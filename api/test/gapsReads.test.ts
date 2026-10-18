import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

type H = Awaited<ReturnType<typeof harness>>;
const NOW = Date.now();
const DAY = 86_400_000;
const T1 = '/v1/tenants/t1';
const get = async (h: H, path: string, sub: string | null) => {
  const r = await h.send('GET', `${T1}${path}`, sub);
  return { status: r.status, body: (await r.json()) as any };
};

async function world(h: H) {
  await h.addUser('u-tr', ['trainer']);
  await h.addUser('u-tr2', ['trainer']);
  await h.addUser('u-fd', ['member'], { permissions: ['checkin'] });
  await h.addUser('u-par', ['member']);
  await h.addUser('u-kid', ['member']);
  await h.run(`UPDATE memberships SET display_name = 'Mem Ber' WHERE member_id = 'u-mem'`);
  await h.run(`UPDATE memberships SET display_name = 'Kid', birth_date = ${NOW - 10 * 365 * DAY}, guardian_id = 'u-par', guardian_name = 'Par', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
  await h.run(`UPDATE memberships SET display_name = 'Par' WHERE member_id = 'u-par'`);
  await h.run(`UPDATE memberships SET display_name = 'Coach' WHERE member_id = 'u-tr'`);
  await h.run(`UPDATE memberships SET display_name = 'Coach Two' WHERE member_id = 'u-tr2'`);
  await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('pk1','t1','{}')`);
}

describe('member packages: gym-wide list and single read', () => {
  it('staff list newest end first with memberId and assignedBy; default 200, hard cap 1000; members refused', async () => {
    const h = await harness();
    await world(h);
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at, assigned_by) VALUES
      ('mp-a','t1','u-mem','pk1',25050,1,1000,'active','{"packageName":"A","kind":"membership"}',1,'u-admin'),
      ('mp-b','t1','u-par','pk1',100,1,3000,'active','{"packageName":"B"}',1,'u-admin'),
      ('mp-c','t1','u-mem','pk1',100,1,2000,'expired','{"packageName":"C"}',1,NULL)`);
    const r = await get(h, '/member-packages', 'fb-admin');
    expect(r.status).toBe(200);
    expect(r.body.map((x: any) => x.id)).toEqual(['mp-b', 'mp-c', 'mp-a']);
    expect(r.body[2]).toMatchObject({ id: 'mp-a', memberId: 'u-mem', assignedBy: 'u-admin', finalPrice: 25050, packageName: 'A', packageId: 'pk1', status: 'active' });
    expect(r.body[1].assignedBy).toBeNull();
    expect((await get(h, '/member-packages', 'fb-tr')).status).toBe(200);
    expect((await get(h, '/member-packages', 'fb-mem')).status).toBe(403);
    expect((await get(h, '/member-packages?limit=2', 'fb-admin')).body).toHaveLength(2);
    // the per-member list carries the same two fields
    const per = await get(h, '/members/u-mem/member-packages'.replace('member-packages', 'packages'), 'fb-mem');
    expect(per.body.map((x: any) => [x.id, x.memberId, x.assignedBy])).toEqual([['mp-c', 'u-mem', null], ['mp-a', 'u-mem', 'u-admin']]);

    await h.run(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1100)
      INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, assigned_at)
      SELECT 'bulk' || i, 't1', 'u-mem', 'pk1', 1, 1, 5000 + i, 'active', 1 FROM n`);
    expect((await get(h, '/member-packages', 'fb-admin')).body).toHaveLength(200);
    expect((await get(h, '/member-packages?limit=999999', 'fb-admin')).body).toHaveLength(1000);
    expect((await get(h, '/member-packages?limit=abc', 'fb-admin')).body).toHaveLength(200);
  });

  it('one assignment: the member, staff, an approved guardian; everyone else (incl. a pending guardian, another gym) gets 404', async () => {
    const h = await harness();
    await world(h);
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at, assigned_by) VALUES
      ('mp-kid','t1','u-kid','pk1',500,1,${NOW + DAY},'active','{"packageName":"Kid pack"}',1,'u-admin')`);
    const own = await get(h, '/member-packages/mp-kid', 'fb-kid');
    expect(own.body).toMatchObject({ id: 'mp-kid', memberId: 'u-kid', assignedBy: 'u-admin', finalPrice: 500, packageName: 'Kid pack' });
    for (const sub of ['fb-admin', 'fb-tr', 'fb-par']) expect((await get(h, '/member-packages/mp-kid', sub)).status, sub).toBe(200);
    expect((await get(h, '/member-packages/mp-kid', 'fb-mem')).status).toBe(404);
    expect((await get(h, '/member-packages/nope', 'fb-admin')).status).toBe(404);
    await h.run(`UPDATE memberships SET guardian_status = 'pending' WHERE member_id = 'u-kid'`);
    expect((await get(h, '/member-packages/mp-kid', 'fb-par')).status).toBe(404);
    // another gym's admin does not see it, and the id does not leak across gyms
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-oa', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-oa','active','["admin"]',1)`);
    expect((await h.send('GET', '/v1/tenants/t2/member-packages/mp-kid', 'fb-oa')).status).toBe(404);
    expect((await h.send('GET', `${T1}/member-packages/mp-kid`, null)).status).toBe(401);
  });
});

