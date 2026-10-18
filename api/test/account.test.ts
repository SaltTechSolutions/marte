import { describe, expect, it, vi } from 'vitest';

import { sliceHarness } from './sliceApp';

vi.setConfig({ testTimeout: 60_000 });

type H = Awaited<ReturnType<typeof sliceHarness>>;
const NOW = Date.now();
const DAY = 86_400_000;

describe('user_settings (row 1327)', () => {
  it('[L1327] an absent settings row reads as an empty map ("everything on"); a person only ever sees their own', async () => {
    const h = await sliceHarness();
    const r = await h.send('GET', '/v1/me/settings', 'fb-mem');
    expect(r.status).toBe(200);
    expect(await h.json(r)).toEqual({ push: {} });
    await h.send('PATCH', '/v1/me/settings', 'fb-mem', { push: { payments: false } });
    expect(await h.json(await h.send('GET', '/v1/me/settings', 'fb-mem'))).toEqual({ push: { payments: false } });
    // nobody else's: another user is unaffected and no route names a user id
    expect(await h.json(await h.send('GET', '/v1/me/settings', 'fb-admin'))).toEqual({ push: {} });
    expect((await h.send('GET', '/v1/me/settings', null)).status).toBe(401);
    expect((await h.send('GET', '/v1/me/settings/u-mem', 'fb-admin')).status).toBe(404);
  });

  it('switching one category merges: it cannot wipe the others; the stored shape is the flat map the outbox reads', async () => {
    const h = await sliceHarness();
    await h.send('PATCH', '/v1/me/settings', 'fb-mem', { push: { payments: false, bookings: true } });
    const r = await h.send('PATCH', '/v1/me/settings', 'fb-mem', { push: { payments: true, programs: false } });
    expect(await h.json(r)).toEqual({ push: { payments: true, bookings: true, programs: false } });
    const raw = JSON.parse((await h.one(`SELECT notifications n FROM user_settings WHERE user_id = 'u-mem'`)).n);
    expect(raw).toEqual({ payments: true, bookings: true, programs: false });
    expect((await h.one(`SELECT json_extract(notifications, '$.' || 'programs') v FROM user_settings WHERE user_id = 'u-mem'`)).v).toBe(0);
  });

  it("'account' cannot be switched off, unknown categories and non-booleans are 400, an unbootstrapped caller is 409", async () => {
    const h = await sliceHarness();
    for (const push of [{ account: false }, { nope: true }, { payments: 'no' }, { payments: null }, {}, [], 'x']) {
      expect((await h.send('PATCH', '/v1/me/settings', 'fb-mem', { push })).status).toBe(400);
    }
    expect((await h.send('PATCH', '/v1/me/settings', 'fb-mem', {})).status).toBe(400);
    expect(await h.one(`SELECT count(*) c FROM user_settings`)).toEqual({ c: 0 });
    expect((await h.send('PATCH', '/v1/me/settings', 'fb-ghost', { push: { payments: false } })).status).toBe(409);
  });
});

