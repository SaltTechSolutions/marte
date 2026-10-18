import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PtSession } from '../types';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const { __resetSupport } = await import('./classSupport');
const { resetSharedWatches } = await import('../firebase/sharedWatch');
const { localParts, zonedTimeToMs } = await import('../../../../../api/src/cancellationDeadline');
const repo = await import('./ptSessionRepo');

const TZ = 'Europe/Istanbul';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const as = (sub: string) => { w.signInAs(sub); __resetSupport(); };

/** Istanbul wall-clock instant `days` from today at hh:mm. */
function at(days: number, hh: number, mm = 0): number {
  const p = localParts(Date.now() + days * DAY, TZ);
  return zonedTimeToMs(p.year, p.month, p.day, hh, mm, TZ);
}
const weekdayKey = (ms: number) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][(localParts(ms, TZ).weekday + 6) % 7];

beforeEach(async () => {
  __resetSupport();
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-trn2', ['trainer']);
  await w.h.run(`UPDATE memberships SET display_name = 'Mert Antrenör' WHERE member_id = 'u-trn'`);
  await w.h.run(`UPDATE memberships SET display_name = 'Ece Antrenör' WHERE member_id = 'u-trn2'`);
  await w.h.run(`UPDATE memberships SET display_name = 'Ali Üye' WHERE member_id = 'u-mem'`);
  await w.h.run(
    `INSERT INTO trainer_availability (tenant_id, trainer_id, weekly, slot_minutes, exceptions, updated_at) VALUES ('t1','u-trn',?,60,'[]',1)`,
    JSON.stringify({ [weekdayKey(at(3, 12))]: [{ start: '09:00', end: '13:00' }] }),
  );
});
afterEach(() => resetSharedWatches());

const credit = (id: string, o: { total?: number; used?: number; expires?: number; member?: string } = {}) =>
  w.h.run(
    `INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
     VALUES (?, 't1', ?, 'ptLesson', 'purchase', 'pkg', ?, ?, 1, ?, 'active')`,
    id, o.member ?? 'u-mem', o.total ?? 5, o.used ?? 0, o.expires ?? at(60, 12),
  );