describe('payments ledger: gym-wide list', () => {
  it('admin only, newest first, with memberId and memberName; an anonymised row keeps its scrubbed name', async () => {
    const h = await harness();
    await world(h);
    await h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES
      ('p1','t1','u-mem',25050,'confirmed','{"kind":"charge","method":"cash"}',100),
      ('p2','t1','u-par',700,'pending','{"kind":"charge","method":"card","memberName":"Stored Name"}',300),
      ('p3','t1','u-kid',900,'confirmed','{"kind":"charge","method":"cash","memberName":"Silinmiş üye","memberDeletedAt":5}',200),
      ('p4','t1','u-gone',400,'confirmed','{"kind":"charge","method":"cash","memberName":"Eski Üye"}',50)`);
    const r = await get(h, '/payments', 'fb-admin');
    expect(r.status).toBe(200);
    expect(r.body.map((x: any) => x.id)).toEqual(['p2', 'p3', 'p1', 'p4']);
    expect(r.body.map((x: any) => [x.memberId, x.memberName])).toEqual([['u-par', 'Par'], ['u-kid', 'Silinmiş üye'], ['u-mem', 'Mem Ber'], ['u-gone', 'Eski Üye']]);
    expect(r.body[2]).toMatchObject({ amount: 25050, status: 'confirmed', method: 'cash', createdAt: 100 });
    for (const sub of ['fb-tr', 'fb-mem']) expect((await get(h, '/payments', sub)).status, sub).toBe(403);
    expect((await get(h, '/payments?limit=1', 'fb-admin')).body).toHaveLength(1);
    // the per-member ledger carries memberId too
    expect((await get(h, '/members/u-mem/payments', 'fb-mem')).body[0]).toMatchObject({ id: 'p1', memberId: 'u-mem', amount: 25050 });
  });
});

describe('roster and single membership read', () => {
  it('the roster carries permissions, dates, height, guardian and creator fields; ?limit= up to 1000', async () => {
    const h = await harness();
    await world(h);
    await h.run(`UPDATE memberships SET height_cm = 180, approved_at = 77, requested_at = 55, created_by = 'u-admin', guardian_consent_at = 9, guardian_consent_version = 'v1', left_at = NULL WHERE member_id = 'u-kid'`);
    const r = await get(h, '/members', 'fb-tr');
    expect(r.status).toBe(200);
    const kid = r.body.find((x: any) => x.memberId === 'u-kid');
    expect(kid).toMatchObject({ permissions: [], requestedAt: 55, approvedAt: 77, heightCm: 180, guardianId: 'u-par', guardianName: 'Par', guardianStatus: 'approved',
      guardianConsentAt: 9, guardianConsentVersion: 'v1', leftAt: null, createdBy: 'u-admin' });
    expect(r.body.find((x: any) => x.memberId === 'u-fd').permissions).toEqual(['checkin']);
    expect((await get(h, '/members', 'fb-mem')).status).toBe(403);
    expect((await get(h, '/members?limit=2', 'fb-admin')).body).toHaveLength(2);
    await h.run(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1100)
      INSERT INTO users (id, display_name, created_at) SELECT 'bu' || i, 'B' || i, 1 FROM n`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) SELECT 't1', id, 'pending', '["member"]', 1 FROM users WHERE id LIKE 'bu%'`);
    expect((await get(h, '/members', 'fb-admin')).body).toHaveLength(500);
    expect((await get(h, '/members?limit=1000', 'fb-admin')).body).toHaveLength(1000);
    expect((await get(h, '/members?limit=5000', 'fb-admin')).body).toHaveLength(1000);
  });

  it('the single read also carries permissions, leftAt, createdBy and the consent record', async () => {
    const h = await harness();
    await world(h);
    await h.run(`UPDATE memberships SET created_by = 'u-admin', guardian_consent_at = 9, guardian_consent_version = 'v1', left_at = 123 WHERE member_id = 'u-kid'`);
    const r = await get(h, '/members/u-kid', 'fb-admin');
    expect(r.body).toMatchObject({ memberId: 'u-kid', permissions: [], leftAt: 123, createdBy: 'u-admin', guardianConsentAt: 9, guardianConsentVersion: 'v1' });
    expect((await get(h, '/members/u-fd', 'fb-admin')).body.permissions).toEqual(['checkin']);
  });
});

describe('announcements ?all=1', () => {
  it('an admin sees expired ones too (cap 200); members and trainers never do, whatever they ask', async () => {
    const h = await harness();
    await world(h);
    await h.run(`INSERT INTO announcements (id, tenant_id, title, body, created_by, created_at, expires_at) VALUES
      ('live','t1','Live','b','u-admin',${NOW - 1000},${NOW + DAY}), ('old','t1','Old','b','u-admin',${NOW - 2000},${NOW - DAY}), ('forever','t1','Forever','b','u-admin',${NOW - 3000},NULL)`);
    expect((await get(h, '/announcements', 'fb-admin')).body.map((x: any) => x.id)).toEqual(['live', 'forever']);
    expect((await get(h, '/announcements?all=1', 'fb-admin')).body.map((x: any) => x.id)).toEqual(['live', 'old', 'forever']);
    for (const sub of ['fb-mem', 'fb-tr']) expect((await get(h, '/announcements?all=1', sub)).body.map((x: any) => x.id), sub).toEqual(['live', 'forever']);
    await h.run(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 260)
      INSERT INTO announcements (id, tenant_id, title, body, created_by, created_at, expires_at) SELECT 'm' || i, 't1', 'T', 'b', 'u-admin', i, ${NOW - DAY} FROM n`);
    expect((await get(h, '/announcements?all=1', 'fb-admin')).body).toHaveLength(200);
    expect((await get(h, '/announcements', 'fb-admin')).body).toHaveLength(2);
  });
});

