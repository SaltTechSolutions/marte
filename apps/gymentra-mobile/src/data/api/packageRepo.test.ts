import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.setConfig({ testTimeout: 60_000 });

const { startWorld } = await import('./testWorld');
const repo = await import('./packageRepo');
const { forgetTenants } = await import('./pkgTenant');
const { collect, nextValue } = await import('./pkgTestUtil');
type Pkg = import('../types').GymPackage;
type Draft = import('../firebase/packageRepo').PackageDraft;

const monthly = (o: Partial<Draft> = {}): Draft => ({
  name: 'Aylık',
  kind: 'membership',
  price: 1000,
  durationDays: 30,
  entitlements: { gymAccess: true, groupClasses: { unlimited: true } },
  freezePolicy: { minDays: 3, maxCount: 1 },
  ...o,
});
const catalog = () => nextValue<Pkg[]>((ok, err) => repo.watchPackagesForTenant('t1', ok, err as never));

let w: Awaited<ReturnType<typeof startWorld>>;
beforeEach(async () => {
  forgetTenants();
  w = await startWorld();
  w.signInAs('fb-admin');
});

/** Marks a package as sold, the way an assignment does (the Worker owns the counter). */
const sell = (id: string) => w.h.run(`UPDATE gym_packages SET active_assignment_count = 1 WHERE id = ?`, id);