const creditRow = (id: string) => w.h.one(`SELECT used, status FROM member_credits WHERE id = ?`, id) as Promise<{ used: number; status: string }>;
const seedSession = (id: string, o: { trainer?: string; member?: string; start?: number; dur?: number; status?: string; credit?: string | null; deadline?: number | null } = {}) =>
  w.h.run(
    `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, cancellation_deadline_at, created_at, updated_at)
     VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    id, o.trainer ?? 'u-trn', o.member ?? 'u-mem', o.start ?? at(3, 10), o.dur ?? 60, o.status ?? 'scheduled',
    o.credit === undefined ? null : o.credit, o.deadline === undefined ? null : o.deadline,
  );
const rowOf = (id: string) => w.h.one(`SELECT * FROM pt_sessions WHERE id = ?`, id) as Promise<any>;

function firstValue<T>(sub: (cb: (v: T) => void, err: (e: unknown) => void) => () => void, until: (v: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    let stop: () => void = () => {};
    stop = sub((v) => { if (until(v)) { queueMicrotask(() => stop()); resolve(v); } }, reject);
  });
}
type L = PtSession[];
const wide = { from: new Date(Date.now() - DAY), to: new Date(Date.now() + 30 * DAY) };

describe('booking a lesson (bookPtSessions)', () => {
  it('spends one credit per slot, and the session shows up with names, credit and the frozen deadline', async () => {
    await credit('cr1');
    const slots = [new Date(at(3, 10)), new Date(at(3, 11))];
    expect(await repo.bookPtSessions({ tenantId: 't1', trainerId: 'u-trn', slots })).toEqual({ booked: 2 });
    expect(await creditRow('cr1')).toMatchObject({ used: 2 });

    const list = await firstValue<L>((cb, err) => repo.watchUpcomingSessionsForMember('t1', 'u-mem', cb, err as never), (l) => l.length === 2);
    expect(list.map((s) => s.date.getTime())).toEqual(slots.map((s) => s.getTime()));
    expect(list[0]).toMatchObject({
      tenantId: 't1', trainerId: 'u-trn', trainerName: 'Mert Antrenör', memberId: 'u-mem', memberName: 'Ali Üye',
      durationMinutes: 60, status: 'scheduled', creditId: 'cr1',
    });
    expect(list[0].cancellationDeadlineAt).toBeInstanceOf(Date);
    expect(list[0].cancelledAt).toBeUndefined();
    expect(list[0].originalTrainerId).toBeUndefined();
  });

  it('refusals keep a Turkish sentence: outside working hours, slot taken, overlap, no credit, not a trainer', async () => {
    await credit('cr1', { total: 1 });
    const outside = await repo.bookPtSessions({ tenantId: 't1', trainerId: 'u-trn', slots: [new Date(at(3, 15))] }).catch((e) => e);
    expect(outside.code).toBe('functions/failed-precondition');
    expect(outside.message).toBe('Seçtiğin saat antrenörün çalışma saatleri dışında.');

    await seedSession('other', { member: 'u-admin', start: at(3, 10) });
    const taken = await repo.bookPtSessions({ tenantId: 't1', trainerId: 'u-trn', slots: [new Date(at(3, 10))] }).catch((e) => e);
    expect(taken.message).toBe('Seçtiğin saat az önce doldu, başka bir saat seç.');

    const noCredit = await repo.bookPtSessions({ tenantId: 't1', trainerId: 'u-trn', slots: [new Date(at(3, 11)), new Date(at(3, 12))] }).catch((e) => e);
    expect(noCredit.message).toBe('Seçtiğin tarih için geçerli ders kredin yok.');
    expect(await creditRow('cr1')).toMatchObject({ used: 0 });      // all or nothing

    const notTrainer = await repo.bookPtSessions({ tenantId: 't1', trainerId: 'u-mem', slots: [new Date(at(3, 11))] }).catch((e) => e);
    expect(notTrainer.code).toBe('functions/invalid-argument');       // a member cannot book themselves as the trainer
  });

  it('a parent books for an approved child (memberId); the child is charged, not the parent', async () => {
    await w.h.addUser('u-kid', ['member']);
    await w.h.run(`UPDATE memberships SET guardian_id = 'u-mem', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    await credit('crk', { member: 'u-kid' });
    expect(await repo.bookPtSessions({ tenantId: 't1', trainerId: 'u-trn', slots: [new Date(at(3, 10))], memberId: 'u-kid' })).toEqual({ booked: 1 });
    expect(await creditRow('crk')).toMatchObject({ used: 1 });
    const list = await firstValue<L>((cb, err) => repo.watchUpcomingSessionsForMember('t1', 'u-kid', cb, err as never), (l) => l.length === 1);
    expect(list[0].memberId).toBe('u-kid');
  });

  it('after a booking the member lists refresh at once (no waiting for the next poll)', async () => {
    await credit('cr1');
    const seen: L[] = [];
    const stop = repo.watchUpcomingSessionsForMember('t1', 'u-mem', (l) => seen.push(l));
    await vi.waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0]).toEqual([]);
    await repo.bookPtSessions({ tenantId: 't1', trainerId: 'u-trn', slots: [new Date(at(3, 10))] });
    await vi.waitFor(() => expect(seen.length).toBe(2), { timeout: 3000 });
    expect(seen[1]).toHaveLength(1);
    stop();
  });
});

