import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.setConfig({ testTimeout: 60_000 });

const { startWorld } = await import('./testWorld');
const repo = await import('./packageChangeRepo');
const holdingsRepo = await import('./memberPackageRepo');
const pkgRepo = await import('./packageRepo');
const promoRepo = await import('./promotionRepo');
const payRepo = await import('./paymentRepo');
const { forgetTenants } = await import('./pkgTenant');
const { resetIdentity } = await import('./membershipIdentity');
const { auth } = await import('@/services/firebase');
const { collect, nextValue } = await import('./pkgTestUtil');
type Draft = import('../firebase/packageRepo').PackageDraft;
type GP = import('../types').GymPackage;
type MP = import('../types').MemberPackage;
type Req = import('../types').PackageChangeRequest;

const DAY = 86_400_000;
const membership = (name: string, price: number, o: Partial<Draft> = {}): Draft => ({
  name, kind: 'membership', price, durationDays: 30, entitlements: { gymAccess: true }, ...o,
});

let w: Awaited<ReturnType<typeof startWorld>>;
beforeEach(async () => {
  forgetTenants();
  resetIdentity();
  (auth as { currentUser: unknown }).currentUser = null;
  w = await startWorld();
  w.signInAs('fb-admin');
});

async function mk(draft: Draft): Promise<GP> {
  await pkgRepo.createGymPackage('t1', draft);
  const all = await nextValue<GP[]>((ok, err) => pkgRepo.watchPackagesForTenant('t1', ok, err as never));
  return all.find((p) => p.name === draft.name)!;
}
const holdings = () => nextValue<MP[]>((ok, err) => holdingsRepo.watchMemberPackages('t1', 'u-mem', ok, err as never));
const pending = () => nextValue<Req[]>((ok, err) => repo.watchPendingPackageChangeRequests('t1', 'u-mem', ok, err as never));
const ledger = () => nextValue<import('../types').Payment[]>((ok, err) => payRepo.watchPaymentsForMember('t1', 'u-mem', ok, err as never));