/** Everything a member can own, in two gyms, plus the history that must survive. */
async function seed(h: H) {
  await h.run(`INSERT INTO tenants (id, code, name, created_at, active_member_count) VALUES ('t2','T2','Other',1,1)`);
  await h.run(`UPDATE tenants SET active_member_count = 2 WHERE id = 't1'`);
  await h.addUser('u-tr', ['trainer']);
  await h.addUser('u-del', ['member']);
  await h.run(`UPDATE users SET email = 'del@x.com' WHERE id = 'u-del'`);
  await h.run(`UPDATE memberships SET display_name = 'Dilek', email = 'del@x.com', phone = '555', birth_date = 1, height_cm = 170, photo_url = 'https://img/del.jpg', short_code = '123456' WHERE member_id = 'u-del'`);
  await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at, photo_url) VALUES ('t2','u-del','active','["member"]',1,'https://img/del2.jpg')`);
  await h.run(`INSERT INTO gym_packages (id, tenant_id, data, active_assignment_count) VALUES ('pk1','t1','{}',2)`);
  await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, assigned_at) VALUES
    ('mp-del','t1','u-del','pk1',100,1,${NOW + DAY},'active',1), ('mp-mem','t1','u-mem','pk1',100,1,${NOW + DAY},'active',1)`);
  await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES
    ('cr-del','t1','u-del','ptLesson','purchase','pk1',5,3,1,${NOW + 30 * DAY},'active')`);
  await h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES ('cl1','t1','{"capacity":5}',${NOW + DAY})`);
  await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, credit_id, created_at) VALUES ('t1','cl1','u-del','cr-del',1), ('t1','cl1','u-mem',NULL,1)`);
  await h.run(`INSERT INTO class_attendance (tenant_id, class_id, member_id, mark, marked_by, marked_at) VALUES ('t1','cl1','u-del','present','u-admin',1)`);
  await h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES ('cl2','t1','{"capacity":1}',${NOW + 2 * DAY})`);
  await h.run(`INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at) VALUES ('t1','cl2','u-del',1)`);
  await h.run(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES ('ck1','t1','u-del','{}',1)`);
  await h.run(`INSERT INTO programs (id, tenant_id, member_id, data, updated_at) VALUES ('pg1','t1','u-del','{}',1)`);
  await h.run(`INSERT INTO measurements (id, tenant_id, member_id, data, measured_at) VALUES ('ms1','t1','u-del','{}',1)`);
  await h.run(`INSERT INTO workout_logs (id, tenant_id, member_id, data, logged_at) VALUES ('wl1','t1','u-del','{}',1)`);
  await h.run(`INSERT INTO member_notes (tenant_id, member_id, text, updated_by, updated_by_name, updated_at) VALUES
    ('t1','u-del','about her','u-tr','Coach',1), ('t1','u-mem','about him','u-del','Dilek',1)`);
  await h.run(`INSERT INTO member_admin_notes (tenant_id, member_id, text, updated_by, updated_at) VALUES ('t1','u-del','private','u-admin',1)`);
  await h.run(`INSERT INTO member_addresses (tenant_id, member_id, address, updated_by, updated_at) VALUES ('t1','u-del','Some street','u-del',1)`);
  await h.run(`INSERT INTO renewal_requests (id, tenant_id, member_id, status, created_at) VALUES ('rr1','t1','u-del','pending',1)`);
  await h.run(`INSERT INTO package_change_requests (id, tenant_id, member_id, data, effective_at, expires_at, status, created_at) VALUES ('pcr1','t1','u-del','{}',1,${NOW + DAY},'pending',1)`);
  await h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-del','u-tr',1), ('t1','u-tr','u-del',1)`);
  await h.run(`INSERT INTO push_tokens (token, user_id, tenant_id, platform, updated_at) VALUES ('ExponentPushToken[del]','u-del','t1','ios',1)`);
  await h.run(`INSERT INTO user_settings (user_id, notifications, updated_at) VALUES ('u-del','{"payments":false}',1)`);
  await h.run(`INSERT INTO announcements (id, tenant_id, title, body, created_by, created_by_name, created_at) VALUES ('an1','t1','Hi','b','u-del','Dilek',1)`);
  await h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES
    ('pay1','t1','u-del',500,'confirmed','{"kind":"charge","method":"cash","note":"cash from Dilek","memberName":"Dilek"}',1),
    ('pay2','t1','u-mem',700,'pending','{"kind":"charge","method":"cash","submittedBy":"u-del","submittedByName":"Dilek"}',2)`);
  // PT: one past completed and one upcoming scheduled session with the trainer, both paid with her credit
  await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at) VALUES
    ('s-past','t1','u-tr','u-del',${NOW - 5 * DAY},60,'completed','cr-del',1,1),
    ('s-next','t1','u-tr','u-del',${NOW + 2 * DAY},60,'scheduled','cr-del',1,1)`);
}
const count = async (h: H, table: string, where: string, ...a: unknown[]) => (await h.one(`SELECT count(*) c FROM ${table} WHERE ${where}`, ...a)).c;
const del = (h: H, sub: string, body: object = { confirm: true }) => h.send('POST', '/v1/me/delete-account', sub, body);

