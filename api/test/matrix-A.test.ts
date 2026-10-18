import { beforeEach, describe, expect, it } from 'vitest';

import { harness } from './helpers';

/**
 * Rules-test matrix, chunk A (TSV rows 1..71). Each name starts with [L<line>] of the
 * backend/tests/firestore.rules.test.ts test it mirrors. See .gstack/tmp/matrix-A.tsv.
 */
let h: Awaited<ReturnType<typeof harness>>;
beforeEach(async () => { h = await harness(); });

const FUTURE = 9_000_000_000_000;
const PKG_UNLIMITED = '{"entitlements":{"groupClasses":{"unlimited":true}}}';

const seedClass = (id: string, data: object, tenant = 't1') =>
  h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES (?, ?, ?, ?)`, id, tenant, JSON.stringify(data), FUTURE);
const seedPackage = (member: string, data: string, endsAt = FUTURE, status = 'active') =>
  h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
         VALUES (?, 't1', ?, 'g1', 0, 1, ?, ?, ?, 1)`, 'mp-' + member, member, endsAt, status, data);
const seedT2 = () => h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
const seedT2Member = (id: string, role: string, status = 'active') =>
  h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2', ?, ?, ?, 1)`, id, status, JSON.stringify([role]));
const mem = async (id: string) => await h.one(`SELECT * FROM memberships WHERE tenant_id = 't1' AND member_id = ?`, id);

describe('A: auth, tenants, membership requests', () => {
  it('[L58] unauthenticated callers get 401 on every protected read', async () => {
    for (const p of ['/v1/me', '/v1/tenants/t1/classes', '/v1/tenants/t1/members', '/v1/tenants/t1/members/u-mem',
      '/v1/tenants/t1/members/u-mem/payments', '/v1/tenants/t1/announcements', '/v1/tenants/t1/packages']) {
      expect((await h.send('GET', p, null)).status, p).toBe(401);
    }
  });

  it('[L91] unauthenticated callers cannot read a tenant or a membership row', async () => {
    expect((await h.send('GET', '/v1/tenants/by-code/T1', null)).status).toBe(401);
    expect((await h.send('GET', '/v1/tenants/t1/members/u-admin', null)).status).toBe(401);
    expect((await h.send('GET', '/v1/tenants/t1/members', null)).status).toBe(401);
  });

  it('[L97] any signed-in user (even unbootstrapped) can look a tenant up by code, safe DTO only', async () => {
    const res = await h.send('GET', '/v1/tenants/by-code/t1', 'fb-nobody');
    expect(res.status).toBe(200);
    expect(Object.keys((await res.json()) as object).sort()).toEqual(['branding', 'code', 'id', 'name']);
  });

  it('[L132] join creates only the caller\'s own pending member row; body cannot raise status/roles or target another user', async () => {
    await h.addUser('u-new', null);
    const res = await h.send('POST', '/v1/tenants/t1/join', 'fb-new',
      { status: 'active', roles: ['admin'], permissions: ['checkin'], memberId: 'u-mem', userId: 'u-mem' });
    expect(res.status).toBe(201);
    expect(await mem('u-new')).toMatchObject({ status: 'pending', roles: '["member"]', permissions: '[]' });
    expect(await mem('u-mem')).toMatchObject({ status: 'active', roles: '["member"]' });   // untouched
    // no internal user yet (not bootstrapped) cannot join at all
    expect((await h.send('POST', '/v1/tenants/t1/join', 'fb-ghost')).status).toBe(409);
  });

  it('[L161] only a tenant admin can approve a pending membership', async () => {
    await h.addUser('u-pend', ['member'], { status: 'pending' });
    const path = '/v1/tenants/t1/members/u-pend/status';
    expect((await h.send('PUT', path, 'fb-pend', { status: 'active' })).status).toBe(403);   // self-approval
    expect((await h.send('PUT', path, 'fb-mem', { status: 'active' })).status).toBe(403);    // plain member
    expect((await mem('u-pend')).status).toBe('pending');
    expect((await h.send('PUT', path, 'fb-admin', { status: 'active' })).status).toBe(200);
    expect((await mem('u-pend')).status).toBe('active');
  });

  it('[L180] admin sees pending requests of their gym; a stranger sees nothing', async () => {
    await h.addUser('u-pend', ['member'], { status: 'pending' });
    await h.addUser('u-str', null);
    const list = (await (await h.send('GET', '/v1/tenants/t1/members', 'fb-admin')).json()) as { memberId: string; status: string }[];
    expect(list.find((m) => m.memberId === 'u-pend')?.status).toBe('pending');
    expect((await h.send('GET', '/v1/tenants/t1/members/u-pend', 'fb-admin')).status).toBe(200);
    expect((await h.send('GET', '/v1/tenants/t1/members', 'fb-str')).status).toBe(403);
    expect((await h.send('GET', '/v1/tenants/t1/members/u-pend', 'fb-str')).status).toBe(404);
  });
});

