import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const { __resetSupport } = await import('./classSupport');
const { resetSharedWatches } = await import('../firebase/sharedWatch');
const repo = await import('./classRepo');

const DAY = 86_400_000;
type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
/** Switch identity; `GET /me` is cached per Firebase user, which the test world does not model, so drop it. */
const as = (sub: string) => { w.signInAs(sub); __resetSupport(); };

beforeEach(async () => {
  __resetSupport();
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-trn2', ['trainer']);
  await w.h.addUser('u-m2', ['member']);
  await w.h.addUser('u-m3', ['member']);
});
afterEach(() => resetSharedWatches());

// ---- seeds -------------------------------------------------------------------------------------------------------
const unlimited = (member: string) =>
  w.h.run(
    `INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
     VALUES (?, 't1', ?, 'g1', 0, 1, ?, 'active', ?, 1)`,
    'mp-' + member, member, Date.now() + 60 * DAY, JSON.stringify({ kind: 'membership', entitlements: { gymAccess: true, groupClasses: { unlimited: true } } }),
  );
const quota = async (member: string, creditId: string, total = 4) => {
  await w.h.run(
    `INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
     VALUES (?, 't1', ?, 'g1', 0, 1, ?, 'active', ?, 1)`,
    'mp-' + member, member, Date.now() + 60 * DAY, JSON.stringify({ kind: 'membership', entitlements: { gymAccess: true, groupClasses: { count: total, periodDays: 30 } } }),
  );
  await w.h.run(
    `INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
     VALUES (?, 't1', ?, 'groupClass', 'entitlement', ?, ?, 0, 1, ?, 'active')`,
    creditId, member, 'mp-' + member, total, Date.now() + 30 * DAY,
  );
};
const seedClass = (id: string, o: { cap?: number; trainerId?: string; startsAt?: number; name?: string; seriesId?: string } = {}) =>
  w.h.run(
    `INSERT INTO classes (id, tenant_id, data, starts_at) VALUES (?, 't1', ?, ?)`,
    id,
    JSON.stringify({ name: o.name ?? 'Pilates', capacity: o.cap ?? 10, trainerName: 'Ayşe', durationMinutes: 50, ...(o.trainerId ? { trainerId: o.trainerId } : {}), ...(o.seriesId ? { seriesId: o.seriesId } : {}) }),
    o.startsAt ?? Date.now() + 5 * DAY,
  );
const creditRow = (id: string) => w.h.one(`SELECT used, status FROM member_credits WHERE id = ?`, id) as Promise<{ used: number; status: string }>;
const range = { from: new Date(Date.now() - DAY), to: new Date(Date.now() + 30 * DAY) };

/** Subscribes and resolves with the first value (or the one satisfying `until`). */
function firstValue<T>(sub: (cb: (v: T) => void, err: (e: unknown) => void) => () => void, until: (v: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    let stop: () => void = () => {};
    stop = sub(
      (v) => {
        if (until(v)) {
          queueMicrotask(() => stop());
          resolve(v);
        }
      },
      reject,
    );
  });
}
type S = import('../types').ClassSession[];
const classes = (until?: (v: S) => boolean) => firstValue<S>((cb, err) => repo.watchClassesForTenant('t1', range, cb, err as never), until);