describe('packageRepo over the Worker', () => {
  it('seedDefaultPackages writes the three starter packages, in order, active, unsold, priced 0', async () => {
    await repo.seedDefaultPackages('t1');
    const pkgs = await catalog();
    expect(pkgs.map((p) => p.name)).toEqual(['Silver', 'Gold', 'Platinium']);
    expect(pkgs.every((p) => p.isActive && p.price === 0 && p.activeAssignmentCount === 0 && p.tenantId === 't1')).toBe(true);
    expect(pkgs[2].entitlements.ptLessons).toEqual({ count: 12, periodDays: 90 });
  });

  it('createGymPackage + watch: app types (Dates, optional fields absent), catalog order by sortOrder', async () => {
    await repo.createGymPackage('t1', monthly({ name: 'A' }));
    await new Promise((r) => setTimeout(r, 5));
    await repo.createGymPackage('t1', { name: '10 ders', kind: 'lessons', price: 2000, lessonCount: 10, lessonValidityDays: 90, entitlements: { gymAccess: false } });
    const pkgs = await catalog();
    expect(pkgs.map((p) => p.name)).toEqual(['A', '10 ders']);
    expect(pkgs[0]).toMatchObject({ kind: 'membership', durationDays: 30, freezePolicy: { minDays: 3, maxCount: 1 }, isActive: true, activeAssignmentCount: 0 });
    expect(pkgs[0].lessonCount).toBeUndefined();
    expect(pkgs[0].createdAt).toBeInstanceOf(Date);
    expect(pkgs[1]).toMatchObject({ lessonCount: 10, lessonValidityDays: 90 });
    expect(repo.canEditPackage(pkgs[0])).toBe(true);
  });

  it('updateGymPackage edits an unsold package whole and keeps isActive / sortOrder', async () => {
    await repo.createGymPackage('t1', monthly());
    const [before] = await catalog();
    await repo.setPackageActive(before.id, false);
    await repo.updateGymPackage(before.id, monthly({ name: 'Yeni ad', price: 1200, freezePolicy: undefined }));
    const after = await repo.getGymPackage(before.id);
    expect(after).toMatchObject({ name: 'Yeni ad', price: 1200, isActive: false, sortOrder: before.sortOrder });
    expect(after!.freezePolicy).toBeUndefined();
  });

  it('a package in use: content is locked (409, Turkish message), but it can still be retired and re-offered', async () => {
    await repo.createGymPackage('t1', monthly());
    const [p] = await catalog();
    await sell(p.id);
    const locked = await repo.updateGymPackage(p.id, monthly({ price: 1 })).catch((e) => e);
    expect(locked).toMatchObject({ code: 'functions/failed-precondition' });
    expect(locked.message).toMatch(/kullanımda/);
    await repo.setPackageActive(p.id, false);
    expect((await repo.getGymPackage(p.id))!.isActive).toBe(false);
    await repo.setPackageActive(p.id, true);
    const back = (await repo.getGymPackage(p.id))!;
    expect(back).toMatchObject({ isActive: true, price: 1000, activeAssignmentCount: 1 });
    expect(repo.canEditPackage(back)).toBe(false);
  });

  it('createPackageVersion: new version carries the edit + supersedesId + position, the old one is retired', async () => {
    await repo.createGymPackage('t1', monthly());
    const [old] = await catalog();
    await sell(old.id);
    await repo.createPackageVersion(old, monthly({ price: 1500 }));
    const pkgs = await catalog();
    expect(pkgs).toHaveLength(2);
    const retired = pkgs.find((p) => p.id === old.id)!;
    const fresh = pkgs.find((p) => p.id !== old.id)!;
    expect(retired).toMatchObject({ isActive: false, price: 1000 });
    expect(fresh).toMatchObject({ isActive: true, price: 1500, supersedesId: old.id, sortOrder: old.sortOrder, activeAssignmentCount: 0 });
  });

  it('money round trip: 199,99 TL is 19999 kuruş in the database and 199.99 again in the app, through create, update, retire and version', async () => {
    await repo.createGymPackage('t1', monthly({ price: 199.99 }));
    const price = async () => JSON.parse((await w.h.one(`SELECT data FROM gym_packages`)).data).price;
    expect(await price()).toBe(19999);
    const [p] = await catalog();
    expect(p.price).toBe(199.99);
    await repo.updateGymPackage(p.id, monthly({ price: 250.5 }));
    expect(await price()).toBe(25050);
    expect((await repo.getGymPackage(p.id))!.price).toBe(250.5);
    await repo.setPackageActive(p.id, false);          // re-sends the stored content: the price must survive unchanged
    expect(await price()).toBe(25050);
    await repo.setPackageActive(p.id, true);
    expect(await price()).toBe(25050);
    await sell(p.id);                                   // a version is only made of a package that is in use
    await repo.createPackageVersion({ ...p, price: 250.5, activeAssignmentCount: 1 }, monthly({ price: 300.05 }));
    const prices = (await w.h.db.prepare(`SELECT data FROM gym_packages`).all<any>()).results.map((r: any) => JSON.parse(r.data).price).sort();
    expect(prices).toEqual([25050, 30005]);
    expect((await catalog()).map((x) => x.price).sort()).toEqual([250.5, 300.05]);
    expect(await repo.createGymPackage('t1', monthly({ price: 10.005 })).catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument', message: 'Tutar en fazla 2 ondalık basamak içerebilir.' });
  });

  it('getGymPackage: unknown id -> null', async () => {
    expect(await repo.getGymPackage('gp-nope')).toBeNull();
  });

  it('writes invalidate the live catalog', async () => {
    const live = collect<Pkg[]>((ok, err) => repo.watchPackagesForTenant('t1', ok, err as never));
    await live.until(1);
    await repo.createGymPackage('t1', monthly());
    await live.until(2);
    expect(live.values[1]).toHaveLength(1);
    await repo.setPackageActive(live.values[1][0].id, false);
    await live.until(3);
    expect(live.values[2][0].isActive).toBe(false);
    live.stop();
  });

  it('who may do what: any member reads the catalog, only an admin writes, bad drafts are invalid-argument', async () => {
    await repo.createGymPackage('t1', monthly());
    await expect(repo.createGymPackage('t1', monthly({ price: -5 }))).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    w.signInAs('fb-mem');
    expect(await catalog()).toHaveLength(1);
    await expect(repo.createGymPackage('t1', monthly())).rejects.toMatchObject({ code: 'functions/permission-denied' });
    const [p] = await catalog();
    await expect(repo.setPackageActive(p.id, false)).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });
});
