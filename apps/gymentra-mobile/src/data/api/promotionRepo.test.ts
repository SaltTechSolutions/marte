import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.setConfig({ testTimeout: 60_000 });

const { startWorld } = await import('./testWorld');
const repo = await import('./promotionRepo');
const { forgetTenants } = await import('./pkgTenant');
const { collect, nextValue } = await import('./pkgTestUtil');

const DAY = 86_400_000;
const draft = (o: Partial<import('../firebase/promotionRepo').PromotionDraft> = {}) => ({
  name: 'Yaz kampanyası',
  kind: 'percentDiscount' as const,
  value: 20,
  appliesTo: [] as string[],
  startsAt: new Date(Date.now() - DAY),
  endsAt: new Date(Date.now() + 30 * DAY),
  ...o,
});
const list = () => nextValue<import('../types').Promotion[]>((ok, err) => repo.watchPromotionsForTenant('t1', ok, err as never));

let w: Awaited<ReturnType<typeof startWorld>>;
beforeEach(async () => {
  forgetTenants();
  w = await startWorld();
  w.signInAs('fb-admin');
});

describe('promotionRepo over the Worker', () => {
  it('createPromotion + watchPromotionsForTenant: app types (Dates, redeemed 0, active), newest first', async () => {
    await repo.createPromotion('t1', draft({ name: 'Eski' }));
    await new Promise((r) => setTimeout(r, 5));
    await repo.createPromotion('t1', draft({ name: 'Yeni', kind: 'bonusDays', value: 14, maxRedemptions: 3 }));
    const promos = await list();
    expect(promos.map((p) => p.name)).toEqual(['Yeni', 'Eski']);
    expect(promos[0]).toMatchObject({ tenantId: 't1', kind: 'bonusDays', value: 14, maxRedemptions: 3, redeemed: 0, isActive: true, appliesTo: [] });
    expect(promos[0].startsAt).toBeInstanceOf(Date);
    expect(promos[0].endsAt.getTime()).toBeGreaterThan(Date.now());
    expect(promos[1].maxRedemptions).toBeUndefined();
  });

  it('money round trip: only an amount discount is money - 49,50 TL is 4950 kuruş, a percent or a bonus is stored as it is', async () => {
    await repo.createPromotion('t1', draft({ name: 'Tutar', kind: 'amountDiscount', value: 49.5 }));
    await repo.createPromotion('t1', draft({ name: 'Yüzde', kind: 'percentDiscount', value: 20 }));
    await repo.createPromotion('t1', draft({ name: 'Gün', kind: 'bonusDays', value: 14 }));
    const stored = async (name: string) => JSON.parse((await w.h.one(`SELECT data FROM promotions WHERE json_extract(data, '$.name') = ?`, name)).data).value;
    expect([await stored('Tutar'), await stored('Yüzde'), await stored('Gün')]).toEqual([4950, 20, 14]);
    const promos = await list();
    expect(promos.map((p) => [p.name, p.value]).sort()).toEqual([['Gün', 14], ['Tutar', 49.5], ['Yüzde', 20]]);
    const tutar = promos.find((p) => p.name === 'Tutar')!;
    await repo.updatePromotion(tutar.id, draft({ name: 'Tutar', kind: 'amountDiscount', value: 75.25 }));
    expect(await stored('Tutar')).toBe(7525);
    expect((await repo.getPromotion(tutar.id))!.value).toBe(75.25);
  });

  it('getPromotion: found (cold, tenant discovered via /me), unknown id -> null', async () => {
    await repo.createPromotion('t1', draft());
    const [p] = await list();
    forgetTenants();
    expect((await repo.getPromotion(p.id))?.name).toBe('Yaz kampanyası');
    expect(await repo.getPromotion('pr-nope')).toBeNull();
  });

  it('getPromotion: staff read it by id; a plain member gets null (403), as before', async () => {
    await repo.createPromotion('t1', draft());
    const [p] = await list();
    w.signInAs('fb-mem');
    expect(await repo.getPromotion(p.id)).toBeNull();
    w.signInAs('fb-admin');
    expect((await repo.getPromotion(p.id))?.id).toBe(p.id);
  });

  it('updatePromotion replaces the editable fields and a cleared cap really disappears', async () => {
    await repo.createPromotion('t1', draft({ maxRedemptions: 5, appliesTo: ['a', 'b'] }));
    const [p] = await list();
    await repo.updatePromotion(p.id, draft({ name: 'Güncel', value: 30, appliesTo: ['a'] }));
    const after = await repo.getPromotion(p.id);
    expect(after).toMatchObject({ name: 'Güncel', value: 30, appliesTo: ['a'], redeemed: 0 });
    expect(after!.maxRedemptions).toBeUndefined();
  });

  it('setPromotionActive toggles it; an unknown id is a refusal, not a silent success', async () => {
    await repo.createPromotion('t1', draft());
    const [p] = await list();
    await repo.setPromotionActive(p.id, false);
    expect((await repo.getPromotion(p.id))?.isActive).toBe(false);
    await repo.setPromotionActive(p.id, true);
    expect((await repo.getPromotion(p.id))?.isActive).toBe(true);
    await expect(repo.setPromotionActive('pr-nope', false)).rejects.toMatchObject({ code: 'functions/not-found' });
  });

  it('updates are validated on the Worker: unknown id is not-found, a merged invalid promotion is invalid-argument and changes nothing', async () => {
    await repo.createPromotion('t1', draft());
    const [p] = await list();
    expect(await repo.updatePromotion('pr-nope', draft()).catch((x) => x)).toMatchObject({ code: 'functions/not-found' });
    expect(await repo.setPromotionActive('pr-nope', true).catch((x) => x)).toMatchObject({ code: 'functions/not-found' });
    expect(await repo.updatePromotion(p.id, draft({ value: 150 })).catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument' });
    expect((await repo.getPromotion(p.id))!.value).toBe(20);
  });

  it('writes invalidate the live list: a watcher sees the change without waiting for the next poll', async () => {
    const live = collect<import('../types').Promotion[]>((ok, err) => repo.watchPromotionsForTenant('t1', ok, err as never));
    await live.until(1);
    expect(live.values[0]).toEqual([]);
    await repo.createPromotion('t1', draft());
    await live.until(2);
    expect(live.values[1]).toHaveLength(1);
    await repo.setPromotionActive(live.values[1][0].id, false);
    await live.until(3);
    expect(live.values[2][0].isActive).toBe(false);
    live.stop();
  });

  it('refusals arrive as ApiError with the callable-style code: member cannot write or list, bad value is invalid-argument', async () => {
    await expect(repo.createPromotion('t1', draft({ kind: 'percentDiscount', value: 150 }))).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    w.signInAs('fb-mem');
    await expect(repo.createPromotion('t1', draft())).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await expect(list()).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });

  it('isPromotionUsable keeps the Firebase semantics', () => {
    const base = { id: 'p', tenantId: 't1', name: 'x', kind: 'amountDiscount' as const, value: 5, appliesTo: ['k1'], startsAt: new Date(1000), endsAt: new Date(5000), redeemed: 0, isActive: true, createdAt: new Date(0) };
    const now = new Date(2000);
    expect(repo.isPromotionUsable(base, 'k1', now)).toBe(true);
    expect(repo.isPromotionUsable(base, 'k2', now)).toBe(false);
    expect(repo.isPromotionUsable({ ...base, appliesTo: [] }, 'k2', now)).toBe(true);
    expect(repo.isPromotionUsable({ ...base, isActive: false }, 'k1', now)).toBe(false);
    expect(repo.isPromotionUsable(base, 'k1', new Date(6000))).toBe(false);
    expect(repo.isPromotionUsable({ ...base, maxRedemptions: 2, redeemed: 2 }, 'k1', now)).toBe(false);
  });
});
