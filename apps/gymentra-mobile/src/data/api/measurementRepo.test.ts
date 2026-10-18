import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const repo = await import('./measurementRepo');

type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const stops: (() => void)[] = [];
const track = (stop: () => void) => { stops.push(stop); return stop; };
const feed = () => {
  const seen: any[] = [];
  return { seen, push: (v: any) => void seen.push(v), last: () => seen[seen.length - 1] };
};
const seed = (id: string, memberId: string, data: Record<string, unknown>, at: number) =>
  w.h.run(`INSERT INTO measurements (id, tenant_id, member_id, data, measured_at) VALUES (?, 't1', ?, ?, ?)`, id, memberId, JSON.stringify(data), at);

beforeEach(async () => {
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-mem2', ['member']);
  w.signInAs('fb-mem');
});
afterEach(() => stops.splice(0).forEach((s) => s()));

describe('addMeasurement', () => {
  it('stores weight and the optional circumferences under the caller, with the server\'s clock', async () => {
    const before = Date.now();
    await repo.addMeasurement({ tenantId: 't1', memberId: 'u-mem', weightKg: 72.5, chestCm: 98, waistCm: 80, armCm: 33 });
    const r = await w.h.one(`SELECT member_id m, tenant_id t, data d, measured_at at FROM measurements`);
    expect(r).toMatchObject({ m: 'u-mem', t: 't1' });
    expect(JSON.parse(r.d)).toEqual({ weightKg: 72.5, chestCm: 98, waistCm: 80, armCm: 33 });
    expect(r.at).toBeGreaterThanOrEqual(before);
  });

  it('leaves out circumferences that were not given, but keeps a 0', async () => {
    await repo.addMeasurement({ tenantId: 't1', memberId: 'u-mem', weightKg: 70, chestCm: 0 });
    expect(JSON.parse((await w.h.one(`SELECT data d FROM measurements`)).d)).toEqual({ weightKg: 70, chestCm: 0 });
  });

  it('a measurement for somebody else is filed under the caller; nothing is written for them', async () => {
    await repo.addMeasurement({ tenantId: 't1', memberId: 'u-mem2', weightKg: 70 });
    expect((await w.h.one(`SELECT member_id m FROM measurements`)).m).toBe('u-mem');
    expect((await w.h.one(`SELECT count(*) c FROM measurements WHERE member_id = 'u-mem2'`)).c).toBe(0);
  });

  it('refuses an impossible weight (400) and a gym the caller is not in (403); nothing is stored', async () => {
    for (const weightKg of [0, -3, 500, 9999]) {
      await expect(repo.addMeasurement({ tenantId: 't1', memberId: 'u-mem', weightKg })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    }
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await expect(repo.addMeasurement({ tenantId: 't2', memberId: 'u-mem', weightKg: 70 })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect((await w.h.one(`SELECT count(*) c FROM measurements`)).c).toBe(0);
  });
});

describe('watchMeasurements', () => {
  it('newest first, Dates rebuilt; recordedAt is the server column; null circumferences become undefined', async () => {
    await seed('m-old', 'u-mem', { weightKg: 80, recordedAt: 1_000, chestCm: 100, waistCm: null }, 1_000);
    await seed('m-new', 'u-mem', { weightKg: 78, recordedAt: 9, armCm: 35 }, 2_000);   // body clock disagrees: the column wins
    const got = feed();
    track(repo.watchMeasurements('t1', 'u-mem', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    expect(got.last()).toEqual([
      { id: 'm-new', tenantId: 't1', memberId: 'u-mem', recordedAt: new Date(2_000), weightKg: 78, chestCm: undefined, waistCm: undefined, armCm: 35 },
      { id: 'm-old', tenantId: 't1', memberId: 'u-mem', recordedAt: new Date(1_000), weightKg: 80, chestCm: 100, waistCm: undefined, armCm: undefined },
    ]);
  });

  it('keeps only the newest 100', async () => {
    for (let i = 1; i <= 105; i++) await seed(`m${i}`, 'u-mem', { weightKg: 70 }, i);
    const got = feed();
    track(repo.watchMeasurements('t1', 'u-mem', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    expect(got.last()).toHaveLength(100);
    expect(got.last()[0].id).toBe('m105');
    expect(got.last()[99].id).toBe('m6');
  });

  it('shows a new measurement straight after addMeasurement', async () => {
    const got = feed();
    track(repo.watchMeasurements('t1', 'u-mem', got.push));
    await vi.waitFor(() => expect(got.last()).toEqual([]));
    await repo.addMeasurement({ tenantId: 't1', memberId: 'u-mem', weightKg: 71 });
    await vi.waitFor(() => expect(got.last()).toMatchObject([{ weightKg: 71, memberId: 'u-mem' }]));
  });

  it('the trainer reads a member\'s history; another member is refused through onError', async () => {
    await seed('m1', 'u-mem', { weightKg: 70 }, 5);
    w.signInAs('fb-trn');
    const got = feed();
    track(repo.watchMeasurements('t1', 'u-mem', got.push));
    await vi.waitFor(() => expect(got.last()).toMatchObject([{ id: 'm1' }]));

    w.signInAs('fb-mem2');
    const err = vi.fn();
    const other = feed();
    track(repo.watchMeasurements('t1', 'u-mem', other.push, err));
    await vi.waitFor(() => expect(err).toHaveBeenCalledTimes(1));
    expect(err.mock.calls[0][0]).toMatchObject({ code: 'functions/permission-denied' });
    expect(other.seen).toEqual([]);
  });
});