describe('A: classes and booking', () => {
  it('[L282] only staff with the right to can create a class: member 403, admin 201', async () => {
    const body = { name: 'Yoga', capacity: 5, startsAt: FUTURE };
    expect((await h.send('POST', '/v1/tenants/t1/classes', 'fb-mem', body)).status).toBe(403);
    expect((await h.send('POST', '/v1/tenants/t1/classes', 'fb-admin', body)).status).toBe(201);
    expect(await h.one(`SELECT count(*) c FROM classes`)).toEqual({ c: 1 });
  });

  it('[L294] unlimited entitlement books the caller only; booking for someone else is refused', async () => {
    await h.addUser('u-new', ['member']);
    await seedClass('open', { name: 'HIIT', capacity: 10 });
    await seedPackage('u-new', PKG_UNLIMITED);
    expect((await h.send('POST', '/v1/tenants/t1/classes/open/book', 'fb-new', { memberId: 'u-mem' })).status).toBe(403);
    expect((await h.send('POST', '/v1/tenants/t1/classes/open/book', 'fb-new')).status).toBe(201);
    const rows = await h.db.prepare(`SELECT member_id FROM class_bookings`).all<any>();
    expect(rows.results.map((r: any) => r.member_id)).toEqual(['u-new']);
  });

  it('[L306] a member with no group-class entitlement cannot book (no waitlist route exists either)', async () => {
    await h.addUser('u-bare', ['member']);
    await seedClass('open', { name: 'HIIT', capacity: 10 });
    expect((await h.send('POST', '/v1/tenants/t1/classes/open/book', 'fb-bare')).status).toBe(409);
    expect((await h.send('POST', '/v1/tenants/t1/classes/open/waitlist', 'fb-bare')).status).toBe(409);   // F3: the waitlist route exists and refuses without an entitlement
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });

  it('[L313] a quota (non-unlimited) entitlement cannot book on this path', async () => {
    await h.addUser('u-quota', ['member']);
    await seedClass('open', { name: 'HIIT', capacity: 10 });
    await seedPackage('u-quota', '{"entitlements":{"groupClasses":{"count":4,"periodDays":30}}}');
    expect((await h.send('POST', '/v1/tenants/t1/classes/open/book', 'fb-quota')).status).toBe(409);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });

  it('[L320] an expired entitlement cannot book', async () => {
    await h.addUser('u-lapsed', ['member']);
    await seedClass('open', { name: 'HIIT', capacity: 10 });
    await seedPackage('u-lapsed', PKG_UNLIMITED, Date.now() - 86_400_000);
    expect((await h.send('POST', '/v1/tenants/t1/classes/open/book', 'fb-lapsed')).status).toBe(409);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });

  it('[L336] booking past capacity is refused', async () => {
    await h.addUser('u-first', ['member']);
    await h.addUser('u-new', ['member']);
    await seedClass('full', { name: 'Pilates', capacity: 1 });
    await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','full','u-first',1)`);
    await seedPackage('u-new', PKG_UNLIMITED);
    expect((await h.send('POST', '/v1/tenants/t1/classes/full/book', 'fb-new')).status).toBe(409);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 1 });
  });

  it('[L348] cancelling needs no entitlement, but only your own booking', async () => {
    await h.addUser('u-first', ['member']);
    await h.addUser('u-str', ['member']);
    await seedClass('full', { name: 'Pilates', capacity: 1 });
    await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','full','u-first',1)`);
    // another member cannot cancel it, neither by naming the owner nor by plain delete
    expect((await h.send('DELETE', '/v1/tenants/t1/classes/full/book', 'fb-str', { memberId: 'u-first' })).status).toBe(403);
    await h.send('DELETE', '/v1/tenants/t1/classes/full/book', 'fb-str');
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 1 });
    // the owner has no package at all and may still cancel
    expect((await h.send('DELETE', '/v1/tenants/t1/classes/full/book', 'fb-first')).status).toBe(200);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });

  it('[L361] a non-member cannot book even knowing the class id', async () => {
    await h.addUser('u-out', null);
    await seedClass('open', { name: 'HIIT', capacity: 10 });
    expect((await h.send('POST', '/v1/tenants/t1/classes/open/book', 'fb-out')).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });

  it('[L366] a tenant admin can edit and delete any class of the gym', async () => {
    await seedClass('open', { name: 'HIIT', capacity: 10 });
    expect((await h.send('PUT', '/v1/tenants/t1/classes/open', 'fb-admin', { name: 'HIIT', capacity: 20, startsAt: FUTURE })).status).toBe(200);
    expect(JSON.parse((await h.one(`SELECT data d FROM classes WHERE id = 'open'`)).d).capacity).toBe(20);
    expect((await h.send('DELETE', '/v1/tenants/t1/classes/open', 'fb-admin')).status).toBe(200);
    expect(await h.one(`SELECT 1 x FROM classes WHERE id = 'open'`)).toBeNull();
  });
});

