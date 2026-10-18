import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const repo = await import('./workoutLogRepo');
const { auth } = await import('@/services/firebase');
const { resetIdentity } = await import('./membershipIdentity');

import type { ExerciseLog, Program } from '../types';

type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const stops: (() => void)[] = [];
const track = (stop: () => void) => { stops.push(stop); return stop; };
const feed = () => {
  const seen: any[] = [];
  return { seen, push: (v: any) => void seen.push(v), last: () => seen[seen.length - 1] };
};

const log = (id: string, memberId: string, at: number, extra: Record<string, unknown> = {}, tenant = 't1') =>
  w.h.run(
    `INSERT INTO workout_logs (id, tenant_id, member_id, data, logged_at) VALUES (?, ?, ?, ?, ?)`,
    id, tenant, memberId,
    JSON.stringify({ programId: 'pg1', programName: 'Güç', exerciseLogs: [], ...extra }), at,
  );
const row = async (id: string) => {
  const r = await w.h.one(`SELECT member_id m, tenant_id t, data d, logged_at l FROM workout_logs WHERE id = ?`, id);
  return r && { ...r, data: JSON.parse(r.d) as Record<string, any> };
};
const el = (id: string, done = 0): ExerciseLog => ({ exerciseId: id, name: `Hareket ${id}`, setsTarget: 3, repsTarget: 8, setsCompleted: done, weightKg: 40 });

const ex = (id: string, extra: object = {}) => ({ id, name: `Hareket ${id}`, sets: 3, reps: 8, targetWeightKg: 40, ...extra });
const program: Program = {
  id: 'pg1', tenantId: 't1', memberId: 'u-mem', memberName: 'Mem', trainerId: 'u-trn', name: 'Güç Programı', status: 'active',
  exercises: [ex('e1', { libraryId: 'back-squat' }), ex('e2')],
  days: [{ id: 'd1', name: 'Gün 1', exercises: [ex('e1', { libraryId: 'back-squat' }), ex('e2')] }, { id: 'd2', name: 'Gün 2', exercises: [ex('e3')] }],
  createdAt: new Date(1), updatedAt: new Date(2),
};

beforeEach(async () => {
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-mem2', ['member']);
  w.signInAs('fb-mem');
});
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  (auth as { currentUser: unknown }).currentUser = null;
  resetIdentity();
});

describe('startWorkoutLog', () => {
  it('snapshots the chosen day\'s targets (name, libraryId, sets, reps, weight) and files the log under the caller', async () => {
    const before = Date.now();
    const id = await repo.startWorkoutLog('t1', 'u-mem', program, program.days![1]);
    const r = (await row(id))!;
    expect(r).toMatchObject({ m: 'u-mem', t: 't1' });
    expect(r.l).toBeGreaterThanOrEqual(before);
    expect(r.data).toEqual({
      programId: 'pg1', programName: 'Güç Programı', dayId: 'd2', dayName: 'Gün 2',
      exerciseLogs: [{ exerciseId: 'e3', name: 'Hareket e3', setsTarget: 3, repsTarget: 8, setsCompleted: 0, weightKg: 40 }],
    });
  });

  it('without a day it snapshots the single-list exercises and writes no dayId / dayName; libraryId only when set', async () => {
    const id = await repo.startWorkoutLog('t1', 'u-mem', program);
    const r = (await row(id))!;
    expect(r.data.dayId).toBeUndefined();
    expect(r.data.dayName).toBeUndefined();
    expect(r.data.exerciseLogs).toEqual([
      { exerciseId: 'e1', name: 'Hareket e1', libraryId: 'back-squat', setsTarget: 3, repsTarget: 8, setsCompleted: 0, weightKg: 40 },
      { exerciseId: 'e2', name: 'Hareket e2', setsTarget: 3, repsTarget: 8, setsCompleted: 0, weightKg: 40 },
    ]);
  });

  it('is refused in a gym the caller is not in, and is never filed for another member', async () => {
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await expect(repo.startWorkoutLog('t2', 'u-mem', program)).rejects.toMatchObject({ code: 'functions/permission-denied' });
    const id = await repo.startWorkoutLog('t1', 'u-mem2', program);
    expect((await row(id))!.m).toBe('u-mem');
  });

  it('opens straight on the session screen\'s watch and refreshes the history', async () => {
    const history = feed();
    track(repo.watchWorkoutLogsForMember('t1', 'u-mem', history.push));
    await vi.waitFor(() => expect(history.last()).toEqual([]));
    const id = await repo.startWorkoutLog('t1', 'u-mem', program, program.days![0]);
    await vi.waitFor(() => expect(history.last()?.map((l: any) => l.id)).toEqual([id]));
    const one = feed();
    track(repo.watchWorkoutLog(id, one.push));
    await vi.waitFor(() => expect(one.last()).toMatchObject({ id, tenantId: 't1', memberId: 'u-mem', programId: 'pg1', dayId: 'd1', completedAt: undefined }));
  });
});

