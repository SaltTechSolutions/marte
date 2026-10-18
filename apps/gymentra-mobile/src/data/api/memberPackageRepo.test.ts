import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.setConfig({ testTimeout: 60_000 });

const { startWorld } = await import('./testWorld');
const repo = await import('./memberPackageRepo');
const pkgRepo = await import('./packageRepo');
const promoRepo = await import('./promotionRepo');
const { forgetTenants } = await import('./pkgTenant');
const { resetIdentity } = await import('./membershipIdentity');
const { auth } = await import('@/services/firebase');
const { collect, nextValue } = await import('./pkgTestUtil');
type Draft = import('../firebase/packageRepo').PackageDraft;
type MP = import('../types').MemberPackage;

const DAY = 86_400_000;
const monthly = (o: Partial<Draft> = {}): Draft => ({
  name: 'Aylık',
  kind: 'membership',
  price: 1000,
  durationDays: 30,
  entitlements: { gymAccess: true, groupClasses: { count: 8, periodDays: 30 }, ptLessons: { count: 2, periodDays: 30 } },
  freezePolicy: { minDays: 3, maxCount: 1 },
  ...o,
});
const tenPack = (): Draft => ({ name: '10 ders', kind: 'lessons', price: 2000, lessonCount: 10, lessonValidityDays: 90, entitlements: { gymAccess: false } });

let w: Awaited<ReturnType<typeof startWorld>>;
beforeEach(async () => {
  forgetTenants();
  resetIdentity();
  (auth as { currentUser: unknown }).currentUser = null;
  w = await startWorld();
  w.signInAs('fb-admin');
});

