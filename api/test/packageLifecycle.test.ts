import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { requireAuth } from '../src/auth';
import { currentEntitlements } from '../src/entitlements';
import { packageLifecycle } from '../src/packageLifecycle';
import { packages } from '../src/packages';
import { reads3 } from '../src/reads3';
import type { Env, Vars } from '../src/types';
import { harness, PROJECT } from './helpers';

vi.setConfig({ testTimeout: 60_000 });
const T1 = '/v1/tenants/t1';
const DAY = 86_400_000;

// The lead mounts packageLifecycle in index.ts; these tests mount it themselves so they are independent of that wiring.
const mini = new Hono<{ Bindings: Env; Variables: Vars }>().use('/v1/*', requireAuth).route('/v1', packages).route('/v1', packageLifecycle).route('/v1', reads3);

const monthly = { name: 'Aylık', kind: 'membership', price: 1000, durationDays: 30, isActive: true, freezePolicy: { minDays: 3, maxCount: 1 },
  entitlements: { gymAccess: true, groupClasses: { unlimited: false, count: 8, periodDays: 30 }, ptLessons: { count: 2, periodDays: 30 } } };
const basic = { name: 'Basic', kind: 'membership', price: 500, durationDays: 30, isActive: true, entitlements: { gymAccess: true } };
const gold = { name: 'Gold', kind: 'membership', price: 1500, durationDays: 30, isActive: true, entitlements: { gymAccess: true, groupClasses: { unlimited: true }, ptLessons: { count: 4, periodDays: 30 } } };
const lessons = { name: '10 ders', kind: 'lessons', price: 2000, lessonCount: 10, lessonValidityDays: 90, isActive: true, entitlements: { gymAccess: false } };

async function world() {
  const h = await harness();
  const send = async (method: string, path: string, sub: string | null, body?: object) =>
    mini.fetch(new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(sub ? { Authorization: `Bearer ${await h.sign(sub)}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }), { DB: h.db, FIREBASE_PROJECT_ID: PROJECT });
  await h.addUser('u-mem2', ['member']);
  await h.run(`UPDATE memberships SET display_name = member_id`);
  await h.addUser('u-trn', ['trainer']);
  await h.addUser('u-admin2', ['admin']);
  const json = async (r: Response) => (await r.json()) as any;
  const pkg = async (def: object) => (await json(await send('POST', `${T1}/packages`, 'fb-admin', def))).id as string;
  const assign = async (packageId: string, member = 'u-mem', extra: object = {}) => {
    const r = await send('POST', `${T1}/members/${member}/packages`, 'fb-admin', { packageId, ...extra });
    expect(r.status).toBe(201);
    return (await json(r)).id as string;
  };
  const outbox = async (like = '%') => (await h.db.prepare(`SELECT kind, payload, dedupe_key FROM outbox WHERE dedupe_key LIKE ? ORDER BY created_at, id`).bind(like).all<any>()).results
    .map((r: any) => ({ ...JSON.parse(r.payload), dedupe: r.dedupe_key }));
  /** Runs `before` just before the next db.batch (simulates a concurrent writer landing between read and write). */
  const raceOnce = (before: () => Promise<unknown>) => {
    const orig = h.db.batch.bind(h.db);
    (h.db as any).batch = async (l: any) => { (h.db as any).batch = orig; await before(); return orig(l); };
  };
  return { ...h, send, json, pkg, assign, outbox, raceOnce };
}
const propose = (w: Awaited<ReturnType<typeof world>>, body: object, sub = 'fb-admin') =>
  w.send('POST', `${T1}/package-change-requests`, sub, { memberId: 'u-mem', kind: 'upgrade', ...body });

describe('assignment: paymentId and renewal (packages.ts, F3)', () => {
  const pay = (w: Awaited<ReturnType<typeof world>>, id: string, o: { member?: string; tenant?: string; status?: string; data?: object } = {}) =>
    w.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES (?, ?, ?, 1000, ?, ?, 1)`,
      id, o.tenant ?? 't1', o.member ?? 'u-mem', o.status ?? 'confirmed', JSON.stringify(o.data ?? { kind: 'charge', method: 'cash' }));

  it('paymentId must be a confirmed, non-reversed charge of THIS member in THIS gym; nothing is written otherwise', async () => {
    const w = await world();
    const id = await w.pkg(monthly);
    await w.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await pay(w, 'p-pending', { status: 'pending' });
    await pay(w, 'p-rejected', { status: 'rejected' });
    await pay(w, 'p-reversed', { data: { kind: 'charge', reversedAt: 5 } });
    await pay(w, 'p-refund', { data: { kind: 'refund' } });
    await pay(w, 'p-other-member', { member: 'u-mem2' });
    await pay(w, 'p-other-tenant', { tenant: 't2' });
    for (const p of ['p-pending', 'p-rejected', 'p-reversed', 'p-refund', 'p-other-member', 'p-other-tenant', 'p-missing']) {
      expect((await w.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id, paymentId: p })).status, p).toBe(409);
    }
    expect((await w.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id, paymentId: 5 })).status).toBe(400);
    expect(await w.one(`SELECT count(*) c FROM member_packages`)).toEqual({ c: 0 });
    expect(await w.one(`SELECT count(*) c FROM member_credits`)).toEqual({ c: 0 });
    expect((await w.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id })).status).toBe(201);   // no paymentId at all stays allowed
    await pay(w, 'p-ok');
    expect((await w.send('POST', `${T1}/members/u-mem2/packages`, 'fb-admin', { packageId: id, paymentId: 'p-ok' })).status).toBe(409);   // p-ok is u-mem's
    const done = await w.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id, paymentId: 'p-ok' });
    expect(done.status).toBe(201);
    expect((await w.one(`SELECT payment_id p FROM member_packages WHERE id = ?`, (await w.json(done)).id)).p).toBe('p-ok');
  });

  it('a payment reversed between the check and the write cannot slip through, and a promotion redemption is not spent', async () => {
    const w = await world();
    const id = await w.pkg(monthly);
    const promo = (await w.json(await w.send('POST', `${T1}/promotions`, 'fb-admin', { name: 'p', kind: 'bonusDays', value: 3, appliesTo: [], isActive: true, maxRedemptions: 5 }))).id;
    await pay(w, 'p1');
    w.raceOnce(() => w.run(`UPDATE payments SET data = json_set(data, '$.reversedAt', 9) WHERE id = 'p1'`));
    const r = await w.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id, paymentId: 'p1', promotionId: promo });
    expect(r.status).toBe(409);
    expect(await w.one(`SELECT count(*) c FROM member_packages`)).toEqual({ c: 0 });
    expect(JSON.parse((await w.one(`SELECT data d FROM promotions`)).d).redeemed).toBe(0);
    expect(await w.one(`SELECT count(*) c FROM member_credits`)).toEqual({ c: 0 });
  });

  it('a catalog edit between read and write is detected (price the admin saw is the price charged)', async () => {
    const w = await world();
    const id = await w.pkg(monthly);
    w.raceOnce(() => w.run(`UPDATE gym_packages SET data = json_set(data, '$.price', 1) WHERE id = ?`, id));
    expect((await w.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id })).status).toBe(409);
    expect(await w.one(`SELECT count(*) c FROM member_packages`)).toEqual({ c: 0 });
  });

  it('[resolveRenewalOnAssignment] a new assignment closes the open renewal request and tells the member, once', async () => {
    const w = await world();
    const id = await w.pkg(monthly);
    await w.run(`INSERT INTO renewal_requests (id, tenant_id, member_id, member_name, status, created_at) VALUES ('rr1','t1','u-mem','M','pending',1)`);
    await w.run(`INSERT INTO renewal_requests (id, tenant_id, member_id, member_name, status, created_at) VALUES ('rr2','t1','u-mem2','M2','pending',1)`);
    const mp = await w.assign(id);
    expect(await w.one(`SELECT status s, handled_by b FROM renewal_requests WHERE id = 'rr1'`)).toEqual({ s: 'handled', b: 'u-admin' });
    expect((await w.one(`SELECT status s FROM renewal_requests WHERE id = 'rr2'`)).s).toBe('pending');   // other member untouched
    const out = await w.outbox('renewal-handled:%');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ userIds: ['u-mem'], category: 'packages', title: 'Paketin yenilendi', dedupe: `renewal-handled:${mp}` });
    await w.assign(id);   // no open request now: no second push
    expect(await w.outbox('renewal-handled:%')).toHaveLength(1);
  });
});

