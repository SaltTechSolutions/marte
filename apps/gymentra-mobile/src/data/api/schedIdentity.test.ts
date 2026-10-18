import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClassSession, PtSession } from '../types';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

/**
 * The screens hold my FIREBASE uid as `user.uid` and compare against it ~70 times; the Worker only knows the
 * internal `users.id` (u-mem, u-admin ... here). These tests sign in WITH a Firebase uid (`auth.currentUser`) and
 * use that uid everywhere a screen would: what goes out is the internal id, what comes back about ME is the
 * Firebase uid again, and everybody else's id stays internal on both sides.
 */
const { startWorld } = await import('./testWorld');
const { resetSchedulingCaches } = await import('./classSupport');
const { resetSharedWatches } = await import('../firebase/sharedWatch');
const { auth } = await import('@/services/firebase');
const classes = await import('./classRepo');
const pt = await import('./ptSessionRepo');
const checkin = await import('./checkinRepo');
const availability = await import('./availabilityRepo');
const shares = await import('./calendarShareRepo');

const DAY = 86_400_000;
type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
/** Sign in as the Firebase subject `sub` (token AND `auth.currentUser.uid`). */
const as = (sub: string) => {
  w.signInAs(sub);
  (auth as { currentUser: unknown }).currentUser = { uid: sub };
  resetSchedulingCaches();
};

beforeEach(async () => {
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-trn2', ['trainer']);
  as('fb-mem');
});
afterEach(() => {
  resetSharedWatches();
  (auth as { currentUser: unknown }).currentUser = null;
});

function firstValue<T>(sub: (cb: (v: T) => void, err: (e: unknown) => void) => () => void, until: (v: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    let stop: () => void = () => {};
    stop = sub((v) => { if (until(v)) { queueMicrotask(() => stop()); resolve(v); } }, reject);
  });
}
const unlimited = (member: string) =>
  w.h.run(
    `INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at) VALUES (?, 't1', ?, 'g1', 0, 1, ?, 'active', ?, 1)`,
    'mp-' + member, member, Date.now() + 60 * DAY, JSON.stringify({ packageName: 'Aylık', kind: 'membership', entitlements: { gymAccess: true, groupClasses: { unlimited: true } } }),
  );
