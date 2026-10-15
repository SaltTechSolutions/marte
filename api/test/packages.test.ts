import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });
const T1 = '/v1/tenants/t1';
const monthly = { name: 'Aylık', kind: 'membership', price: 1000, durationDays: 30, isActive: true,
  entitlements: { gymAccess: true, groupClasses: { unlimited: false, count: 8, periodDays: 30 }, ptLessons: { count: 2, periodDays: 30 } } };
const lessons = { name: '10 ders', kind: 'lessons', price: 2000, lessonCount: 10, lessonValidityDays: 90, isActive: true, entitlements: { gymAccess: false } };

describe('packages & promotions (F3)', () => {
  it('catalog: admin only, validated; a package in use only toggles isActive/sortOrder', async () => {
    const h = await harness();
    expect((await h.send('POST', `${T1}/packages`, 'fb-mem', monthly)).status).toBe(403);
    expect((await h.send('POST', `${T1}/packages`, 'fb-admin', { ...monthly, price: -1 })).status).toBe(400);
    expect((await h.send('POST', `${T1}/packages`, 'fb-admin', { ...monthly, durationDays: 0 })).status).toBe(400);
    const { id } = (await (await h.send('POST', `${T1}/packages`, 'fb-admin', monthly)).json()) as { id: string };
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { ...monthly, price: 1200 })).status).toBe(200);   // not in use yet
    expect((await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id })).status).toBe(201);
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { price: 1 })).status).toBe(409);
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { isActive: false })).status).toBe(200);
    expect((await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id })).status).toBe(409);   // inactive
  });

  it('assignment: package + entitlement credits + in-use counter in one go; admin only; member must be active', async () => {
    const h = await harness();
    const { id } = (await (await h.send('POST', `${T1}/packages`, 'fb-admin', monthly)).json()) as { id: string };
    expect((await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-mem', { packageId: id })).status).toBe(403);
    await h.addUser('u-p', ['member'], { status: 'pending' });
    expect((await h.send('POST', `${T1}/members/u-p/packages`, 'fb-admin', { packageId: id })).status).toBe(409);
    const res = await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id, startsAt: 1_000_000 });
    expect(res.status).toBe(201);
    const credits = await h.db.prepare(`SELECT kind, source, total, expires_at e FROM member_credits ORDER BY kind`).all<any>();
    expect(credits.results.map((r) => [r.kind, r.source, r.total, r.e])).toEqual([
      ['groupClass', 'entitlement', 8, 1_000_000 + 30 * 86_400_000],
      ['ptLesson', 'entitlement', 2, 1_000_000 + 30 * 86_400_000],
    ]);
    expect((await h.one(`SELECT active_assignment_count n FROM gym_packages`)).n).toBe(1);
  });

  it('lesson packs credit purchased lessons; a promotion discounts, adds bonus and is redeemed exactly once per assignment', async () => {
    const h = await harness();
    const pk = (await (await h.send('POST', `${T1}/packages`, 'fb-admin', lessons)).json()) as { id: string };
    const promo = (await (await h.send('POST', `${T1}/promotions`, 'fb-admin',
      { name: '+2 ders', kind: 'bonusLessons', value: 2, appliesTo: [pk.id], isActive: true, maxRedemptions: 1 })).json()) as { id: string };
    const res = await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: pk.id, promotionId: promo.id });
    expect(res.status).toBe(201);
    expect((await h.one(`SELECT total t FROM member_credits`)).t).toBe(12);
    expect(JSON.parse((await h.one(`SELECT data d FROM promotions`)).d).redeemed).toBe(1);
    // exhausted: the second assignment writes nothing at all
    const again = await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: pk.id, promotionId: promo.id });
    expect(again.status).toBe(409);
    expect(await h.one(`SELECT count(*) c FROM member_packages`)).toEqual({ c: 1 });
    expect(await h.one(`SELECT count(*) c FROM member_credits`)).toEqual({ c: 1 });
  });

  it('percent and amount discounts; promotion limited to other packages is refused; redeemed cannot be written by the client', async () => {
    const h = await harness();
    const pk = (await (await h.send('POST', `${T1}/packages`, 'fb-admin', monthly)).json()) as { id: string };
    const p20 = (await (await h.send('POST', `${T1}/promotions`, 'fb-admin', { name: '%20', kind: 'percentDiscount', value: 20, appliesTo: [], isActive: true })).json()) as { id: string };
    const other = (await (await h.send('POST', `${T1}/promotions`, 'fb-admin', { name: 'x', kind: 'amountDiscount', value: 5, appliesTo: ['nope'], isActive: true })).json()) as { id: string };
    expect((await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: pk.id, promotionId: other.id })).status).toBe(409);
    const ok = (await (await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: pk.id, promotionId: p20.id })).json()) as { finalPrice: number };
    expect(ok.finalPrice).toBe(800);
    expect((await h.send('PUT', `${T1}/promotions/${p20.id}`, 'fb-admin', { redeemed: 0 })).status).toBe(400);
    expect((await h.send('POST', `${T1}/promotions`, 'fb-admin', { name: 'bad', kind: 'percentDiscount', value: 150, appliesTo: [], isActive: true })).status).toBe(400);
    expect((await h.send('POST', `${T1}/promotions`, 'fb-mem', { name: 'x', kind: 'bonusDays', value: 1, appliesTo: [], isActive: true })).status).toBe(403);
  });
});

describe('packages matrix rows (PKG-1/5)', () => {
  it('[L1657][L1689] the in-use counter is server-owned: a client value is ignored on create and on edit', async () => {
    const h = await harness();
    const { id } = (await (await h.send('POST', `${T1}/packages`, 'fb-admin', { ...monthly, activeAssignmentCount: 5 })).json()) as { id: string };
    expect((await h.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, id)).n).toBe(0);
    expect(JSON.parse((await h.one(`SELECT data d FROM gym_packages WHERE id = ?`, id)).d).activeAssignmentCount).toBeUndefined();
    await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { ...monthly, activeAssignmentCount: 9 });
    expect((await h.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, id)).n).toBe(0);
    await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id });
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { activeAssignmentCount: 0 })).status).toBe(409);
  });

  it('[L1831][L1837][L1862] promotions: redeemed starts at 0 whatever is sent, other fields editable, admin deletes', async () => {
    const h = await harness();
    const { id } = (await (await h.send('POST', `${T1}/promotions`, 'fb-admin', { name: 'p', kind: 'bonusDays', value: 3, appliesTo: [], isActive: true, redeemed: 99 })).json()) as { id: string };
    expect(JSON.parse((await h.one(`SELECT data d FROM promotions WHERE id = ?`, id)).d).redeemed).toBe(0);
    expect((await h.send('PUT', `${T1}/promotions/${id}`, 'fb-admin', { name: 'renamed', value: 5 })).status).toBe(200);
    expect(JSON.parse((await h.one(`SELECT data d FROM promotions WHERE id = ?`, id)).d)).toMatchObject({ name: 'renamed', value: 5, redeemed: 0 });
    expect((await h.send('DELETE', `${T1}/promotions/${id}`, 'fb-mem')).status).toBe(403);
    expect((await h.send('DELETE', `${T1}/promotions/${id}`, 'fb-admin')).status).toBe(200);
    expect(await h.one(`SELECT 1 x FROM promotions WHERE id = ?`, id)).toBeNull();
  });

  it('[L1983] credits cannot be created directly: no route accepts it', async () => {
    const h = await harness();
    expect((await h.send('POST', `${T1}/members/u-mem/credits`, 'fb-admin', { kind: 'ptLesson', total: 5 })).status).toBe(404);
  });
});