describe('A: check-ins', () => {
  it('[L374] a member cannot self-check-in; an admin can', async () => {
    const body = { memberId: 'u-mem', accessReason: 'ok' };
    expect((await h.send('POST', '/v1/tenants/t1/checkins', 'fb-mem', body)).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM checkins`)).toEqual({ c: 0 });
    expect((await h.send('POST', '/v1/tenants/t1/checkins', 'fb-admin', body)).status).toBe(201);
    expect(await h.one(`SELECT count(*) c FROM checkins`)).toEqual({ c: 1 });
  });

  it('[L404] check-ins have no update/delete route (read endpoint is F3)', async () => {
    const { id } = (await (await h.send('POST', '/v1/tenants/t1/checkins', 'fb-admin', { memberId: 'u-mem', accessReason: 'ok' })).json()) as { id: string };
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      expect((await h.send(m, `/v1/tenants/t1/checkins/${id}`, 'fb-admin', { memberId: 'u-admin' })).status, m).toBe(404);
    }
    expect((await h.one(`SELECT member_id m FROM checkins WHERE id = ?`, id)).m).toBe('u-mem');
  });

  it('[L433] accessReason must be a known value', async () => {
    const p = '/v1/tenants/t1/checkins';
    expect((await h.send('POST', p, 'fb-admin', { memberId: 'u-mem' })).status).toBe(400);
    expect((await h.send('POST', p, 'fb-admin', { memberId: 'u-mem', accessReason: 'made-up-reason' })).status).toBe(400);
    expect((await h.send('POST', p, 'fb-admin', { memberId: 'u-mem', accessReason: 'frozen' })).status).toBe(201);
  });
});

describe('A: rejoin after leaving (P0-6)', () => {
  const former = async (id: string, status: string, roles: string[] = ['member'], permissions: string[] = []) => {
    await h.addUser(id, roles, { status, permissions });
    await h.run(`UPDATE memberships SET short_code = '424242', left_at = ? WHERE tenant_id = 't1' AND member_id = ?`, status === 'left' ? 5 : null, id);
  };
  const join = (sub: string, body?: object) => h.send('POST', '/v1/tenants/t1/join', sub, body);

  it('[L534] someone who left can apply again', async () => {
    await former('u-quitter', 'left');
    expect((await join('fb-quitter')).status).toBe(201);
    expect(await mem('u-quitter')).toMatchObject({ status: 'pending', left_at: null });
  });

  it('[L540] someone who was rejected can apply again', async () => {
    await former('u-turned', 'rejected');
    expect((await join('fb-turned')).status).toBe(201);
    expect((await mem('u-turned')).status).toBe('pending');
  });

  it('[L546] rejoining cannot go straight to active', async () => {
    await former('u-sneaky', 'left');
    expect((await join('fb-sneaky', { status: 'active', approvedAt: 1 })).status).toBe(201);
    expect(await mem('u-sneaky')).toMatchObject({ status: 'pending', approved_at: null });
  });

  it('[L552] a former trainer does not keep the trainer role through a rejoin', async () => {
    await former('u-coach', 'left', ['trainer']);
    await join('fb-coach', { roles: ['trainer'] });
    expect((await mem('u-coach')).roles).toBe('["member"]');
  });

  it('[L559] a former delegated permission is dropped on rejoin', async () => {
    await former('u-desk', 'left', ['member'], ['checkin']);
    await join('fb-desk', { permissions: ['checkin'] });
    expect((await mem('u-desk')).permissions).toBe('[]');
  });

  it('[L567] a suspended member cannot let themselves back in', async () => {
    await former('u-banned', 'suspended');
    expect((await join('fb-banned')).status).toBe(409);
    expect((await mem('u-banned')).status).toBe('suspended');
  });

  it('[L573] nobody can rejoin on someone else\'s behalf', async () => {
    await former('u-victim', 'left');
    await h.addUser('u-stranger', null);
    await join('fb-stranger', { memberId: 'u-victim', userId: 'u-victim' });
    expect((await mem('u-victim')).status).toBe('left');
  });

  it('[L579] rejoining cannot rewrite the shortCode', async () => {
    await former('u-thief', 'left');
    await join('fb-thief', { shortCode: '999999', short_code: '999999' });
    expect((await mem('u-thief')).short_code).toBe('424242');
  });

  it('[L585] rejoining cannot move the membership to another gym', async () => {
    await seedT2();
    await former('u-hopper', 'left');
    await join('fb-hopper', { tenantId: 't2' });
    expect(await h.one(`SELECT 1 x FROM memberships WHERE tenant_id = 't2' AND member_id = 'u-hopper'`)).toBeNull();
    expect((await mem('u-hopper')).status).toBe('pending');
  });
});

describe('A: trainer rows visible to members (PKG-8)', () => {
  beforeEach(async () => {
    await h.addUser('u-bm', ['member']);
    await h.addUser('u-trainer', ['trainer']);
  });

  it('[L593] a member can read a trainer row in their own gym', async () => {
    const res = await h.send('GET', '/v1/tenants/t1/members/u-trainer', 'fb-bm');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { roles: string[] }).roles).toEqual(['trainer']);
  });

  it('[L600] a member cannot read another member\'s row', async () => {
    await h.addUser('u-other', ['member']);
    expect((await h.send('GET', '/v1/tenants/t1/members/u-other', 'fb-bm')).status).toBe(404);
  });

  it('[L607] a member cannot read another gym\'s trainer', async () => {
    await seedT2();
    await h.run(`INSERT INTO users (id, created_at) VALUES ('u-ft', 1)`);
    await seedT2Member('u-ft', 'trainer');
    expect((await h.send('GET', '/v1/tenants/t2/members/u-ft', 'fb-bm')).status).toBe(404);
    expect((await h.send('GET', '/v1/tenants/t1/members/u-ft', 'fb-bm')).status).toBe(404);
  });

  it('[L614] a pending member cannot read the trainer list', async () => {
    await h.addUser('u-pend', ['member'], { status: 'pending' });
    expect((await h.send('GET', '/v1/tenants/t1/members/u-trainer', 'fb-pend')).status).toBe(404);
  });
});

describe('A: tenant isolation of classes', () => {
  beforeEach(() => seedClass('c1', { name: 'Pilates', capacity: 10 }));

  it('[L635] a member of the gym can read its classes', async () => {
    const res = await h.send('GET', '/v1/tenants/t1/classes', 'fb-mem');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }[]).map((c) => c.name)).toEqual(['Pilates']);
  });

  it('[L641] a signed-in user with no membership cannot read the gym\'s classes', async () => {
    await h.addUser('u-out', null);
    expect((await h.send('GET', '/v1/tenants/t1/classes', 'fb-out')).status).toBe(403);
    expect((await h.send('GET', '/v1/tenants/t1/classes', 'fb-unmapped')).status).toBe(403);
  });

  it('[L646] a member (even an admin) of a DIFFERENT gym cannot read this gym\'s classes', async () => {
    await seedT2();
    await h.addUser('u-rival', null);
    await seedT2Member('u-rival', 'admin');
    expect((await h.send('GET', '/v1/tenants/t1/classes', 'fb-rival')).status).toBe(403);
  });

  it('[L652] a pending member cannot read classes', async () => {
    await h.addUser('u-pend', ['member'], { status: 'pending' });
    expect((await h.send('GET', '/v1/tenants/t1/classes', 'fb-pend')).status).toBe(403);
  });
});

describe('A: cross-tenant injection (logs, measurements, payments)', () => {
  const rowsOf = async (table: string) => (await h.db.prepare(`SELECT * FROM ${table}`).all<any>()).results;

  it('[L660] a member cannot write a workout log into a gym they do not belong to', async () => {
    await seedT2();
    await h.addUser('u-w2', null);
    await seedT2Member('u-w2', 'member');
    expect((await h.send('POST', '/v1/tenants/t1/workout-logs', 'fb-w2', { programId: 'p1', exerciseLogs: [] })).status).toBe(403);
    expect(await rowsOf('workout_logs')).toHaveLength(0);
  });

  it('[L673] a member can write a workout log into their own gym', async () => {
    const res = await h.send('POST', '/v1/tenants/t1/workout-logs', 'fb-mem', { programId: 'p1', exerciseLogs: [] });
    expect(res.status).toBe(201);
    expect(await rowsOf('workout_logs')).toMatchObject([{ tenant_id: 't1', member_id: 'u-mem' }]);
  });

  it('[L686] a member cannot log a workout as somebody else (row is always filed under the caller)', async () => {
    const res = await h.send('POST', '/v1/tenants/t1/workout-logs', 'fb-mem',
      { programId: 'p1', exerciseLogs: [], memberId: 'u-admin', tenantId: 't2' });
    expect(res.status).toBe(201);
    expect(await rowsOf('workout_logs')).toMatchObject([{ tenant_id: 't1', member_id: 'u-mem' }]);
    expect(await h.one(`SELECT count(*) c FROM workout_logs WHERE member_id = 'u-admin'`)).toEqual({ c: 0 });
  });

  it('[L699] a measurement belongs to the caller and a gym they are in, with a sane weight', async () => {
    await seedT2();
    expect((await h.send('POST', '/v1/tenants/t1/measurements', 'fb-mem', { weightKg: 70, memberId: 'u-admin' })).status).toBe(201);
    expect(await rowsOf('measurements')).toMatchObject([{ tenant_id: 't1', member_id: 'u-mem' }]);
    expect((await h.send('POST', '/v1/tenants/t2/measurements', 'fb-mem', { weightKg: 70 })).status).toBe(403);   // gym they are not in
    expect((await h.send('POST', '/v1/tenants/t1/measurements', 'fb-mem', { weightKg: 0 })).status).toBe(400);
    expect((await h.send('POST', '/v1/tenants/t1/measurements', 'fb-mem', { weightKg: 9999 })).status).toBe(400);
    expect(await rowsOf('measurements')).toHaveLength(1);
  });

  it('[L717] measurements are append-only: no edit or delete route exists', async () => {
    const { id } = (await (await h.send('POST', '/v1/tenants/t1/measurements', 'fb-mem', { weightKg: 70 })).json()) as { id: string };
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      expect((await h.send(m, `/v1/tenants/t1/measurements/${id}`, 'fb-mem', { weightKg: 60 })).status, m).toBe(404);
      expect((await h.send(m, `/v1/tenants/t1/measurements/${id}`, 'fb-admin', { weightKg: 60 })).status, m).toBe(404);
    }
    expect(JSON.parse((await h.one(`SELECT data d FROM measurements WHERE id = ?`, id)).d).weightKg).toBe(70);
  });

  it('[L733] a member cannot spam a payment notice into a gym they do not belong to', async () => {
    await seedT2();
    await h.addUser('u-w2', null);
    await seedT2Member('u-w2', 'member');
    expect((await h.send('POST', '/v1/tenants/t1/payments', 'fb-w2', { memberId: 'u-w2', amount: 100, method: 'cash' })).status).toBe(403);
    expect(await rowsOf('payments')).toHaveLength(0);
  });

  it('[L748] a member can only file a PENDING notice; a requested "confirmed" is ignored', async () => {
    const res = await h.send('POST', '/v1/tenants/t1/payments', 'fb-mem', { memberId: 'u-mem', amount: 100, method: 'cash', status: 'confirmed' });
    expect(res.status).toBe(201);
    expect(await rowsOf('payments')).toMatchObject([{ status: 'pending', member_id: 'u-mem' }]);
  });

  it('[L774] payment amount and method are validated', async () => {
    const pay = (o: object) => h.send('POST', '/v1/tenants/t1/payments', 'fb-mem', { memberId: 'u-mem', ...o });
    expect((await pay({ amount: 0, method: 'cash' })).status).toBe(400);
    expect((await pay({ amount: -5, method: 'cash' })).status).toBe(400);
    expect((await pay({ amount: 100, method: 'bitcoin' })).status).toBe(400);
    expect(await rowsOf('payments')).toHaveLength(0);
  });

  it('[L784] a payment can never be deleted: no delete route, even for admin', async () => {
    await h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES ('pay1','t1','u-mem',100,'confirmed','{}',1)`);
    expect((await h.send('DELETE', '/v1/tenants/t1/payments/pay1', 'fb-admin')).status).toBe(404);
    expect((await h.send('DELETE', '/v1/tenants/t1/payments/pay1', 'fb-mem')).status).toBe(404);
    expect(await rowsOf('payments')).toHaveLength(1);
  });
});

