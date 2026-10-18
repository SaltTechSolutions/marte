import { describe, expect, it, vi } from 'vitest';

import { formatTl } from '../src/format';
import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

/**
 * Money is an INTEGER IN KURUŞ everywhere (1 TL = 100). One test per route family that carries money: the value a
 * client sends comes back unchanged (no rounding to lira, no division), fractional/oversized amounts are refused, and
 * every push text a person reads divides by 100 and prints tr-TR ("₺250,50").
 */
type H = Awaited<ReturnType<typeof harness>>;
const T1 = '/v1/tenants/t1';
const DAY = 86_400_000;
const json = async (r: Response) => (await r.json()) as any;
const pushes = async (h: H) => (await h.db.prepare(`SELECT payload FROM outbox ORDER BY created_at, rowid`).all<{ payload: string }>()).results.map((x) => JSON.parse(x.payload));
const monthly = { name: 'Aylık', kind: 'membership', price: 25_050, durationDays: 30, isActive: true, entitlements: { gymAccess: true } };

describe('formatTl', () => {
  it('prints kuruş as tr-TR lira', () => {
    expect(formatTl(25_050)).toBe('₺250,50');
    expect(formatTl(25_000)).toBe('₺250');
    expect(formatTl(5)).toBe('₺0,05');
    expect(formatTl(100)).toBe('₺1');
    expect(formatTl(123_456)).toBe('₺1.234,56');
    expect(formatTl(100_000_000)).toBe('₺1.000.000');
    expect(formatTl(99)).toBe('₺0,99');
  });
});

describe('money: packages and promotions (catalog prices, discounts)', () => {
  it('a package price in kuruş round-trips unchanged; fractional and absurd prices are refused', async () => {
    const h = await harness();
    const { id } = await json(await h.send('POST', `${T1}/packages`, 'fb-admin', monthly));
    expect((await json(await h.send('GET', `${T1}/packages`, 'fb-mem'))).find((p: any) => p.id === id).price).toBe(25_050);
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { price: 99_999 })).status).toBe(200);
    expect((await json(await h.send('GET', `${T1}/packages`, 'fb-mem'))).find((p: any) => p.id === id).price).toBe(99_999);
    for (const price of [250.5, -1, 100_000_001, '25050']) expect((await h.send('POST', `${T1}/packages`, 'fb-admin', { ...monthly, price })).status, String(price)).toBe(400);
  });

  it('an amount discount is whole kuruş and subtracts as such; a percent discount rounds to a whole kuruş', async () => {
    const h = await harness();
    const pk = (await json(await h.send('POST', `${T1}/packages`, 'fb-admin', monthly))).id;
    const amount = (await json(await h.send('POST', `${T1}/promotions`, 'fb-admin', { name: '50,50 TL', kind: 'amountDiscount', value: 5_050, appliesTo: [], isActive: true }))).id;
    expect((await json(await h.send('GET', `${T1}/promotions`, 'fb-admin'))).find((p: any) => p.id === amount).value).toBe(5_050);
    expect((await h.send('POST', `${T1}/promotions`, 'fb-admin', { name: 'x', kind: 'amountDiscount', value: 50.5, appliesTo: [], isActive: true })).status).toBe(400);
    const sold = await json(await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: pk, promotionId: amount }));
    expect(sold.finalPrice).toBe(20_000);
    const pct = (await json(await h.send('POST', `${T1}/promotions`, 'fb-admin', { name: '%15', kind: 'percentDiscount', value: 15, appliesTo: [], isActive: true }))).id;
    await h.addUser('u-b', ['member']);
    const sold2 = await json(await h.send('POST', `${T1}/members/u-b/packages`, 'fb-admin', { packageId: pk, promotionId: pct }));
    expect(sold2.finalPrice).toBe(21_293);                                // 25050 * 0.85 = 21292.5 -> a whole kuruş
    expect(Number.isInteger(sold2.finalPrice)).toBe(true);
  });
});

describe('money: assignments (final price)', () => {
  it('the price paid is stored and listed in kuruş, in the member list, the gym-wide list and the single read', async () => {
    const h = await harness();
    const pk = (await json(await h.send('POST', `${T1}/packages`, 'fb-admin', monthly))).id;
    const sold = await json(await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: pk }));
    expect(sold.finalPrice).toBe(25_050);
    expect((await h.one(`SELECT final_price p FROM member_packages WHERE id = ?`, sold.id)).p).toBe(25_050);
    expect((await json(await h.send('GET', `${T1}/members/u-mem/packages`, 'fb-mem')))[0]).toMatchObject({ finalPrice: 25_050, listPrice: 25_050 });
    expect((await json(await h.send('GET', `${T1}/member-packages`, 'fb-admin')))[0].finalPrice).toBe(25_050);
    expect((await json(await h.send('GET', `${T1}/member-packages/${sold.id}`, 'fb-mem'))).finalPrice).toBe(25_050);
  });
});

