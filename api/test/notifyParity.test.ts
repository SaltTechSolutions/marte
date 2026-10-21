import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

/**
 * Pushes the Firebase triggers sent (backend/functions/src/notifications.ts) that the Worker used to leave out:
 * join request, membership approved, member left, payment notice, payment decision, payment correction.
 */
type H = Awaited<ReturnType<typeof harness>>;
const T1 = '/v1/tenants/t1';
const json = async (r: Response) => (await r.json()) as any;
const pushes = async (h: H) =>
  (await h.db.prepare(`SELECT payload p, dedupe_key k FROM outbox ORDER BY created_at, rowid`).all<any>()).results
    .map((r) => ({ ...JSON.parse(r.p), key: r.k }));

async function world() {
  const h = await harness();
  await h.addUser('u-admin2', ['admin']);
  await h.addUser('u-new', null);                  // signed up, no membership yet
  await h.run(`UPDATE users SET display_name = 'Yeni Kişi' WHERE id = 'u-new'`);
  await h.run(`UPDATE users SET display_name = 'Mem Ber' WHERE id = 'u-mem'`);
  return h;
}

describe('join request', () => {
  it('tells every active admin, once per request, and says "again" for a returning member', async () => {
    const h = await world();
    expect((await h.send('POST', `${T1}/join`, 'fb-new')).status).toBe(201);
    let rows = await pushes(h);
    expect(rows).toHaveLength(1);
    expect([...rows[0].userIds].sort()).toEqual(['u-admin', 'u-admin2']);
    expect(rows[0]).toMatchObject({ category: 'account', title: 'Yeni katılım isteği', body: 'Yeni Kişi salona katılmak istiyor.', data: { screen: 'admin/members' } });
    // a second tap is refused and says nothing
    expect((await h.send('POST', `${T1}/join`, 'fb-new')).status).toBe(409);
    expect(await pushes(h)).toHaveLength(1);
    // left, then back: a new request, worded as returning
    await h.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-new'`);
    expect((await h.send('POST', `${T1}/join`, 'fb-new')).status).toBe(201);
    rows = await pushes(h);
    expect(rows).toHaveLength(2);
    expect(rows[1].body).toBe('Yeni Kişi salona tekrar katılmak istiyor.');
  });
});