describe('current entitlements (member_entitlements as a derived view)', () => {
  it('derives from member_packages: active membership only, strict end boundary, longest wins; lessons/frozen/cancelled/expired grant nothing', async () => {
    const w = await world();
    const now = Date.now();
    expect(await currentEntitlements(w.db, 't1', 'u-mem', now)).toBeNull();
    const mk = async (id: string, kind: string, status: string, endsAt: number, ent: object = { gymAccess: true }) =>
      w.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
             VALUES (?, 't1', 'u-mem', 'gp', 1, 1, ?, ?, ?, 1)`, id, endsAt, status, JSON.stringify({ kind, entitlements: ent }));
    await mk('l1', 'lessons', 'active', now + DAY);
    await mk('f1', 'membership', 'frozen', now + DAY);
    await mk('c1', 'membership', 'cancelled', now + DAY);
    await mk('e1', 'membership', 'active', now - 1);
    await mk('e2', 'membership', 'active', now);                        // strict: ends exactly now is over
    expect(await currentEntitlements(w.db, 't1', 'u-mem', now)).toBeNull();
    await mk('a1', 'membership', 'active', now + 5 * DAY, { gymAccess: true });
    await mk('a2', 'membership', 'active', now + 9 * DAY, { gymAccess: true, groupClasses: { unlimited: true } });
    const cur = await currentEntitlements(w.db, 't1', 'u-mem', now);
    expect(cur).toMatchObject({ packageId: 'a2', endsAt: now + 9 * DAY, tenantId: 't1', memberId: 'u-mem' });
    expect(cur!.entitlements.groupClasses?.unlimited).toBe(true);
    expect(await currentEntitlements(w.db, 't1', 'u-mem2', now)).toBeNull();      // someone else's
    expect(await currentEntitlements(w.db, 't2', 'u-mem', now)).toBeNull();       // other gym
  });

  it('GET entitlements: the member and staff read it (null when none); a colleague cannot', async () => {
    const w = await world();
    expect(await w.json(await w.send('GET', `${T1}/members/u-mem/entitlements`, 'fb-mem'))).toBeNull();
    const id = await w.pkg(gold);
    await w.assign(id);
    const mine = await w.json(await w.send('GET', `${T1}/members/u-mem/entitlements`, 'fb-mem'));
    expect(mine.entitlements.groupClasses.unlimited).toBe(true);
    expect((await w.send('GET', `${T1}/members/u-mem/entitlements`, 'fb-trn')).status).toBe(200);
    expect((await w.send('GET', `${T1}/members/u-mem/entitlements`, 'fb-admin')).status).toBe(200);
    expect((await w.send('GET', `${T1}/members/u-mem/entitlements`, 'fb-mem2')).status).toBe(403);
    expect((await w.send('GET', `${T1}/members/u-mem/entitlements`, null)).status).toBe(401);
  });
});

describe('package change requests (PKG-6)', () => {
  it('[L1728] only a tenant admin may create a request, and only as themselves', async () => {
    const w = await world();
    const cur = await w.assign(await w.pkg(monthly));
    const gp = await w.pkg(gold);
    const body = { proposedPackageId: gp, currentPackageAssignmentId: cur };
    expect((await propose(w, body, 'fb-trn')).status).toBe(403);
    expect((await propose(w, body, 'fb-mem')).status).toBe(403);
    expect((await propose(w, body, 'fb-new')).status).toBe(403);
    expect((await propose(w, { ...body, createdBy: 'u-admin2' })).status).toBe(403);   // not on someone else's behalf
    expect(await w.one(`SELECT count(*) c FROM package_change_requests`)).toEqual({ c: 0 });
    const ok = await propose(w, { ...body, createdBy: 'u-admin' });
    expect(ok.status).toBe(201);
    const row = await w.one(`SELECT created_by c, status s, member_id m FROM package_change_requests WHERE id = ?`, (await w.json(ok)).id);
    expect(row).toEqual({ c: 'u-admin', s: 'pending', m: 'u-mem' });
  });

  it('create: validated, server-computed (client money is ignored), member is notified in the same batch', async () => {
    const w = await world();
    const cur = await w.assign(await w.pkg(monthly));
    const gp = await w.pkg(gold);
    const base = { proposedPackageId: gp, currentPackageAssignmentId: cur };
    for (const bad of [{ kind: 'swap' }, { memberId: 7 }, { proposedPackageId: 3 }, { note: 'x'.repeat(501) }, { effectiveInDays: -1 }, { expiresInDays: 0 }, { expiresInDays: 31 }, { effectiveInDays: 1.5 }]) {
      expect((await propose(w, { ...base, ...bad })).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await propose(w, { ...base, memberId: 'u-nobody' })).status).toBe(409);                    // not a member
    expect((await propose(w, { ...base, proposedPackageId: 'nope' })).status).toBe(404);
    expect((await propose(w, { ...base, currentPackageAssignmentId: 'nope' })).status).toBe(409);
    expect((await propose(w, { ...base, memberId: 'u-mem2' })).status).toBe(409);                      // the assignment is u-mem's
    expect((await propose(w, { ...base, proposedPromotionId: 'nope' })).status).toBe(404);
    const off = await w.pkg({ ...gold, name: 'Off', isActive: false });
    expect((await propose(w, { ...base, proposedPackageId: off })).status).toBe(409);
    expect(await w.one(`SELECT count(*) c FROM package_change_requests`)).toEqual({ c: 0 });

    const r = await propose(w, { ...base, note: 'merhaba', refundAmount: 99999, priceDelta: -5, status: 'approved', expiresInDays: 5 });
    expect(r.status).toBe(201);
    const out = await w.json(r);
    expect(out).toMatchObject({ priceDelta: 500, finalPrice: 1500 });
    expect(out.refundAmount).toBeUndefined();
    const row = await w.one(`SELECT * FROM package_change_requests WHERE id = ?`, out.id);
    expect(row.status).toBe('pending');
    expect(JSON.parse(row.data)).toMatchObject({ memberName: 'u-mem', kind: 'upgrade', note: 'merhaba', priceDelta: 500, proposedPackageId: gp,
      currentPackageAssignmentId: cur, currentSummary: { packageName: 'Aylık', price: 1000 }, proposedSummary: { packageName: 'Gold', price: 1500 } });
    expect(JSON.parse(row.data).refundAmount).toBeUndefined();
    expect(Math.round((row.expires_at - row.created_at) / DAY)).toBe(5);
    const pushes = await w.outbox(`pkgchg-new:${out.id}`);
    expect(pushes).toEqual([expect.objectContaining({ userIds: ['u-mem'], title: 'Paket teklifin var', body: 'Gold için bir teklif bekliyor.', category: 'packages' })]);
  });

  it('create: a downgrade carries the prorated refund the SERVER computed; a promotion is priced in and must apply', async () => {
    const w = await world();
    const cur = await w.assign(await w.pkg(monthly));
    const bp = await w.pkg(basic);
    const r = await w.json(await propose(w, { kind: 'downgrade', proposedPackageId: bp, currentPackageAssignmentId: cur, effectiveInDays: 15 }));
    expect(r).toMatchObject({ priceDelta: -500, refundAmount: 250, refundBasis: 'kalan 15/30 gün' });
    const p20 = (await w.json(await w.send('POST', `${T1}/promotions`, 'fb-admin', { name: '%20', kind: 'percentDiscount', value: 20, appliesTo: [bp], isActive: true }))).id;
    const other = (await w.json(await w.send('POST', `${T1}/promotions`, 'fb-admin', { name: 'x', kind: 'amountDiscount', value: 5, appliesTo: ['nope'], isActive: true }))).id;
    expect((await propose(w, { kind: 'promotion', proposedPackageId: bp, proposedPromotionId: other })).status).toBe(409);
    const withPromo = await w.json(await propose(w, { kind: 'promotion', proposedPackageId: bp, proposedPromotionId: p20 }));
    expect(withPromo.finalPrice).toBe(400);
    expect(await w.one(`SELECT count(*) c FROM package_change_requests`)).toEqual({ c: 2 });
  });

  it('create: state that changes between read and write (package deactivated, current assignment cancelled) writes nothing, not even the push', async () => {
    const w = await world();
    const cur = await w.assign(await w.pkg(monthly));
    const gp = await w.pkg(gold);
    w.raceOnce(() => w.run(`UPDATE member_packages SET status = 'cancelled' WHERE id = ?`, cur));
    expect((await propose(w, { proposedPackageId: gp, currentPackageAssignmentId: cur })).status).toBe(409);
    w.raceOnce(() => w.run(`UPDATE gym_packages SET data = json_set(data, '$.isActive', json('false')) WHERE id = ?`, gp));
    expect((await propose(w, { proposedPackageId: gp })).status).toBe(409);
    expect(await w.one(`SELECT count(*) c FROM package_change_requests`)).toEqual({ c: 0 });
    expect(await w.outbox('pkgchg-new:%')).toHaveLength(0);
  });

  it('reads: the member lists/gets their own request; a colleague gets nothing', async () => {
    const w = await world();
    const id = (await w.json(await propose(w, { proposedPackageId: await w.pkg(gold) }))).id;
    expect((await w.json(await w.send('GET', `${T1}/package-change-requests`, 'fb-mem'))).map((r: any) => r.id)).toEqual([id]);
    expect(await w.json(await w.send('GET', `${T1}/package-change-requests`, 'fb-mem2'))).toEqual([]);
    expect((await w.json(await w.send('GET', `${T1}/package-change-requests/${id}`, 'fb-mem'))).proposedSummary.packageName).toBe('Gold');
    expect((await w.send('GET', `${T1}/package-change-requests/${id}`, 'fb-trn')).status).toBe(200);
    expect((await w.send('GET', `${T1}/package-change-requests/${id}`, 'fb-mem2')).status).toBe(404);
    expect((await w.send('GET', `${T1}/package-change-requests/${id}`, 'fb-new')).status).toBe(403);
  });

  it('[L1767] the admin can cancel a still-pending offer; not once it has been answered', async () => {
    const w = await world();
    const gp = await w.pkg(gold);
    const a = (await w.json(await propose(w, { proposedPackageId: gp }))).id;
    expect((await w.send('POST', `${T1}/package-change-requests/${a}/cancel`, 'fb-mem')).status).toBe(403);
    expect((await w.send('POST', `${T1}/package-change-requests/${a}/cancel`, 'fb-trn')).status).toBe(403);
    expect((await w.send('POST', `${T1}/package-change-requests/${a}/cancel`, 'fb-admin2')).status).toBe(200);   // any admin of the gym
    expect((await w.one(`SELECT status s FROM package_change_requests WHERE id = ?`, a)).s).toBe('cancelled');
    expect((await w.send('POST', `${T1}/package-change-requests/${a}/cancel`, 'fb-admin')).status).toBe(409);   // already cancelled
    expect((await w.send('POST', `${T1}/package-change-requests/nope/cancel`, 'fb-admin')).status).toBe(404);
    for (const status of ['approved', 'rejected', 'expired']) {
      const id = (await w.json(await propose(w, { proposedPackageId: gp }))).id;
      await w.run(`UPDATE package_change_requests SET status = ? WHERE id = ?`, status, id);
      expect((await w.send('POST', `${T1}/package-change-requests/${id}/cancel`, 'fb-admin')).status, status).toBe(409);
      expect((await w.one(`SELECT status s FROM package_change_requests WHERE id = ?`, id)).s).toBe(status);
    }
    // and a cancelled offer cannot be accepted any more
    expect((await w.send('POST', `${T1}/package-change-requests/${a}/respond`, 'fb-mem', { approve: true })).status).toBe(409);
  });

  it('[L1740][L1754] only the addressed member can respond; nobody else can move status, by any route', async () => {
    const w = await world();
    const id = (await w.json(await propose(w, { proposedPackageId: await w.pkg(gold) }))).id;
    const path = `${T1}/package-change-requests/${id}/respond`;
    for (const sub of ['fb-mem2', 'fb-admin', 'fb-trn']) expect((await w.send('POST', path, sub, { approve: true })).status, sub).toBe(404);
    expect((await w.send('POST', path, 'fb-new', { approve: true })).status).toBe(404);
    expect((await w.send('POST', path, null, { approve: true })).status).toBe(401);
    for (const m of ['PUT', 'PATCH', 'POST']) for (const sub of ['fb-mem', 'fb-admin']) {
      expect((await w.send(m, `${T1}/package-change-requests/${id}`, sub, { status: 'approved' })).status, `${m} ${sub}`).toBe(404);
    }
    expect((await w.send('PUT', path, 'fb-mem', { approve: true })).status).toBe(404);
    expect((await w.send('POST', path, 'fb-mem', { approve: 'yes' })).status).toBe(400);
    expect((await w.send('POST', path, 'fb-mem', {})).status).toBe(400);
    expect((await w.one(`SELECT status s FROM package_change_requests WHERE id = ?`, id)).s).toBe('pending');
    expect(await w.one(`SELECT count(*) c FROM member_packages`)).toEqual({ c: 0 });
  });

  it('reject: closes the request and tells the admins (and the creator), once; cannot be answered twice', async () => {
    const w = await world();
    const id = (await w.json(await propose(w, { proposedPackageId: await w.pkg(gold) }))).id;
    const r = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: false });
    expect(await w.json(r)).toEqual({ status: 'rejected' });
    expect(await w.one(`SELECT status s, responded_at IS NOT NULL r FROM package_change_requests WHERE id = ?`, id)).toEqual({ s: 'rejected', r: 1 });
    const out = await w.outbox(`pkgchg-resp:${id}`);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Paket teklifi reddedildi');
    expect([...out[0].userIds].sort()).toEqual(['u-admin', 'u-admin2']);
    expect((await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: false })).status).toBe(409);
    expect((await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true })).status).toBe(409);
    expect(await w.outbox(`pkgchg-resp:${id}`)).toHaveLength(1);
  });

  async function swapWorld() {
    const w = await world();
    const monthlyId = await w.pkg(monthly);
    const goldId = await w.pkg(gold);
    const cur = await w.assign(monthlyId);
    const promo = (await w.json(await w.send('POST', `${T1}/promotions`, 'fb-admin', { name: 'bonus', kind: 'bonusDays', value: 7, appliesTo: [], isActive: true, maxRedemptions: 1 }))).id;
    return { ...w, monthlyId, goldId, cur, promo };
  }

  it('approve (upgrade): old holding + its credits cancelled, new holding + credits minted, counters moved, request closed, admins told - one atomic change', async () => {
    const w = await swapWorld();
    await w.run(`UPDATE member_credits SET used = 1 WHERE source_package_id = ? AND kind = 'ptLesson'`, w.cur);
    await w.run(`INSERT INTO renewal_requests (id, tenant_id, member_id, member_name, status, created_at) VALUES ('rr','t1','u-mem','M','pending',1)`);
    const id = (await w.json(await propose(w, { proposedPackageId: w.goldId, currentPackageAssignmentId: w.cur, proposedPromotionId: w.promo }))).id;
    expect(await w.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, w.monthlyId)).toEqual({ n: 1 });
    const r = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true });
    expect(r.status).toBe(200);
    const { status, packageId } = await w.json(r);
    expect(status).toBe('approved');

    expect((await w.one(`SELECT status s, json_extract(data,'$.cancellationReason') r FROM member_packages WHERE id = ?`, w.cur))).toEqual({ s: 'cancelled', r: 'package-change' });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE source_package_id = ? AND status = 'cancelled'`, w.cur)).toEqual({ c: 2 });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE source_package_id = ? AND status <> 'cancelled'`, w.cur)).toEqual({ c: 0 });
    const np = await w.one(`SELECT * FROM member_packages WHERE id = ?`, packageId);
    expect(np).toMatchObject({ status: 'active', package_id: w.goldId, final_price: 1500, member_id: 'u-mem', assigned_by: 'u-admin', payment_id: null });
    expect(np.ends_at - np.starts_at).toBe(37 * DAY);          // 30 + 7 bonus days
    expect(JSON.parse(np.data)).toMatchObject({ packageName: 'Gold', promotionName: 'bonus', bonusDays: 7, listPrice: 1500, frozenDays: 0, changeRequestId: id, memberName: 'u-mem' });
    // gold has only a PT quota (group classes are unlimited, so no group credit)
    const credits = (await w.db.prepare(`SELECT kind, source, total, used, status FROM member_credits WHERE source_package_id = ?`).bind(packageId).all<any>()).results;
    expect(credits).toEqual([{ kind: 'ptLesson', source: 'entitlement', total: 4, used: 0, status: 'active' }]);
    expect(await w.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, w.monthlyId)).toEqual({ n: 0 });
    expect(await w.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, w.goldId)).toEqual({ n: 1 });
    expect(JSON.parse((await w.one(`SELECT data d FROM promotions WHERE id = ?`, w.promo)).d).redeemed).toBe(1);
    const req = await w.one(`SELECT status s, applied_at a, responded_at r, data d FROM package_change_requests WHERE id = ?`, id);
    expect(req).toMatchObject({ s: 'approved' });
    expect(req.a).toBe(req.r);
    expect(JSON.parse(req.d).applyToken).toBeUndefined();     // the batch-internal token never leaks
    expect((await w.one(`SELECT status s, handled_by b FROM renewal_requests WHERE id = 'rr'`))).toEqual({ s: 'handled', b: 'u-admin' });
    expect((await w.outbox(`pkgchg-resp:${id}`))[0]).toMatchObject({ title: 'Paket teklifi kabul edildi', category: 'packages' });
    expect(await w.outbox('renewal-handled:%')).toHaveLength(1);
    expect(await w.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 0 });   // upgrade: no refund row
    // the entitlements view now answers with the new package
    expect((await currentEntitlements(w.db, 't1', 'u-mem'))!.packageId).toBe(packageId);

    // double-approve / stale retry: refused, nothing minted twice
    const again = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true });
    expect(again.status).toBe(409);
    expect(await w.one(`SELECT count(*) c FROM member_packages WHERE status = 'active'`)).toEqual({ c: 1 });
    expect(JSON.parse((await w.one(`SELECT data d FROM promotions WHERE id = ?`, w.promo)).d).redeemed).toBe(1);
  });

  it('approve (downgrade): books the refund the member was shown as a confirmed refund ledger row', async () => {
    const w = await swapWorld();
    const bp = await w.pkg(basic);
    const id = (await w.json(await propose(w, { kind: 'downgrade', proposedPackageId: bp, currentPackageAssignmentId: w.cur, effectiveInDays: 15 }))).id;
    expect((await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true })).status).toBe(200);
    const pay = await w.one(`SELECT * FROM payments`);
    expect(pay).toMatchObject({ tenant_id: 't1', member_id: 'u-mem', amount: 250, status: 'confirmed' });
    expect(JSON.parse(pay.data)).toMatchObject({ kind: 'refund', method: 'cash', packageChangeRequestId: id });
    expect(JSON.parse(pay.data).note).toBe('Aylık → Basic geçişi (kalan 15/30 gün)');
    const np = await w.one(`SELECT starts_at s, ends_at e, final_price p FROM member_packages WHERE package_id = ?`, bp);
    expect(np.p).toBe(500);
    expect(np.e - np.s).toBe(30 * DAY);
  });

  it('approve (addon, no current): a lessons package is added next to the untouched membership', async () => {
    const w = await swapWorld();
    const lp = await w.pkg(lessons);
    const id = (await w.json(await propose(w, { kind: 'addon', proposedPackageId: lp }))).id;
    const { packageId } = await w.json(await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true }));
    expect((await w.one(`SELECT status s FROM member_packages WHERE id = ?`, w.cur)).s).toBe('active');
    expect(await w.one(`SELECT kind, source, total, status FROM member_credits WHERE source_package_id = ?`, packageId)).toEqual({ kind: 'ptLesson', source: 'purchase', total: 10, status: 'active' });
  });

  it('approve: the replaced holding is gone/changed -> refused and NOTHING is written (no second active package)', async () => {
    const w = await swapWorld();
    const id = (await w.json(await propose(w, { proposedPackageId: w.goldId, currentPackageAssignmentId: w.cur, proposedPromotionId: w.promo }))).id;
    await w.run(`UPDATE member_packages SET status = 'cancelled' WHERE id = ?`, w.cur);
    const r = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true });
    expect(r.status).toBe(409);
    expect((await w.json(r)).code).toBe('current-not-active');
    expect((await w.one(`SELECT status s FROM package_change_requests WHERE id = ?`, id)).s).toBe('pending');
    expect(await w.one(`SELECT count(*) c FROM member_packages`)).toEqual({ c: 1 });
    expect(JSON.parse((await w.one(`SELECT data d FROM promotions`)).d).redeemed).toBe(0);
  });

  it('approve: a writer landing between read and write cannot make the batch half-commit (gate = zero rows => no old cancel, no new rows, no promotion spent)', async () => {
    for (const racer of [
      (w: any) => w.run(`UPDATE member_packages SET status = 'cancelled' WHERE id = ?`, w.cur),
      (w: any) => w.run(`UPDATE promotions SET data = json_set(data, '$.redeemed', 1)`),
      (w: any) => w.run(`UPDATE package_change_requests SET status = 'cancelled'`),
      (w: any) => w.run(`UPDATE gym_packages SET data = json_set(data, '$.price', 1) WHERE id = ?`, w.goldId),
      (w: any) => w.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-mem'`),
    ]) {
      const w = await swapWorld();
      const id = (await w.json(await propose(w, { proposedPackageId: w.goldId, currentPackageAssignmentId: w.cur, proposedPromotionId: w.promo }))).id;
      w.raceOnce(() => racer(w));
      const r = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true });
      expect(r.status).toBe(409);
      // the racer's own write is the only difference; the approval added/changed nothing else
      expect(await w.one(`SELECT count(*) c FROM member_packages WHERE id <> ?`, w.cur)).toEqual({ c: 0 });
      expect(await w.one(`SELECT count(*) c FROM member_credits WHERE source_package_id <> ?`, w.cur)).toEqual({ c: 0 });
      expect(await w.one(`SELECT count(*) c FROM member_credits WHERE status = 'cancelled'`)).toEqual({ c: 0 });
      expect(await w.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 0 });
      expect(await w.outbox('pkgchg-resp:%')).toHaveLength(0);
      expect(await w.outbox('renewal-handled:%')).toHaveLength(0);
      expect(JSON.parse((await w.one(`SELECT data d FROM package_change_requests WHERE id = ?`, id)).d).applyToken).toBeUndefined();
    }
  });

  it('approve: the promotion ran out since the offer -> the WHOLE swap is refused, request closed as expired, creator told; never charged full price', async () => {
    const w = await swapWorld();
    const id = (await w.json(await propose(w, { proposedPackageId: w.goldId, currentPackageAssignmentId: w.cur, proposedPromotionId: w.promo }))).id;
    await w.run(`UPDATE promotions SET data = json_set(data, '$.redeemed', 1)`);          // cap (1) reached by someone else
    const r = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true });
    expect(r.status).toBe(200);
    expect(await w.json(r)).toEqual({ status: 'promotion-expired' });
    expect(await w.one(`SELECT status s FROM package_change_requests WHERE id = ?`, id)).toEqual({ s: 'expired' });
    expect((await w.one(`SELECT status s FROM member_packages WHERE id = ?`, w.cur)).s).toBe('active');
    expect(await w.one(`SELECT count(*) c FROM member_packages`)).toEqual({ c: 1 });
    const out = await w.outbox(`pkgchg-promo-expired:${id}`);
    expect(out).toEqual([expect.objectContaining({ userIds: ['u-admin'], title: 'Promosyon süresi doldu' })]);
    expect(await w.outbox(`pkgchg-resp:${id}`)).toHaveLength(0);
    // an inactive or past-window promotion behaves the same
    const id2 = (await w.json(await propose(w, { proposedPackageId: w.goldId, currentPackageAssignmentId: w.cur, proposedPromotionId: undefined }))).id;
    await w.run(`UPDATE package_change_requests SET data = json_set(data, '$.proposedPromotionId', ?) WHERE id = ?`, w.promo, id2);
    await w.run(`UPDATE promotions SET data = json_set(data, '$.redeemed', 0, '$.endsAt', 5)`);
    expect(await w.json(await w.send('POST', `${T1}/package-change-requests/${id2}/respond`, 'fb-mem', { approve: true }))).toEqual({ status: 'promotion-expired' });
  });

  it('approve: an offer past its deadline cannot be accepted (and is closed as expired)', async () => {
    const w = await swapWorld();
    const id = (await w.json(await propose(w, { proposedPackageId: w.goldId, currentPackageAssignmentId: w.cur }))).id;
    await w.run(`UPDATE package_change_requests SET expires_at = ? WHERE id = ?`, Date.now() - 1000, id);
    const r = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true });
    expect(r.status).toBe(409);
    expect((await w.json(r)).code).toBe('expired');
    expect((await w.one(`SELECT status s FROM package_change_requests WHERE id = ?`, id)).s).toBe('expired');
    expect(await w.one(`SELECT count(*) c FROM member_packages WHERE status = 'active'`)).toEqual({ c: 1 });
  });

  it('approve: a member who left the gym cannot accept; a cross-tenant package reference is refused', async () => {
    const w = await swapWorld();
    const id = (await w.json(await propose(w, { proposedPackageId: w.goldId }))).id;
    await w.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-mem'`);
    expect((await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true })).status).toBe(403);
    await w.run(`UPDATE memberships SET status = 'active' WHERE member_id = 'u-mem'`);
    await w.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await w.run(`UPDATE gym_packages SET tenant_id = 't2' WHERE id = ?`, w.goldId);
    const r = await w.send('POST', `${T1}/package-change-requests/${id}/respond`, 'fb-mem', { approve: true });
    expect(r.status).toBe(409);
    expect(await w.one(`SELECT count(*) c FROM member_packages WHERE package_id = ?`, w.goldId)).toEqual({ c: 0 });
  });
});

