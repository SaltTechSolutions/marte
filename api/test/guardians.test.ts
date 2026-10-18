import { describe, expect, it, vi } from 'vitest';

import { abortIf } from '../src/guarded';
import { GUARDIAN_CONSENT_VERSION } from '../src/guardians';
import { sliceHarness } from './sliceApp';

vi.setConfig({ testTimeout: 60_000 });

const T = '/v1/tenants/t1';
type H = Awaited<ReturnType<typeof sliceHarness>>;

/** Gym t1 plus a parent (active, par@x.com) and a minor (kid@x.com, status given). */
async function world(kidStatus: 'pending' | 'active' = 'pending') {
  const h = await sliceHarness();
  await h.addUser('u-par', ['member']);
  await h.addUser('u-kid', ['member'], { status: kidStatus });
  await h.run(`UPDATE memberships SET email = 'par@x.com', display_name = 'Parent' WHERE member_id = 'u-par'`);
  await h.run(`UPDATE memberships SET email = 'kid@x.com', display_name = 'Kid' WHERE member_id = 'u-kid'`);
  return h;
}
const kid = (h: H) => h.one(`SELECT guardian_id g, guardian_name n, guardian_status s, guardian_consent_at at, guardian_consent_version v FROM memberships WHERE member_id = 'u-kid'`);
const pushes = async (h: H) => {
  const { results } = await h.db.prepare(`SELECT payload FROM outbox WHERE kind = 'push' ORDER BY created_at, rowid`).all<{ payload: string }>();
  return results.map((r) => JSON.parse(r.payload));
};
const request = (h: H, sub: string, email: string) => h.send('POST', `${T}/guardian/request`, sub, { guardianEmail: email });
const respond = (h: H, sub: string, body: object) => h.send('POST', `${T}/guardian/respond`, sub, body);

describe('guardians: requestGuardian', () => {
  it('nominates an ACTIVE account member by e-mail (case/space-insensitive), pending, with a push to the parent', async () => {
    const h = await world();
    const r = await request(h, 'fb-kid', '  PAR@X.com ');
    expect(r.status).toBe(200);
    expect(await h.json(r)).toEqual({ guardianName: 'Parent', status: 'pending' });
    expect(await kid(h)).toEqual({ g: 'u-par', n: 'Parent', s: 'pending', at: null, v: null });
    const p = await pushes(h);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ userIds: ['u-par'], category: 'account', title: 'Ebeveyn onayı isteniyor', body: 'Kid seni ebeveyni olarak gösterdi.' });
  });

  it('refuses: yourself, an unknown / inactive / managed / pending parent, a parent who is themselves linked, a bad e-mail, no membership', async () => {
    const h = await world();
    expect((await request(h, 'fb-kid', 'kid@x.com')).status).toBe(400);
    expect((await request(h, 'fb-kid', 'nobody@x.com')).status).toBe(404);
    expect((await request(h, 'fb-kid', 'not-an-email')).status).toBe(400);
    expect((await h.send('POST', `${T}/guardian/request`, 'fb-kid', {})).status).toBe(400);
    await h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-par'`);
    expect((await request(h, 'fb-kid', 'par@x.com')).status).toBe(404);
    await h.run(`UPDATE memberships SET status = 'active', managed = 1 WHERE member_id = 'u-par'`);
    expect((await request(h, 'fb-kid', 'par@x.com')).status).toBe(404);   // a managed member has no account to answer with
    await h.run(`UPDATE memberships SET managed = 0, guardian_id = 'u-admin', guardian_status = 'approved' WHERE member_id = 'u-par'`);
    expect((await request(h, 'fb-kid', 'par@x.com')).status).toBe(409);   // no chains
    await h.addUser('u-out', null);
    expect((await request(h, 'fb-out', 'par@x.com')).status).toBe(404);   // no membership in this gym
    await h.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-kid'`);
    expect((await request(h, 'fb-kid', 'par@x.com')).status).toBe(404);
    expect(await kid(h)).toMatchObject({ g: null, s: null });
    expect(await pushes(h)).toHaveLength(0);
  });

  it('a double tap does not re-ask or double-push; re-requesting an approved parent keeps the consent', async () => {
    const h = await world();
    await request(h, 'fb-kid', 'par@x.com');
    expect((await request(h, 'fb-kid', 'par@x.com')).status).toBe(200);
    expect(await pushes(h)).toHaveLength(1);
    await respond(h, 'fb-par', { childId: 'u-kid', approve: true });
    const consent = await kid(h);
    expect((await request(h, 'fb-kid', 'par@x.com')).status).toBe(200);
    expect(await kid(h)).toEqual(consent);
    expect(await pushes(h)).toHaveLength(2);   // request + approval, nothing more
  });

  it('after a rejection a new request starts clean: no consent carried forward', async () => {
    const h = await world();
    await request(h, 'fb-kid', 'par@x.com');
    await respond(h, 'fb-par', { childId: 'u-kid', approve: false });
    expect(await kid(h)).toMatchObject({ g: null, s: 'rejected' });
    await h.addUser('u-par2', ['member']);
    await h.run(`UPDATE memberships SET email = 'par2@x.com' WHERE member_id = 'u-par2'`);
    expect((await request(h, 'fb-kid', 'par2@x.com')).status).toBe(200);
    expect(await kid(h)).toMatchObject({ g: 'u-par2', s: 'pending', at: null, v: null });
  });

  it('changing parent while an old consent exists clears that consent', async () => {
    const h = await world('active');
    await request(h, 'fb-kid', 'par@x.com');
    await respond(h, 'fb-par', { childId: 'u-kid', approve: true });
    await h.addUser('u-par2', ['member']);
    await h.run(`UPDATE memberships SET email = 'par2@x.com' WHERE member_id = 'u-par2'`);
    await request(h, 'fb-kid', 'par2@x.com');
    expect(await kid(h)).toMatchObject({ g: 'u-par2', s: 'pending', at: null, v: null });
  });
});