describe('membership approved', () => {
  it('tells the member (account category, card screen) and only on a real activation', async () => {
    const h = await world();
    await h.send('POST', `${T1}/join`, 'fb-new');
    await h.run(`DELETE FROM outbox`);
    expect((await h.send('PUT', `${T1}/members/u-new/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
    const rows = await pushes(h);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userIds: ['u-new'], category: 'account', title: 'Üyeliğin onaylandı 🎉', body: 'Gym ailesine hoş geldin! Üyelik kartın artık hazır.', data: { screen: 'member/card' } });
    // already active: refused, nothing more
    expect((await h.send('PUT', `${T1}/members/u-new/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
    expect(await pushes(h)).toHaveLength(1);
  });

  it('a refused activation (member cap) queues nothing', async () => {
    const h = await world();
    await h.send('POST', `${T1}/join`, 'fb-new');
    await h.run(`DELETE FROM outbox`);
    await h.run(`UPDATE tenants SET active_member_count = 10 WHERE id = 't1'`);
    expect((await h.send('PUT', `${T1}/members/u-new/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
    expect(await pushes(h)).toHaveLength(0);
  });

  it('rejecting or suspending is silent, as before', async () => {
    const h = await world();
    await h.send('POST', `${T1}/join`, 'fb-new');
    await h.run(`DELETE FROM outbox`);
    expect((await h.send('PUT', `${T1}/members/u-new/status`, 'fb-admin', { status: 'rejected' })).status).toBe(200);
    expect(await pushes(h)).toHaveLength(0);
  });
});

describe('member left', () => {
  it('tells the other admins, not the one who left', async () => {
    const h = await world();
    expect((await h.send('POST', `${T1}/leave`, 'fb-mem')).status).toBe(200);
    const rows = await pushes(h);
    expect(rows).toHaveLength(1);
    expect([...rows[0].userIds].sort()).toEqual(['u-admin', 'u-admin2']);
    expect(rows[0]).toMatchObject({ category: 'account', title: 'Bir üye salondan ayrıldı', body: 'Mem Ber üyeliğini sonlandırdı.', data: { screen: 'admin/members' } });
    // leaving twice: 404, no second push
    expect((await h.send('POST', `${T1}/leave`, 'fb-mem')).status).toBe(404);
    expect(await pushes(h)).toHaveLength(1);
  });

  it('an admin leaving does not notify themself', async () => {
    const h = await world();
    expect((await h.send('POST', `${T1}/leave`, 'fb-admin2')).status).toBe(200);
    expect((await pushes(h))[0].userIds).toEqual(['u-admin']);
  });
});

describe('payment notice, decision and correction', () => {
  it('a member-filed notice tells the admins (not the filer); an admin-recorded payment says nothing', async () => {
    const h = await world();
    const r = await h.send('POST', `${T1}/payments`, 'fb-mem', { memberId: 'u-mem', amount: 25050, method: 'cash' });
    expect(r.status).toBe(201);
    const rows = await pushes(h);
    expect(rows).toHaveLength(1);
    expect([...rows[0].userIds].sort()).toEqual(['u-admin', 'u-admin2']);
    const { id } = await json(r);
    expect(rows[0]).toMatchObject({ category: 'payments', title: 'Yeni ödeme bildirimi', body: 'Mem Ber · ₺250,50 onayını bekliyor.', data: { screen: 'admin/payments', paymentId: id } });
    await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 10000, method: 'cash' });
    expect(await pushes(h)).toHaveLength(1);
  });

  it('confirming or rejecting a pending notice tells the member; a repeat decision says nothing', async () => {
    const h = await world();
    const a = await json(await h.send('POST', `${T1}/payments`, 'fb-mem', { memberId: 'u-mem', amount: 25000, method: 'cash' }));
    const b = await json(await h.send('POST', `${T1}/payments`, 'fb-mem', { memberId: 'u-mem', amount: 5000, method: 'cash' }));
    await h.run(`DELETE FROM outbox`);
    expect((await h.send('PUT', `${T1}/payments/${a.id}/decision`, 'fb-admin', { status: 'confirmed' })).status).toBe(200);
    expect((await h.send('PUT', `${T1}/payments/${b.id}/decision`, 'fb-admin', { status: 'rejected' })).status).toBe(200);
    const rows = await pushes(h);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userIds: ['u-mem'], category: 'payments', title: 'Ödemen onaylandı ✓', body: '₺250 tutarındaki ödemen onaylandı.', data: { screen: 'member/payments', paymentId: a.id } });
    expect(rows[1]).toMatchObject({ userIds: ['u-mem'], title: 'Ödemen onaylanmadı', body: '₺50 tutarındaki ödeme bildirimin reddedildi. Detay için salonla iletişime geç.' });
    expect((await h.send('PUT', `${T1}/payments/${a.id}/decision`, 'fb-admin', { status: 'rejected' })).status).toBe(409);
    expect(await pushes(h)).toHaveLength(2);
  });

  it('a correction tells the member (with the reason) and the other admins, not the one who made it', async () => {
    const h = await world();
    const { id } = await json(await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 25050, method: 'cash' }));
    await h.run(`DELETE FROM outbox`);
    const r = await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 25050, method: 'cash', kind: 'reversal', reversesPaymentId: id, reason: 'yanlış tutar' });
    expect(r.status).toBe(201);
    const rows = await pushes(h);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userIds: ['u-mem'], category: 'payments', title: 'Ödeme kaydın düzeltildi', body: '₺250,50 tutarındaki kaydın salon tarafından düzeltildi. Gerekçe: yanlış tutar', data: { screen: 'member/payments', paymentId: id } });
    expect(rows[1]).toMatchObject({ userIds: ['u-admin2'], title: 'Ödeme kaydı düzeltildi', body: 'Mem Ber · ₺250,50 Gerekçe: yanlış tutar', data: { screen: 'admin/payments', paymentId: id } });
    // a second correction of the same row is refused and queues nothing
    await h.run(`DELETE FROM outbox`);
    expect((await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 25050, method: 'cash', kind: 'reversal', reversesPaymentId: id })).status).toBe(409);
    expect(await pushes(h)).toHaveLength(0);
  });

  it('a correction without a reason has no reason sentence', async () => {
    const h = await world();
    const { id } = await json(await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 10000, method: 'cash' }));
    await h.run(`DELETE FROM outbox`);
    await h.send('POST', `${T1}/payments`, 'fb-admin', { memberId: 'u-mem', amount: 10000, method: 'cash', kind: 'reversal', reversesPaymentId: id });
    expect((await pushes(h))[0].body).toBe('₺100 tutarındaki kaydın salon tarafından düzeltildi.');
  });
});