const klass = (id: string, o: { cap?: number; trainerId?: string } = {}) =>
  w.h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES (?, 't1', ?, ?)`, id,
    JSON.stringify({ name: 'Pilates', capacity: o.cap ?? 5, trainerName: 'Ayşe', durationMinutes: 50, ...(o.trainerId ? { trainerId: o.trainerId } : {}) }), Date.now() + 3 * DAY);
const range = { from: new Date(Date.now() - DAY), to: new Date(Date.now() + 30 * DAY) };
const bookedRows = async (cls: string) => (await w.h.db.prepare(`SELECT member_id m FROM class_bookings WHERE class_id = ?`).bind(cls).all<any>()).results.map((r: any) => r.m);

describe('group classes with the app id', () => {
  it('self-booking and self-cancel: the Worker books the internal id, the screen sees its own Firebase uid', async () => {
    await klass('k1'); await unlimited('u-mem');
    expect(await classes.bookClass('k1', 'fb-mem')).toBe('booked');
    expect(await bookedRows('k1')).toEqual(['u-mem']);                       // D1 never holds the Firebase uid
    expect(await classes.bookClass('k1', 'fb-mem')).toBe('already-in');
    const list = await firstValue<ClassSession[]>((cb, err) => classes.watchClassesForTenant('t1', range, cb, err as never));
    expect(list[0].bookedUserIds).toContain('fb-mem');                        // `bookedUserIds.includes(user.uid)` keeps working
    expect(list[0].bookedUserIds).not.toContain('u-mem');
    const mine = await firstValue<ClassSession[]>((cb, err) => classes.watchMyUpcomingClasses('t1', 'fb-mem', cb, err as never), (l) => l.length === 1);
    expect(mine[0].bookedUserIds).toContain('fb-mem');
    await classes.cancelBooking('k1', 'fb-mem');
    expect(await bookedRows('k1')).toEqual([]);
  });

  it('the waitlist shows me as my Firebase uid; the credit path takes the app id too', async () => {
    await klass('k1', { cap: 1 }); await unlimited('u-mem'); await unlimited('u-admin');
    as('fb-admin'); await classes.bookClass('k1', 'fb-admin');
    as('fb-mem');
    expect(await classes.bookGroupClassWithCredit('k1')).toBe('waitlisted');
    const [c] = await firstValue<ClassSession[]>((cb, err) => classes.watchClassesForTenant('t1', range, cb, err as never), (l) => l[0]?.waitlistUserIds.includes('fb-mem'));
    expect(c.waitlistUserIds).toEqual(['fb-mem']);
    expect(c.bookedUserIds).toHaveLength(1);
    expect(c.bookedUserIds).not.toContain('fb-mem');
  });

  it('a coach sees themself as their Firebase uid (trainerId, filter) and members by internal id; attendance uses the same ids', async () => {
    await klass('mine', { trainerId: 'u-trn' }); await klass('theirs', { trainerId: 'u-trn2' });
    await unlimited('u-mem');
    await w.h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1','mine','u-mem',1)`);
    as('fb-trn');
    const list = await firstValue<ClassSession[]>((cb, err) => classes.watchClassesForTrainer('t1', 'fb-trn', range, cb, err as never));
    expect(list.map((c) => c.id)).toEqual(['mine']);
    expect(list[0].trainerId).toBe('fb-trn');
    expect(list[0].bookedUserIds).toEqual(['u-mem']);
    await classes.setClassAttendance('mine', 'u-mem', 'present');
    const marked = await firstValue<ClassSession[]>((cb, err) => classes.watchClassesForTrainer('t1', 'fb-trn', range, cb, err as never), (l) => !!l[0]?.attendance);
    expect(marked[0].attendance).toEqual({ 'u-mem': 'present' });
  });

  it('an admin creates and edits a class for a coach given by the coach\'s app id', async () => {
    as('fb-admin');
    await classes.createClass({ tenantId: 't1', name: 'Yoga', trainerId: 'u-trn', trainerName: 'Mert', date: new Date(Date.now() + DAY), durationMinutes: 45, capacity: 8 });
    // the admin picks MYSELF (the admin is also a coach here) -> stored as the internal id
    await w.h.run(`UPDATE memberships SET roles = '["admin","trainer"]' WHERE member_id = 'u-admin'`);
    await classes.createClass({ tenantId: 't1', name: 'Pilates', trainerId: 'fb-admin', trainerName: 'Ben', date: new Date(Date.now() + 2 * DAY), durationMinutes: 45, capacity: 8 });
    const rows = (await w.h.db.prepare(`SELECT data FROM classes ORDER BY starts_at`).all<any>()).results.map((r: any) => JSON.parse(r.data));
    expect(rows.map((r: any) => r.trainerId)).toEqual(['u-trn', 'u-admin']);
    const list = await firstValue<ClassSession[]>((cb, err) => classes.watchClassesForTenant('t1', range, cb, err as never), (l) => l.length === 2);
    expect(list.map((c) => c.trainerId)).toEqual(['u-trn', 'fb-admin']);
    await classes.updateClass(list[1].id, { trainerId: 'u-trn2' });
    expect(JSON.parse(((await w.h.one(`SELECT data FROM classes WHERE id = ?`, list[1].id)) as any).data).trainerId).toBe('u-trn2');
  });
});

