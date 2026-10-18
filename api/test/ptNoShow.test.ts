import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { MESSAGES } from '../src/errorMessages';
import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

type H = Awaited<ReturnType<typeof harness>>;
const NOW = Date.now();
const HOUR = 3_600_000;
const T1 = '/v1/tenants/t1';
const post = (h: H, sub: string | null, id: string) => h.send('POST', `${T1}/pt-sessions/${id}/no-show`, sub);

async function world() {
  const h = await harness();
  await h.addUser('u-tr', ['trainer']);
  await h.addUser('u-tr2', ['trainer']);
  await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('pk1','t1','{}')`);
  await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, assigned_at) VALUES ('mp1','t1','u-mem','pk1',1,1,${NOW + 30 * 24 * HOUR},'active',1)`);
  await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES
    ('cr1','t1','u-mem','ptLesson','purchase','mp1',3,2,1,${NOW + 30 * 24 * HOUR},'active')`);
  const s = (id: string, at: number, status: string, credit: string | null = 'cr1') => h.run(
    `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at) VALUES (?, 't1', 'u-tr', 'u-mem', ?, 60, ?, ?, 1, 1)`, id, at, status, credit);
  await s('past', NOW - 2 * HOUR, 'scheduled');
  await s('started', NOW - 10_000, 'scheduled', null);
  await s('future', NOW + 5 * HOUR, 'scheduled');
  await s('done', NOW - 30 * HOUR, 'completed');
  return { h, s };
}

describe('POST pt-sessions/:id/no-show', () => {
  it('the assigned trainer marks a past session: status no-show, the lesson stays spent, no refund outcome, the member is told', async () => {
    const { h } = await world();
    const r = await post(h, 'fb-tr', 'past');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: 'no-show' });
    expect(await h.one(`SELECT status s, refund_outcome o, credit_id c FROM pt_sessions WHERE id = 'past'`)).toEqual({ s: 'no-show', o: null, c: 'cr1' });
    expect(await h.one(`SELECT used u, status s FROM member_credits WHERE id = 'cr1'`)).toEqual({ u: 2, s: 'active' });
    const pushes = (await h.db.prepare(`SELECT payload, dedupe_key k FROM outbox`).all<any>()).results;
    expect(pushes).toHaveLength(1);
    expect(pushes[0].k).toBe('pt-no-show:past');
    expect(JSON.parse(pushes[0].payload)).toMatchObject({ userIds: ['u-mem'], category: 'bookings', title: 'Randevuna katılmadın' });
    expect(JSON.parse(pushes[0].payload).body).toContain('Ders hakkın kullanılmış sayıldı');
    // a session that merely STARTED counts; one without a credit does not claim a spent lesson
    expect((await post(h, 'fb-admin', 'started')).status).toBe(200);
    const second = (await h.db.prepare(`SELECT payload FROM outbox WHERE dedupe_key = 'pt-no-show:started'`).first<any>())!;
    expect(JSON.parse(second.payload).body).not.toContain('Ders hakkı');
    // it shows in the member's list and as a busy slot with its status
    const list = (await (await h.send('GET', `${T1}/members/u-mem/pt-sessions`, 'fb-mem')).json()) as any[];
    expect(list.find((x) => x.id === 'past')).toMatchObject({ status: 'no-show', refundOutcome: null });
  });

  it('refusals: future session, already answered, other trainer, member, stranger, unknown id', async () => {
    const { h } = await world();
    const early = await post(h, 'fb-tr', 'future');
    expect(early.status).toBe(409);
    expect(((await early.json()) as any).error).toBe('session_not_started');
    expect((await post(h, 'fb-tr', 'done')).status).toBe(409);
    expect(await h.one(`SELECT status s FROM pt_sessions WHERE id = 'done'`)).toEqual({ s: 'completed' });
    for (const sub of ['fb-tr2', 'fb-mem']) expect((await post(h, sub, 'past')).status, sub).toBe(403);
    expect((await post(h, null, 'past')).status).toBe(401);
    expect((await post(h, 'fb-tr', 'nope')).status).toBe(403);          // no id probing for non-admins
    expect((await post(h, 'fb-admin', 'nope')).status).toBe(404);
    expect((await h.one(`SELECT status s FROM pt_sessions WHERE id = 'past'`)).s).toBe('scheduled');
    expect((await post(h, 'fb-tr', 'past')).status).toBe(200);
    const again = await post(h, 'fb-tr', 'past');
    expect(again.status).toBe(409);
    const body = (await again.json()) as any;
    expect(body.error).toBe('already_no-show');
    expect(body.message).toBe(MESSAGES['already_no-show']);
    expect(await h.one(`SELECT count(*) c FROM outbox`)).toEqual({ c: 1 });       // one push, however often it is pressed
  });

  it('a no-show can no longer be cancelled (and so never refunded)', async () => {
    const { h } = await world();
    await post(h, 'fb-tr', 'past');
    const r = await h.send('POST', `${T1}/pt-sessions/past/cancel`, 'fb-admin');
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).error).toBe('already_no-show');
    expect(await h.one(`SELECT used u FROM member_credits WHERE id = 'cr1'`)).toEqual({ u: 2 });
  });
});

describe('migration 0050: pt_sessions rebuild', () => {
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const files = readdirSync(dir).sort();

  it('keeps every row and column, the constraints of 0010 and the indexes; accepts no-show and nothing else new', () => {
    const sql = new DatabaseSync(':memory:');
    sql.exec('PRAGMA foreign_keys = ON');
    for (const f of files.filter((x) => x < '0050')) sql.exec(readFileSync(dir + f, 'utf8'));
    sql.exec(`INSERT INTO users (id, created_at) VALUES ('u1',1), ('u2',1);
      INSERT INTO tenants (id, code, name, created_at) VALUES ('t1','T1','G',1);
      INSERT INTO memberships (tenant_id, member_id, status, requested_at) VALUES ('t1','u1','active',1), ('t1','u2','active',1);
      INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES ('c1','t1','u1','ptLesson','purchase','p',3,1,1,9,'active');
      INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, original_trainer_id, starts_at, duration_minutes, status, credit_id, cancellation_deadline_at,
        cancelled_at, cancelled_by, cancelled_by_role, refund_outcome, reminder_sent_at, created_at, updated_at)
        VALUES ('a','t1','u2','u1','u2',100,60,'cancelled','c1',50,70,'u1','member','refunded',NULL,5,6),
               ('b','t1','u2','u1',NULL,200,45,'scheduled',NULL,150,NULL,NULL,NULL,NULL,190,7,8);`);
    const before = sql.prepare(`SELECT * FROM pt_sessions ORDER BY id`).all();
    for (const f of files.filter((x) => x >= '0050' && x.startsWith('0050'))) sql.exec(readFileSync(dir + f, 'utf8'));
    expect(sql.prepare(`SELECT * FROM pt_sessions ORDER BY id`).all()).toEqual(before);

    const ins = (id: string, status: string, refund: string | null = null) => sql.exec(
      `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, refund_outcome, created_at, updated_at) VALUES ('${id}','t1','u2','u1',300,60,'${status}',${refund ? `'${refund}'` : 'NULL'},1,1)`);
    ins('ns', 'no-show');
    expect(() => ins('bad', 'bogus')).toThrow(/CHECK/);
    expect(() => ins('bad2', 'no-show', 'refunded')).toThrow(/CHECK/);            // only a cancelled session has a refund outcome
    expect(() => sql.exec(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES ('z','t1','u2','u1',1,0,'scheduled',1,1)`)).toThrow(/CHECK/);
    expect(() => sql.exec(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at) VALUES ('f','t1','u2','u1',1,60,'scheduled','nope',1,1)`)).toThrow(/FOREIGN KEY/);
    expect(() => sql.exec(`DELETE FROM memberships WHERE member_id = 'u2'`)).toThrow(/FOREIGN KEY/);      // the trainer FK still protects the calendar
    const idx = (sql.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pt_sessions' AND name LIKE 'pt_sessions_%' ORDER BY name`).all() as { name: string }[]).map((x) => x.name);
    expect(idx).toEqual(['pt_sessions_credit', 'pt_sessions_member', 'pt_sessions_reminder', 'pt_sessions_tenant_time', 'pt_sessions_trainer']);
    // the abort guard table is untouched: inserting still always fails
    expect(() => sql.exec(`INSERT INTO pt_batch_abort (reason) VALUES ('x')`)).toThrow(/pt_batch_aborted|CHECK/);
    expect(sql.prepare(`SELECT count(*) c FROM pt_sessions`).get()).toEqual({ c: 3 });
  });
});
