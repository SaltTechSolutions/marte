import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const { auth } = await import('@/services/firebase');
const { resetSharedWatches } = await import('../firebase/sharedWatch');
const { resetIdentity } = await import('./membershipIdentity');
const repo = await import('./programRepo');

type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const stops: (() => void)[] = [];
const track = (stop: () => void) => { stops.push(stop); return stop; };
const feed = <T,>() => {
  const seen: T[] = [];
  return { seen, push: (v: T) => void seen.push(v), last: () => seen[seen.length - 1] };
};

const body = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ memberName: 'Mem', trainerId: 'u-trn', name: 'Mem Programı', status: 'draft', exercises: [], createdAt: 1_700_000_000_000, ...extra });
const seed = (id: string, memberId: string, data: string, updatedAt = 1_700_000_100_000, tenant = 't1') =>
  w.h.run(`INSERT INTO programs (id, tenant_id, member_id, data, updated_at) VALUES (?, ?, ?, ?, ?)`, id, tenant, memberId, data, updatedAt);
const row = async (id: string) => {
  const r = await w.h.one(`SELECT member_id m, tenant_id t, data d, updated_at u FROM programs WHERE id = ?`, id);
  return r && { ...r, data: JSON.parse(r.d) as Record<string, any> };
};
const ex = (id: string) => ({ id, name: 'Squat', sets: 3, reps: 8, targetWeightKg: 60 });

beforeEach(async () => {
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-mem2', ['member']);
  w.signInAs('fb-trn');
});
afterEach(() => {
  stops.splice(0).forEach((s) => s());
  resetSharedWatches();
  (auth as { currentUser: unknown }).currentUser = null;
  resetIdentity();
});

describe('newLocalId', () => {
  it('is a 20-char alphanumeric id, different every time', () => {
    const ids = new Set(Array.from({ length: 50 }, repo.newLocalId));
    expect(ids.size).toBe(50);
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9]{20}$/));
  });
});