describe('deleteMyAccount', () => {
  it('needs an explicit confirmation and a token; a stray call deletes nothing', async () => {
    const h = await sliceHarness();
    await seed(h);
    expect((await del(h, 'fb-del', {})).status).toBe(400);
    expect((await del(h, 'fb-del', { confirm: 'true' })).status).toBe(400);
    expect((await del(h, null as never)).status).toBe(401);
    expect(await count(h, 'memberships', `member_id = 'u-del'`)).toBe(2);
  });

  it('erases the person everywhere, keeps the ledger and the trainer calendar (scrubbed), and says the Auth user is still to do', async () => {
    const h = await sliceHarness();
    await seed(h);
    const r = await del(h, 'fb-del');
    expect(r.status).toBe(200);
    expect(await h.json(r)).toEqual({ deleted: true, authDeletionRequired: true, subject: 'fb-del', photoUrls: ['https://img/del.jpg', 'https://img/del2.jpg'] });

    // ---- erased
    for (const [t, col] of [
      ['member_packages', 'member_id'], ['member_credits', 'member_id'], ['class_bookings', 'member_id'], ['class_waitlist', 'member_id'],
      ['class_attendance', 'member_id'], ['checkins', 'member_id'], ['programs', 'member_id'], ['measurements', 'member_id'],
      ['workout_logs', 'member_id'], ['member_notes', 'member_id'], ['member_admin_notes', 'member_id'], ['member_addresses', 'member_id'],
      ['renewal_requests', 'member_id'], ['package_change_requests', 'member_id'], ['push_tokens', 'user_id'], ['user_settings', 'user_id'],
      ['identities', 'user_id'],
    ] as const) expect(await count(h, t, `${col} = 'u-del'`), t).toBe(0);
    expect(await count(h, 'calendar_shares', `owner_trainer_id = 'u-del' OR viewer_trainer_id = 'u-del'`)).toBe(0);
    // ... but only hers
    expect(await count(h, 'member_packages', `member_id = 'u-mem'`)).toBe(1);
    expect(await count(h, 'class_bookings', `member_id = 'u-mem'`)).toBe(1);
    expect(await count(h, 'member_notes', `member_id = 'u-mem'`)).toBe(1);
    expect(await count(h, 'calendar_shares', `owner_trainer_id = 'u-tr'`)).toBe(0);   // the share TO her went too

    // ---- the person is unlinkable: memberships either gone or scrubbed tombstones, the user row anonymous
    expect(await h.one(`SELECT display_name n, email e FROM users WHERE id = 'u-del'`)).toEqual({ n: 'Silinmiş üye', e: null });
    expect(await count(h, 'memberships', `member_id = 'u-del' AND tenant_id = 't2'`)).toBe(0);   // nothing retained there
    expect(await h.one(`SELECT status, roles, display_name, email, phone, birth_date, height_cm, photo_url, short_code FROM memberships WHERE tenant_id = 't1' AND member_id = 'u-del'`))
      .toEqual({ status: 'left', roles: '["member"]', display_name: 'Silinmiş üye', email: null, phone: null, birth_date: null, height_cm: null, photo_url: null, short_code: null });

    // ---- the gym's ledger survives, anonymised
    const p1 = await h.one(`SELECT amount, status, member_id, data FROM payments WHERE id = 'pay1'`);
    expect(p1).toMatchObject({ amount: 500, status: 'confirmed', member_id: 'u-del' });
    const d1 = JSON.parse(p1.data);
    expect(d1).toMatchObject({ kind: 'charge', method: 'cash', memberName: 'Silinmiş üye' });
    expect(d1.note).toBeUndefined();
    expect(typeof d1.memberDeletedAt).toBe('number');
    // an entry she filed for someone else loses only her name
    expect(JSON.parse((await h.one(`SELECT data FROM payments WHERE id = 'pay2'`)).data)).toEqual({ kind: 'charge', method: 'cash', submittedBy: 'u-del' });
    expect(await count(h, 'payments', `1 = 1`)).toBe(2);

    // ---- the trainer's calendar: the past stays, the upcoming one is cancelled and frees its slot; no credit link remains
    const past = await h.one(`SELECT status s, credit_id c FROM pt_sessions WHERE id = 's-past'`);
    expect(past).toEqual({ s: 'completed', c: null });
    expect(await h.one(`SELECT status s, credit_id c, cancelled_by_role r, refund_outcome o FROM pt_sessions WHERE id = 's-next'`))
      .toEqual({ s: 'cancelled', c: null, r: 'system', o: 'void' });

    // ---- gym content she authored keeps existing, nameless
    expect(await h.one(`SELECT created_by_name n FROM announcements WHERE id = 'an1'`)).toEqual({ n: null });
    expect(await h.one(`SELECT updated_by_name n FROM member_notes WHERE member_id = 'u-mem'`)).toEqual({ n: null });

    // ---- seat tallies and package in-use counter follow
    expect(await h.one(`SELECT active_member_count c FROM tenants WHERE id = 't1'`)).toEqual({ c: 1 });
    expect(await h.one(`SELECT active_member_count c FROM tenants WHERE id = 't2'`)).toEqual({ c: 0 });
    expect(await h.one(`SELECT active_assignment_count c FROM gym_packages WHERE id = 'pk1'`)).toEqual({ c: 1 });
  });

  it('is idempotent: the token still verifies but the identity is gone, so a repeat is a harmless 200', async () => {
    const h = await sliceHarness();
    await seed(h);
    await del(h, 'fb-del');
    const before = await h.one(`SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM payments) p, (SELECT sum(active_member_count) FROM tenants) m`);
    const again = await del(h, 'fb-del');
    expect(again.status).toBe(200);
    expect(await h.json(again)).toMatchObject({ deleted: true, alreadyDeleted: true, authDeletionRequired: true, subject: 'fb-del' });
    expect(await h.one(`SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM payments) p, (SELECT sum(active_member_count) FROM tenants) m`)).toEqual(before);
    // and the deleted person can no longer act
    expect((await h.send('GET', '/v1/tenants/t1/contact', 'fb-del')).status).toBe(403);
  });

  it("does not touch anyone else's data when two members delete in a row (counters stay exact)", async () => {
    const h = await sliceHarness();
    await seed(h);
    await h.addUser('u-del2', ['member']);
    await h.run(`UPDATE tenants SET active_member_count = 3 WHERE id = 't1'`);
    await del(h, 'fb-del');
    await del(h, 'fb-del2');
    expect(await h.one(`SELECT active_member_count c FROM tenants WHERE id = 't1'`)).toEqual({ c: 1 });
    expect(await count(h, 'memberships', `member_id = 'u-mem' AND status = 'active'`)).toBe(1);
  });

  it('refuses the sole active admin of a gym (409) and changes nothing; with another active admin it goes through and the admin tally follows', async () => {
    const h = await sliceHarness();
    await h.run(`UPDATE tenants SET active_admin_count = 1 WHERE id = 't1'`);
    const before = await h.one(`SELECT (SELECT count(*) FROM memberships) m, (SELECT count(*) FROM identities) i`);
    const r = await del(h, 'fb-admin');
    expect(r.status).toBe(409);
    expect(await h.one(`SELECT (SELECT count(*) FROM memberships) m, (SELECT count(*) FROM identities) i`)).toEqual(before);
    // a suspended second admin does not count as "another admin"
    await h.addUser('u-adm2', ['admin'], { status: 'suspended' });
    expect((await del(h, 'fb-admin')).status).toBe(409);
    await h.run(`UPDATE memberships SET status = 'active' WHERE member_id = 'u-adm2'`);
    await h.run(`UPDATE tenants SET active_admin_count = 2 WHERE id = 't1'`);
    expect((await del(h, 'fb-admin')).status).toBe(200);
    expect(await h.one(`SELECT active_admin_count a FROM tenants WHERE id = 't1'`)).toEqual({ a: 1 });
    // the remaining admin is now the sole one
    expect((await del(h, 'fb-adm2')).status).toBe(409);
  });

  it('the last-admin guard also fires INSIDE the write: if the other admin vanishes between the check and the batch, nothing is deleted (409)', async () => {
    const h = await sliceHarness();
    await h.addUser('u-adm2', ['admin']);
    await seed(h);
    await h.run(`UPDATE memberships SET roles = '["admin"]' WHERE member_id = 'u-del' AND tenant_id = 't1'`);   // keep the seeded world, make u-del an admin of t1 too
    await h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id IN ('u-admin','u-adm2')`);
    // two ACTIVE admins (u-del, u-adm2) at pre-check time; the proxy removes u-adm2 right before the batch
    await h.run(`UPDATE memberships SET status = 'active' WHERE member_id = 'u-adm2'`);   // 2 active admins at pre-check time
    const proxy = Object.create(h.db) as D1Database;
    let flipped = false;
    (proxy as any).batch = async (list: D1PreparedStatement[]) => {
      if (!flipped) { flipped = true; await h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-adm2'`); }   // the race: the other admin is gone
      return h.db.batch(list);
    };
    (proxy as any).prepare = (q: string) => h.db.prepare(q);
    const res = await h.app.fetch(new Request('http://x/v1/me/delete-account', {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${await h.sign('fb-del')}` }, body: '{"confirm":true}',
    }), { ...h.env, DB: proxy } as never);
    expect(flipped).toBe(true);
    expect(res.status).toBe(409);
    expect(await count(h, 'memberships', `member_id = 'u-del' AND status = 'active'`)).toBe(2);   // untouched
    expect(await count(h, 'identities', `user_id = 'u-del'`)).toBe(1);
    expect(await count(h, 'member_packages', `member_id = 'u-del'`)).toBe(1);
  });

  it('being sole admin of a gym you merely own, while another gym has a spare admin: still refused', async () => {
    const h = await sliceHarness();
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-admin','active','["admin"]',1)`);
    await h.addUser('u-adm2', ['admin']);   // spare admin in t1 only
    expect((await del(h, 'fb-admin')).status).toBe(409);
  });

  it('a trainer leaving: upcoming sessions are cancelled WITH the lesson given back and the member told; past ones stay under a scrubbed tombstone', async () => {
    const h = await sliceHarness();
    await h.addUser('u-tr', ['trainer']);
    await h.run(`UPDATE memberships SET display_name = 'Coach', phone = '5' WHERE member_id = 'u-tr'`);
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES
      ('c1','t1','u-mem','ptLesson','purchase','pk',3,2,1,${NOW + 30 * DAY},'active'),
      ('c2','t1','u-mem','ptLesson','purchase','pk',2,2,1,${NOW + 30 * DAY},'exhausted')`);
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at) VALUES
      ('a','t1','u-tr','u-mem',${NOW + DAY},60,'scheduled','c1',1,1),
      ('b','t1','u-tr','u-mem',${NOW + 2 * DAY},60,'scheduled','c1',1,1),
      ('c','t1','u-tr','u-mem',${NOW + 3 * DAY},60,'scheduled','c2',1,1),
      ('d','t1','u-tr','u-mem',${NOW + 4 * DAY},60,'scheduled',NULL,1,1),
      ('e','t1','u-tr','u-mem',${NOW - DAY},60,'completed','c1',1,1)`);
    expect((await del(h, 'fb-tr')).status).toBe(200);
    expect((await h.db.prepare(`SELECT id, status, refund_outcome o, cancelled_by_role r FROM pt_sessions ORDER BY id`).all<any>()).results).toEqual([
      { id: 'a', status: 'cancelled', o: 'refunded', r: 'system' }, { id: 'b', status: 'cancelled', o: 'refunded', r: 'system' },
      { id: 'c', status: 'cancelled', o: 'refunded', r: 'system' }, { id: 'd', status: 'cancelled', o: 'no-credit', r: 'system' },
      { id: 'e', status: 'completed', o: null, r: null },
    ]);
    // c1 gets back one lesson per cancelled session (2), c2 was exhausted and is usable again
    expect((await h.db.prepare(`SELECT id, used, status FROM member_credits ORDER BY id`).all<any>()).results).toEqual([
      { id: 'c1', used: 0, status: 'active' }, { id: 'c2', used: 1, status: 'active' },
    ]);
    const push = await h.db.prepare(`SELECT payload FROM outbox WHERE kind = 'push'`).all<{ payload: string }>();
    expect(push.results.map((x) => JSON.parse(x.payload))).toEqual([expect.objectContaining({ userIds: ['u-mem'], category: 'bookings', title: 'Randevun iptal edildi' })]);
    // the past session still has a trainer row to point at, and it is anonymous
    expect(await h.one(`SELECT status, display_name n, phone FROM memberships WHERE tenant_id = 't1' AND member_id = 'u-tr'`)).toEqual({ status: 'left', n: 'Silinmiş üye', phone: null });
    expect((await h.send('GET', '/v1/tenants/t1/contact', 'fb-tr')).status).toBe(403);
  });

  it("a parent leaving: the children's guardian link and consent are cleared (no dangling authority) and the children are told", async () => {
    const h = await sliceHarness();
    await h.addUser('u-par', ['member']);
    await h.addUser('u-kid', ['member']);
    await h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_name = 'P', guardian_status = 'approved', guardian_consent_at = 5, guardian_consent_version = 'v1' WHERE member_id = 'u-kid'`);
    expect((await del(h, 'fb-par')).status).toBe(200);
    expect(await h.one(`SELECT guardian_id g, guardian_name n, guardian_status s, guardian_consent_at a, guardian_consent_version v, status FROM memberships WHERE member_id = 'u-kid'`))
      .toEqual({ g: null, n: null, s: null, a: null, v: null, status: 'active' });
    const push = (await h.db.prepare(`SELECT payload FROM outbox`).all<{ payload: string }>()).results.map((x) => JSON.parse(x.payload));
    expect(push).toEqual([expect.objectContaining({ userIds: ['u-kid'], category: 'account' })]);
  });

  it('a gym owner who is not the last admin can delete; the gym keeps pointing at an anonymous owner row', async () => {
    const h = await sliceHarness();
    await h.addUser('u-owner', null);
    const made = await h.json(await h.send('POST', '/v1/tenants', 'fb-owner', { code: 'OWN-9', name: 'Own' }));
    expect((await del(h, 'fb-owner')).status).toBe(409);   // sole admin
    await h.addUser('u-co', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES (?, 'u-co', 'active', '["admin"]', 1)`, made.id);
    expect((await del(h, 'fb-owner')).status).toBe(200);
    expect(await h.one(`SELECT owner_user_id o FROM tenants WHERE id = ?`, made.id)).toEqual({ o: 'u-owner' });
    expect(await h.one(`SELECT display_name n FROM users WHERE id = 'u-owner'`)).toEqual({ n: 'Silinmiş üye' });
  });

  it('a managed member created by a deleted admin keeps working (created_by still resolves)', async () => {
    const h = await sliceHarness();
    await h.addUser('u-adm2', ['admin']);
    await h.run(`INSERT INTO users (id, display_name, created_at) VALUES ('mm1','Managed',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, managed, created_by, requested_at) VALUES ('t1','mm1','active','["member"]',1,'u-adm2',1)`);
    expect((await del(h, 'fb-adm2')).status).toBe(200);
    expect(await h.one(`SELECT created_by c FROM memberships WHERE member_id = 'mm1'`)).toEqual({ c: 'u-adm2' });
  });

  // Reads table_info through PRAGMA, which D1 does not authorise: schema drift is checked on the shim run.
  it.skipIf(process.env.REAL_D1)('DRIFT TRIPWIRE: every table that carries a member/user key is either erased by deleteMyAccount or consciously retained', async () => {
    const h = await sliceHarness();
    const { results: tables } = await h.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all<{ name: string }>();
    const keyed: string[] = [];
    for (const { name } of tables) {
      const { results: cols } = await h.db.prepare(`SELECT name FROM pragma_table_info('${name}')`).all<{ name: string }>();
      for (const c of cols) if (['member_id', 'user_id', 'trainer_id', 'owner_trainer_id', 'viewer_trainer_id', 'reported_by', 'created_by', 'updated_by'].includes(c.name)) keyed.push(`${name}.${c.name}`);
    }
    // ERASED by account.ts (statement per table) or SCRUBBED/RETAINED on purpose. A new table with a person key must be added here
    // AND to the statement list in account.ts, or deleting an account silently leaves that person's data behind.
    const known = [
      'identities.user_id', 'push_tokens.user_id', 'user_settings.user_id',
      'memberships.member_id', 'memberships.created_by',
      'member_notes.member_id', 'member_notes.updated_by', 'member_admin_notes.member_id', 'member_admin_notes.updated_by',
      'member_addresses.member_id', 'member_addresses.updated_by',
      'class_bookings.member_id', 'class_waitlist.member_id', 'class_attendance.member_id', 'class_cancellation_refunds.member_id', 'checkins.member_id',
      'programs.member_id', 'workout_logs.member_id', 'measurements.member_id', 'payments.member_id',
      'member_packages.member_id', 'member_credits.member_id', 'package_change_requests.member_id', 'package_change_requests.created_by',
      'pt_sessions.trainer_id', 'pt_sessions.member_id', 'trainer_availability.trainer_id', 'calendar_shares.owner_trainer_id', 'calendar_shares.viewer_trainer_id',
      'renewal_requests.member_id', 'exercise_reports.reported_by', 'announcements.created_by',
    ];
    expect(keyed.filter((k) => !known.includes(k)), 'new person-keyed columns: extend account.ts (erase or consciously retain) and this list').toEqual([]);
  });
});