/** Member u-mem holds `gold` (2000) and the admin proposes `basic` (1000). */
async function downgradeSetup() {
  const gold = await mk(membership('Gold', 2000));
  const basic = await mk(membership('Basic', 1000));
  await holdingsRepo.assignPackageToMember({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', pkg: gold, startsAt: new Date(), assignedBy: 'a' });
  const [current] = await holdings();
  const propose = (o: Partial<Parameters<typeof repo.createPackageChangeRequest>[0]> = {}) =>
    repo.createPackageChangeRequest({
      tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', kind: 'downgrade',
      current: { assignmentId: current.id, pkg: current }, proposedPackage: basic, createdBy: 'a', ...o,
    });
  return { gold, basic, current, propose };
}

describe('createPackageChangeRequest', () => {
  it('sends only the choices: the SERVER computes price delta, prorated refund, summaries and dates', async () => {
    const { propose, basic, current } = await downgradeSetup();
    await propose({ note: 'Fiyat uygunluğu' });
    w.signInAs('fb-mem');
    const [r] = await pending();
    expect(r).toMatchObject({
      tenantId: 't1', memberId: 'u-mem', kind: 'downgrade', status: 'pending', currentPackageAssignmentId: current.id,
      proposedPackageId: basic.id, priceDelta: -1000, refundAmount: 1000, refundBasis: 'kalan 30/30 gün', note: 'Fiyat uygunluğu',
    });
    expect(r.currentSummary).toMatchObject({ packageName: 'Gold', price: 2000 });
    expect(r.proposedSummary).toMatchObject({ packageName: 'Basic', price: 1000 });
    expect(r.proposedSummary.endsAt.getTime() - r.effectiveAt.getTime()).toBe(30 * DAY);
    expect(r.expiresAt.getTime() - r.createdAt.getTime()).toBeGreaterThan(2.9 * DAY);   // default 3 days
    expect(r.effectiveAt).toBeInstanceOf(Date);
    // the preview helper agrees with what the Worker computed
    expect(repo.computeProratedRefund(current, basic.price, r.effectiveAt)).toEqual({ refundAmount: 1000, refundBasis: 'kalan 30/30 gün' });
  });

  it('an upgrade carries a promotion and a delayed start; the offer\'s proposed price already includes the discount', async () => {
    const gold = await mk(membership('Gold', 2000));
    const silver = await mk(membership('Silver', 1000));
    await holdingsRepo.assignPackageToMember({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', pkg: silver, startsAt: new Date(), assignedBy: 'a' });
    const [current] = await holdings();
    await promoRepo.createPromotion('t1', { name: '%10', kind: 'percentDiscount', value: 10, appliesTo: [], startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 9 * DAY) });
    const [promo] = await nextValue<import('../types').Promotion[]>((ok, err) => promoRepo.watchPromotionsForTenant('t1', ok, err as never));
    await repo.createPackageChangeRequest({
      tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', kind: 'upgrade', current: { assignmentId: current.id, pkg: current },
      proposedPackage: gold, proposedPromotion: promo, effectiveInDays: 7, expiresInDays: 5, createdBy: 'a',
    });
    const [r] = await nextValue<Req[]>((ok, err) => repo.watchPendingPackageChangeRequests('t1', 'u-mem', ok, err as never));
    expect(r).toMatchObject({ kind: 'upgrade', proposedPromotionId: promo.id, priceDelta: 800 });
    expect(r.refundAmount).toBeUndefined();
    expect(r.proposedSummary.price).toBe(1800);
    expect(Math.round((r.effectiveAt.getTime() - r.createdAt.getTime()) / DAY)).toBe(7);
    expect(Math.round((r.expiresAt.getTime() - r.createdAt.getTime()) / DAY)).toBe(5);
  });

  it('an add-on without a current assignment; admin only; bad windows are invalid-argument', async () => {
    const { basic, propose } = await downgradeSetup();
    await repo.createPackageChangeRequest({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', kind: 'addon', proposedPackage: basic, createdBy: 'a' });
    const reqs = await nextValue<Req[]>((ok, err) => repo.watchPendingPackageChangeRequests('t1', 'u-mem', ok, err as never));
    const addon = reqs.find((r) => r.kind === 'addon')!;
    expect(addon.currentPackageAssignmentId).toBeUndefined();
    expect(addon.currentSummary).toBeUndefined();
    expect(addon.priceDelta).toBe(1000);
    expect(await propose({ expiresInDays: 99 }).catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument' });
    w.signInAs('fb-mem');
    expect(await propose().catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('reading offers', () => {
  it('the member sees their pending offers newest first; getPackageChangeRequest / watchPackageChangeRequest by id; others get null', async () => {
    const { propose } = await downgradeSetup();
    await propose();
    await new Promise((r) => setTimeout(r, 5));
    await propose({ note: 'ikinci' });
    w.signInAs('fb-mem');
    const list = await pending();
    expect(list.map((r) => r.note)).toEqual(['ikinci', undefined]);
    forgetTenants();
    expect((await repo.getPackageChangeRequest(list[0].id))?.note).toBe('ikinci');
    expect((await nextValue<Req | null>((ok, err) => repo.watchPackageChangeRequest(list[1].id, ok, err as never)))?.id).toBe(list[1].id);
    expect(await repo.getPackageChangeRequest('pcr-nope')).toBeNull();
    await w.h.addUser('u-other', ['member']);
    w.signInAs('fb-other');
    forgetTenants();
    expect(await repo.getPackageChangeRequest(list[0].id)).toBeNull();
  });

  it('a new offer reaches a live watcher at once', async () => {
    const { propose } = await downgradeSetup();
    w.signInAs('fb-mem');
    const live = collect<Req[]>((ok, err) => repo.watchPendingPackageChangeRequests('t1', 'u-mem', ok, err as never));
    await live.until(1);
    expect(live.values[0]).toEqual([]);
    w.signInAs('fb-admin');
    await propose();
    w.signInAs('fb-mem');
    await live.until(2);
    expect(live.values[1]).toHaveLength(1);
    live.stop();
  });
});

describe('respondToPackageChangeRequest', () => {
  it('approve: the swap is applied by the Worker - old holding cancelled, new one active, refund booked in the ledger', async () => {
    const { propose, current } = await downgradeSetup();
    await propose();
    w.signInAs('fb-mem');
    const [r] = await pending();
    const outcome = await repo.respondToPackageChangeRequest(r.id, true);
    expect(outcome).toBe('approved');
    const all = await holdings();
    const old = all.find((p) => p.id === current.id)!;
    const fresh = all.find((p) => p.id !== current.id)!;
    expect(old.status).toBe('cancelled');
    expect(fresh).toMatchObject({ packageName: 'Basic', status: 'active', finalPrice: 1000 });
    expect(await pending()).toEqual([]);
    expect((await repo.getPackageChangeRequest(r.id))?.status).toBe('approved');
    const refund = (await ledger()).find((p) => p.kind === 'refund');
    expect(refund).toMatchObject({ amount: 1000, status: 'confirmed', method: 'cash' });
    expect(refund!.note).toContain('Gold → Basic');
    const ent = await nextValue<import('../types').MemberEntitlementsCache | null>((ok, err) => holdingsRepo.watchMemberEntitlements('t1', 'u-mem', ok, err as never));
    expect(ent!.packageId).toBe(fresh.id);
  });

  it('reject: nothing changes; answering twice is a Turkish refusal', async () => {
    const { propose, current } = await downgradeSetup();
    await propose();
    w.signInAs('fb-mem');
    const [r] = await pending();
    expect(await repo.respondToPackageChangeRequest(r.id, false)).toBe('rejected');
    expect((await holdings()).map((p) => [p.id, p.status])).toEqual([[current.id, 'active']]);
    const again = await repo.respondToPackageChangeRequest(r.id, true).catch((x) => x);
    expect(again).toMatchObject({ code: 'functions/failed-precondition', message: 'Bu teklif artık beklemede değil.' });
  });

  it("'promotion-expired' is its own outcome, not a success: the swap is refused instead of being charged at full price", async () => {
    const gold = await mk(membership('Gold', 2000));
    const silver = await mk(membership('Silver', 1000));
    await holdingsRepo.assignPackageToMember({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', pkg: silver, startsAt: new Date(), assignedBy: 'a' });
    const [current] = await holdings();
    await promoRepo.createPromotion('t1', { name: '%50', kind: 'percentDiscount', value: 50, appliesTo: [], startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + DAY) });
    const [promo] = await nextValue<import('../types').Promotion[]>((ok, err) => promoRepo.watchPromotionsForTenant('t1', ok, err as never));
    await repo.createPackageChangeRequest({
      tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', kind: 'upgrade', current: { assignmentId: current.id, pkg: current },
      proposedPackage: gold, proposedPromotion: promo, createdBy: 'a',
    });
    await w.h.run(`UPDATE promotions SET data = json_set(data, '$.endsAt', 1)`);   // the campaign ends before the member answers
    w.signInAs('fb-mem');
    const [r] = await pending();
    expect(await repo.respondToPackageChangeRequest(r.id, true)).toBe('promotion-expired');
    expect((await holdings()).map((p) => p.packageName)).toEqual(['Silver']);
    expect((await repo.getPackageChangeRequest(r.id))?.status).toBe('expired');
  });

  it('only the addressed member answers; an expired offer is refused', async () => {
    const { propose } = await downgradeSetup();
    await propose();
    w.signInAs('fb-mem');
    const [r] = await pending();
    await w.h.addUser('u-other', ['member']);
    w.signInAs('fb-other');
    expect(await repo.respondToPackageChangeRequest(r.id, true).catch((x) => x)).toMatchObject({ code: 'functions/not-found' });
    w.signInAs('fb-mem');
    await w.h.run(`UPDATE package_change_requests SET expires_at = 1`);
    expect(await repo.respondToPackageChangeRequest(r.id, true).catch((x) => x)).toMatchObject({ message: 'Teklifin süresi doldu.' });
  });
});

describe('cancelPackageChangeRequest', () => {
  it('the admin withdraws a pending offer; the member can no longer accept it', async () => {
    const { propose } = await downgradeSetup();
    await propose();
    w.signInAs('fb-mem');
    const [r] = await pending();
    w.signInAs('fb-admin');
    await repo.cancelPackageChangeRequest(r.id);
    expect((await repo.getPackageChangeRequest(r.id))?.status).toBe('cancelled');
    expect(await repo.cancelPackageChangeRequest(r.id).catch((x) => x)).toMatchObject({ message: 'Bu teklif artık beklemede değil.' });
    w.signInAs('fb-mem');
    expect(await repo.respondToPackageChangeRequest(r.id, true).catch((x) => x)).toMatchObject({ code: 'functions/failed-precondition' });
    expect(await pending()).toEqual([]);
  });

  it('a member cannot withdraw', async () => {
    const { propose } = await downgradeSetup();
    await propose();
    w.signInAs('fb-mem');
    const [r] = await pending();
    expect(await repo.cancelPackageChangeRequest(r.id).catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('person ids', () => {
  it('the member finds and answers their offer by Firebase uid; the offer shows them as that uid, and the admin who made it stays internal', async () => {
    const { propose } = await downgradeSetup();
    await propose();
    (auth as { currentUser: unknown }).currentUser = { uid: 'FIREBASE-UID-MEM' };
    resetIdentity();
    w.signInAs('fb-mem');
    const [r] = await nextValue<Req[]>((ok, err) => repo.watchPendingPackageChangeRequests('t1', 'FIREBASE-UID-MEM', ok, err as never));
    expect(r).toMatchObject({ memberId: 'FIREBASE-UID-MEM', createdBy: 'u-admin' });
    expect((await repo.getPackageChangeRequest(r.id))?.memberId).toBe('FIREBASE-UID-MEM');
    expect(await repo.respondToPackageChangeRequest(r.id, true)).toBe('approved');
  });
});

describe('money round trip', () => {
  it('decimal prices: the offer\'s delta, refund and summaries come back in lira and match the lira preview; the refund row is booked in kuruş', async () => {
    const gold = await mk(membership('Gold', 1999.99));
    const basic = await mk(membership('Basic', 1000.5));
    await holdingsRepo.assignPackageToMember({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', pkg: gold, startsAt: new Date(), assignedBy: 'a' });
    const [current] = await holdings();
    expect((await w.h.one(`SELECT final_price FROM member_packages`)).final_price).toBe(199999);
    await repo.createPackageChangeRequest({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', kind: 'downgrade', current: { assignmentId: current.id, pkg: current }, proposedPackage: basic, createdBy: 'a' });
    w.signInAs('fb-mem');
    const [r] = await pending();
    expect(r.priceDelta).toBe(-999.49);
    expect(r.refundAmount).toBe(999.49);
    expect(r.currentSummary!.price).toBe(1999.99);
    expect(r.proposedSummary.price).toBe(1000.5);
    expect(repo.computeProratedRefund(current, basic.price, r.effectiveAt).refundAmount).toBe(r.refundAmount);
    expect(await repo.respondToPackageChangeRequest(r.id, true)).toBe('approved');
    expect((await w.h.one(`SELECT amount FROM payments WHERE json_extract(data, '$.kind') = 'refund'`)).amount).toBe(99949);
    expect((await ledger()).find((p) => p.kind === 'refund')!.amount).toBe(999.49);
  });
});

describe('computeProratedRefund (pure)', () => {
  it('prorates the unused part of the price difference, never negative remaining days', () => {
    const cur = { finalPrice: 900, startsAt: new Date('2026-01-01'), endsAt: new Date('2026-04-01') };   // 90 days
    expect(repo.computeProratedRefund(cur, 300, new Date('2026-02-15'))).toEqual({ refundAmount: 300, refundBasis: 'kalan 45/90 gün' });
    expect(repo.computeProratedRefund(cur, 300, new Date('2026-05-01'))).toEqual({ refundAmount: 0, refundBasis: 'kalan 0/90 gün' });
  });
});