describe('cancelling (cancelPtSession)', () => {
  it('in time: the lesson comes back; the list drops the session; the id-only call finds its gym', async () => {
    await credit('cr1', { used: 1 });
    await seedSession('s1', { credit: 'cr1', start: at(3, 10), deadline: Date.now() + 2 * DAY });
    expect(await repo.cancelPtSession('s1')).toEqual({ refunded: true });
    expect(await creditRow('cr1')).toMatchObject({ used: 0 });
    expect(await rowOf('s1')).toMatchObject({ status: 'cancelled', cancelled_by_role: 'member', refund_outcome: 'refunded' });
    const list = await firstValue<L>((cb, err) => repo.watchSessionsForMember('t1', 'u-mem', wide, cb, err as never));
    expect(list[0]).toMatchObject({ status: 'cancelled', cancelledByRole: 'member', creditRefunded: true });
    expect(list[0].cancelledAt).toBeInstanceOf(Date);
    const upcoming = await firstValue<L>((cb, err) => repo.watchUpcomingSessionsForMember('t1', 'u-mem', cb, err as never));
    expect(upcoming).toEqual([]);                                     // cancelled sessions are not "upcoming"
  });

  it('late: the credit is burnt (refunded false); the coach cancelling always refunds', async () => {
    await credit('cr1', { used: 2 });
    await seedSession('late', { credit: 'cr1', start: at(3, 10), deadline: Date.now() - HOUR });
    await seedSession('byCoach', { credit: 'cr1', start: at(3, 11), deadline: Date.now() - HOUR });
    expect(await repo.cancelPtSession('late')).toEqual({ refunded: false });
    as('fb-trn');
    expect(await repo.cancelPtSession('byCoach')).toEqual({ refunded: true });
    expect(await creditRow('cr1')).toMatchObject({ used: 1 });
  });

  it('a stranger, an already cancelled and a completed session are refused with a sentence', async () => {
    await seedSession('s1'); await seedSession('done', { status: 'completed', start: at(3, 11) }); await seedSession('gone', { status: 'cancelled', start: at(3, 12) });
    as('fb-admin');
    await w.h.addUser('u-x', ['member']);
    as('fb-x');
    const forbidden: any = await repo.cancelPtSession('s1').catch((e) => e);
    expect(forbidden.code).toBe('functions/permission-denied');
    as('fb-mem');
    expect(((await repo.cancelPtSession('gone').catch((e) => e)) as any).message).toBe('Randevu zaten iptal edilmiş.');
    expect(((await repo.cancelPtSession('done').catch((e) => e)) as any).message).toBe('Tamamlanmış randevu iptal edilemez.');
  });
});

describe('the trainer calendar', () => {
  it('watchSessionsForTrainer: the window applies on both ends, names resolve, ordered by time', async () => {
    as('fb-trn');
    await seedSession('a', { start: at(5, 10) }); await seedSession('b', { start: at(2, 10) }); await seedSession('far', { start: at(90, 10) });
    await seedSession('other', { trainer: 'u-trn2', start: at(3, 10), member: 'u-admin' });
    const list = await firstValue<L>((cb, err) => repo.watchSessionsForTrainer('t1', 'u-trn', wide, cb, err as never));
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ trainerName: 'Mert Antrenör', memberName: 'Ali Üye' });
  });

  it("another coach's calendar needs a share; the viewer then sees it", async () => {
    await seedSession('s1');
    as('fb-trn2');
    const denied: any = await firstValue<L>((cb, err) => repo.watchSessionsForTrainer('t1', 'u-trn', wide, cb, err as never)).catch((e) => e);
    expect(denied.code).toBe('functions/permission-denied');
    await w.h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-trn','u-trn2',1)`);
    const list = await firstValue<L>((cb, err) => repo.watchSessionsForTrainer('t1', 'u-trn', wide, cb, err as never));
    expect(list.map((s) => s.id)).toEqual(['s1']);
  });

  it('watchSessionsForTenant (admin): every coach, one list, names from the roster', async () => {
    await seedSession('a', { start: at(2, 10) });
    await seedSession('b', { trainer: 'u-trn2', start: at(1, 10), member: 'u-admin' });
    await seedSession('old', { start: at(-40, 10) });
    as('fb-admin');
    const list = await firstValue<L>((cb, err) => repo.watchSessionsForTenant('t1', wide, cb, err as never));
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    expect(list[0]).toMatchObject({ trainerName: 'Ece Antrenör', trainerId: 'u-trn2' });
    expect(list[1]).toMatchObject({ trainerName: 'Mert Antrenör', memberName: 'Ali Üye' });
  });

  it('watchSessionsForTenant refuses a plain member through onError', async () => {
    const e: any = await firstValue<L>((cb, err) => repo.watchSessionsForTenant('t1', wide, cb, err as never)).catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
  });
});