describe('package change requests: filters', () => {
  it('staff filter by memberId and status; a member only ever sees their own; junk status is a 400', async () => {
    const h = await harness();
    await world(h);
    const row = (id: string, m: string, st: string, at: number) =>
      h.run(`INSERT INTO package_change_requests (id, tenant_id, member_id, data, effective_at, expires_at, status, created_at) VALUES (?, 't1', ?, '{}', 1, ${NOW + DAY}, ?, ?)`, id, m, st, at);
    await row('r1', 'u-mem', 'pending', 1); await row('r2', 'u-mem', 'approved', 2); await row('r3', 'u-par', 'pending', 3);
    const ids = async (q: string, sub: string) => (await get(h, `/package-change-requests${q}`, sub)).body.map((x: any) => x.id);
    expect(await ids('', 'fb-admin')).toEqual(['r3', 'r2', 'r1']);
    expect(await ids('?memberId=u-mem', 'fb-admin')).toEqual(['r2', 'r1']);
    expect(await ids('?status=pending', 'fb-admin')).toEqual(['r3', 'r1']);
    expect(await ids('?memberId=u-mem&status=pending', 'fb-tr')).toEqual(['r1']);
    expect(await ids('?limit=1', 'fb-admin')).toEqual(['r3']);
    expect(await ids('', 'fb-mem')).toEqual(['r2', 'r1']);
    expect(await ids('?memberId=u-par', 'fb-mem')).toEqual([]);          // asking for someone else's widens nothing
    expect(await ids('?memberId=u-mem&status=approved', 'fb-mem')).toEqual(['r2']);
    expect((await get(h, '/package-change-requests?status=bogus', 'fb-admin')).status).toBe(400);
  });
});

