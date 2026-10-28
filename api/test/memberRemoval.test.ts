import { describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { harness, PROJECT } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

type H = Awaited<ReturnType<typeof harness>>;
const NOW = Date.now();
const DAY = 86_400_000;
const T1 = '/v1/tenants/t1';
const rm = (h: H, sub: string | null, id: string) => h.send('DELETE', `${T1}/members/${id}`, sub);
const count = async (h: H, table: string, where: string, ...a: unknown[]) => (await h.one(`SELECT count(*) c FROM ${table} WHERE ${where}`, ...a)).c;

/** u-del: a member of two gyms with everything a member can own in t1, plus a child, a trainer and the history that must survive. */
async function seed(h: H) {
  await h.run(`INSERT INTO tenants (id, code, name, created_at, active_member_count) VALUES ('t2','T2','Other',1,1)`);
  await h.run(`UPDATE tenants SET active_member_count = 2 WHERE id = 't1'`);
  await h.addUser('u-tr', ['trainer']);
  await h.addUser('u-del', ['member']);
  await h.addUser('u-kid', ['member']);
  await h.run(`UPDATE memberships SET display_name = 'Dilek', email = 'del@x.com', phone = '555', birth_date = 1, height_cm = 170, photo_url = 'https://img/del.jpg', short_code = '123456' WHERE member_id = 'u-del'`);
  await h.run(`UPDATE memberships SET guardian_id = 'u-del', guardian_name = 'Dilek', guardian_status = 'approved', guardian_consent_at = 5, guardian_consent_version = 'v1' WHERE member_id = 'u-kid'`);
  await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at, short_code) VALUES ('t2','u-del','active','["member"]',1,'999999')`);
  await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at, guardian_id, guardian_status) VALUES ('t2','u-kid','active','["member"]',1,'u-del','approved')`);
  await h.run(`INSERT INTO gym_packages (id, tenant_id, data, active_assignment_count) VALUES ('pk1','t1','{}',2)`);
  await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, assigned_at) VALUES
    ('mp-del','t1','u-del','pk1',100,1,${NOW + DAY},'active',1), ('mp-mem','t1','u-mem','pk1',100,1,${NOW + DAY},'active',1),
    ('mp-del2','t2','u-del','pk1',100,1,${NOW + DAY},'active',1)`);
  await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES
    ('cr-del','t1','u-del','ptLesson','purchase','mp-del',5,3,1,${NOW + 30 * DAY},'active'),
    ('cr-del2','t2','u-del','ptLesson','purchase','mp-del2',5,3,1,${NOW + 30 * DAY},'active')`);
  await h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES ('cl1','t1','{"capacity":5}',${NOW + DAY}), ('cl2','t1','{"capacity":1}',${NOW + 2 * DAY}), ('cl3','t2','{"capacity":5}',${NOW + DAY})`);
  await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, credit_id, created_at) VALUES ('t1','cl1','u-del','cr-del',1), ('t1','cl1','u-mem',NULL,1), ('t2','cl3','u-del','cr-del2',1)`);
  await h.run(`INSERT INTO class_attendance (tenant_id, class_id, member_id, mark, marked_by, marked_at) VALUES ('t1','cl1','u-del','present','u-admin',1)`);
  await h.run(`INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at) VALUES ('t1','cl2','u-del',1)`);
  for (const [t, tid] of [['t1', 'a'], ['t2', 'b']]) {
    await h.run(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES ('ck${tid}','${t}','u-del','{}',1)`);
    await h.run(`INSERT INTO programs (id, tenant_id, member_id, data, updated_at) VALUES ('pg${tid}','${t}','u-del','{}',1)`);
    await h.run(`INSERT INTO measurements (id, tenant_id, member_id, data, measured_at) VALUES ('ms${tid}','${t}','u-del','{}',1)`);
    await h.run(`INSERT INTO workout_logs (id, tenant_id, member_id, data, logged_at) VALUES ('wl${tid}','${t}','u-del','{}',1)`);
    await h.run(`INSERT INTO member_notes (tenant_id, member_id, text, updated_by, updated_by_name, updated_at) VALUES ('${t}','u-del','about her','u-tr','Coach',1)`);
    await h.run(`INSERT INTO member_admin_notes (tenant_id, member_id, text, updated_by, updated_at) VALUES ('${t}','u-del','private','u-admin',1)`);
    await h.run(`INSERT INTO member_addresses (tenant_id, member_id, address, updated_by, updated_at) VALUES ('${t}','u-del','Some street','u-del',1)`);
    await h.run(`INSERT INTO renewal_requests (id, tenant_id, member_id, status, created_at) VALUES ('rr${tid}','${t}','u-del','pending',1)`);
    await h.run(`INSERT INTO package_change_requests (id, tenant_id, member_id, data, effective_at, expires_at, status, created_at) VALUES ('pcr${tid}','${t}','u-del','{}',1,${NOW + DAY},'pending',1)`);
  }
  await h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-del','u-tr',1), ('t1','u-tr','u-del',1)`);
  await h.run(`INSERT INTO push_tokens (token, user_id, tenant_id, platform, updated_at) VALUES ('ExponentPushToken[d1]','u-del','t1','ios',1), ('ExponentPushToken[d2]','u-del','t2','ios',1)`);
  await h.run(`INSERT INTO user_settings (user_id, notifications, updated_at) VALUES ('u-del','{"payments":false}',1)`);
  await h.run(`INSERT INTO announcements (id, tenant_id, title, body, created_by, created_by_name, created_at) VALUES ('an1','t1','Hi','b','u-del','Dilek',1)`);
  await h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES
    ('pay1','t1','u-del',25050,'confirmed','{"kind":"charge","method":"cash","note":"cash from Dilek","memberName":"Dilek"}',1),
    ('pay2','t1','u-mem',700,'pending','{"kind":"charge","method":"cash","submittedBy":"u-del","submittedByName":"Dilek"}',2),
    ('pay3','t2','u-del',500,'confirmed','{"kind":"charge","method":"cash","note":"other gym"}',3)`);
}

describe('DELETE /tenants/:t/members/:id — an admin removes one person from one gym', () => {
  it('erases the person from THIS gym only, anonymises the ledger, frees the seat, cancels what is upcoming, unlinks children', async () => {
    const h = await harness();
    await seed(h);
    // one past (retained) and one upcoming session with the trainer, both paid with her credit
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at) VALUES
      ('s-past','t1','u-tr','u-del',${NOW - 5 * DAY},60,'completed','cr-del',1,1),
      ('s-next','t1','u-tr','u-del',${NOW + 2 * DAY},60,'scheduled','cr-del',1,1)`);
    const r = await rm(h, 'fb-admin', 'u-del');
    expect(r.status).toBe(200);
    const { deleted } = (await r.json()) as { deleted: number };
    expect(deleted).toBeGreaterThan(15);

    for (const t of ['member_packages', 'member_credits', 'class_bookings', 'class_waitlist', 'class_attendance', 'checkins', 'programs', 'measurements',
      'workout_logs', 'member_notes', 'member_admin_notes', 'member_addresses', 'renewal_requests', 'package_change_requests']) {
      expect(await count(h, t, `member_id = 'u-del' AND tenant_id = 't1'`), t).toBe(0);
      expect(await count(h, t, `member_id = 'u-del' AND tenant_id = 't2'`), `${t} in t2 untouched`).toBe(t === 'class_attendance' || t === 'class_waitlist' ? 0 : 1);
    }
    expect(await count(h, 'calendar_shares', `owner_trainer_id = 'u-del' OR viewer_trainer_id = 'u-del'`)).toBe(0);
    // hers only: the other members and the other gym's token survive; the account, its identity and settings are untouched
    expect(await count(h, 'member_packages', `member_id = 'u-mem'`)).toBe(1);
    expect(await count(h, 'class_bookings', `member_id = 'u-mem'`)).toBe(1);
    expect(await count(h, 'push_tokens', `user_id = 'u-del'`)).toBe(1);
    expect((await h.one(`SELECT tenant_id t FROM push_tokens WHERE user_id = 'u-del'`)).t).toBe('t2');
    expect(await count(h, 'identities', `user_id = 'u-del'`)).toBe(1);
    expect(await count(h, 'user_settings', `user_id = 'u-del'`)).toBe(1);
    expect((await h.one(`SELECT display_name n FROM users WHERE id = 'u-del'`)).n).toBe('u-del');
    expect((await h.one(`SELECT status s, short_code c FROM memberships WHERE tenant_id = 't2' AND member_id = 'u-del'`))).toEqual({ s: 'active', c: '999999' });

    // seat tally: t1 had 2 counted seats, t2 untouched; the package in-use tally dropped by her holding
    expect((await h.one(`SELECT active_member_count n FROM tenants WHERE id = 't1'`)).n).toBe(1);
    expect((await h.one(`SELECT active_member_count n FROM tenants WHERE id = 't2'`)).n).toBe(1);
    expect((await h.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = 'pk1'`)).n).toBe(1);

    // PT: the upcoming one is cancelled and voided, the past one stays for the trainer with no credit link; the membership stays as a scrubbed tombstone
    expect(await h.one(`SELECT status s, refund_outcome o, cancelled_by_role r, credit_id c FROM pt_sessions WHERE id = 's-next'`)).toEqual({ s: 'cancelled', o: 'void', r: 'system', c: null });
    expect(await h.one(`SELECT status s, credit_id c FROM pt_sessions WHERE id = 's-past'`)).toEqual({ s: 'completed', c: null });
    expect(await h.one(`SELECT status s, display_name n, email e, short_code c, photo_url p, birth_date b FROM memberships WHERE tenant_id = 't1' AND member_id = 'u-del'`))
      .toEqual({ s: 'left', n: 'Silinmiş üye', e: null, c: null, p: null, b: null });

    // ledger kept, scrubbed; other gym's untouched
    const p1 = await h.one(`SELECT amount a, data d FROM payments WHERE id = 'pay1'`);
    expect(p1.a).toBe(25050);
    expect(JSON.parse(p1.d)).toMatchObject({ memberName: 'Silinmiş üye', method: 'cash' });
    expect(JSON.parse(p1.d).note).toBeUndefined();
    expect(JSON.parse((await h.one(`SELECT data d FROM payments WHERE id = 'pay2'`)).d).submittedByName).toBeUndefined();
    expect(JSON.parse((await h.one(`SELECT data d FROM payments WHERE id = 'pay3'`)).d).note).toBe('other gym');
    expect((await h.one(`SELECT created_by_name n FROM announcements WHERE id = 'an1'`)).n).toBeNull();

    // children: unlinked in this gym only, and told
    expect(await h.one(`SELECT guardian_id g, guardian_status s, guardian_consent_at c FROM memberships WHERE tenant_id = 't1' AND member_id = 'u-kid'`)).toEqual({ g: null, s: null, c: null });
    expect((await h.one(`SELECT guardian_id g FROM memberships WHERE tenant_id = 't2' AND member_id = 'u-kid'`)).g).toBe('u-del');
    const pushes = (await h.db.prepare(`SELECT payload FROM outbox`).all<{ payload: string }>()).results.map((x) => JSON.parse(x.payload));
    expect(pushes.some((p) => p.userIds.includes('u-kid') && p.category === 'account')).toBe(true);
  });

  it('a person with no retained PT history disappears completely: the row is gone and the answer counts it', async () => {
    const h = await harness();
    await h.addUser('u-x', ['member']);
    const r = await rm(h, 'fb-admin', 'u-x');
    expect(await r.json()).toEqual({ deleted: 1 });
    expect(await h.one(`SELECT 1 x FROM memberships WHERE member_id = 'u-x'`)).toBeNull();
    expect((await h.send('GET', `${T1}/members/u-x`, 'fb-admin')).status).toBe(404);
    // gone means gone: the second call is a 404, and the seat was freed exactly once
    expect((await rm(h, 'fb-admin', 'u-x')).status).toBe(404);
    expect((await h.one(`SELECT active_member_count n FROM tenants WHERE id = 't1'`)).n).toBe(0);   // seeded tally is 0: MAX(…, 0) never goes negative
  });

  it('removing an active member frees one seat; a pending applicant frees none; a rejoin after removal starts a clean application', async () => {
    const h = await harness();
    await h.run(`UPDATE tenants SET active_member_count = 3 WHERE id = 't1'`);
    await h.addUser('u-a', ['member']);
    await h.addUser('u-p', ['member'], { status: 'pending' });
    await rm(h, 'fb-admin', 'u-a');
    expect((await h.one(`SELECT active_member_count n FROM tenants WHERE id = 't1'`)).n).toBe(2);
    await rm(h, 'fb-admin', 'u-p');
    expect((await h.one(`SELECT active_member_count n FROM tenants WHERE id = 't1'`)).n).toBe(2);

    // a retained session leaves a scrubbed 'left' tombstone; joining again resets it with the person's real name
    await h.addUser('u-b', ['member']);
    await h.addUser('u-tr', ['trainer']);
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES ('sx','t1','u-tr','u-b',1,60,'completed',1,1)`);
    await rm(h, 'fb-admin', 'u-b');
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-b'`)).s).toBe('left');
    expect((await h.send('POST', `${T1}/join`, 'fb-b')).status).toBe(201);
    expect(await h.one(`SELECT status s, display_name n FROM memberships WHERE member_id = 'u-b'`)).toEqual({ s: 'pending', n: 'u-b' });
  });

  it('removing a trainer cancels their upcoming sessions WITH the lesson given back, tells the trainees, keeps past sessions and frees their calendar', async () => {
    const h = await harness();
    await h.addUser('u-tr', ['trainer']);
    await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('pk1','t1','{}')`);
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, assigned_at) VALUES ('mp1','t1','u-mem','pk1',1,1,${NOW + DAY},'active',1)`);
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES
      ('cr1','t1','u-mem','ptLesson','purchase','mp1',2,2,1,${NOW + 30 * DAY},'exhausted')`);
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at) VALUES
      ('s1','t1','u-tr','u-mem',${NOW + DAY},60,'scheduled','cr1',1,1), ('s0','t1','u-tr','u-mem',${NOW - DAY},60,'completed','cr1',1,1)`);
    await h.run(`INSERT INTO trainer_availability (tenant_id, trainer_id, weekly, slot_minutes, updated_at) VALUES ('t1','u-tr','{}',60,1)`);
    expect((await rm(h, 'fb-admin', 'u-tr')).status).toBe(200);
    expect(await h.one(`SELECT used u, status s FROM member_credits WHERE id = 'cr1'`)).toEqual({ u: 1, s: 'active' });
    expect(await h.one(`SELECT status s, refund_outcome o FROM pt_sessions WHERE id = 's1'`)).toEqual({ s: 'cancelled', o: 'refunded' });
    expect((await h.one(`SELECT status s FROM pt_sessions WHERE id = 's0'`)).s).toBe('completed');
    expect(await count(h, 'trainer_availability', `trainer_id = 'u-tr'`)).toBe(0);
    const pushes = (await h.db.prepare(`SELECT payload FROM outbox`).all<{ payload: string }>()).results.map((x) => JSON.parse(x.payload));
    expect(pushes.find((p) => p.title === 'Randevun iptal edildi')?.userIds).toEqual(['u-mem']);
  });

  it('removing a managed member also drops their account-less users row; removing a real account keeps the account', async () => {
    const h = await harness();
    const made = await h.send('POST', `${T1}/members/managed`, 'fb-admin', { name: 'Elle Eklenen', email: 'e@x.com' });
    const { memberId } = (await made.json()) as { memberId: string };
    expect(await h.one(`SELECT 1 x FROM users WHERE id = ?`, memberId)).not.toBeNull();
    expect((await rm(h, 'fb-admin', memberId)).status).toBe(200);
    expect(await h.one(`SELECT 1 x FROM users WHERE id = ?`, memberId)).toBeNull();
    expect(await h.one(`SELECT 1 x FROM users WHERE id = 'u-mem'`)).not.toBeNull();
  });

  it('who may: only an admin of THIS gym; never yourself (409); unknown is 404; anonymous 401', async () => {
    const h = await harness();
    await h.addUser('u-tr', ['trainer']);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-oa', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-oa','active','["admin"]',1)`);
    await h.addUser('u-tgt', ['member']);
    expect((await rm(h, null, 'u-tgt')).status).toBe(401);
    for (const sub of ['fb-mem', 'fb-tr', 'fb-oa']) expect((await rm(h, sub, 'u-tgt')).status, sub).toBe(403);
    expect(await h.one(`SELECT 1 x FROM memberships WHERE member_id = 'u-tgt'`)).not.toBeNull();
    expect((await rm(h, 'fb-admin', 'u-admin')).status).toBe(409);
    expect((await rm(h, 'fb-admin', 'u-nobody')).status).toBe(404);
    expect((await h.send('DELETE', '/v1/tenants/t2/members/u-tgt', 'fb-oa')).status).toBe(404);   // not his gym's member
    expect(await h.one(`SELECT 1 x FROM memberships WHERE tenant_id = 't1' AND member_id = 'u-admin'`)).not.toBeNull();
    const refused = (await (await rm(h, 'fb-admin', 'u-admin')).json()) as { message: string };
    expect(refused.message).toMatch(/Kendini/);
  });

  it('removing another admin frees the admin seat; the guard INSIDE the batch rolls everything back if the caller lost admin meanwhile', async () => {
    const h = await harness();
    await h.run(`UPDATE tenants SET active_admin_count = 2 WHERE id = 't1'`);
    await h.addUser('u-a2', ['admin']);
    await h.addUser('u-victim', ['member']);
    await h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES ('c1','t1','{"capacity":3}',${NOW + DAY})`);
    await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','c1','u-victim',1)`);

    // race: between the route's checks and its batch, the caller is demoted
    const racing = { ...h.db, batch: async (l: any[]) => { await h.run(`UPDATE memberships SET roles = '["member"]' WHERE member_id = 'u-admin'`); return h.db.batch(l); } } as unknown as D1Database;
    const lost = await app.fetch(new Request(`http://x${T1}/members/u-victim`, { method: 'DELETE', headers: { Authorization: `Bearer ${await h.sign('fb-admin')}` } }), { DB: racing, API_OPEN: '1', FIREBASE_PROJECT_ID: PROJECT });
    expect(lost.status).toBe(403);
    expect(await h.one(`SELECT 1 x FROM memberships WHERE member_id = 'u-victim'`)).not.toBeNull();
    expect(await count(h, 'class_bookings', `member_id = 'u-victim'`)).toBe(1);   // nothing half-done

    await h.run(`UPDATE memberships SET roles = '["admin"]' WHERE member_id = 'u-admin'`);
    expect((await rm(h, 'fb-admin', 'u-a2')).status).toBe(200);
    expect((await h.one(`SELECT active_admin_count n FROM tenants WHERE id = 't1'`)).n).toBe(1);
  });
});