describe('class list (watchClassesForTenant)', () => {
  it('maps the Worker class to the app ClassSession; a member sees counts, an opaque roster and their own id', async () => {
    await seedClass('k1', { cap: 3, trainerId: 'u-trn', seriesId: 'ser1' });
    await unlimited('u-mem'); await unlimited('u-m2');
    await w.h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','k1','u-mem',1), ('t1','k1','u-m2',2)`);
    const [c] = await classes();
    expect(c).toMatchObject({ id: 'k1', tenantId: 't1', name: 'Pilates', trainerId: 'u-trn', trainerName: 'Ayşe', seriesId: 'ser1', durationMinutes: 50, capacity: 3 });
    expect(c.date).toBeInstanceOf(Date);
    expect(c.bookedUserIds).toHaveLength(2);
    expect(c.bookedUserIds).toContain('u-mem');            // mine
    expect(c.bookedUserIds).not.toContain('u-m2');         // other members' identities never reach a member
    expect(c.waitlistUserIds).toEqual([]);
    expect(c.attendance).toBeUndefined();
  });

  it('staff get real ids and the register for classes that already took place', async () => {
    as('fb-admin');
    await seedClass('past', { startsAt: Date.now() - 2 * 3_600_000 });
    await seedClass('future');
    await unlimited('u-mem');
    await w.h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','past','u-mem',1), ('t1','future','u-mem',1)`);
    await w.h.run(`INSERT INTO class_attendance (tenant_id, class_id, member_id, mark, marked_by, marked_at) VALUES ('t1','past','u-mem','present','u-admin',1)`);
    const wide = { from: new Date(Date.now() - 2 * DAY), to: new Date(Date.now() + 30 * DAY) };
    const list = await firstValue<S>((cb, err) => repo.watchClassesForTenant('t1', wide, cb, err as never));
    const past = list.find((c) => c.id === 'past')!;
    expect(past.bookedUserIds).toEqual(['u-mem']);
    expect(past.attendance).toEqual({ 'u-mem': 'present' });
    expect(list.find((c) => c.id === 'future')!.bookedUserIds).toHaveLength(1);   // counted; identity only for past classes
  });

  it('applies the window: classes outside range.to are left out', async () => {
    await seedClass('in'); await seedClass('out', { startsAt: Date.now() + 90 * DAY });
    expect((await classes()).map((c) => c.id)).toEqual(['in']);
  });

  it('reports a refusal through onError (a member outside the gym)', async () => {
    await w.h.addUser('u-out', null);
    as('fb-out');
    await expect(classes()).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('booking', () => {
  it('bookClass: booked, then already-in; the list shows the seat; a refusal keeps the Turkish message', async () => {
    await seedClass('k1'); await unlimited('u-mem');
    expect(await repo.bookClass('k1', 'u-mem')).toBe('booked');
    expect(await repo.bookClass('k1', 'u-mem')).toBe('already-in');
    const [c] = await classes((l) => l[0]?.bookedUserIds.includes('u-mem'));
    expect(c.bookedUserIds).toEqual(['u-mem']);
    // no package at all -> the Worker refuses and the sentence reaches the screen unchanged
    as('fb-m2');
    const e: any = await repo.bookClass('k1', 'u-m2').catch((x) => x);
    expect(e.code).toBe('functions/failed-precondition');
    expect(e.message).toBe('Bu derse katılma hakkın yok. Paketini kontrol et.');
  });

  it('a full class puts the member on the waitlist (listed last, count right); cancelling a seat promotes them', async () => {
    await seedClass('k1', { cap: 1 });
    await unlimited('u-mem'); await unlimited('u-m2');
    expect(await repo.bookClass('k1', 'u-mem')).toBe('booked');
    as('fb-m2');
    expect(await repo.bookClass('k1', 'u-m2')).toBe('waitlisted');
    expect(await repo.bookClass('k1', 'u-m2')).toBe('already-in');
    const [c] = await classes((l) => l[0]?.waitlistUserIds.includes('u-m2'));
    expect(c.bookedUserIds).toHaveLength(1);
    expect(c.waitlistUserIds).toEqual(['u-m2']);

    as('fb-mem');
    await repo.cancelBooking('k1', 'u-mem');
    const booked = (await w.h.db.prepare(`SELECT member_id FROM class_bookings WHERE class_id = 'k1'`).all<any>()).results.map((r: any) => r.member_id);
    expect(booked).toEqual(['u-m2']);                      // promoted by the Worker
  });

  it('bookGroupClassWithCredit spends one credit; cancelGroupClassWithCredit gives it back in time', async () => {
    await seedClass('k1'); await quota('u-mem', 'cr1');
    expect(await repo.bookGroupClassWithCredit('k1')).toBe('booked');
    expect(await creditRow('cr1')).toMatchObject({ used: 1 });
    expect(await repo.bookGroupClassWithCredit('k1')).toBe('already-booked');
    expect(await repo.cancelGroupClassWithCredit('k1')).toEqual({ refunded: true });
    expect(await creditRow('cr1')).toMatchObject({ used: 0, status: 'active' });
  });

  it('a late cancellation keeps the credit spent (refunded false)', async () => {
    await seedClass('soon', { startsAt: Date.now() + 2 * 3_600_000 }); await quota('u-mem', 'cr1');
    await repo.bookGroupClassWithCredit('soon');
    expect(await repo.cancelGroupClassWithCredit('soon')).toEqual({ refunded: false });
    expect(await creditRow('cr1')).toMatchObject({ used: 1 });
  });

  it('a parent books for an approved child (memberId); a stranger is refused', async () => {
    await seedClass('k1');
    await w.h.addUser('u-kid', ['member']);
    await unlimited('u-kid');
    await w.h.run(`UPDATE memberships SET guardian_id = 'u-mem', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    expect(await repo.bookGroupClassWithCredit('k1', 'u-kid')).toBe('booked');
    as('fb-m3');
    const e: any = await repo.bookGroupClassWithCredit('k1', 'u-kid').catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
  });

  it('cancelBooking leaves the waitlist when only waiting; cancelling nothing is harmless', async () => {
    await seedClass('k1', { cap: 1 }); await unlimited('u-mem'); await unlimited('u-m2');
    await repo.bookClass('k1', 'u-mem');
    as('fb-m2');
    await repo.bookClass('k1', 'u-m2');
    await repo.cancelBooking('k1', 'u-m2');
    expect((await w.h.one(`SELECT count(*) n FROM class_waitlist`)).n).toBe(0);
    await expect(repo.cancelBooking('k1', 'u-m2')).resolves.toBeUndefined();
  });
});

describe('waitlist position', () => {
  it('shows my real place in the queue ("#n"), with the others as placeholders', async () => {
    await seedClass('k1', { cap: 1 });
    for (const u of ['u-m2', 'u-m3']) await unlimited(u);
    await unlimited('u-mem'); await unlimited('u-admin');
    await w.h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','k1','u-admin',1)`);
    await w.h.run(`INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at) VALUES ('t1','k1','u-m2',10), ('t1','k1','u-m3',20), ('t1','k1','u-mem',30)`);
    const [c] = await classes((l) => !!l[0]);
    expect(c.waitlistUserIds).toHaveLength(3);
    expect(c.waitlistUserIds.indexOf('u-mem')).toBe(2);                      // third in line -> "#3"
    as('fb-m2');
    resetSharedWatches();                                   // another account: no replay of the previous account's list
    const [d] = await classes((l) => !!l[0]);
    expect(d.waitlistUserIds.indexOf('u-m2')).toBe(0);
  });
});

describe('my classes (watchMyUpcomingClasses)', () => {
  it('lists only the classes I am booked into, soonest first, with my id in the roster', async () => {
    await unlimited('u-mem');
    await seedClass('b', { startsAt: Date.now() + 4 * DAY }); await seedClass('a', { startsAt: Date.now() + 2 * DAY }); await seedClass('c');
    await repo.bookClass('a', 'u-mem'); await repo.bookClass('b', 'u-mem');
    const list = await firstValue<S>((cb, err) => repo.watchMyUpcomingClasses('t1', 'u-mem', cb, err as never), (l) => l.length === 2);
    expect(list.map((c) => c.id)).toEqual(['a', 'b']);
    expect(list[0].bookedUserIds).toContain('u-mem');
  });

  it("a guardian watches the child's classes (userId = child)", async () => {
    await w.h.addUser('u-kid', ['member']); await unlimited('u-kid');
    await w.h.run(`UPDATE memberships SET guardian_id = 'u-mem', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    await seedClass('a');
    await repo.bookGroupClassWithCredit('a', 'u-kid');
    const list = await firstValue<S>((cb, err) => repo.watchMyUpcomingClasses('t1', 'u-kid', cb, err as never), (l) => l.length === 1);
    expect(list[0].bookedUserIds).toContain('u-kid');
  });
});

describe('the coach (watchClassesForTrainer, setClassAttendance)', () => {
  it('sees only their own classes with booked ids, waitlist ids and the register; marks and clears attendance', async () => {
    as('fb-trn');
    await seedClass('mine', { trainerId: 'u-trn', cap: 1 }); await seedClass('theirs', { trainerId: 'u-trn2' });
    await unlimited('u-mem'); await unlimited('u-m2');
    await w.h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','mine','u-mem',1)`);
    await w.h.run(`INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at) VALUES ('t1','mine','u-m2',2)`);
    const sub = (cb: (v: any) => void, err: (e: unknown) => void) => repo.watchClassesForTrainer('t1', 'u-trn', range, cb, err as never);
    const first: any[] = await firstValue(sub);
    expect(first.map((c) => c.id)).toEqual(['mine']);
    expect(first[0].bookedUserIds).toEqual(['u-mem']);
    expect(first[0].waitlistUserIds).toEqual(['u-m2']);
    expect(first[0].attendance).toBeUndefined();

    await repo.setClassAttendance('mine', 'u-mem', 'present');
    const marked: any[] = await firstValue(sub, (l) => !!l[0]?.attendance);
    expect(marked[0].attendance).toEqual({ 'u-mem': 'present' });
    await repo.setClassAttendance('mine', 'u-mem', null);
    expect((await w.h.one(`SELECT count(*) n FROM class_attendance`)).n).toBe(0);
  });

  it("refuses another coach's class and an unbooked member", async () => {
    await seedClass('theirs', { trainerId: 'u-trn2' }); await seedClass('mine', { trainerId: 'u-trn' });
    as('fb-trn');
    await repo.bookClass('mine', 'u-trn').catch(() => undefined);   // makes the id known to the registry
    const e: any = await repo.setClassAttendance('mine', 'u-mem', 'present').catch((x) => x);
    expect(e.message).toBe('Bu üye derse kayıtlı değil.');
    as('fb-trn2');
    const f: any = await repo.setClassAttendance('mine', 'u-mem', 'present').catch((x) => x);
    expect(f.code).toBe('functions/permission-denied');
  });
});

describe('writes: create / update / delete', () => {
  it('createClass: an admin creates, the class shows up at once (no waiting for the next poll)', async () => {
    as('fb-admin');
    const seen: any[] = [];
    const stop = repo.watchClassesForTenant('t1', range, (l) => seen.push(l));
    await vi.waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0]).toEqual([]);
    await repo.createClass({ tenantId: 't1', name: 'Yoga', trainerId: 'u-trn', trainerName: 'Mert', date: new Date(Date.now() + 2 * DAY), durationMinutes: 45, capacity: 12 });
    await vi.waitFor(() => expect(seen.length).toBe(2), { timeout: 3000 });
    expect(seen[1][0]).toMatchObject({ name: 'Yoga', trainerId: 'u-trn', trainerName: 'Mert', durationMinutes: 45, capacity: 12 });
    stop();
  });

  it('createClass: a member and a trainer for someone else are refused', async () => {
    const e: any = await repo.createClass({ tenantId: 't1', name: 'X', trainerName: 'Y', date: new Date(Date.now() + DAY), durationMinutes: 30, capacity: 5 }).catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
    as('fb-trn');
    const f: any = await repo.createClass({ tenantId: 't1', name: 'X', trainerId: 'u-trn2', trainerName: 'Y', date: new Date(Date.now() + DAY), durationMinutes: 30, capacity: 5 }).catch((x) => x);
    expect(f.code).toBe('functions/permission-denied');
    const g: any = await repo.createClass({ tenantId: 't1', name: 'X', trainerId: 'u-trn', trainerName: 'Y', date: new Date(Date.now() + DAY), durationMinutes: 30, capacity: 0 }).catch((x) => x);
    expect(g.code).toBe('functions/invalid-argument');
    expect(g.message).toBe('Ders bilgileri geçersiz. Ad, saat ve kontenjanı kontrol et.');
  });

  it('updateClass merges the change: name/time/capacity move, everything else (series, trainer) stays', async () => {
    as('fb-admin');
    await seedClass('k1', { trainerId: 'u-trn', seriesId: 'ser1' });
    await firstValue((cb, err) => repo.watchClassesForTenant('t1', range, cb, err as never));   // the screen loaded it
    const when = new Date(Date.now() + 9 * DAY);
    await repo.updateClass('k1', { name: '  Reformer ', capacity: 4, date: when });
    const row: any = await w.h.one(`SELECT data, starts_at FROM classes WHERE id = 'k1'`);
    expect(JSON.parse(row.data)).toMatchObject({ name: 'Reformer', capacity: 4, trainerId: 'u-trn', trainerName: 'Ayşe', seriesId: 'ser1', durationMinutes: 50 });
    expect(row.starts_at).toBe(when.getTime());
    await expect(repo.updateClass('k1', {})).resolves.toBeUndefined();   // nothing to change: no request
  });

  it('updateClass: a trainer may edit their own class but not hand it to someone else', async () => {
    await seedClass('k1', { trainerId: 'u-trn' });
    as('fb-trn');
    await firstValue((cb, err) => repo.watchClassesForTrainer('t1', 'u-trn', range, cb, err as never));
    await repo.updateClass('k1', { capacity: 7 });
    expect(JSON.parse(((await w.h.one(`SELECT data FROM classes WHERE id='k1'`)) as any).data).capacity).toBe(7);
    const e: any = await repo.updateClass('k1', { trainerId: 'u-trn2' }).catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
  });

  it('deleteClass refunds a credit-paid seat and removes the class', async () => {
    await seedClass('k1'); await quota('u-mem', 'cr1');
    await repo.bookGroupClassWithCredit('k1');
    as('fb-admin');
    await firstValue((cb, err) => repo.watchClassesForTenant('t1', range, cb, err as never));
    await repo.deleteClass('k1');
    expect(await w.h.one(`SELECT id FROM classes WHERE id='k1'`)).toBeNull();
    expect(await creditRow('cr1')).toMatchObject({ used: 0 });
    expect((await w.h.one(`SELECT count(*) n FROM class_cancellation_refunds WHERE outcome = 'refunded'`)).n).toBe(1);
  });

  it('an id the app never loaded: the only gym is assumed; with two gyms it fails loudly instead of guessing', async () => {
    await seedClass('k1');
    as('fb-admin');
    await repo.deleteClass('k1');                          // admin has exactly one gym
    expect(await w.h.one(`SELECT id FROM classes WHERE id='k1'`)).toBeNull();
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Gym 2',1)`);
    await w.h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-admin','active','["admin"]',1)`);
    __resetSupport();
    await expect(repo.deleteClass('nope')).rejects.toThrow(/GAP\(api\)/);
  });
});

describe('series', () => {
  it('createClassSeries makes `weeks` weekly classes sharing a seriesId; 1 week is an ordinary class', async () => {
    as('fb-admin');
    const start = new Date(Date.now() + 2 * DAY);
    const params = { tenantId: 't1', name: 'Zumba', trainerId: 'u-trn', trainerName: 'Ece', date: start, durationMinutes: 60, capacity: 20 };
    const one = await repo.createClassSeries(params, 1);
    expect(one).toEqual({ created: 1 });
    const out = await repo.createClassSeries(params, 3);
    expect(out.created).toBe(3);
    expect(out.seriesId).toBeTruthy();
    const rows = (await w.h.db.prepare(`SELECT data, starts_at FROM classes WHERE json_extract(data,'$.seriesId') = ? ORDER BY starts_at`).bind(out.seriesId).all<any>()).results;
    expect(rows).toHaveLength(3);
    const d1 = new Date(start); d1.setDate(d1.getDate() + 7);
    expect(rows[1].starts_at).toBe(d1.getTime());
    expect(JSON.parse(rows[0].data)).toMatchObject({ name: 'Zumba', trainerId: 'u-trn', capacity: 20 });
  });

  it('createClassSeries is one Worker call: all occurrences or none (a bad request leaves nothing behind)', async () => {
    as('fb-admin');
    const params = { tenantId: 't1', name: 'Zumba', trainerName: 'Ece', date: new Date(Date.now() + DAY), durationMinutes: 60, capacity: 20 };
    const e: any = await repo.createClassSeries({ ...params, capacity: 0 }, 4).catch((x) => x);
    expect(e.code).toBe('functions/invalid-argument');
    expect(e.message).toBe('Ders bilgileri geçersiz. Ad, saat ve kontenjanı kontrol et.');
    const tooLong: any = await repo.createClassSeries(params, 60).catch((x) => x);
    expect(tooLong.message).toBe('Tekrar sayısı 1 ile 52 arasında olmalı.');
    expect((await w.h.one(`SELECT count(*) n FROM classes`)).n).toBe(0);
    // a trainer may only make a series of their own
    as('fb-trn');
    const f: any = await repo.createClassSeries({ ...params, trainerId: 'u-trn2' }, 3).catch((x) => x);
    expect(f.code).toBe('functions/permission-denied');
  });

  it('deleteClassSeriesFrom cancels this week and later, forward-only', async () => {
    as('fb-admin');
    for (let i = 0; i < 4; i++) await seedClass('s' + i, { seriesId: 'ser1', startsAt: Date.now() + (i + 1) * 7 * DAY });
    await seedClass('other', { seriesId: 'ser2', startsAt: Date.now() + 15 * DAY });
    const out = await repo.deleteClassSeriesFrom('t1', 'ser1', new Date(Date.now() + 13 * DAY));
    expect(out).toEqual({ deleted: 3 });
    const left = (await w.h.db.prepare(`SELECT id FROM classes ORDER BY id`).all<any>()).results.map((r: any) => r.id);
    expect(left).toEqual(['other', 's0']);
    expect(await repo.deleteClassSeriesFrom('t1', 'ser1', new Date(Date.now() + 13 * DAY))).toEqual({ deleted: 0 });
  });
});