describe('getRecentLogs', () => {
  it('newest first, limited by count, Dates rebuilt; startedAt is the server column', async () => {
    await log('l1', 'u-mem', 1_000, { startedAt: 1_000, completedAt: 1_500 });
    await log('l2', 'u-mem', 2_000, { startedAt: 7, dayId: 'd1', dayName: 'Gün 1' });   // body clock disagrees: the column wins
    await log('l3', 'u-mem', 3_000);
    await log('l-other', 'u-mem2', 4_000);
    const logs = await repo.getRecentLogs('t1', 'u-mem');
    expect(logs.map((l) => l.id)).toEqual(['l3', 'l2', 'l1']);
    expect(logs[1]).toEqual({ id: 'l2', tenantId: 't1', memberId: 'u-mem', programId: 'pg1', programName: 'Güç', dayId: 'd1', dayName: 'Gün 1', startedAt: new Date(2_000), completedAt: undefined, exerciseLogs: [] });
    expect(logs[2].completedAt).toEqual(new Date(1_500));
    expect((await repo.getRecentLogs('t1', 'u-mem', 2)).map((l) => l.id)).toEqual(['l3', 'l2']);
  });

  it('a trainer reads a member\'s logs; another member is refused', async () => {
    await log('l1', 'u-mem', 1_000);
    w.signInAs('fb-trn');
    expect(await repo.getRecentLogs('t1', 'u-mem')).toHaveLength(1);
    w.signInAs('fb-mem2');
    await expect(repo.getRecentLogs('t1', 'u-mem')).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('Firebase uid at the screen boundary', () => {
  it('a screen\'s user.uid reaches the Worker as the internal id, and the logs come back with user.uid', async () => {
    (auth as { currentUser: unknown }).currentUser = { uid: 'fb-mem' };
    const id = await repo.startWorkoutLog('t1', 'fb-mem', program);
    await log('l-uid', 'u-mem', 1);
    const logs = await repo.getRecentLogs('t1', 'fb-mem');
    expect(logs.map((l) => [l.id, l.memberId])).toEqual([[id, 'fb-mem'], ['l-uid', 'fb-mem']]);
  });
});

describe('watchWorkoutLog + saveExerciseLogs + completeWorkoutLog', () => {
  it('shows each tick at once (no wait for a round trip), stores it, and keeps the rest of the log', async () => {
    await log('l-live', 'u-mem', 5_000, { exerciseLogs: [el('e1'), el('e2')], dayId: 'd1' });
    const got = feed();
    track(repo.watchWorkoutLog('l-live', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    expect(got.last().exerciseLogs).toEqual([el('e1'), el('e2')]);

    const next = [el('e1', 1), el('e2')];
    const saving = repo.saveExerciseLogs('l-live', next);
    await vi.waitFor(() => expect(got.last().exerciseLogs).toEqual(next));      // echoed before the network answers
    await saving;
    expect((await row('l-live'))!.data).toMatchObject({ exerciseLogs: next, dayId: 'd1', programId: 'pg1' });
    await new Promise((r) => setTimeout(r, 30));
    expect(got.last().exerciseLogs).toEqual(next);                              // and it stays after the refresh
  });

  it('quick successive taps land in order', async () => {
    await log('l-fast', 'u-mem', 5_000, { exerciseLogs: [el('e1')] });
    await Promise.all([1, 2, 3].map((n) => repo.saveExerciseLogs('l-fast', [el('e1', n)])));
    expect((await row('l-fast'))!.data.exerciseLogs).toEqual([el('e1', 3)]);
  });

  it('completeWorkoutLog stamps completedAt (ms) and the open screen sees the Date', async () => {
    await log('l-done', 'u-mem', 5_000, { exerciseLogs: [el('e1', 3)] });
    const got = feed();
    track(repo.watchWorkoutLog('l-done', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    const before = Date.now();
    await repo.completeWorkoutLog('l-done');
    const stored = (await row('l-done'))!.data.completedAt;
    expect(stored).toBeGreaterThanOrEqual(before);
    await vi.waitFor(() => expect(got.last().completedAt).toEqual(new Date(stored)));
    expect((await row('l-done'))!.l).toBe(5_000);                                // started time untouched
  });

  it('null for a log that does not exist for the caller', async () => {
    const got = feed();
    track(repo.watchWorkoutLog('l-nope', got.push));
    await vi.waitFor(() => expect(got.seen).toEqual([null]));
  });

  it('another member cannot write to the log (nothing changes); a log that is not theirs is "not found"', async () => {
    await log('l-mine', 'u-mem', 5_000, { exerciseLogs: [el('e1')] });
    const warm = feed();
    track(repo.watchWorkoutLog('l-mine', warm.push));                            // place of the log is known
    await vi.waitFor(() => expect(warm.seen.length).toBe(1));
    w.signInAs('fb-mem2');
    await expect(repo.saveExerciseLogs('l-mine', [el('e1', 3)])).rejects.toMatchObject({ code: 'functions/not-found' });
    await expect(repo.completeWorkoutLog('l-mine')).rejects.toMatchObject({ code: 'functions/not-found' });
    await expect(repo.saveExerciseLogs('l-unknown', [])).rejects.toMatchObject({ code: 'functions/not-found', message: 'Antrenman kaydı bulunamadı.' });
    expect((await row('l-mine'))!.data).toMatchObject({ exerciseLogs: [el('e1')] });
    expect((await row('l-mine'))!.data.completedAt).toBeUndefined();
  });

  it('a failed save is shown at once, then replaced by what the server really has', async () => {
    await log('l-fail', 'u-mem', 5_000, { exerciseLogs: [el('e1')] });
    const got = feed();
    track(repo.watchWorkoutLog('l-fail', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    w.signInAs('fb-trn');                                                        // the trainer\'s write is refused
    // the watcher keeps polling as the trainer, who may read member logs; the save is the failing part
    await expect(repo.saveExerciseLogs('l-fail', [el('e1', 2)])).rejects.toBeTruthy();
    await vi.waitFor(() => expect(got.last().exerciseLogs).toEqual([el('e1')]));
  });

  it('finds a log it has never listed (cold start)', async () => {
    await log('l-cold', 'u-mem', 5_000, { exerciseLogs: [el('e9')] });
    await repo.saveExerciseLogs('l-cold', [el('e9', 2)]);
    expect((await row('l-cold'))!.data.exerciseLogs).toEqual([el('e9', 2)]);
  });

  it('finds an old log however far back it is', async () => {
    await log('l-old', 'u-mem', 1, { exerciseLogs: [el('e1')] });
    for (let i = 0; i < 8; i++) await log(`l-n${i}`, 'u-mem', 100 + i);
    const got = feed();
    track(repo.watchWorkoutLog('l-old', got.push));
    await vi.waitFor(() => expect(got.last()).toMatchObject({ id: 'l-old' }));
  });
});

describe('watchWorkoutLogsForMember', () => {
  it('oldest first (the Gelişim screen\'s order), at most the newest 200', async () => {
    for (let i = 1; i <= 203; i++) await log(`l${i}`, 'u-mem', i * 10);
    const got = feed();
    track(repo.watchWorkoutLogsForMember('t1', 'u-mem', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    const ids = got.last().map((l: any) => l.id);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('l4');
    expect(ids[199]).toBe('l203');
  });

  it('another member\'s history is refused through onError', async () => {
    await log('l1', 'u-mem', 10);
    w.signInAs('fb-mem2');
    const err = vi.fn();
    track(repo.watchWorkoutLogsForMember('t1', 'u-mem', () => {}, err));
    await vi.waitFor(() => expect(err).toHaveBeenCalledTimes(1));
    expect(err.mock.calls[0][0]).toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('watchCompletedThisWeek', () => {
  const startOfWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  it('counts completed sessions since this week\'s Monday only, and updates when one is finished', async () => {
    const monday = startOfWeek();
    await log('this-done', 'u-mem', monday + 1_000, { completedAt: monday + 5_000 });
    await log('this-open', 'u-mem', monday + 2_000);
    await log('last-week', 'u-mem', monday - 86_400_000, { completedAt: monday - 80_000_000 });
    await log('other', 'u-mem2', monday + 3_000, { completedAt: monday + 4_000 });
    const got = feed();
    track(repo.watchCompletedThisWeek('t1', 'u-mem', got.push));
    await vi.waitFor(() => expect(got.last()).toBe(1));
    await repo.completeWorkoutLog('this-open');
    await vi.waitFor(() => expect(got.last()).toBe(2));
  });
});