describe('A: availability, busy slots, calendar shares', () => {
  beforeEach(async () => {
    await h.addUser('u-t1', ['trainer']);
    await h.addUser('u-t2', ['trainer']);
  });
  const av = (t: string) => `/v1/tenants/t1/trainers/${t}/availability`;
  const weekly = (end: string) => ({ weekly: { mon: [{ start: '08:00', end }] }, slotMinutes: 60, exceptions: [] });

  it('[L961] any tenant member reads availability; only the trainer or an admin writes it', async () => {
    expect((await h.send('PUT', av('u-t1'), 'fb-t1', weekly('12:00'))).status).toBe(200);
    expect((await h.send('PUT', av('u-t1'), 'fb-t2', { weekly: {}, slotMinutes: 60, exceptions: [] })).status).toBe(403);
    expect((await h.send('PUT', av('u-t1'), 'fb-mem', weekly('09:00'))).status).toBe(403);
    expect((await h.send('PUT', av('u-t1'), 'fb-admin', weekly('13:00'))).status).toBe(200);
    const res = await h.send('GET', av('u-t1'), 'fb-mem');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).weekly.mon[0].end).toBe('13:00');
    await h.addUser('u-out', null);
    expect((await h.send('GET', av('u-t1'), 'fb-out')).status).toBe(403);
  });

  it('[L1004] busy slots: any tenant member reads, nobody writes through the API', async () => {
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at)
                 VALUES ('s1','t1','u-t1','u-mem',?,60,'scheduled',1,1)`, FUTURE);
    const busy = '/v1/tenants/t1/trainers/u-t1/busy';
    const res = await h.send('GET', busy, 'fb-mem');
    expect(res.status).toBe(200);
    expect(Object.keys(((await res.json()) as object[])[0]).sort()).toEqual(['durationMinutes', 'startsAt']);
    await h.addUser('u-out', null);
    expect((await h.send('GET', busy, 'fb-out')).status).toBe(403);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect([404, 405], m).toContain((await h.send(m, busy, 'fb-mem', { status: 'cancelled' })).status);
    }
    expect((await h.one(`SELECT status s FROM pt_sessions WHERE id = 's1'`)).s).toBe('scheduled');
  });

  it('[L1024] a trainer can only share their OWN calendar', async () => {
    // The route takes only the viewer; the owner is always the caller, so impersonating another owner is impossible.
    expect((await h.send('PUT', '/v1/tenants/t1/calendar-shares/u-t2', 'fb-t1', { ownerTrainerId: 'u-t9' })).status).toBe(200);
    expect((await h.db.prepare(`SELECT owner_trainer_id o, viewer_trainer_id v FROM calendar_shares`).all<any>()).results)
      .toEqual([{ o: 'u-t1', v: 'u-t2' }]);
    // a non-trainer cannot share a calendar at all
    expect((await h.send('PUT', '/v1/tenants/t1/calendar-shares/u-t2', 'fb-mem')).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM calendar_shares`)).toEqual({ c: 1 });
  });

  it('[L1044] sharing with yourself is rejected', async () => {
    expect((await h.send('PUT', '/v1/tenants/t1/calendar-shares/u-t1', 'fb-t1')).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM calendar_shares`)).toEqual({ c: 0 });
  });
});

describe('A: trainer owns their own classes (PER-8)', () => {
  const klass = (o: object = {}) => ({ name: 'HIIT', startsAt: FUTURE, durationMinutes: 50, capacity: 10, trainerId: 'u-t1', ...o });
  const cdata = async (id: string) => JSON.parse((await h.one(`SELECT data d FROM classes WHERE id = ?`, id)).d);
  beforeEach(async () => {
    await h.addUser('u-t1', ['trainer']);
    await h.addUser('u-t2', ['trainer']);
  });

  it('[L1076] a trainer can schedule a class for themselves', async () => {
    expect((await h.send('POST', '/v1/tenants/t1/classes', 'fb-t1', klass())).status).toBe(201);
  });

  it('[L1082] but not one that lands on a colleague', async () => {
    expect((await h.send('POST', '/v1/tenants/t1/classes', 'fb-t1', klass({ trainerId: 'u-t2' }))).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM classes`)).toEqual({ c: 0 });
  });

  it('[L1090] an admin can schedule one for any trainer', async () => {
    expect((await h.send('POST', '/v1/tenants/t1/classes', 'fb-admin', klass({ trainerId: 'u-t9' }))).status).toBe(201);
  });


  it('[L1103] another trainer cannot edit or delete it', async () => {
    await seedClass('c5', klass());
    expect((await h.send('PUT', '/v1/tenants/t1/classes/c5', 'fb-t2', klass({ capacity: 99 }))).status).toBe(403);
    expect((await h.send('DELETE', '/v1/tenants/t1/classes/c5', 'fb-t2')).status).toBe(403);
    expect((await cdata('c5')).capacity).toBe(10);
  });

  it('[L1111] the owner cannot move the class to another gym or hand it away', async () => {
    await seedClass('c6', klass());
    expect((await h.send('PUT', '/v1/tenants/t1/classes/c6', 'fb-t1', klass({ trainerId: 'u-t2' }))).status).toBe(403);
    // tenantId in the body is ignored: the row stays in the gym of the path
    expect((await h.send('PUT', '/v1/tenants/t1/classes/c6', 'fb-t1', klass({ tenantId: 't2' }))).status).toBe(200);
    expect((await h.one(`SELECT tenant_id t FROM classes WHERE id = 'c6'`)).t).toBe('t1');
    expect((await cdata('c6')).tenantId).toBeUndefined();
    expect((await cdata('c6')).trainerId).toBe('u-t1');
  });

  it('[L1120] the owner can cancel their own class', async () => {
    await seedClass('c7', klass());
    expect((await h.send('DELETE', '/v1/tenants/t1/classes/c7', 'fb-t1')).status).toBe(200);
    expect(await h.one(`SELECT 1 x FROM classes WHERE id = 'c7'`)).toBeNull();
  });

  it('[L1127] a class with no trainerId stays admin-only', async () => {
    const { trainerId: _omit, ...legacy } = klass();
    await seedClass('legacy', legacy);
    expect((await h.send('PUT', '/v1/tenants/t1/classes/legacy', 'fb-t1', klass({ capacity: 20, trainerId: undefined }))).status).toBe(403);
    expect((await h.send('DELETE', '/v1/tenants/t1/classes/legacy', 'fb-t1')).status).toBe(403);
    expect((await cdata('legacy')).capacity).toBe(10);
    expect((await h.send('PUT', '/v1/tenants/t1/classes/legacy', 'fb-admin', klass({ capacity: 20, trainerId: undefined }))).status).toBe(200);
  });

  it('[L1140] a member cannot edit, delete or otherwise modify a class (take the register)', async () => {
    await seedClass('c8', klass());
    expect((await h.send('PUT', '/v1/tenants/t1/classes/c8', 'fb-mem', klass({ attendance: { 'u-mem': 'present' } }))).status).toBe(403);
    expect((await h.send('DELETE', '/v1/tenants/t1/classes/c8', 'fb-mem')).status).toBe(403);
    expect((await cdata('c8')).attendance).toBeUndefined();
  });
});
