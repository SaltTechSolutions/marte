import { describe, expect, it, vi } from 'vitest';

import { deliverOutbox } from '../src/jobs/outboxDelivery';
import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });
const T1 = '/v1/tenants/t1';

// Parity with backend/functions/src/exerciseReports.ts (emailExerciseReport): one mail per report to the content
// owner, reply-to = the reporter, subject/body in the same shape. Here it is an outbox row written in the SAME
// batch as the report.
describe('exercise report e-mail (Firebase parity)', () => {
  it('writes the report and one e-mail outbox row together, with the Firebase subject, body, recipient and reply-to', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    await h.run(`UPDATE users SET display_name = 'Ayşe Koç' WHERE id = 'u-coach'`);
    await h.run(`UPDATE memberships SET email = 'ayse@example.test' WHERE member_id = 'u-coach'`);
    await h.run(`UPDATE tenants SET name = 'Supergym' WHERE id = 't1'`);
    const res = await h.send('POST', `${T1}/exercise-reports`, 'fb-coach', { exerciseId: 'back-squat', exerciseName: 'Back squat', reason: 'muscles', note: 'Kalça yanlış boyanmış' });
    expect(res.status).toBe(201);
    const report = await h.one(`SELECT id, reported_by_name n FROM exercise_reports`);
    expect(report.n).toBe('Ayşe Koç');
    const rows = (await h.db.prepare(`SELECT kind, payload, dedupe_key, status FROM outbox`).all<any>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'email', status: 'pending', dedupe_key: `exercise-report:${report.id}` });
    const p = JSON.parse(rows[0].payload);
    expect(p).toMatchObject({ toEnv: 'EXERCISE_REPORT_TO', subject: 'GymEntra · Back squat — Kaslar yanlış', replyTo: 'ayse@example.test' });
    expect(p.to).toBeUndefined();                     // the address is resolved at delivery, never stored
    expect(p.text).toBe([
      'Hareket:  Back squat (back-squat)',
      'Sorun:    Kaslar yanlış',
      'Bildiren: Ayşe Koç · ayse@example.test',
      'Salon:    Supergym (t1)',
      '',
      'Not:\nKalça yanlış boyanmış',
      '',
      `Kayıt: exercise_reports/${report.id}`,
      'Düzeltme: backend/scripts/build_exercise_library.py → python3 scripts/build_exercise_library.py',
    ].join('\n'));
  });

  it('falls back sensibly without a reporter e-mail, exercise name or note; a rejected report writes neither row', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    expect((await h.send('POST', `${T1}/exercise-reports`, 'fb-coach', { exerciseId: 'x', reason: 'nonsense', note: 'n' })).status).toBe(400);
    expect((await h.send('POST', `${T1}/exercise-reports`, 'fb-mem', { exerciseId: 'x', reason: 'pose', note: 'n' })).status).toBe(403);
    expect((await h.one(`SELECT count(*) c FROM exercise_reports`)).c).toBe(0);
    expect((await h.one(`SELECT count(*) c FROM outbox`)).c).toBe(0);
    expect((await h.send('POST', `${T1}/exercise-reports`, 'fb-coach', { exerciseId: 'x', reason: 'other', note: '   ' })).status).toBe(201);
    const p = JSON.parse((await h.one(`SELECT payload p FROM outbox`)).p);
    expect(p.replyTo).toBeUndefined();
    expect(p.subject).toBe('GymEntra · x — Başka');
    expect(p.text).toContain('Bildiren: u-coach');
    expect(p.text).toContain('Not girilmedi.');
  });

  it('every report gets its own mail (distinct dedupe keys), none carries an address', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    for (let i = 0; i < 2; i++) expect((await h.send('POST', `${T1}/exercise-reports`, 'fb-coach', { exerciseId: 'x', reason: 'pose', note: 'same text' })).status).toBe(201);
    const rows = (await h.db.prepare(`SELECT payload, dedupe_key FROM outbox`).all<any>()).results;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.dedupe_key)).size).toBe(2);
    for (const r of rows) expect(JSON.parse(r.payload).to).toBeUndefined();
  });

  it('delivery resolves the recipient from EXERCISE_REPORT_TO at delivery time; unset fails visibly and the report stays saved', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    await h.run(`UPDATE memberships SET email = 'coach@example.test' WHERE member_id = 'u-coach'`);
    expect((await h.send('POST', `${T1}/exercise-reports`, 'fb-coach', { exerciseId: 'x', exerciseName: 'X', reason: 'pose', note: 'n' })).status).toBe(201);
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    let now = Date.now();
    // no key
    expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', EXERCISE_REPORT_TO: 'owner@example.test' }, now, 50, f as never)).toMatchObject({ failed: 1 });
    expect((await h.one(`SELECT last_error e FROM outbox`)).e).toMatch(/RESEND_API_KEY/);
    // key but no recipient (or only whitespace): fails, readable error, nothing sent
    now += 120_000;
    for (const to of [undefined, '   ']) {
      expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', RESEND_API_KEY: 'test-key', EXERCISE_REPORT_TO: to }, now, 50, f as never)).toMatchObject({ failed: 1, sent: 0 });
      expect((await h.one(`SELECT last_error e FROM outbox`)).e).toBe('EXERCISE_REPORT_TO not configured');
      now += 4_000_000;
    }
    expect(f).not.toHaveBeenCalled();
    expect((await h.one(`SELECT count(*) c FROM exercise_reports`)).c).toBe(1);
    // the var is set later: the waiting row is delivered without any data fix
    expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', RESEND_API_KEY: 'test-key', EXERCISE_REPORT_TO: ' owner@example.test ' }, now, 50, f as never)).toMatchObject({ sent: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://api.resend.com/emails');
    expect(JSON.parse(init.body)).toMatchObject({ from: 'GymEntra <bildirim@salt-tech-apps.com>', to: ['owner@example.test'], reply_to: 'coach@example.test', subject: 'GymEntra · X — Çizim yanlış' });
  });
});