describe('guardians: respondToGuardian', () => {
  it('approve records consent (time, version, who) and tells the child; the child status is untouched', async () => {
    const h = await world();
    await request(h, 'fb-kid', 'par@x.com');
    const before = Date.now();
    const r = await respond(h, 'fb-par', { childId: 'u-kid', approve: true });
    expect(r.status).toBe(200);
    const out = await h.json(r);
    expect(out).toMatchObject({ approved: true, consentVersion: GUARDIAN_CONSENT_VERSION });
    const row = await kid(h);
    expect(row).toMatchObject({ g: 'u-par', s: 'approved', v: GUARDIAN_CONSENT_VERSION });
    expect(row.at).toBeGreaterThanOrEqual(before);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-kid'`)).s).toBe('pending');
    const p = await pushes(h);
    expect(p.at(-1)).toMatchObject({ userIds: ['u-kid'], title: 'Ebeveyn onayın alındı', category: 'account' });
  });

  it('reject CLEARS the link (a rejected row must not keep granting that person access) and tells the child', async () => {
    const h = await world();
    await request(h, 'fb-kid', 'par@x.com');
    expect((await respond(h, 'fb-par', { childId: 'u-kid', approve: false })).status).toBe(200);
    expect(await kid(h)).toEqual({ g: null, n: null, s: 'rejected', at: null, v: null });
    expect((await pushes(h)).at(-1)).toMatchObject({ userIds: ['u-kid'], title: 'Ebeveyn onayı verilmedi' });
    // the parent no longer sees the child's row
    expect((await h.send('GET', `${T}/members/u-kid`, 'fb-par')).status).toBe(404);
  });

  it('only the nominated parent may answer; others see "no such request" (no existence leak); answered requests are 409', async () => {
    const h = await world();
    await h.addUser('u-oth', ['member']);
    await request(h, 'fb-kid', 'par@x.com');
    for (const [sub, childId] of [['fb-oth', 'u-kid'], ['fb-admin', 'u-kid'], ['fb-par', 'u-nobody'], ['fb-par', 'u-admin']] as const) {
      expect((await respond(h, sub, { childId, approve: true })).status).toBe(404);
    }
    expect((await respond(h, 'fb-kid', { childId: 'u-kid', approve: true })).status).toBe(403);   // the child is not even an active member yet
    expect(await kid(h)).toMatchObject({ s: 'pending' });
    expect((await respond(h, 'fb-par', { childId: 'u-kid', approve: true })).status).toBe(200);
    expect((await respond(h, 'fb-par', { childId: 'u-kid', approve: false })).status).toBe(409);
    expect(await kid(h)).toMatchObject({ g: 'u-par', s: 'approved' });
  });

  it('a malformed answer is a 400 that changes nothing (Firebase read "not true" as a refusal)', async () => {
    const h = await world();
    await request(h, 'fb-kid', 'par@x.com');
    for (const body of [{}, { childId: 'u-kid' }, { childId: 'u-kid', approve: 'yes' }, { childId: 'u-kid', approve: 1 }, { approve: true }, { childId: 5, approve: true }]) {
      expect((await respond(h, 'fb-par', body)).status).toBe(400);
    }
    expect(await kid(h)).toMatchObject({ g: 'u-par', s: 'pending' });
  });

  it('a parent who has left the gym cannot answer; unauthenticated is 401', async () => {
    const h = await world();
    await request(h, 'fb-kid', 'par@x.com');
    await h.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-par'`);
    expect((await respond(h, 'fb-par', { childId: 'u-kid', approve: true })).status).toBe(403);
    expect((await respond(h, null as never, { childId: 'u-kid', approve: true })).status).toBe(401);
  });

  it('parallel approve + reject: exactly one answer wins, one push', async () => {
    const h = await world();
    await request(h, 'fb-kid', 'par@x.com');
    const res = await Promise.all([respond(h, 'fb-par', { childId: 'u-kid', approve: true }), respond(h, 'fb-par', { childId: 'u-kid', approve: false })]);
    const codes = res.map((r) => r.status).sort();
    expect(codes[0]).toBe(200);
    expect([404, 409]).toContain(codes[1]);   // 409 if the loser saw the approval, 404 if it saw the cleared link
    expect((await pushes(h)).filter((p) => p.userIds[0] === 'u-kid')).toHaveLength(1);
  });
});