async function mkPackage(draft: Draft) {
  await pkgRepo.createGymPackage('t1', draft);
  const all = await nextValue<import('../types').GymPackage[]>((ok, err) => pkgRepo.watchPackagesForTenant('t1', ok, err as never));
  return all.find((p) => p.name === draft.name)!;
}
async function mkPromotion(o: Partial<import('../firebase/promotionRepo').PromotionDraft> = {}) {
  await promoRepo.createPromotion('t1', {
    name: 'Kampanya', kind: 'percentDiscount', value: 20, appliesTo: [],
    startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 30 * DAY), ...o,
  });
  const all = await nextValue<import('../types').Promotion[]>((ok, err) => promoRepo.watchPromotionsForTenant('t1', ok, err as never));
  return all.find((p) => p.name === (o.name ?? 'Kampanya'))!;
}
const assign = (pkg: import('../types').GymPackage, extra: Partial<Parameters<typeof repo.assignPackageToMember>[0]> = {}) =>
  repo.assignPackageToMember({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', pkg, startsAt: new Date(), assignedBy: 'whoever', ...extra });
const holdings = (memberId = 'u-mem') => nextValue<MP[]>((ok, err) => repo.watchMemberPackages('t1', memberId, ok, err as never));
const credits = (kind: 'ptLesson' | 'groupClass', memberId = 'u-mem') => repo.getActiveMemberCredits('t1', memberId, kind);

describe('assignPackageToMember', () => {
  it('the SERVER prices it: promotion discount, dates and credits come back from the Worker and match the app preview', async () => {
    const pkg = await mkPackage(monthly());
    const promo = await mkPromotion();
    const preview = repo.applyPromotionEffect(pkg.price, promo);
    await assign(pkg, { promotion: promo });
    const [mp] = await holdings();
    expect(preview.finalPrice).toBe(800);
    expect(mp).toMatchObject({
      tenantId: 't1', memberId: 'u-mem', packageId: pkg.id, packageName: 'Aylık', kind: 'membership',
      listPrice: 1000, finalPrice: preview.finalPrice, promotionId: promo.id, promotionName: 'Kampanya', bonusDays: 0, bonusLessons: 0,
      status: 'active', frozenDays: 0, freezes: [],
    });
    expect(mp.endsAt.getTime() - mp.startsAt.getTime()).toBe(30 * DAY);
    expect(mp.assignedAt).toBeInstanceOf(Date);
    expect(mp.freezePolicy).toEqual({ minDays: 3, maxCount: 1 });
    // the promotion was redeemed once, on the server
    const [p] = await nextValue<import('../types').Promotion[]>((ok, err) => promoRepo.watchPromotionsForTenant('t1', ok, err as never));
    expect(p.redeemed).toBe(1);
    // the in-use counter moved
    const [cat] = await nextValue<import('../types').GymPackage[]>((ok, err) => pkgRepo.watchPackagesForTenant('t1', ok, err as never));
    expect(cat.activeAssignmentCount).toBe(1);
  });

  it('a bonus-lessons promotion on a lesson pack: credit total = pack + bonus, valid until the package ends', async () => {
    const pkg = await mkPackage(tenPack());
    const promo = await mkPromotion({ kind: 'bonusLessons', value: 2, name: '+2' });
    await assign(pkg, { promotion: promo, startsAt: new Date(Date.now() - 2 * DAY) });
    const [c] = await credits('ptLesson');
    expect(c).toMatchObject({ tenantId: 't1', memberId: 'u-mem', kind: 'ptLesson', source: 'purchase', total: 12, used: 0, status: 'active' });
    const [mp] = await holdings();
    expect(c.sourcePackageId).toBe(mp.id);
    expect(c.expiresAt.getTime()).toBe(mp.endsAt.getTime());
  });

  it('entitlement credits of a membership package: one per quota, soonest-expiring first, filtered by kind', async () => {
    const pkg = await mkPackage(monthly({ entitlements: { gymAccess: true, groupClasses: { count: 8, periodDays: 30 }, ptLessons: { count: 2, periodDays: 10 } } }));
    await assign(pkg);
    const pt = await credits('ptLesson');
    const group = await credits('groupClass');
    expect(pt).toHaveLength(1);
    expect(group).toHaveLength(1);
    expect(pt[0]).toMatchObject({ kind: 'ptLesson', source: 'entitlement', total: 2 });
    expect(group[0]).toMatchObject({ kind: 'groupClass', source: 'entitlement', total: 8 });
    expect(pt[0].expiresAt.getTime()).toBeLessThan(group[0].expiresAt.getTime());
  });

  it('an exhausted promotion surfaces as the exact PROMOTION_EXHAUSTED error the assign screen branches on, and writes nothing', async () => {
    const pkg = await mkPackage(monthly());
    const promo = await mkPromotion({ maxRedemptions: 1 });
    await assign(pkg, { promotion: promo });
    const e = await assign(pkg, { promotion: promo }).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe('PROMOTION_EXHAUSTED');
    expect(await holdings()).toHaveLength(1);
  });

  it('refusals: a member cannot assign; an inactive member / package are business refusals with a Turkish message', async () => {
    const pkg = await mkPackage(monthly());
    await w.h.addUser('u-new', ['member'], { status: 'pending' });
    const noMember = await assign(pkg, { memberId: 'u-new' }).catch((x) => x);
    expect(noMember).toMatchObject({ code: 'functions/failed-precondition' });
    expect(noMember.message).toMatch(/aktif değil/);
    await pkgRepo.setPackageActive(pkg.id, false);
    expect(await assign(pkg).catch((x) => x)).toMatchObject({ code: 'functions/failed-precondition', message: expect.stringMatching(/satışta değil/) });
    w.signInAs('fb-mem');
    expect(await assign(pkg).catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
  });

  it('a payment that is not a confirmed charge of this member is refused', async () => {
    const pkg = await mkPackage(monthly());
    await w.h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES ('pay-x','t1','u-admin',1000,'confirmed','{"kind":"charge"}',1)`);
    expect(await assign(pkg, { paymentId: 'pay-x' }).catch((x) => x)).toMatchObject({ message: expect.stringMatching(/onaylı bir ödeme değil/) });
    await w.h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES ('pay-ok','t1','u-mem',1000,'confirmed','{"kind":"charge"}',1)`);
    await assign(pkg, { paymentId: 'pay-ok' });
    expect((await holdings())[0].paymentId).toBe('pay-ok');
  });
});

describe('money round trip', () => {
  it('decimal lira in, kuruş in the database, lira out; the app preview equals what the Worker stored', async () => {
    const pkg = await mkPackage(monthly({ price: 199.99 }));
    const promo = await mkPromotion({ kind: 'amountDiscount', value: 49.5, name: 'Tutar' });
    const preview = repo.applyPromotionEffect(pkg.price, promo);
    expect(preview.finalPrice).toBe(150.49);
    await assign(pkg, { promotion: promo });
    const row = await w.h.one(`SELECT final_price, data FROM member_packages`);
    expect(row.final_price).toBe(15049);
    expect(JSON.parse(row.data).listPrice).toBe(19999);
    const [mp] = await holdings();
    expect(mp).toMatchObject({ listPrice: 199.99, finalPrice: 150.49 });
    expect(mp.finalPrice).toBe(preview.finalPrice);
  });

  it('percent preview rounds to the kuruş like the Worker', async () => {
    const pkg = await mkPackage(monthly({ price: 99.99 }));
    const promo = await mkPromotion({ kind: 'percentDiscount', value: 15, name: 'Yüzde' });
    const preview = repo.applyPromotionEffect(pkg.price, promo);
    await assign(pkg, { promotion: promo });
    expect((await holdings())[0].finalPrice).toBe(preview.finalPrice);
    expect(preview.finalPrice).toBe(84.99);   // 9999 kuruş * 0.85 = 8499.15 -> 8499
  });
});

describe('reads: holdings, credits, entitlements', () => {
  it('the member reads their own; a different member is refused; getMemberPackages is the newest-ending first', async () => {
    const monthlyPkg = await mkPackage(monthly());
    const pack = await mkPackage(tenPack());
    await assign(monthlyPkg);
    await assign(pack);
    w.signInAs('fb-mem');
    const mine = await repo.getMemberPackages('t1', 'u-mem');
    expect(mine.map((p) => p.packageName)).toEqual(['10 ders', 'Aylık']);   // 90 days beats 30
    expect(mine[0].endsAt.getTime()).toBeGreaterThan(mine[1].endsAt.getTime());
    expect((await credits('ptLesson')).length).toBeGreaterThan(0);
    await w.h.addUser('u-x', ['member']);
    w.signInAs('fb-x');
    await expect(repo.getMemberPackages('t1', 'u-mem')).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await expect(credits('ptLesson')).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });

  it('getMemberPackage: re-reads a listed assignment, null once it is gone, and states the gap for an id never listed', async () => {
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    const [mp] = await holdings();
    expect((await repo.getMemberPackage(mp.id))?.id).toBe(mp.id);
    await w.h.run(`DELETE FROM member_credits`);
    await w.h.run(`DELETE FROM member_packages`);
    expect(await repo.getMemberPackage(mp.id)).toBeNull();
    await expect(repo.getMemberPackage('mp-never-listed')).rejects.toThrow(/GAP\(api\)/);
  });

  it('watchMemberEntitlements: cache shape from the live package, null with none and once it has lapsed; unchanged polls are not re-delivered', async () => {
    expect(await nextValue<unknown>((ok, err) => repo.watchMemberEntitlements('t1', 'u-mem', ok, err as never))).toBeNull();
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    w.signInAs('fb-mem');
    const live = collect<import('../types').MemberEntitlementsCache | null>((ok, err) => repo.watchMemberEntitlements('t1', 'u-mem', ok, err as never));
    await live.until(1);
    const cache = live.values[0]!;
    const [mp] = await holdings();
    expect(cache).toMatchObject({ tenantId: 't1', memberId: 'u-mem', packageId: mp.id });
    expect(cache.entitlements).toMatchObject({ gymAccess: true, groupClasses: { count: 8 } });
    expect(cache.endsAt.getTime()).toBe(mp.endsAt.getTime());
    expect(cache.updatedAt).toBeInstanceOf(Date);
    // time passes: the lapsed membership reads as "no entitlements" on the next refresh
    await w.h.run(`UPDATE member_packages SET ends_at = ? WHERE id = ?`, Date.now() - 1000, mp.id);
    const { invalidate } = await import('./poll');
    invalidate('t:t1:entitlements');
    await live.until(2);
    expect(live.values[1]).toBeNull();
    live.stop();
  });

  it('writes refresh live watchers at once (no waiting for the 30 s poll)', async () => {
    const pkg = await mkPackage(monthly());
    const live = collect<MP[]>((ok, err) => repo.watchMemberPackages('t1', 'u-mem', ok, err as never));
    const liveCredits = collect<import('../types').MemberCredit[]>((ok, err) => repo.watchMemberCredits('t1', 'u-mem', 'ptLesson', ok, err as never));
    await live.until(1);
    await liveCredits.until(1);
    expect(live.values[0]).toEqual([]);
    await assign(pkg);
    await live.until(2);
    await liveCredits.until(2);
    expect(live.values[1]).toHaveLength(1);
    expect(liveCredits.values[1]).toHaveLength(1);
    live.stop();
    liveCredits.stop();
  });

  it('watchTenantMemberPackages is an explicit GAP: the screen\'s error callback gets a clear Error, never an empty list', async () => {
    const e = await nextValue<unknown>((ok, err) => repo.watchTenantMemberPackages('t1', ok as never, err as never)).catch((x) => x);
    expect(String((e as Error).message)).toMatch(/GAP\(api\).*member-packages/);
    expect(() => repo.watchTenantMemberPackages('t1', () => {})).toThrow(/GAP\(api\)/);
  });
});

describe('freezeMemberPackage', () => {
  it('freezes: returns when it resumes, ends_at and the live credits move by the frozen span (gym found via /me, nothing known beforehand)', async () => {
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    const [before] = await holdings();
    const creditsBefore = await credits('ptLesson');
    forgetTenants();
    const { resumesAt } = await repo.freezeMemberPackage(before.id, 10);
    expect(resumesAt).toBeInstanceOf(Date);
    expect(Math.abs(resumesAt.getTime() - (Date.now() + 10 * DAY))).toBeLessThan(60_000);
    const [after] = await holdings();
    expect(after.status).toBe('frozen');
    expect(after.frozenDays).toBe(10);
    expect(after.freezes).toHaveLength(1);
    expect(after.freezes[0]).toMatchObject({ days: 10 });
    expect(after.endsAt.getTime() - before.endsAt.getTime()).toBe(10 * DAY);
    const creditsAfter = await credits('ptLesson');
    expect(creditsAfter[0].expiresAt.getTime() - creditsBefore[0].expiresAt.getTime()).toBe(10 * DAY);
  });

  it('refusals name the limit in Turkish: minimum days, already frozen, used-up quota; a member cannot freeze', async () => {
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    const [mp] = await holdings();
    const short = await repo.freezeMemberPackage(mp.id, 1).catch((x) => x);
    expect(short).toMatchObject({ code: 'functions/failed-precondition', message: 'Bir dondurma en az 3 gün olmalı.' });
    await repo.freezeMemberPackage(mp.id, 5);
    expect(await repo.freezeMemberPackage(mp.id, 5).catch((x) => x)).toMatchObject({ message: 'Paket zaten dondurulmuş.' });
    await w.h.run(`UPDATE member_packages SET status = 'active', frozen_until = NULL WHERE id = ?`, mp.id);   // what the daily sweep does
    expect(await repo.freezeMemberPackage(mp.id, 5).catch((x) => x)).toMatchObject({ message: 'Dondurma hakkı doldu (en fazla 1 kez).' });
    w.signInAs('fb-mem');
    expect(await repo.freezeMemberPackage(mp.id, 5).catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
  });

  it('a package without a freeze right says so', async () => {
    const pkg = await mkPackage(monthly({ freezePolicy: undefined }));
    await assign(pkg);
    const [mp] = await holdings();
    expect(await repo.freezeMemberPackage(mp.id, 7).catch((x) => x)).toMatchObject({ message: 'Bu paketin dondurma hakkı yok.' });
  });
});

describe('cancelPackageAssignment', () => {
  it("'immediate': access shut now, quota revoked (no active credits, no entitlements), history row kept with the reason", async () => {
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    const [mp] = await holdings();
    await repo.cancelPackageAssignment(mp.id, 'yanlış atama', 'immediate');
    const [after] = await holdings();
    expect(after).toMatchObject({ id: mp.id, status: 'cancelled', cancellationReason: 'yanlış atama', cancellationAccess: 'immediate' });
    expect(after.cancelledAt).toBeInstanceOf(Date);
    expect(after.endsAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await credits('ptLesson')).toEqual([]);
    expect(await credits('groupClass')).toEqual([]);
    expect(await nextValue<unknown>((ok, err) => repo.watchMemberEntitlements('t1', 'u-mem', ok, err as never))).toBeNull();
    expect(await repo.cancelPackageAssignment(mp.id, 'tekrar', 'immediate').catch((x) => x)).toMatchObject({ message: 'Bu paket zaten geri alınmış.' });
  });

  it("'until-end': the member keeps access and credits, only the decision is recorded", async () => {
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    const [mp] = await holdings();
    await repo.cancelPackageAssignment(mp.id, 'yenilenmeyecek', 'until-end');
    const [after] = await holdings();
    expect(after).toMatchObject({ status: 'active', cancellationAccess: 'until-end', cancellationReason: 'yenilenmeyecek' });
    expect(after.endsAt.getTime()).toBe(mp.endsAt.getTime());
    expect((await credits('ptLesson')).length).toBe(1);
    expect(await nextValue<unknown>((ok, err) => repo.watchMemberEntitlements('t1', 'u-mem', ok, err as never))).not.toBeNull();
    expect(await repo.cancelPackageAssignment(mp.id, 'x', 'until-end').catch((x) => x)).toMatchObject({ code: 'functions/failed-precondition' });
  });

  it("'immediate' is refused while PT appointments paid from it are ahead, naming how many; allowed once they are cancelled", async () => {
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    const [mp] = await holdings();
    const [credit] = await credits('ptLesson');
    await w.h.run(
      `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at)
       VALUES ('s1','t1','u-admin','u-mem',?,60,'scheduled',?,1,1)`, Date.now() + DAY, credit.id);
    const blocked = await repo.cancelPackageAssignment(mp.id, 'hata', 'immediate').catch((x) => x);
    expect(blocked).toMatchObject({ code: 'functions/failed-precondition', message: 'Bu pakete bağlı 1 ileri tarihli randevu var. Önce onları iptal et.' });
    await w.h.run(`UPDATE pt_sessions SET status = 'cancelled' WHERE id = 's1'`);
    await repo.cancelPackageAssignment(mp.id, 'hata', 'immediate');
    expect((await holdings())[0].status).toBe('cancelled');
  });

  it('needs a reason and an admin', async () => {
    const pkg = await mkPackage(monthly());
    await assign(pkg);
    const [mp] = await holdings();
    expect(await repo.cancelPackageAssignment(mp.id, '  ', 'immediate').catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument' });
    w.signInAs('fb-mem');
    expect(await repo.cancelPackageAssignment(mp.id, 'x', 'immediate').catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('person ids: the screens hold the Firebase uid, the Worker the internal id', () => {
  it('a member reads their holdings, credits and entitlements by Firebase uid; the admin who ended a package is shown as the admin\'s uid', async () => {
    const pkg = await mkPackage(monthly());
    (auth as { currentUser: unknown }).currentUser = { uid: 'FIREBASE-UID-ADMIN' };
    await assign(pkg);
    const [mp] = await holdings();
    await repo.cancelPackageAssignment(mp.id, 'bitir', 'until-end');
    expect((await holdings())[0].cancelledBy).toBe('FIREBASE-UID-ADMIN');
    (auth as { currentUser: unknown }).currentUser = { uid: 'FIREBASE-UID-MEM' };
    resetIdentity();
    w.signInAs('fb-mem');
    const mine = await repo.getMemberPackages('t1', 'FIREBASE-UID-MEM');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ memberId: 'FIREBASE-UID-MEM', cancelledBy: 'u-admin' });   // somebody else's id stays internal
    expect((await credits('ptLesson', 'FIREBASE-UID-MEM')).every((c) => c.memberId === 'FIREBASE-UID-MEM')).toBe(true);
    const ent = await nextValue<import('../types').MemberEntitlementsCache | null>((ok, err) => repo.watchMemberEntitlements('t1', 'FIREBASE-UID-MEM', ok, err as never));
    expect(ent).toMatchObject({ memberId: 'FIREBASE-UID-MEM', tenantId: 't1' });
  });
});

describe('pure exports keep the Firebase behaviour', () => {
  it('memberEntitlementsId / applyPromotionEffect', () => {
    expect(repo.memberEntitlementsId('t1', 'u-mem')).toBe('t1_u-mem');
    expect(repo.applyPromotionEffect(1000, { kind: 'percentDiscount', value: 15 })).toEqual({ finalPrice: 850, bonusDays: 0, bonusLessons: 0 });
    expect(repo.applyPromotionEffect(500, { kind: 'amountDiscount', value: 800 })).toEqual({ finalPrice: 0, bonusDays: 0, bonusLessons: 0 });
    expect(repo.applyPromotionEffect(1000, { kind: 'bonusDays', value: 14 })).toEqual({ finalPrice: 1000, bonusDays: 14, bonusLessons: 0 });
    expect(repo.applyPromotionEffect(1000, { kind: 'bonusLessons', value: 2 })).toEqual({ finalPrice: 1000, bonusDays: 0, bonusLessons: 2 });
  });
});