describe('findOrCreateDraftProgram', () => {
  const params = { tenantId: 't1', trainerId: 'u-trn', memberId: 'u-mem', memberName: 'Ayşe' };

  it('creates a draft once, then reuses it; the member and gym are the server\'s', async () => {
    const id = await repo.findOrCreateDraftProgram(params);
    expect(await repo.findOrCreateDraftProgram(params)).toBe(id);
    const r = await row(id);
    expect(r).toMatchObject({ m: 'u-mem', t: 't1' });
    expect(r!.data).toMatchObject({ name: 'Ayşe Programı', status: 'draft', exercises: [], trainerId: 'u-trn', memberName: 'Ayşe' });
    expect(typeof r!.data.createdAt).toBe('number');
    expect(r!.data.tenantId).toBeUndefined();
    expect(r!.data.memberId).toBeUndefined();
    expect((await w.h.one(`SELECT count(*) c FROM programs`)).c).toBe(1);
  });

  it('prefers an existing draft over an active program, and reuses an active one rather than creating', async () => {
    await seed('pg-act', 'u-mem', body({ status: 'active' }), 3);
    expect(await repo.findOrCreateDraftProgram(params)).toBe('pg-act');
    await seed('pg-dr', 'u-mem', body({ status: 'draft' }), 2);
    expect(await repo.findOrCreateDraftProgram(params)).toBe('pg-dr');
    expect((await w.h.one(`SELECT count(*) c FROM programs`)).c).toBe(2);
  });

  it('is refused for a member, and for someone who is not in the gym', async () => {
    w.signInAs('fb-mem');
    await expect(repo.findOrCreateDraftProgram(params)).rejects.toMatchObject({ code: 'functions/permission-denied' });
    w.signInAs('fb-trn');
    await expect(repo.findOrCreateDraftProgram({ ...params, memberId: 'u-nobody' })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    expect((await w.h.one(`SELECT count(*) c FROM programs`)).c).toBe(0);
  });

  it('refreshes the gym\'s open program lists at once', async () => {
    const all = feed<any[]>();
    track(repo.watchProgramsForTenant('t1', all.push));
    await vi.waitFor(() => expect(all.last()).toEqual([]));
    const id = await repo.findOrCreateDraftProgram(params);
    await vi.waitFor(() => expect(all.last()?.map((p) => p.id)).toEqual([id]));
  });
});

describe('watchProgram + the write functions', () => {
  it('maps a migrated body: ms -> Date, server-owned tenant/member/id/updatedAt win over the body', async () => {
    await seed('pg-mig', 'u-mem', body({ tenantId: 't2', memberId: 'x', id: 'evil', updatedAt: 5, days: [{ id: 'd1', name: 'Gün 1', exercises: [ex('e1')] }], exercises: [ex('e1')], warmup: 'warmup-general', templateId: 'tp1' }), 1_700_000_100_000);
    const got = feed<any>();
    track(repo.watchProgram('pg-mig', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    expect(got.last()).toEqual({
      id: 'pg-mig', tenantId: 't1', memberId: 'u-mem', memberName: 'Mem', trainerId: 'u-trn', name: 'Mem Programı', status: 'draft',
      exercises: [ex('e1')], days: [{ id: 'd1', name: 'Gün 1', exercises: [ex('e1')] }], warmup: 'warmup-general', templateId: 'tp1',
      createdAt: new Date(1_700_000_000_000), updatedAt: new Date(1_700_000_100_000),
    });
  });

  it('a program without createdAt falls back to updatedAt, not to "now"', async () => {
    await seed('pg-nocr', 'u-mem', JSON.stringify({ memberName: 'M', trainerId: 't', name: 'n', status: 'draft' }), 1_700_000_100_000);
    const got = feed<any>();
    track(repo.watchProgram('pg-nocr', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    expect(got.last()).toMatchObject({ createdAt: new Date(1_700_000_100_000), exercises: [] });
    expect(got.last().days).toBeUndefined();
  });

  it('null for a program that does not exist for the caller', async () => {
    const got = feed<any>();
    track(repo.watchProgram('pg-nope', got.push));
    await vi.waitFor(() => expect(got.seen).toEqual([null]));
  });

  it('a program the caller may not see is "not found" (null), never confirmed: another member\'s, or another gym\'s', async () => {
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await seed('pg-theirs', 'u-mem2', body(), 1);
    await seed('pg-t2', 'u-mem2', body(), 1, 't2');
    w.signInAs('fb-mem');
    for (const id of ['pg-theirs', 'pg-t2']) {
      const got = feed<any>();
      track(repo.watchProgram(id, got.push));
      await vi.waitFor(() => expect(got.seen).toEqual([null]));
      await expect(repo.setProgramStatus(id, 'active')).rejects.toMatchObject({ code: 'functions/not-found' });
    }
  });

  it('saveProgramDays: writes days, mirrors day 1 into exercises, keeps the rest of the body, shows the change at once', async () => {
    await seed('pg-days', 'u-mem', body({ createdAt: 1_700_000_000_000 }), 1);
    const got = feed<any>();
    track(repo.watchProgram('pg-days', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));

    const days = [{ id: 'd1', name: 'Gün 1', exercises: [ex('e1')] }, { id: 'd2', name: 'Gün 2', exercises: [ex('e2')] }];
    await repo.saveProgramDays('pg-days', days, { warmup: 'warmup-short', templateId: 'tp9' });

    const r = (await row('pg-days'))!;
    expect(r.data).toMatchObject({ days, exercises: [ex('e1')], warmup: 'warmup-short', templateId: 'tp9', name: 'Mem Programı', trainerId: 'u-trn', createdAt: 1_700_000_000_000 });
    expect(r.data.tenantId).toBeUndefined();
    expect(r.data.id).toBeUndefined();
    expect(r.u).toBeGreaterThan(1);
    await vi.waitFor(() => expect(got.last()).toMatchObject({ days, exercises: [ex('e1')], warmup: 'warmup-short', templateId: 'tp9' }));
  });

  it('saveProgramDays without origin leaves warmup / templateId as they were; an empty day list mirrors []', async () => {
    await seed('pg-keep', 'u-mem', body({ warmup: 'warmup-general', templateId: 'tp1' }), 1);
    await repo.saveProgramDays('pg-keep', []);
    expect((await row('pg-keep'))!.data).toMatchObject({ days: [], exercises: [], warmup: 'warmup-general', templateId: 'tp1' });
  });

  it('setProgramWarmup: a value sets it, null DELETES the field (not an empty string)', async () => {
    await seed('pg-wu', 'u-mem', body(), 1);
    await repo.setProgramWarmup('pg-wu', 'warmup-general');
    expect((await row('pg-wu'))!.data.warmup).toBe('warmup-general');
    await repo.setProgramWarmup('pg-wu', null);
    const r = (await row('pg-wu'))!;
    expect('warmup' in r.data).toBe(false);
    expect(r.data.name).toBe('Mem Programı');
  });

  it('saveProgramExercises and setProgramStatus change just their field', async () => {
    await seed('pg-ex', 'u-mem', body({ days: [{ id: 'd1', name: 'G', exercises: [] }] }), 1);
    await repo.saveProgramExercises('pg-ex', [ex('e7')]);
    await repo.setProgramStatus('pg-ex', 'active');
    expect((await row('pg-ex'))!.data).toMatchObject({ exercises: [ex('e7')], status: 'active', days: [{ id: 'd1', name: 'G', exercises: [] }], name: 'Mem Programı' });
  });

  it('two quick edits land in order (the later one wins) and nothing is lost', async () => {
    await seed('pg-race', 'u-mem', body(), 1);
    await Promise.all([repo.setProgramStatus('pg-race', 'active'), repo.saveProgramExercises('pg-race', [ex('a')]), repo.saveProgramExercises('pg-race', [ex('b')])]);
    expect((await row('pg-race'))!.data).toMatchObject({ status: 'active', exercises: [ex('b')] });
  });

  it('writes are refused for a member (and change nothing); an unknown program is "not found"', async () => {
    await seed('pg-ro', 'u-mem', body(), 1);
    const got = feed<any>();
    track(repo.watchProgram('pg-ro', got.push));          // the trainer has seen it, so its place is known
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    w.signInAs('fb-mem');
    await expect(repo.setProgramStatus('pg-ro', 'active')).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect((await row('pg-ro'))!.data.status).toBe('draft');
    w.signInAs('fb-trn');
    await expect(repo.setProgramStatus('pg-nope', 'active')).rejects.toMatchObject({ code: 'functions/not-found', message: 'Program bulunamadı.' });
  });

  it('a failed write is shown at once and then replaced by the server\'s truth', async () => {
    await seed('pg-fail', 'u-mem', body(), 1);
    const got = feed<any>();
    track(repo.watchProgram('pg-fail', got.push));
    await vi.waitFor(() => expect(got.seen.length).toBe(1));
    w.signInAs('fb-mem');                                  // writes will be refused
    await expect(repo.setProgramStatus('pg-fail', 'active')).rejects.toBeTruthy();
    await vi.waitFor(() => expect(got.last().status).toBe('draft'));
  });

  it('finds a program it has never listed (cold start): staff through the gym, a member for their own', async () => {
    await seed('pg-cold', 'u-mem', body(), 1);
    await repo.setProgramStatus('pg-cold', 'active');                 // trainer: discovered via the gym fan-out
    expect((await row('pg-cold'))!.data.status).toBe('active');
    await seed('pg-cold2', 'u-mem', body({ name: 'Own' }), 2);
    w.signInAs('fb-mem');
    const got = feed<any>();
    track(repo.watchProgram('pg-cold2', got.push));                   // a member: discovered through their own list
    await vi.waitFor(() => expect(got.last()).toMatchObject({ id: 'pg-cold2', name: 'Own', memberId: 'u-mem' }));
  });

  it('speaks Firebase uids to the screens and internal ids to the Worker (memberId and trainerId)', async () => {
    await seed('pg-uid', 'u-mem', body({ status: 'active', trainerId: 'u-trn' }), 1);
    (auth as { currentUser: unknown }).currentUser = { uid: 'fb-mem' };
    w.signInAs('fb-mem');
    const mine = feed<any>();
    track(repo.watchActiveProgramForMember('t1', 'fb-mem', mine.push));        // screens pass user.uid
    await vi.waitFor(() => expect(mine.last()).toMatchObject({ id: 'pg-uid', memberId: 'fb-mem', trainerId: 'u-trn' }));

    // the trainer is "me": a program they authored shows trainerId === user.uid, and new ones store the internal id
    (auth as { currentUser: unknown }).currentUser = { uid: 'fb-trn' };
    w.signInAs('fb-trn');
    resetIdentity();
    const id = await repo.findOrCreateDraftProgram({ tenantId: 't1', trainerId: 'fb-trn', memberId: 'u-mem2', memberName: 'M2' });
    expect((await row(id))!.data.trainerId).toBe('u-trn');
    const all = feed<any[]>();
    track(repo.watchProgramsForTenant('t1', all.push));
    await vi.waitFor(() => expect(all.last()?.length).toBe(2));
    expect(all.last().find((p) => p.id === id)).toMatchObject({ trainerId: 'fb-trn', memberId: 'u-mem2' });
    expect(all.last().find((p) => p.id === 'pg-uid')).toMatchObject({ trainerId: 'fb-trn', memberId: 'u-mem' });
  });
});

describe('watchActiveProgramForMember', () => {
  it('null without an active program; the most recently edited active one once there is; other members\' programs never', async () => {
    await seed('pg-d', 'u-mem', body({ status: 'draft' }), 5);
    await seed('pg-o', 'u-mem2', body({ status: 'active' }), 9);
    w.signInAs('fb-mem');
    const got = feed<any>();
    track(repo.watchActiveProgramForMember('t1', 'u-mem', got.push));
    await vi.waitFor(() => expect(got.seen).toEqual([null]));

    w.signInAs('fb-trn');
    await repo.setProgramStatus('pg-d', 'active');                    // refreshes the open watcher straight away
    w.signInAs('fb-mem');
    await vi.waitFor(() => expect(got.last()).toMatchObject({ id: 'pg-d', status: 'active', memberId: 'u-mem' }));
  });

  it('reports a refusal through onError (a member may not read another member\'s programs)', async () => {
    w.signInAs('fb-mem');
    const err = vi.fn();
    track(repo.watchActiveProgramForMember('t1', 'u-mem2', () => {}, err));
    await vi.waitFor(() => expect(err).toHaveBeenCalledTimes(1));
    expect(err.mock.calls[0][0]).toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('tenant-wide lists', () => {
  it('lists every member\'s programs (active only / all, last edit first) with the right memberId', async () => {
    await seed('pg-a', 'u-mem', body({ status: 'active' }), 10);
    await seed('pg-b', 'u-mem2', body({ status: 'draft' }), 30);
    await seed('pg-c', 'u-mem2', body({ status: 'active' }), 20);
    const active = feed<any[]>();
    const all = feed<any[]>();
    track(repo.watchActiveProgramsForTenant('t1', active.push));
    track(repo.watchProgramsForTenant('t1', all.push));
    await vi.waitFor(() => expect(all.last()?.length).toBe(3));
    await vi.waitFor(() => expect(active.last()?.length).toBe(2));
    expect(all.last().map((p) => [p.id, p.memberId])).toEqual([['pg-b', 'u-mem2'], ['pg-c', 'u-mem2'], ['pg-a', 'u-mem']]);
    expect(active.last().map((p) => p.id)).toEqual(['pg-c', 'pg-a']);
  });

  it('a program of another gym never shows up; a second screen shares the first one\'s poller', async () => {
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await w.h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-mem2','active','["member"]',1)`);
    await seed('pg-t2', 'u-mem2', body(), 1, 't2');
    await seed('pg-t1', 'u-mem2', body(), 1);
    const a = feed<any[]>();
    const b = feed<any[]>();
    track(repo.watchProgramsForTenant('t1', a.push));
    await vi.waitFor(() => expect(a.last()?.map((p) => p.id)).toEqual(['pg-t1']));
    track(repo.watchProgramsForTenant('t1', b.push));                 // replayed from the shared watcher
    expect(b.last()?.map((p) => p.id)).toEqual(['pg-t1']);
  });

  it('a member cannot read the gym\'s programs: onError, no data', async () => {
    w.signInAs('fb-mem');
    const got = feed<any[]>();
    const err = vi.fn();
    track(repo.watchProgramsForTenant('t1', got.push, err));
    await vi.waitFor(() => expect(err).toHaveBeenCalledTimes(1));
    expect(got.seen).toEqual([]);
  });
});