describe('PT sessions with the app id', () => {
  const at = (days: number, hh: number) => { const d = new Date(Date.now() + days * DAY); d.setHours(hh, 0, 0, 0); return d.getTime(); };
  const seed = (id: string, trainer: string, member: string, start: number) =>
    w.h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES (?, 't1', ?, ?, ?, 60, 'scheduled', 1, 1)`, id, trainer, member, start);

  it('a member books and cancels as their Firebase uid; the list shows memberId === user.uid and the trainer by internal id', async () => {
    await w.h.run(`INSERT INTO trainer_availability (tenant_id, trainer_id, weekly, slot_minutes, exceptions, updated_at) VALUES ('t1','u-trn',?,60,'[]',1)`,
      JSON.stringify(Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [{ start: '00:00', end: '23:59' }]]))));
    await w.h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES ('cr1','t1','u-mem','ptLesson','purchase','p',3,0,1,?, 'active')`, Date.now() + 60 * DAY);
    const slot = new Date(at(2, 10));
    expect(await pt.bookPtSessions({ tenantId: 't1', trainerId: 'u-trn', slots: [slot] })).toEqual({ booked: 1 });
    const list = await firstValue<PtSession[]>((cb, err) => pt.watchUpcomingSessionsForMember('t1', 'fb-mem', cb, err as never), (l) => l.length === 1);
    expect(list[0]).toMatchObject({ memberId: 'fb-mem', trainerId: 'u-trn' });
    expect(await pt.hasSessionToday('t1', 'fb-mem', new Date(slot))).toBe(true);
    expect(await pt.cancelPtSession(list[0].id)).toEqual({ refunded: true });
  });

  it('a coach: calendar by their app id, trainerId comes back as their Firebase uid, createPtSession and reassign take app ids', async () => {
    await seed('s1', 'u-trn', 'u-mem', at(3, 10));
    as('fb-trn');
    const mine = await firstValue<PtSession[]>((cb, err) => pt.watchSessionsForTrainer('t1', 'fb-trn', { from: new Date(Date.now() - DAY), to: new Date(Date.now() + 30 * DAY) }, cb, err as never));
    expect(mine[0]).toMatchObject({ trainerId: 'fb-trn', memberId: 'u-mem' });
    await pt.createPtSession({ tenantId: 't1', trainerId: 'fb-trn', memberId: 'u-mem', date: new Date(at(4, 9)), durationMinutes: 45 });
    expect((await w.h.one(`SELECT trainer_id t FROM pt_sessions WHERE starts_at = ?`, at(4, 9))).t).toBe('u-trn');
    await pt.reassignSession(mine[0], 'u-trn2', 'Ece');
    expect((await w.h.one(`SELECT trainer_id t, original_trainer_id o FROM pt_sessions WHERE id = 's1'`))).toEqual({ t: 'u-trn2', o: 'u-trn' });
    // take it back as myself: the target is my Firebase uid
    await w.h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-trn2','u-trn',1)`);
    await pt.reassignSession({ ...mine[0], trainerId: 'u-trn2' }, 'fb-trn', 'Mert');
    expect((await w.h.one(`SELECT trainer_id t FROM pt_sessions WHERE id = 's1'`)).t).toBe('u-trn');
  });
});