describe('cancel an assignment (ADMIN-4)', () => {
  async function cancelWorld() {
    const w = await world();
    const pid = await w.pkg(monthly);
    const mp = await w.assign(pid);
    const credits = (await w.db.prepare(`SELECT id FROM member_credits WHERE source_package_id = ?`).bind(mp).all<any>()).results.map((r: any) => r.id);
    return { ...w, pid, mp, credits, path: `${T1}/member-packages/${mp}/cancel` };
  }
  const book = async (w: Awaited<ReturnType<typeof cancelWorld>>, creditId: string, startsAt: number, status = 'scheduled') =>
    w.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at)
           VALUES (?, 't1', 'u-trn', 'u-mem', ?, 60, ?, ?, 1, 1)`, 's' + startsAt + status, startsAt, status, creditId);

  it('immediate: closed to non-admins, reason required, status/ends_at/credits/counter/push all move together; history is kept', async () => {
    const w = await cancelWorld();
    expect((await w.send('POST', w.path, 'fb-mem', { reason: 'x' })).status).toBe(403);
    expect((await w.send('POST', w.path, 'fb-trn', { reason: 'x' })).status).toBe(403);
    expect((await w.send('POST', w.path, 'fb-admin', { reason: '   ' })).status).toBe(400);
    expect((await w.send('POST', w.path, 'fb-admin', {})).status).toBe(400);
    expect((await w.send('POST', w.path, 'fb-admin', { reason: 'x', access: 'now' })).status).toBe(400);
    expect((await w.send('POST', `${T1}/member-packages/nope/cancel`, 'fb-admin', { reason: 'x' })).status).toBe(404);
    expect((await w.one(`SELECT status s FROM member_packages WHERE id = ?`, w.mp)).s).toBe('active');
    await w.run(`UPDATE member_credits SET used = 1 WHERE id = ?`, w.credits[0]);

    const before = Date.now();
    const r = await w.send('POST', w.path, 'fb-admin', { reason: 'yanlış atama' });
    expect(r.status).toBe(200);
    expect(await w.json(r)).toEqual({ revokedCredits: 2 });
    const row = await w.one(`SELECT status s, ends_at e, frozen_until f, data d FROM member_packages WHERE id = ?`, w.mp);
    expect(row.s).toBe('cancelled');
    expect(row.e).toBeGreaterThanOrEqual(before);
    expect(row.e).toBeLessThanOrEqual(Date.now());
    expect(JSON.parse(row.d)).toMatchObject({ cancelledBy: 'u-admin', cancellationReason: 'yanlış atama', cancellationAccess: 'immediate' });
    expect(JSON.parse(row.d).cancelToken).toBeUndefined();
    expect((await w.db.prepare(`SELECT status, used FROM member_credits WHERE source_package_id = ? ORDER BY id`).bind(w.mp).all<any>()).results.map((c: any) => c.status)).toEqual(['revoked', 'revoked']);
    expect((await w.one(`SELECT used u FROM member_credits WHERE id = ?`, w.credits[0])).u).toBe(1);   // spent lessons stay spent
    expect(await w.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, w.pid)).toEqual({ n: 0 });
    expect(await currentEntitlements(w.db, 't1', 'u-mem')).toBeNull();
    const out = await w.outbox(`pkg-cancel:${w.mp}:%`);
    expect(out).toEqual([expect.objectContaining({ userIds: ['u-mem'], title: 'Paketin geri alındı', category: 'packages' })]);
    expect(out[0].body).toContain('yanlış atama');
    expect((await w.send('POST', w.path, 'fb-admin', { reason: 'again' })).status).toBe(409);
    expect(await w.outbox(`pkg-cancel:${w.mp}:%`)).toHaveLength(1);
  });

  it('immediate never EXTENDS an assignment that already ended, and other tenants cannot reach it', async () => {
    const w = await cancelWorld();
    await w.run(`UPDATE member_packages SET ends_at = 1000 WHERE id = ?`, w.mp);
    expect((await w.send('POST', w.path, 'fb-admin', { reason: 'cleanup' })).status).toBe(200);
    expect((await w.one(`SELECT ends_at e FROM member_packages WHERE id = ?`, w.mp)).e).toBe(1000);
    const w2 = await cancelWorld();
    await w2.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','O',1)`);
    await w2.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-mem2','active','["admin"]',1)`);
    expect((await w2.send('POST', `/v1/tenants/t2/member-packages/${w2.mp}/cancel`, 'fb-mem2', { reason: 'x' })).status).toBe(404);   // admin of ANOTHER gym
    expect((await w2.one(`SELECT status s FROM member_packages WHERE id = ?`, w2.mp)).s).toBe('active');
  });

  it('immediate is refused while PT appointments paid from this package are still ahead; past or cancelled ones do not block', async () => {
    const w = await cancelWorld();
    const pt = (await w.one(`SELECT id FROM member_credits WHERE source_package_id = ? AND kind = 'ptLesson'`, w.mp)).id;
    await book(w, pt, Date.now() - DAY);                         // past
    await book(w, pt, Date.now() + DAY, 'cancelled');            // future but cancelled
    await book(w, pt, Date.now() + 2 * DAY);                     // future, live
    const r = await w.send('POST', w.path, 'fb-admin', { reason: 'x' });
    expect(r.status).toBe(409);
    expect(await w.json(r)).toMatchObject({ code: 'blocking-sessions', blocking: 1 });
    expect(await w.one(`SELECT status s FROM member_packages WHERE id = ?`, w.mp)).toEqual({ s: 'active' });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE status = 'revoked'`)).toEqual({ c: 0 });
    expect(await w.outbox('pkg-cancel:%')).toHaveLength(0);
    // until-end has nothing to protect the member from: it goes through
    expect((await w.send('POST', w.path, 'fb-admin', { reason: 'x', access: 'until-end' })).status).toBe(200);
  });

  it('a booking that lands between the check and the write still blocks (the gate is inside the UPDATE): nothing changes', async () => {
    const w = await cancelWorld();
    const pt = (await w.one(`SELECT id FROM member_credits WHERE source_package_id = ? AND kind = 'ptLesson'`, w.mp)).id;
    w.raceOnce(() => book(w, pt, Date.now() + DAY));
    const r = await w.send('POST', w.path, 'fb-admin', { reason: 'x' });
    expect(r.status).toBe(409);
    expect((await w.json(r)).code).toBe('blocking-sessions');
    expect(await w.one(`SELECT status s FROM member_packages WHERE id = ?`, w.mp)).toEqual({ s: 'active' });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE status = 'revoked'`)).toEqual({ c: 0 });
    expect(await w.outbox('pkg-cancel:%')).toHaveLength(0);
  });

  it("until-end: the member keeps the period - status/ends_at/credits stand, only the decision is recorded; a second until-end is refused, immediate can still follow", async () => {
    const w = await cancelWorld();
    const ends = (await w.one(`SELECT ends_at e FROM member_packages WHERE id = ?`, w.mp)).e;
    const r = await w.send('POST', w.path, 'fb-admin', { reason: 'yenilenmeyecek', access: 'until-end' });
    expect(await w.json(r)).toEqual({ revokedCredits: 0 });
    const row = await w.one(`SELECT status s, ends_at e, data d FROM member_packages WHERE id = ?`, w.mp);
    expect(row).toMatchObject({ s: 'active', e: ends });
    expect(JSON.parse(row.d)).toMatchObject({ cancellationAccess: 'until-end', cancelledBy: 'u-admin', cancellationReason: 'yenilenmeyecek' });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE status = 'active'`)).toEqual({ c: 2 });
    expect(await currentEntitlements(w.db, 't1', 'u-mem')).not.toBeNull();
    const out = await w.outbox(`pkg-cancel:${w.mp}:until-end`);
    expect(out[0].title).toBe('Paketin yenilenmeyecek');
    expect(out[0].body).toMatch(/\d{2}\.\d{2}\.\d{4} tarihinde bitecek/);
    expect((await w.send('POST', w.path, 'fb-admin', { reason: 'again', access: 'until-end' })).status).toBe(409);
    expect((await w.send('POST', `${T1}/member-packages/${w.mp}/freeze`, 'fb-admin', { days: 5 })).status).toBe(409);   // an ended package cannot be frozen
    expect((await w.send('POST', w.path, 'fb-admin', { reason: 'escalate' })).status).toBe(200);
    expect((await w.one(`SELECT status s FROM member_packages WHERE id = ?`, w.mp)).s).toBe('cancelled');
  });
});

describe('freeze (PKG-10)', () => {
  async function freezeWorld(def: object = monthly) {
    const w = await world();
    const pid = await w.pkg(def);
    const mp = await w.assign(pid);
    return { ...w, pid, mp, path: `${T1}/member-packages/${mp}/freeze` };
  }

  it('freezes now for N days: ends_at and every live credit shift by exactly that span, quota is recorded, member is told, counter unchanged', async () => {
    const w = await freezeWorld();
    const before = await w.one(`SELECT ends_at e FROM member_packages WHERE id = ?`, w.mp);
    const creditsBefore = (await w.db.prepare(`SELECT id, expires_at e FROM member_credits WHERE source_package_id = ? ORDER BY id`).bind(w.mp).all<any>()).results;
    await w.run(`UPDATE member_credits SET status = 'expired' WHERE id = ?`, creditsBefore[0].id);    // dead credits keep their history
    const t0 = Date.now();
    const r = await w.send('POST', w.path, 'fb-admin', { days: 10 });
    expect(r.status).toBe(200);
    const out = await w.json(r);
    expect(out.shiftedCredits).toBe(1);
    expect(Date.parse(out.resumesAt)).toBeGreaterThanOrEqual(t0 + 10 * DAY);
    const row = await w.one(`SELECT status s, ends_at e, frozen_until f, data d FROM member_packages WHERE id = ?`, w.mp);
    expect(row.s).toBe('frozen');
    expect(row.e).toBe(before.e + 10 * DAY);
    expect(row.f).toBe(Date.parse(out.resumesAt));
    const d = JSON.parse(row.d);
    expect(d.frozenDays).toBe(10);
    expect(d.freezes).toHaveLength(1);
    expect(d.freezes[0]).toMatchObject({ days: 10, createdBy: 'u-admin', endsAt: row.f });
    expect(d.freezeToken).toBeUndefined();
    const creditsAfter = (await w.db.prepare(`SELECT id, expires_at e FROM member_credits WHERE source_package_id = ? ORDER BY id`).bind(w.mp).all<any>()).results;
    expect(creditsAfter[0].e).toBe(creditsBefore[0].e);                    // expired credit: untouched
    expect(creditsAfter[1].e).toBe(creditsBefore[1].e + 10 * DAY);         // live credit: shifted
    expect(await currentEntitlements(w.db, 't1', 'u-mem')).toBeNull();     // frozen = no access
    expect(await w.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, w.pid)).toEqual({ n: 1 });   // frozen still counts as in use
    const push = await w.outbox(`pkg-freeze:${w.mp}:1`);
    expect(push).toEqual([expect.objectContaining({ userIds: ['u-mem'], title: 'Üyeliğin donduruldu', category: 'packages' })]);
    expect(push[0].body).toContain('10 gün ileri alındı');
  });

  it('rules: admin only; days validated; membership only; needs a freeze right with quota and minimum length; not twice, not once ended/expired', async () => {
    const w = await freezeWorld();
    expect((await w.send('POST', w.path, 'fb-mem', { days: 5 })).status).toBe(403);
    expect((await w.send('POST', w.path, 'fb-trn', { days: 5 })).status).toBe(403);
    for (const days of [0, -1, 1.5, '5', 366, null, undefined]) expect((await w.send('POST', w.path, 'fb-admin', { days })).status, String(days)).toBe(400);
    expect((await w.send('POST', `${T1}/member-packages/nope/freeze`, 'fb-admin', { days: 5 })).status).toBe(404);
    const short = await w.send('POST', w.path, 'fb-admin', { days: 2 });                       // policy minDays 3
    expect(short.status).toBe(409);
    expect((await w.json(short)).code).toBe('min-days');
    expect(await w.one(`SELECT status s FROM member_packages WHERE id = ?`, w.mp)).toEqual({ s: 'active' });
    expect((await w.send('POST', w.path, 'fb-admin', { days: 5 })).status).toBe(200);
    expect((await w.json(await w.send('POST', w.path, 'fb-admin', { days: 5 }))).code).toBe('already-frozen');
    await w.run(`UPDATE member_packages SET status = 'active', frozen_until = NULL WHERE id = ?`, w.mp);       // resumed
    expect((await w.json(await w.send('POST', w.path, 'fb-admin', { days: 5 }))).code).toBe('freeze-quota');     // maxCount 1 used
    await w.run(`UPDATE member_packages SET ends_at = ? WHERE id = ?`, Date.now() - 1, w.mp);
    await w.run(`UPDATE member_packages SET data = json_set(data, '$.freezePolicy.maxCount', 5) WHERE id = ?`, w.mp);
    expect((await w.json(await w.send('POST', w.path, 'fb-admin', { days: 5 }))).code).toBe('expired');

    const w2 = await freezeWorld({ ...monthly, freezePolicy: undefined });
    expect((await w2.json(await w2.send('POST', w2.path, 'fb-admin', { days: 5 }))).code).toBe('no-freeze-right');
    const w3 = await world();
    const lp = await w3.assign(await w3.pkg(lessons));
    expect((await w3.json(await w3.send('POST', `${T1}/member-packages/${lp}/freeze`, 'fb-admin', { days: 5 }))).code).toBe('not-membership');
  });

  it('a state change between the check and the write is caught by the gate: nothing shifts, nothing is queued', async () => {
    const w = await freezeWorld();
    const creditsBefore = (await w.db.prepare(`SELECT expires_at e FROM member_credits ORDER BY id`).all<any>()).results;
    w.raceOnce(() => w.run(`UPDATE member_packages SET status = 'cancelled' WHERE id = ?`, w.mp));
    const r = await w.send('POST', w.path, 'fb-admin', { days: 5 });
    expect(r.status).toBe(409);
    expect((await w.db.prepare(`SELECT expires_at e FROM member_credits ORDER BY id`).all<any>()).results).toEqual(creditsBefore);
    expect(await w.outbox('pkg-freeze:%')).toHaveLength(0);
    expect(JSON.parse((await w.one(`SELECT data d FROM member_packages WHERE id = ?`, w.mp)).d).freezes).toEqual([]);
  });

  it('several freezes allowed by the policy accumulate frozenDays and freeze history', async () => {
    const w = await freezeWorld({ ...monthly, freezePolicy: { minDays: 1, maxCount: 2 } });
    expect((await w.send('POST', w.path, 'fb-admin', { days: 4 })).status).toBe(200);
    await w.run(`UPDATE member_packages SET status = 'active', frozen_until = NULL WHERE id = ?`, w.mp);
    expect((await w.send('POST', w.path, 'fb-admin', { days: 6 })).status).toBe(200);
    const d = JSON.parse((await w.one(`SELECT data d FROM member_packages WHERE id = ?`, w.mp)).d);
    expect(d.frozenDays).toBe(10);
    expect(d.freezes.map((f: any) => f.days)).toEqual([4, 6]);
    expect((await w.outbox('pkg-freeze:%')).length).toBe(2);
  });
});
