import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrainerAvailability, TrainerBusySlot } from '../types';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const { __resetSupport } = await import('./classSupport');
const { resetSharedWatches } = await import('../firebase/sharedWatch');
const repo = await import('./availabilityRepo');

const DAY = 86_400_000;
type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const as = (sub: string) => { w.signInAs(sub); __resetSupport(); };

beforeEach(async () => {
  __resetSupport();
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-trn2', ['trainer']);
});
afterEach(() => resetSharedWatches());

function firstValue<T>(sub: (cb: (v: T) => void, err: (e: unknown) => void) => () => void, until: (v: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    let stop: () => void = () => {};
    stop = sub((v) => { if (until(v)) { queueMicrotask(() => stop()); resolve(v); } }, reject);
  });
}
type A = TrainerAvailability | null;

describe('working hours', () => {
  it('"never configured" is null (not an error); setting it shows at once; the pure helpers agree with the data', async () => {
    as('fb-trn');
    const seen: A[] = [];
    const stop = repo.watchTrainerAvailability('t1', 'u-trn', (a) => seen.push(a));
    await vi.waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0]).toBeNull();
    expect(repo.hasAnyAvailability(seen[0])).toBe(false);

    await repo.setTrainerAvailability({
      tenantId: 't1', trainerId: 'u-trn', slotMinutes: 45,
      weekly: { mon: [{ start: '09:00', end: '12:00' }], wed: [{ start: '14:00', end: '16:00' }] },
      exceptions: [{ date: '2030-01-07', closed: true }],
    });
    await vi.waitFor(() => expect(seen.length).toBe(2), { timeout: 3000 });
    expect(seen[1]).toMatchObject({
      tenantId: 't1', trainerId: 'u-trn', slotMinutes: 45,
      weekly: { mon: [{ start: '09:00', end: '12:00' }], wed: [{ start: '14:00', end: '16:00' }] },
      exceptions: [{ date: '2030-01-07', closed: true }],
    });
    expect(seen[1]!.updatedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);   // the stored time, not a placeholder
    expect(repo.hasAnyAvailability(seen[1])).toBe(true);
    // 2030-01-14 is a Monday: 09:00-12:00 in 45 minute slots = 4 slots
    expect(repo.computeFreeSlots(seen[1]!, new Date(2030, 0, 14), [], new Date(2030, 0, 1))).toHaveLength(4);
    // 2030-01-07 is closed by the exception
    expect(repo.computeFreeSlots(seen[1]!, new Date(2030, 0, 7), [], new Date(2030, 0, 1))).toEqual([]);
    stop();
  });

  it('a member can read a coach\'s hours (to book) but not write them; a coach cannot write another coach\'s; bad input is explained', async () => {
    await w.h.run(`INSERT INTO trainer_availability (tenant_id, trainer_id, weekly, slot_minutes, exceptions, updated_at) VALUES ('t1','u-trn','{"fri":[{"start":"10:00","end":"11:00"}]}',60,'[]',1)`);
    const a = await firstValue<A>((cb, err) => repo.watchTrainerAvailability('t1', 'u-trn', cb, err as never));
    expect(a!.weekly.fri).toEqual([{ start: '10:00', end: '11:00' }]);

    const params = { tenantId: 't1', trainerId: 'u-trn', weekly: {}, slotMinutes: 60, exceptions: [] };
    expect(((await repo.setTrainerAvailability(params).catch((e) => e)) as any).code).toBe('functions/permission-denied');
    as('fb-trn2');
    expect(((await repo.setTrainerAvailability(params).catch((e) => e)) as any).code).toBe('functions/permission-denied');
    as('fb-trn');
    const bad: any = await repo.setTrainerAvailability({ ...params, slotMinutes: 50 }).catch((e) => e);
    expect(bad.code).toBe('functions/invalid-argument');
    expect(bad.message).toBe('Randevu süresi 30, 45, 60 ya da 90 dakika olmalı.');
    as('fb-admin');
    await repo.setTrainerAvailability({ ...params, slotMinutes: 30 });          // an admin may set anyone's
    expect(JSON.parse(((await w.h.one(`SELECT slot_minutes s FROM trainer_availability WHERE trainer_id='u-trn'`)) as any).s)).toBe(30);
  });

  it('outsiders are refused through onError', async () => {
    await w.h.addUser('u-out', null);
    as('fb-out');
    const e: any = await firstValue<A>((cb, err) => repo.watchTrainerAvailability('t1', 'u-trn', cb, err as never)).catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
  });
});

describe('busy slots of a day', () => {
  const day = new Date(Date.now() + 3 * DAY);
  const noon = () => { const d = new Date(day); d.setHours(12, 0, 0, 0); return d.getTime(); };
  const session = (id: string, start: number, status = 'scheduled', trainer = 'u-trn') =>
    w.h.run(
      `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES (?, 't1', ?, 'u-admin', ?, 60, ?, 1, 1)`,
      id, trainer, start, status,
    );

  it('lists that day only, without identity, cancelled ones left out', async () => {
    await session('a', noon()); await session('b', noon() + 3_600_000); await session('gone', noon() + 7_200_000, 'cancelled');
    await w.h.run(`UPDATE pt_sessions SET status = 'completed' WHERE id = 'b'`);
    await session('nextday', noon() + DAY); await session('other', noon(), 'scheduled', 'u-trn2');
    const seen: TrainerBusySlot[][] = [];
    const stop = repo.watchTrainerBusySlotsForDay('t1', 'u-trn', day, (s) => seen.push(s));
    await vi.waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0].map((s) => s.date.getTime())).toEqual([noon(), noon() + 3_600_000]);
    expect(seen[0][0]).toEqual({ date: new Date(noon()), durationMinutes: 60, status: 'scheduled' });
    expect(seen[0][1].status).toBe('completed');                 // the real status now
    expect(Object.keys(seen[0][0]).sort()).toEqual(['date', 'durationMinutes', 'status']);   // no member, no credit

    // the free-slot computation consumes exactly this shape
    const av: TrainerAvailability = { tenantId: 't1', trainerId: 'u-trn', weekly: {}, slotMinutes: 60, exceptions: [], updatedAt: new Date() };
    const key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()] as 'mon';
    av.weekly = { [key]: [{ start: '11:00', end: '15:00' }] };
    const free = repo.computeFreeSlots(av, day, seen[0], new Date(0));
    expect(free.map((d) => d.getHours())).toEqual([11, 14]);     // 12:00 and 13:00 are taken
    stop();
  });

  it('trainerAvailabilityId is the Firestore document id', () => {
    expect(repo.trainerAvailabilityId('t1', 'u-trn')).toBe('t1_u-trn');
  });
});
