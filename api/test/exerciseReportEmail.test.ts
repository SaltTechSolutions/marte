import { describe, expect, it, vi } from 'vitest';

import { deliverOutbox } from '../src/jobs/outboxDelivery';
import { outboxStatement } from '../src/outbox';
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
    const send = vi.fn(async (_m: unknown) => ({ messageId: 'm1' }));
    const EMAIL = { send } as unknown as SendEmail;
    let now = Date.now();
    // no binding: fails visibly, nothing sent
    expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', EXERCISE_REPORT_TO: 'owner@example.test' }, now)).toMatchObject({ failed: 1 });
    expect((await h.one(`SELECT last_error e FROM outbox`)).e).toBe('EMAIL binding not configured');
    // binding but no recipient (or only whitespace): fails, readable error, nothing sent
    now += 120_000;
    for (const to of [undefined, '   ']) {
      expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', EMAIL, EXERCISE_REPORT_TO: to }, now)).toMatchObject({ failed: 1, sent: 0 });
      expect((await h.one(`SELECT last_error e FROM outbox`)).e).toBe('EXERCISE_REPORT_TO not configured');
      now += 4_000_000;
    }
    expect(send).not.toHaveBeenCalled();
    expect((await h.one(`SELECT count(*) c FROM exercise_reports`)).c).toBe(1);
    // the var is set later: the waiting row is delivered without any data fix
    expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', EMAIL, EXERCISE_REPORT_TO: ' owner@example.test ' }, now)).toMatchObject({ sent: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({
      from: { email: 'bildirim@salt-tech-apps.com', name: 'GymEntra' },
      to: 'owner@example.test',
      replyTo: 'coach@example.test',
      subject: 'GymEntra · X — Çizim yanlış',
      text: expect.stringContaining('Hareket:  X (x)'),
    });
    expect((await h.one(`SELECT status s FROM outbox`)).s).toBe('sent');
  });

  it('EMAIL_FROM overrides the sender (name form and bare address); no replyTo key without a reporter e-mail', async () => {
    const h = await harness();
    await outboxStatement(h.db, 'email', { to: 'a@b.co', subject: 's', text: 't' }).run();
    const send = vi.fn(async (_m: unknown) => ({ messageId: 'm' }));
    const EMAIL = { send } as unknown as SendEmail;
    let now = Date.now();
    await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', EMAIL, EMAIL_FROM: 'Salon Ekibi <ekip@example.test>' }, now);
    await h.run(`UPDATE outbox SET status = 'pending', next_attempt_at = 0`);
    now += 10;
    await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', EMAIL, EMAIL_FROM: 'ekip@example.test' }, now);
    expect(send.mock.calls[0][0]).toEqual({ from: { email: 'ekip@example.test', name: 'Salon Ekibi' }, to: 'a@b.co', subject: 's', text: 't' });
    expect((send.mock.calls[1][0] as { from: unknown }).from).toBe('ekip@example.test');
    // an empty EMAIL_FROM counts as unset
    await h.run(`UPDATE outbox SET status = 'pending', next_attempt_at = 0`);
    await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x', EMAIL, EMAIL_FROM: '' }, now + 10);
    expect((send.mock.calls[2][0] as { from: unknown }).from).toEqual({ email: 'bildirim@salt-tech-apps.com', name: 'GymEntra' });
  });

  it('a thrown send error backs off, keeps a readable code, never stores the address, and the row ends dead after 8 attempts', async () => {
    const h = await harness();
    await outboxStatement(h.db, 'email', { to: 'secret-person@example.test', subject: 's', text: 't' }).run();
    const send = vi.fn(async (_m: unknown) => { throw Object.assign(new Error('recipient secret-person@example.test is not verified'), { code: 'E_RECIPIENT_NOT_ALLOWED' }); });
    const env = { DB: h.db, FIREBASE_PROJECT_ID: 'x', EMAIL: { send } as unknown as SendEmail };
    let now = Date.now();
    expect(await deliverOutbox(env, now)).toMatchObject({ failed: 1 });
    expect(await deliverOutbox(env, now)).toMatchObject({ claimed: 0 });   // backing off
    const err = (await h.one(`SELECT last_error e FROM outbox`)).e as string;
    expect(err).toBe('email E_RECIPIENT_NOT_ALLOWED: recipient [address] is not verified');
    expect(err).not.toContain('secret-person');
    for (let i = 0; i < 7; i++) { now += 4_000_000; await deliverOutbox(env, now); }
    expect(await h.one(`SELECT status s, attempts a FROM outbox`)).toEqual({ s: 'dead', a: 8 });
  });
});