describe('createPtSession (staff)', () => {
  it('a coach adds a session to their own calendar; it shows on the calendar and blocks the slot', async () => {
    as('fb-trn');
    await repo.createPtSession({ tenantId: 't1', trainerId: 'u-trn', memberId: 'u-mem', date: new Date(at(4, 9)), durationMinutes: 45 });
    const list = await firstValue<L>((cb, err) => repo.watchSessionsForTrainer('t1', 'u-trn', wide, cb, err as never), (l) => l.length === 1);
    expect(list[0]).toMatchObject({ memberId: 'u-mem', durationMinutes: 45, status: 'scheduled', trainerName: 'Mert Antrenör' });
    expect(list[0].creditId).toBeUndefined();
    const clash: any = await repo.createPtSession({ tenantId: 't1', trainerId: 'u-trn', memberId: 'u-admin', date: new Date(at(4, 9, 30)), durationMinutes: 30 }).catch((e) => e);
    expect(clash.message).toBe('Seçtiğin saat antrenörün başka bir randevusuyla çakışıyor.');
  });

  it("a coach cannot write onto someone else's calendar; an admin can", async () => {
    as('fb-trn');
    const e: any = await repo.createPtSession({ tenantId: 't1', trainerId: 'u-trn2', memberId: 'u-mem', date: new Date(at(4, 9)), durationMinutes: 60 }).catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
    as('fb-admin');
    await repo.createPtSession({ tenantId: 't1', trainerId: 'u-trn2', memberId: 'u-mem', date: new Date(at(4, 9)), durationMinutes: 60 });
    expect((await w.h.one(`SELECT count(*) n FROM pt_sessions WHERE trainer_id = 'u-trn2'`)).n).toBe(1);
  });
});

describe('status and hand-over', () => {
  it('setSessionStatus: completed and cancelled go through; no-show is a named gap', async () => {
    await seedSession('s1'); await seedSession('s2', { start: at(3, 11) }); await seedSession('s3', { start: at(3, 12) });
    as('fb-trn');
    await firstValue<L>((cb, err) => repo.watchSessionsForTrainer('t1', 'u-trn', wide, cb, err as never));
    await repo.setSessionStatus('s1', 'completed');
    expect((await rowOf('s1')).status).toBe('completed');
    await repo.setSessionStatus('s2', 'cancelled');
    expect(await rowOf('s2')).toMatchObject({ status: 'cancelled', cancelled_by_role: 'trainer', refund_outcome: 'no-credit' });
    await expect(repo.setSessionStatus('s3', 'no-show')).rejects.toThrow(/GAP\(api\).*no-show/);
    expect((await rowOf('s3')).status).toBe('scheduled');
    const again: any = await repo.setSessionStatus('s1', 'completed').catch((e) => e);
    expect(again.code).toBe('functions/failed-precondition');
  });

  it('reassignSession: an admin moves a session; originalTrainerId survives; a share viewer may take over', async () => {
    await seedSession('s1'); await seedSession('s2', { start: at(3, 11) });
    as('fb-admin');
    const list = await firstValue<L>((cb, err) => repo.watchSessionsForTrainer('t1', 'u-trn', wide, cb, err as never), (l) => l.length === 2);
    await repo.reassignSession(list[0], 'u-trn2', 'Ece');
    expect(await rowOf('s1')).toMatchObject({ trainer_id: 'u-trn2', original_trainer_id: 'u-trn' });

    await w.h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-trn','u-trn2',1)`);
    as('fb-trn2');
    await repo.reassignSession(list[1], 'u-trn2', 'Ece');
    expect(await rowOf('s2')).toMatchObject({ trainer_id: 'u-trn2', original_trainer_id: 'u-trn' });
    const e: any = await repo.reassignSession(list[1], 'u-trn2', 'Ece').catch((x) => x);
    expect(e.code).toBe('functions/failed-precondition');          // already assigned
  });
});

describe('hasSessionToday', () => {
  it('true for a live session today, false when it is cancelled or on another day', async () => {
    const noon = new Date(); noon.setHours(12, 0, 0, 0);
    await seedSession('today', { start: noon.getTime() });
    expect(await repo.hasSessionToday('t1', 'u-mem', new Date())).toBe(true);
    await w.h.run(`UPDATE pt_sessions SET status = 'cancelled' WHERE id = 'today'`);
    expect(await repo.hasSessionToday('t1', 'u-mem', new Date())).toBe(false);
    await seedSession('tomorrow', { start: noon.getTime() + DAY });
    expect(await repo.hasSessionToday('t1', 'u-mem', new Date())).toBe(false);
  });
});