describe('money: payments ledger', () => {
  it('an amount in kuruş round-trips in every list; reversals keep theirs; fractions and oversized amounts are 400', async () => {
    const h = await harness();
    const made = await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 25_050, method: 'cash' });
    expect(made.status).toBe(201);
    const { id } = await json(made);
    expect((await h.one(`SELECT amount a FROM payments WHERE id = ?`, id)).a).toBe(25_050);
    expect((await json(await h.send('GET', `${T1}/payments`, 'fb-admin')))[0]).toMatchObject({ id, amount: 25_050, memberId: 'u-mem' });
    expect((await json(await h.send('GET', `${T1}/members/u-mem/payments`, 'fb-mem')))[0].amount).toBe(25_050);
    const rev = await json(await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 25_050, method: 'cash', kind: 'reversal', reversesPaymentId: id }));
    expect((await h.one(`SELECT amount a FROM payments WHERE id = ?`, rev.id)).a).toBe(25_050);
    for (const amount of [250.5, 0, -100, 100_000_001, '25050', null]) {
      expect((await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount, method: 'cash' })).status, String(amount)).toBe(400);
    }
  });
});

describe('money: a parent\'s group payment (the push text)', () => {
  it('splits kuruş exactly (odd kuruş to the last entries) and the push to the admins reads "₺250,50"', async () => {
    const h = await harness();
    await h.addUser('u-par', ['member']);
    await h.addUser('u-k1', ['member']);
    await h.addUser('u-k2', ['member']);
    await h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'approved' WHERE member_id IN ('u-k1','u-k2')`);
    const r = await h.send('POST', `${T1}/payments/group`, 'fb-par', { method: 'cash', totalAmount: 25_051, entries: [{ memberId: 'u-k1' }, { memberId: 'u-k2' }] });
    expect(r.status).toBe(201);
    expect((await json(r)).payments.map((p: any) => p.amount)).toEqual([12_525, 12_526]);
    expect((await h.db.prepare(`SELECT sum(amount) s FROM payments`).first<any>())!.s).toBe(25_051);
    expect((await pushes(h)).at(-1).body).toContain('₺250,51');

    const explicit = await h.send('POST', `${T1}/payments/group`, 'fb-par', { method: 'cash', entries: [{ memberId: 'u-k1', amount: 10_000 }, { memberId: 'u-k2', amount: 15_050 }] });
    expect(explicit.status).toBe(201);
    expect((await pushes(h)).at(-1).body).toBe('u-par · 2 kişi · ₺250,50 onayını bekliyor.');
    expect((await h.send('POST', `${T1}/payments/group`, 'fb-par', { method: 'cash', entries: [{ memberId: 'u-k1', amount: 100.5 }, { memberId: 'u-k2', amount: 100 }] })).status).toBe(400);
    const whole = await h.send('POST', `${T1}/payments/group`, 'fb-par', { method: 'cash', totalAmount: 125_000, entries: [{ memberId: 'u-k1' }] });
    expect(whole.status).toBe(201);
    expect((await pushes(h)).at(-1).body).toContain('₺1.250 ');
  });
});

describe('money: package change offers (price delta, prorated refund)', () => {
  it('priceDelta, refundAmount and the booked refund payment are whole kuruş, equal end to end; no push carries a raw number', async () => {
    const h = await harness();
    const gold = (await json(await h.send('POST', `${T1}/packages`, 'fb-admin', { ...monthly, name: 'Gold', price: 30_001, durationDays: 30 }))).id;
    const basic = (await json(await h.send('POST', `${T1}/packages`, 'fb-admin', { ...monthly, name: 'Basic', price: 12_345, durationDays: 30 }))).id;
    const held = await json(await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: gold, startsAt: Date.now() - 10 * DAY }));
    const offer = await json(await h.send('POST', `${T1}/package-change-requests`, 'fb-admin',
      { memberId: 'u-mem', kind: 'downgrade', proposedPackageId: basic, currentPackageAssignmentId: held.id }));
    expect(offer.priceDelta).toBe(12_345 - 30_001);
    expect(Number.isInteger(offer.refundAmount)).toBe(true);
    const unused = Math.round((30_001 - 12_345) * (Math.round((held.endsAt - Date.now()) / DAY) / 30));
    expect(offer.refundAmount).toBe(unused);
    const listed = (await json(await h.send('GET', `${T1}/package-change-requests?memberId=u-mem&status=pending`, 'fb-admin')))[0];
    expect(listed).toMatchObject({ id: offer.id, priceDelta: 12_345 - 30_001, refundAmount: offer.refundAmount, proposedSummary: { price: 12_345 }, currentSummary: { price: 30_001 } });
    expect((await h.send('POST', `${T1}/package-change-requests/${offer.id}/respond`, 'fb-mem', { approve: true })).status).toBe(200);
    const refund = await h.one(`SELECT amount a, status s FROM payments WHERE json_extract(data, '$.kind') = 'refund'`);
    expect(refund).toEqual({ a: offer.refundAmount, s: 'confirmed' });
    expect((await json(await h.send('GET', `${T1}/payments`, 'fb-admin')))[0]).toMatchObject({ amount: offer.refundAmount, kind: 'refund' });
    expect((await h.one(`SELECT final_price p FROM member_packages WHERE status = 'active'`)).p).toBe(12_345);
    for (const p of await pushes(h)) expect(String(p.body)).not.toMatch(/\d{4,}/);      // nothing leaks a kuruş figure to a person
  });
});