describe('calendar shares list', () => {
  it('a trainer sees what they gave and received; admin sees all; names come along; members are refused', async () => {
    const h = await harness();
    await world(h);
    await h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-tr','u-tr2',10), ('t1','u-tr2','u-tr',20)`);
    await h.addUser('u-tr3', ['trainer']);
    await h.run(`UPDATE memberships SET display_name = 'Coach Three' WHERE member_id = 'u-tr3'`);
    await h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-tr3','u-tr2',30)`);
    const q = async (qs: string, sub: string) => (await get(h, `/calendar-shares${qs}`, sub));
    expect((await q('?as=owner', 'fb-tr')).body).toEqual([{ ownerTrainerId: 'u-tr', ownerName: 'Coach', viewerTrainerId: 'u-tr2', viewerName: 'Coach Two', createdAt: 10 }]);
    expect((await q('?as=viewer', 'fb-tr')).body.map((x: any) => x.ownerTrainerId)).toEqual(['u-tr2']);
    expect((await q('', 'fb-tr')).body).toHaveLength(2);
    expect((await q('?as=viewer', 'fb-tr2')).body.map((x: any) => x.ownerTrainerId)).toEqual(['u-tr', 'u-tr3']);
    expect((await q('', 'fb-admin')).body).toHaveLength(3);
    expect((await q('?as=owner', 'fb-admin')).body).toEqual([]);           // an admin who does not coach has none of their own
    expect((await q('', 'fb-mem')).status).toBe(403);
    expect((await q('?as=nobody', 'fb-tr')).status).toBe(400);
    // another gym's shares never show up
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-tr','active','["trainer"]',1), ('t2','u-tr2','active','["trainer"]',1)`);
    await h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t2','u-tr','u-tr2',40)`);
    expect((await q('', 'fb-tr')).body).toHaveLength(2);
  });
});

describe('check-in log', () => {
  it('admin or a checkin holder, window and limit, newest first with names and reasons; others refused', async () => {
    const h = await harness();
    await world(h);
    const ck = (id: string, m: string, reason: string, at: number) => h.run(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES (?, 't1', ?, ?, ?)`, id, m, JSON.stringify({ accessReason: reason }), at);
    await ck('c1', 'u-mem', 'ok', 100); await ck('c2', 'u-par', 'frozen', 200); await ck('c3', 'u-mem', 'guardian', 300);
    const r = await get(h, '/checkins', 'fb-admin');
    expect(r.body).toEqual([
      { id: 'c3', memberId: 'u-mem', memberName: 'Mem Ber', accessReason: 'guardian', createdAt: 300 },
      { id: 'c2', memberId: 'u-par', memberName: 'Par', accessReason: 'frozen', createdAt: 200 },
      { id: 'c1', memberId: 'u-mem', memberName: 'Mem Ber', accessReason: 'ok', createdAt: 100 }]);
    expect((await get(h, '/checkins', 'fb-fd')).status).toBe(200);
    expect((await get(h, '/checkins?from=150&to=300', 'fb-admin')).body.map((x: any) => x.id)).toEqual(['c2']);
    expect((await get(h, '/checkins?limit=1', 'fb-admin')).body.map((x: any) => x.id)).toEqual(['c3']);
    for (const sub of ['fb-tr', 'fb-mem']) expect((await get(h, '/checkins', sub)).status, sub).toBe(403);
    expect((await get(h, '/checkins?from=abc', 'fb-admin')).status).toBe(400);
    // a suspended holder of the permission loses it
    await h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-fd'`);
    expect((await get(h, '/checkins', 'fb-fd')).status).toBe(403);
  });
});