describe('guardians: bulk payment notice (MEMBER-5e)', () => {
  /** Parent with two approved children, a stranger and a non-approved child. */
  async function two() {
    const h = await world();
    await h.addUser('u-kidb', ['member']);
    await h.addUser('u-oth', ['member']);
    await h.addUser('u-wait', ['member']);
    await h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'approved' WHERE member_id IN ('u-kid','u-kidb')`);
    await h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'pending' WHERE member_id = 'u-wait'`);
    return h;
  }
  const group = (h: H, sub: string, body: object) => h.send('POST', `${T}/payments/group`, sub, { method: 'cash', ...body });
  const rows = async (h: H) => (await h.db.prepare(`SELECT id, member_id, amount, status, data FROM payments ORDER BY member_id`).all<any>()).results;

  it('[L3088] a parent writes one entry per child in a single batch, sharing one paymentGroupId, always pending', async () => {
    const h = await two();
    const r = await group(h, 'fb-par', { entries: [{ memberId: 'u-kid', amount: 33333 }, { memberId: 'u-kidb', amount: 33334 }], note: 'Mart' });
    expect(r.status).toBe(201);
    const out = await h.json(r);
    const db = await rows(h);
    expect(db).toHaveLength(2);
    expect(db.map((p: any) => [p.member_id, p.amount, p.status])).toEqual([['u-kid', 33333, 'pending'], ['u-kidb', 33334, 'pending']]);
    const datas = db.map((p: any) => JSON.parse(p.data));
    expect(new Set(datas.map((d: any) => d.paymentGroupId))).toEqual(new Set([out.paymentGroupId]));
    expect(datas[0]).toMatchObject({ kind: 'charge', method: 'cash', submittedBy: 'u-par', submittedByName: 'u-par', note: 'Mart' });
    // the parent can read back each child's entry (rows 3106/3113 paths)
    const list = await h.json(await h.send('GET', `${T}/members/u-kid/payments`, 'fb-par'));
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('pending');
  });

  it('a status in the body is ignored: a parent can never confirm their own notice', async () => {
    const h = await two();
    expect((await group(h, 'fb-par', { entries: [{ memberId: 'u-kid', amount: 100, status: 'confirmed' }], status: 'confirmed' })).status).toBe(201);
    expect(await h.one(`SELECT count(*) c FROM payments WHERE status = 'confirmed'`)).toEqual({ c: 0 });
  });

  it('[L3098] one disallowed entry fails the whole batch: nothing is written', async () => {
    const h = await two();
    for (const bad of ['u-oth', 'u-wait', 'u-nobody', 'u-admin']) {
      const r = await group(h, 'fb-par', { entries: [{ memberId: 'u-kid', amount: 300 }, { memberId: bad, amount: 300 }] });
      expect(r.status).toBe(403);
    }
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 0 });
    expect(await h.one(`SELECT count(*) c FROM outbox`)).toEqual({ c: 0 });
  });

  it('[L3098] the authorisation is re-checked INSIDE the batch: abortIf rolls back everything written before it', async () => {
    const h = await two();
    const ins = (id: string) => h.db.prepare(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES (?, 't1', 'u-kid', 1, 'pending', '{}', 1)`).bind(id);
    await expect(h.db.batch([ins('a'), abortIf(h.db, `1 = 1`), ins('b')])).rejects.toThrow();
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 0 });
    await h.db.batch([ins('a'), abortIf(h.db, `1 = 0`), ins('b')]);
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 2 });
  });

  it('equal split of a total in kuruş: nothing lost, odd kuruş to the last entries', async () => {
    const h = await two();
    const r = await group(h, 'fb-par', { totalAmount: 100000, entries: [{ memberId: 'u-kid' }, { memberId: 'u-kidb' }, { memberId: 'u-par' }] });
    expect(r.status).toBe(201);
    const amounts = (await rows(h)).map((p: any) => [p.member_id, p.amount]);
    expect(Object.fromEntries(amounts)).toEqual({ 'u-kid': 33333, 'u-kidb': 33333, 'u-par': 33334 });   // a parent may also file for themself
  });

  it('bad shapes are 400 and write nothing: floats, zero, mismatched total, duplicates, mixed explicit/implicit, unknown method, too many', async () => {
    const h = await two();
    const e = (amount?: unknown, memberId = 'u-kid') => ({ memberId, ...(amount === undefined ? {} : { amount }) });
    const bodies: object[] = [
      { entries: [] }, { entries: 'x' }, { entries: [e(10.5)] }, { entries: [e(0)] }, { entries: [e(-5)] }, { entries: [e('5')] },
      { entries: [e(100)], totalAmount: 99 }, { entries: [e(100), e(100)] }, { entries: [e(100), e(undefined, 'u-kidb')] },
      { entries: [e(undefined)] }, { entries: [e(undefined)], totalAmount: 1.5 }, { totalAmount: 1, entries: [e(), e(undefined, 'u-kidb')] },
      { method: 'bitcoin', entries: [e(100)] }, { entries: [e(100_000_001)] }, { entries: [{ amount: 5 }] }, { note: 5, entries: [e(100)] },
      { entries: Array.from({ length: 11 }, (_, i) => ({ memberId: `u-${i}`, amount: 1 })) },
    ];
    for (const b of bodies) expect([400]).toContain((await group(h, 'fb-par', b)).status);
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 0 });
    expect((await group(h, null as never, { entries: [e(100)] })).status).toBe(401);
  });

  it('one push to the gym admins per act of paying (not per child), never to the payer, and exactly once', async () => {
    const h = await two();
    await group(h, 'fb-par', { entries: [{ memberId: 'u-kid', amount: 150050 }, { memberId: 'u-kidb', amount: 50000 }] });
    const p = (await pushes(h)).filter((x) => x.category === 'payments');
    expect(p).toHaveLength(1);
    expect(p[0].userIds).toEqual(['u-admin']);
    expect(p[0].body).toContain('2 kişi');
    expect(p[0].body).toContain('2.000,5');
  });

  it('an admin filing through this route is still pending and is not pushed about their own act', async () => {
    const h = await two();
    await h.run(`UPDATE memberships SET guardian_id = 'u-admin', guardian_status = 'approved' WHERE member_id = 'u-oth'`);
    expect((await group(h, 'fb-admin', { entries: [{ memberId: 'u-oth', amount: 100 }] })).status).toBe(201);
    expect(await h.one(`SELECT status s FROM payments`)).toEqual({ s: 'pending' });
    expect(await pushes(h)).toHaveLength(0);
  });
});
