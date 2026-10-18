import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.setConfig({ testTimeout: 60_000 });

const { startWorld } = await import('./testWorld');
const repo = await import('./paymentRepo');
const { forgetTenants } = await import('./pkgTenant');
const { resetIdentity } = await import('./membershipIdentity');
const { auth } = await import('@/services/firebase');
const { collect, nextValue } = await import('./pkgTestUtil');
type Payment = import('../types').Payment;

let w: Awaited<ReturnType<typeof startWorld>>;
beforeEach(async () => {
  forgetTenants();
  resetIdentity();
  (auth as { currentUser: unknown }).currentUser = null;
  w = await startWorld();
  w.signInAs('fb-admin');
});

const ledger = (memberId = 'u-mem') => nextValue<Payment[]>((ok, err) => repo.watchPaymentsForMember('t1', memberId, ok, err as never));
const record = (amount: number, o: Partial<Parameters<typeof repo.recordPayment>[0]> = {}) =>
  repo.recordPayment({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', amount, method: 'cash', ...o });
const notice = (amount: number, o: Partial<Parameters<typeof repo.submitPaymentNotice>[0]> = {}) =>
  repo.submitPaymentNotice({ tenantId: 't1', memberId: 'u-mem', memberName: 'Üye', amount, method: 'bank_transfer', ...o });

describe('recording and noticing', () => {
  it('recordPayment (admin): confirmed at once, app shape (Dates, charge kind), newest first', async () => {
    await record(500, { note: 'Nakit' });
    await new Promise((r) => setTimeout(r, 5));
    await record(250);
    const rows = await ledger();
    expect(rows.map((p) => p.amount)).toEqual([250, 500]);
    expect(rows[1]).toMatchObject({ tenantId: 't1', memberId: 'u-mem', status: 'confirmed', kind: 'charge', method: 'cash', note: 'Nakit' });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows[0].reversedAt).toBeUndefined();
  });

  it('submitPaymentNotice (member): filed pending, shows in their own history; the member cannot confirm', async () => {
    w.signInAs('fb-mem');
    await notice(300, { note: 'Havale' });
    const [p] = await ledger();
    expect(p).toMatchObject({ amount: 300, status: 'pending', kind: 'charge', method: 'bank_transfer', note: 'Havale' });
    expect(p.confirmedAt).toBeUndefined();
    expect(await repo.confirmPayment(p.id).catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
  });

  it('a member cannot record a payment for somebody else; amount must be positive', async () => {
    await w.h.addUser('u-x', ['member']);
    w.signInAs('fb-mem');
    expect(await notice(100, { memberId: 'u-x' }).catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
    w.signInAs('fb-admin');
    expect(await record(0).catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument' });
    expect(await record(-5).catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument' });
  });

  it('money round trip: 250,50 TL is 25050 kuruş on the wire and in the database, and 250.5 again when read back', async () => {
    await record(250.5);
    expect((await w.h.one(`SELECT amount FROM payments`)).amount).toBe(25050);
    const [p] = await ledger();
    expect(p.amount).toBe(250.5);
    await record(19.99);
    expect((await w.h.one(`SELECT amount FROM payments ORDER BY created_at DESC, id DESC LIMIT 1`)).amount).toBeGreaterThan(0);
    expect((await ledger()).map((x) => x.amount).sort()).toEqual([19.99, 250.5]);
    // a reversal restates the same amount, in kuruş both ways
    const orig = (await ledger()).find((x) => x.amount === 250.5)!;
    await repo.reversePayment({ payment: orig, reason: 'x', reversedBy: 'a' });
    expect((await w.h.one(`SELECT amount FROM payments WHERE json_extract(data, '$.kind') = 'reversal'`)).amount).toBe(25050);
    expect((await ledger()).find((x) => x.kind === 'reversal')!.amount).toBe(250.5);
  });

  it('more than 2 decimals (or a non-number) is refused with a message, never rounded; nothing is written', async () => {
    for (const bad of [100.555, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await record(bad).catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument', message: 'Tutar en fazla 2 ondalık basamak içerebilir.' });
    }
    expect(await ledger()).toEqual([]);
  });

  it('writes refresh a live ledger at once', async () => {
    const live = collect<Payment[]>((ok, err) => repo.watchPaymentsForMember('t1', 'u-mem', ok, err as never));
    await live.until(1);
    await record(100);
    await live.until(2);
    expect(live.values[1]).toHaveLength(1);
    live.stop();
  });
});

describe('decisions', () => {
  it('confirmPayment / rejectPayment: decided once, with confirmedAt; deciding again is a Turkish refusal', async () => {
    w.signInAs('fb-mem');
    await notice(300);
    await notice(400);
    const rows = await ledger();
    const p300 = rows.find((p) => p.amount === 300)!;
    const p400 = rows.find((p) => p.amount === 400)!;
    w.signInAs('fb-admin');
    forgetTenants();                           // the gym is found through /me
    await repo.confirmPayment(p300.id);
    await repo.rejectPayment(p400.id);
    const after = await ledger();
    expect(after.find((p) => p.id === p300.id)).toMatchObject({ status: 'confirmed' });
    expect(after.find((p) => p.id === p300.id)!.confirmedAt).toBeInstanceOf(Date);
    expect(after.find((p) => p.id === p400.id)).toMatchObject({ status: 'rejected' });
    const again = await repo.confirmPayment(p400.id).catch((x) => x);
    expect(again).toMatchObject({ code: 'functions/failed-precondition', message: 'Bu kayıt artık beklemede değil.' });
  });
});

describe('reversePayment', () => {
  it('writes a confirmed reversal of the same amount against it and flags the original; a stale copy cannot reverse twice', async () => {
    await record(500);
    const [orig] = await ledger();
    await repo.reversePayment({ payment: orig, reason: 'Yanlış tutar', reversedBy: 'whoever' });
    const rows = await ledger();
    expect(rows).toHaveLength(2);
    const flagged = rows.find((p) => p.id === orig.id)!;
    const reversal = rows.find((p) => p.kind === 'reversal')!;
    expect(flagged.reversedAt).toBeInstanceOf(Date);
    expect(flagged.reversedByPaymentId).toBe(reversal.id);
    expect(flagged.reversalReason).toBe('Yanlış tutar');
    expect(reversal).toMatchObject({ amount: 500, status: 'confirmed', method: 'cash', reversesPaymentId: orig.id, memberId: 'u-mem' });
    // the fresh copy is refused on the client, a stale one by the Worker
    await expect(repo.reversePayment({ payment: flagged, reason: 'x', reversedBy: 'a' })).rejects.toThrow('Bu ödeme zaten düzeltilmiş.');
    expect(await repo.reversePayment({ payment: orig, reason: 'x', reversedBy: 'a' }).catch((x) => x)).toMatchObject({
      code: 'functions/failed-precondition', message: 'Bu ödeme zaten düzeltilmiş ya da düzeltilemez.',
    });
    expect(await ledger()).toHaveLength(2);
  });

  it('admin only', async () => {
    await record(500);
    const [orig] = await ledger();
    w.signInAs('fb-mem');
    expect(await repo.reversePayment({ payment: orig, reason: 'x', reversedBy: 'a' }).catch((x) => x)).toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('submitGroupPaymentNotice', () => {
  /** u-par is the approved guardian of u-kid and u-kidb; u-oth is a stranger; u-par is also a member of the gym. */
  async function family() {
    await w.h.addUser('u-par', ['member']);
    await w.h.addUser('u-kid', ['member']);
    await w.h.addUser('u-kidb', ['member']);
    await w.h.addUser('u-kidc', ['member']);
    await w.h.addUser('u-oth', ['member']);
    await w.h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'approved' WHERE member_id IN ('u-kid','u-kidb','u-kidc')`);
    w.signInAs('fb-par');
  }
  const kids = (...ids: string[]) => ids.map((id) => ({ memberId: id, memberName: id }));
  const base = { tenantId: 't1', method: 'cash' as const, submittedBy: 'u-par', submittedByName: 'Veli' };

  it('equal split: 1000,00 TL over 3 children is 333,33 / 333,33 / 333,34 (the screen\'s preview) in the database, one pending entry per child sharing a group id', async () => {
    await family();
    const { shares } = await repo.submitGroupPaymentNotice({ ...base, children: kids('u-kid', 'u-kidb', 'u-kidc'), totalAmount: 1000, note: 'Mart' });
    expect(shares).toEqual([333.33, 333.33, 333.34]);
    expect((await w.h.db.prepare(`SELECT member_id, amount FROM payments ORDER BY member_id`).all<any>()).results.map((r: any) => [r.member_id, r.amount]))
      .toEqual([['u-kid', 33333], ['u-kidb', 33333], ['u-kidc', 33334]]);
    const rows = await Promise.all(['u-kid', 'u-kidb', 'u-kidc'].map(async (id) => (await ledger(id))[0]));
    expect(rows.map((p) => [p.memberId, p.amount, p.status])).toEqual([['u-kid', 333.33, 'pending'], ['u-kidb', 333.33, 'pending'], ['u-kidc', 333.34, 'pending']]);
    expect(new Set(rows.map((p) => p.paymentGroupId)).size).toBe(1);
    expect(rows[0].paymentGroupId).toBeTruthy();
    expect(rows[0]).toMatchObject({ note: 'Mart', method: 'cash', submittedBy: 'u-par' });
  });

  it('explicit amounts are kept per child, in order', async () => {
    await family();
    const { shares } = await repo.submitGroupPaymentNotice({ ...base, children: kids('u-kidb', 'u-kid'), totalAmount: 1000.5, amounts: [700.25, 300.25] });
    expect(shares).toEqual([700.25, 300.25]);
    expect((await ledger('u-kidb'))[0].amount).toBe(700.25);
    expect((await ledger('u-kid'))[0].amount).toBe(300.25);
  });

  it('keeps the Firebase input checks (same messages) before any request is made', async () => {
    await family();
    const go = (p: Partial<Parameters<typeof repo.submitGroupPaymentNotice>[0]>) => repo.submitGroupPaymentNotice({ ...base, children: kids('u-kid', 'u-kidb'), totalAmount: 100, ...p });
    await expect(go({ children: [] })).rejects.toThrow('En az bir çocuk seçilmeli.');
    await expect(go({ amounts: [100] })).rejects.toThrow('Her çocuk için bir tutar gerekiyor.');
    await expect(go({ amounts: [60, 30] })).rejects.toThrow('Girilen tutarların toplamı ödeme tutarına eşit değil.');
    await expect(go({ totalAmount: 100, amounts: [150, -50] })).rejects.toThrow('Her tutar sıfırdan büyük olmalı.');
    await expect(go({ totalAmount: 0 })).rejects.toThrow('Her tutar sıfırdan büyük olmalı.');
    expect(await go({ totalAmount: 100.555, amounts: [50.555, 50] }).catch((x) => x)).toMatchObject({ code: 'functions/invalid-argument' });
    expect(await ledger('u-kid')).toEqual([]);
  });

  it('all or nothing: a child the caller may not pay for refuses the whole act, nothing is written', async () => {
    await family();
    const e = await repo.submitGroupPaymentNotice({ ...base, children: kids('u-kid', 'u-oth'), totalAmount: 600 }).catch((x) => x);
    expect(e).toMatchObject({ code: 'functions/permission-denied' });
    expect(await ledger('u-kid').catch(() => 'forbidden')).toEqual([]);
    w.signInAs('fb-admin');
    expect(await ledger('u-kid')).toEqual([]);
    expect(await ledger('u-oth')).toEqual([]);
  });

  it('the guardian reads each child\'s ledger and the admin can then confirm one share', async () => {
    await family();
    await repo.submitGroupPaymentNotice({ ...base, children: kids('u-kid', 'u-kidb'), totalAmount: 600 });
    const [mine] = await ledger('u-kid');
    forgetTenants();
    w.signInAs('fb-admin');
    await repo.confirmPayment(mine.id);
    expect((await ledger('u-kid'))[0].status).toBe('confirmed');
    expect((await ledger('u-kidb'))[0].status).toBe('pending');
  });
});

describe('person ids: the screens hold the Firebase uid, the Worker the internal id', () => {
  it('a member files and reads their own payments by Firebase uid; submittedBy comes back as that uid; others stay internal', async () => {
    (auth as { currentUser: unknown }).currentUser = { uid: 'FIREBASE-UID-MEM' };
    w.signInAs('fb-mem');
    await repo.submitPaymentNotice({ tenantId: 't1', memberId: 'FIREBASE-UID-MEM', memberName: 'Ben', amount: 120, method: 'cash' });
    const [p] = await nextValue<Payment[]>((ok, err) => repo.watchPaymentsForMember('t1', 'FIREBASE-UID-MEM', ok, err as never));
    expect(p).toMatchObject({ memberId: 'FIREBASE-UID-MEM', submittedBy: 'FIREBASE-UID-MEM', amount: 120, status: 'pending' });
    // the admin sees the same row under the member's internal id and the member's uid is not leaked to them
    (auth as { currentUser: unknown }).currentUser = { uid: 'FIREBASE-UID-ADMIN' };
    resetIdentity();
    w.signInAs('fb-admin');
    const [seenByAdmin] = await ledger('u-mem');
    expect(seenByAdmin).toMatchObject({ memberId: 'u-mem', submittedBy: 'u-mem' });
  });

  it('a parent pays for children by Firebase uid / internal ids; the shares come back in the children\'s order', async () => {
    await w.h.addUser('u-par', ['member']);
    await w.h.addUser('u-kid', ['member']);
    await w.h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    (auth as { currentUser: unknown }).currentUser = { uid: 'FIREBASE-UID-PAR' };
    w.signInAs('fb-par');
    const { shares } = await repo.submitGroupPaymentNotice({
      tenantId: 't1', method: 'cash', submittedBy: 'FIREBASE-UID-PAR', submittedByName: 'Veli', totalAmount: 300,
      children: [{ memberId: 'u-kid', memberName: 'Çocuk' }, { memberId: 'FIREBASE-UID-PAR', memberName: 'Veli' }], amounts: [100, 200],
    });
    expect(shares).toEqual([100, 200]);
    const own = await nextValue<Payment[]>((ok, err) => repo.watchPaymentsForMember('t1', 'FIREBASE-UID-PAR', ok, err as never));
    expect(own[0]).toMatchObject({ memberId: 'FIREBASE-UID-PAR', amount: 200, submittedBy: 'FIREBASE-UID-PAR' });
  });
});

describe('watchPaymentsForTenant', () => {
  it('is an explicit GAP (no gym-wide ledger route): error callback gets a clear Error, never an empty ledger', async () => {
    const e = await nextValue<unknown>((ok, err) => repo.watchPaymentsForTenant('t1', ok as never, err as never)).catch((x) => x);
    expect(String((e as Error).message)).toMatch(/GAP\(api\).*\/tenants\/:t\/payments/);
    expect(() => repo.watchPaymentsForTenant('t1', () => {})).toThrow(/GAP\(api\)/);
  });
});