describe("a guardian's children", () => {
  it('staff and checkin holders list them with link state; a plain member cannot', async () => {
    const h = await harness();
    await world(h);
    const r = await get(h, '/guardians/u-par/children', 'fb-tr');
    expect(r.body).toEqual([{ memberId: 'u-kid', name: 'Kid', birthDate: NOW - 10 * 365 * DAY, status: 'active', guardianStatus: 'approved' }]);
    expect((await get(h, '/guardians/u-par/children', 'fb-fd')).status).toBe(200);
    expect((await get(h, '/guardians/u-par/children', 'fb-admin')).status).toBe(200);
    expect((await get(h, '/guardians/u-par/children', 'fb-mem')).status).toBe(403);
    expect((await get(h, '/guardians/u-mem/children', 'fb-admin')).body).toEqual([]);
  });
});

describe('PT reads: names, timestamps, windows, gym-wide', () => {
  it('every list carries trainerName, memberName, createdAt, updatedAt; from/to narrow member and trainer lists; the gym-wide list is admin-only', async () => {
    const h = await harness();
    await world(h);
    const s = (id: string, at: number, st = 'scheduled') => h.run(
      `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES (?, 't1', 'u-tr', 'u-mem', ?, 60, ?, 11, 22)`, id, at, st);
    await s('s1', NOW + DAY); await s('s2', NOW + 2 * DAY); await s('s3', NOW + 3 * DAY); await s('s4', NOW - 20 * DAY, 'completed');
    const one = (await get(h, '/members/u-mem/pt-sessions', 'fb-mem')).body.find((x: any) => x.id === 's1');
    expect(one).toMatchObject({ trainerName: 'Coach', memberName: 'Mem Ber', createdAt: 11, updatedAt: 22, status: 'scheduled', trainerId: 'u-tr', memberId: 'u-mem' });
    const ids = async (path: string, sub = 'fb-admin') => (await get(h, path, sub)).body.map((x: any) => x.id);
    expect(await ids(`/members/u-mem/pt-sessions?from=${NOW + 1.5 * DAY}&to=${NOW + 2.5 * DAY}`)).toEqual(['s2']);
    expect(await ids(`/members/u-mem/pt-sessions?to=${NOW}`)).toEqual(['s4']);
    expect(await ids(`/trainers/u-tr/pt-sessions?to=${NOW + 2.5 * DAY}`, 'fb-tr')).toEqual(['s1', 's2']);       // default from = a week ago
    expect(await ids(`/trainers/u-tr/pt-sessions?from=${NOW - 30 * DAY}&to=${NOW + 1.5 * DAY}`, 'fb-tr')).toEqual(['s4', 's1']);
    expect((await get(h, '/members/u-mem/pt-sessions?from=abc', 'fb-mem')).status).toBe(400);
    // gym-wide (admin): window, limit, names
    expect(await ids('/pt-sessions')).toEqual(['s1', 's2', 's3']);
    expect(await ids(`/pt-sessions?from=${NOW - 30 * DAY}&to=${NOW + 2.5 * DAY}`)).toEqual(['s4', 's1', 's2']);
    expect(await ids('/pt-sessions?limit=1')).toEqual(['s1']);
    for (const sub of ['fb-tr', 'fb-mem']) expect((await get(h, '/pt-sessions', sub)).status, sub).toBe(403);
    expect((await get(h, '/pt-sessions', 'fb-admin')).body[0]).toMatchObject({ trainerName: 'Coach', memberName: 'Mem Ber' });
    // another gym's sessions never leak into this gym's list
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-tr','active','["trainer"]',1), ('t2','u-mem','active','["member"]',1)`);
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES ('sx','t2','u-tr','u-mem',${NOW + DAY},60,'scheduled',1,1)`);
    expect(await ids('/pt-sessions')).toEqual(['s1', 's2', 's3']);
  });

  it('availability carries updatedAt; busy slots carry the session status', async () => {
    const h = await harness();
    await world(h);
    await h.run(`INSERT INTO trainer_availability (tenant_id, trainer_id, weekly, slot_minutes, updated_at) VALUES ('t1','u-tr','{}',60,4242)`);
    expect((await get(h, '/trainers/u-tr/availability', 'fb-mem')).body).toMatchObject({ slotMinutes: 60, updatedAt: 4242 });
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES ('s1','t1','u-tr','u-mem',${NOW + DAY},60,'scheduled',1,1)`);
    expect((await get(h, '/trainers/u-tr/busy', 'fb-mem')).body).toEqual([{ startsAt: NOW + DAY, durationMinutes: 60, status: 'scheduled' }]);
  });
});