describe('check-in with the app id', () => {
  const pkg = (member: string) =>
    w.h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at) VALUES (?, 't1', ?, 'g1', 0, ?, ?, 'active', ?, 1)`,
      'mp-' + member, member, Date.now() - DAY, Date.now() + 30 * DAY, JSON.stringify({ packageName: 'Aylık', kind: 'membership', entitlements: { gymAccess: true } }));

  it('self-check-in: the front desk scans a card holding the member\'s own Firebase uid (here the scanner IS that person)', async () => {
    await pkg('u-admin');
    as('fb-admin');
    expect(await checkin.resolveAccess('t1', 'fb-admin')).toMatchObject({ access: 'ok', packageLabel: 'Aylık' });
    expect(await checkin.checkInByMembershipId('t1', 't1_fb-admin')).toMatchObject({ ok: true, access: 'ok' });
    expect((await w.h.one(`SELECT member_id m FROM checkins`)).m).toBe('u-admin');
    expect(await checkin.checkInByMembershipId('t1', 't1_fb-admin')).toEqual({ ok: false, reason: 'already-checked-in' });
    const visits = await firstValue<Date[]>((cb, err) => checkin.watchMyCheckins('t1', 'fb-admin', new Date(Date.now() - DAY), cb, err as never), (l) => l.length === 1);
    expect(visits).toHaveLength(1);
  });

  it('a warning hands back a doc id built from the APP id, and confirming it with that id works', async () => {
    as('fb-admin');
    const out: any = await checkin.checkInByShortCode('t1', 'nope');
    expect(out).toEqual({ ok: false, reason: 'not-found' });
    await w.h.run(`UPDATE memberships SET short_code = '555555' WHERE member_id = 'u-admin'`);
    const warn: any = await checkin.checkInByShortCode('t1', '555555');
    expect(warn).toMatchObject({ ok: true, access: 'warn', warnReason: 'no-package', membershipDocId: 't1_fb-admin' });
    expect(await checkin.confirmCheckInDespiteWarning('t1', warn.membershipDocId, 'no-package')).toMatchObject({ ok: true });
    expect((await w.h.one(`SELECT member_id m FROM checkins`)).m).toBe('u-admin');
  });

  it('the desk scans ANOTHER member\'s card (their Firebase uid) while holding its own Firebase uid', async () => {
    await pkg('u-mem');
    as('fb-admin');
    expect(await checkin.checkInByMembershipId('t1', 't1_fb-mem')).toMatchObject({ ok: true, name: 'u-mem', access: 'ok' });
    expect((await w.h.one(`SELECT member_id m FROM checkins`)).m).toBe('u-mem');
  });

  it('another member by short code: the doc id carries their internal id (all a screen can know about them)', async () => {
    await w.h.run(`UPDATE memberships SET short_code = '123456' WHERE member_id = 'u-mem'`);
    as('fb-admin');
    expect(await checkin.checkInByShortCode('t1', '123456')).toMatchObject({ access: 'warn', membershipDocId: 't1_u-mem' });
  });
});

describe('availability and calendar shares with the app id', () => {
  it('a coach edits their own hours by Firebase uid; trainerId on the data is what the screen asked for', async () => {
    as('fb-trn');
    await availability.setTrainerAvailability({ tenantId: 't1', trainerId: 'fb-trn', weekly: { mon: [{ start: '09:00', end: '12:00' }] }, slotMinutes: 60, exceptions: [] });
    expect((await w.h.one(`SELECT trainer_id t FROM trainer_availability`)).t).toBe('u-trn');
    const a = await firstValue<any>((cb, err) => availability.watchTrainerAvailability('t1', 'fb-trn', cb, err as never));
    expect(a).toMatchObject({ trainerId: 'fb-trn', slotMinutes: 60 });
    expect(await firstValue<any[]>((cb, err) => availability.watchTrainerBusySlotsForDay('t1', 'fb-trn', new Date(), cb, err as never))).toEqual([]);
  });

  it('grant and revoke: my own side is my Firebase uid, the colleague\'s is the internal id', async () => {
    as('fb-trn');
    await shares.grantCalendarShare({ tenantId: 't1', ownerTrainerId: 'fb-trn', ownerTrainerName: 'Mert', viewerTrainerId: 'u-trn2' });
    expect((await w.h.one(`SELECT owner_trainer_id o, viewer_trainer_id v FROM calendar_shares`))).toEqual({ o: 'u-trn', v: 'u-trn2' });
    await shares.revokeCalendarShare('t1', 'fb-trn', 'u-trn2');
    expect(await w.h.one(`SELECT 1 x FROM calendar_shares`)).toBeNull();
    // the colleague revokes the share the other way round (viewer = me)
    await w.h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-trn2','u-trn',1)`);
    as('fb-admin');
    await shares.revokeCalendarShare('t1', 'u-trn2', 'u-trn');
    expect(await w.h.one(`SELECT 1 x FROM calendar_shares`)).toBeNull();
  });
});

it('resetSchedulingCaches forgets the id translation: the next account is translated afresh', async () => {
  await klass('k1'); await unlimited('u-mem'); await unlimited('u-admin');
  await classes.bookClass('k1', 'fb-mem');
  as('fb-admin');                                          // as() resets the caches, like the lead's sign-out hook
  await classes.bookClass('k1', 'fb-admin');
  expect((await bookedRows('k1')).sort()).toEqual(['u-admin', 'u-mem']);
});