describe('classes: filters and waitlist position', () => {
  it('the class list takes to and trainerId; bookings carry a 1-based waitlistPosition by join time', async () => {
    const h = await harness();
    await world(h);
    const k = (id: string, at: number, trainer: string | null) =>
      h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES (?, 't1', ?, ?)`, id, JSON.stringify({ name: id, capacity: 1, ...(trainer ? { trainerId: trainer } : {}) }), at);
    await k('k1', NOW + DAY, 'u-tr'); await k('k2', NOW + 2 * DAY, 'u-tr2'); await k('k3', NOW + 3 * DAY, 'u-tr');
    const ids = async (qs: string) => (await get(h, `/classes${qs}`, 'fb-mem')).body.map((x: any) => x.id);
    expect(await ids('')).toEqual(['k1', 'k2', 'k3']);
    expect(await ids(`?to=${NOW + 2.5 * DAY}`)).toEqual(['k1', 'k2']);
    expect(await ids('?trainerId=u-tr')).toEqual(['k1', 'k3']);
    expect(await ids(`?trainerId=u-tr&to=${NOW + 2 * DAY}`)).toEqual(['k1']);
    expect((await get(h, '/classes?to=abc', 'fb-mem')).status).toBe(400);

    await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','k1','u-par',1)`);
    await h.run(`INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at) VALUES ('t1','k1','u-kid',50), ('t1','k1','u-mem',10), ('t1','k1','u-tr2',50), ('t1','k2','u-mem',5)`);
    const mine = (await get(h, '/class-bookings', 'fb-mem')).body;
    expect(mine).toEqual([
      expect.objectContaining({ classId: 'k1', status: 'waitlisted', waitlistPosition: 1 }),
      expect.objectContaining({ classId: 'k2', status: 'waitlisted', waitlistPosition: 1 })]);
    expect((await get(h, '/class-bookings?memberId=u-kid', 'fb-admin')).body[0].waitlistPosition).toBe(2);   // u-mem(10), then u-kid(50, earlier row)
    expect((await get(h, '/class-bookings?memberId=u-tr2', 'fb-admin')).body[0].waitlistPosition).toBe(3);
    const booked = (await get(h, '/class-bookings', 'fb-par')).body[0];
    expect(booked.status).toBe('booked');
    expect('waitlistPosition' in booked).toBe(false);
  });
});
