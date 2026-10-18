import { Hono } from 'hono';

import { rolesIn } from './auth';
import { creditStatements, promoUsableSql, recountPackage, renewalResolution, usablePaymentSql } from './pkgSupport';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const packages = new Hono<App>();

const DAY = 86_400_000;
const isAdmin = async (c: Ctx) => (await rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'))).includes('admin');
const body = async (c: Ctx) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, any>;
const bad = (c: Ctx, m: string) => c.json({ error: m }, 400);
const forbidden = (c: Ctx) => c.json({ error: 'forbidden' }, 403);
const newId = (p: string) => p + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
const posInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;

// ---- catalog ----
function parsePackage(b: Record<string, any>): Record<string, unknown> | string {
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) return 'name';
  if (b.kind !== 'membership' && b.kind !== 'lessons') return 'kind';
  if (typeof b.price !== 'number' || !Number.isInteger(b.price) || b.price < 0) return 'price';
  if (typeof b.entitlements?.gymAccess !== 'boolean') return 'entitlements.gymAccess';
  if (typeof b.isActive !== 'boolean') return 'isActive';
  if (b.kind === 'membership' && !posInt(b.durationDays)) return 'durationDays';
  if (b.kind === 'lessons' && (!posInt(b.lessonCount) || !posInt(b.lessonValidityDays))) return 'lessonCount/lessonValidityDays';
  const { id: _i, tenantId: _t, activeAssignmentCount: _a, createdAt: _c, ...data } = b;
  return data;
}

packages.post('/tenants/:tenantId/packages', async (c) => {
  if (!(await isAdmin(c))) return forbidden(c);
  const data = parsePackage(await body(c));
  if (typeof data === 'string') return bad(c, data);
  const id = newId('gp');
  await c.env.DB.prepare(`INSERT INTO gym_packages (id, tenant_id, data) VALUES (?, ?, ?)`)
    .bind(id, c.req.param('tenantId'), JSON.stringify({ ...data, createdAt: Date.now() })).run();
  return c.json({ id }, 201);
});

/** A package in use is frozen except for isActive / sortOrder: its terms were sold to someone. */
packages.put('/tenants/:tenantId/packages/:id', async (c) => {
  if (!(await isAdmin(c))) return forbidden(c);
  const tenantId = c.req.param('tenantId')!;
  const row = await c.env.DB.prepare(`SELECT data, active_assignment_count n FROM gym_packages WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), tenantId).first<{ data: string; n: number }>();
  if (!row) return c.json({ error: 'not found' }, 404);
  const b = await body(c);
  let next: Record<string, unknown>;
  if (row.n > 0) {
    const allowed = ['isActive', 'sortOrder', 'updatedAt'];
    if (Object.keys(b).some((k) => !allowed.includes(k))) return c.json({ error: 'package in use: only isActive/sortOrder can change' }, 409);
    next = { ...JSON.parse(row.data), ...b, updatedAt: Date.now() };
  } else {
    const data = parsePackage(b);
    if (typeof data === 'string') return bad(c, data);
    next = { ...data, createdAt: JSON.parse(row.data).createdAt, updatedAt: Date.now() };
  }
  // The in-use check is repeated inside the write: an assignment racing this edit wins.
  await c.env.DB.prepare(`UPDATE gym_packages SET data = ? WHERE id = ? AND tenant_id = ? AND (active_assignment_count = 0 OR ? = 1)`)
    .bind(JSON.stringify(next), c.req.param('id'), tenantId, row.n > 0 ? 1 : 0).run();
  return c.json({ ok: true });
});

// ---- promotions ----
const PROMO_KINDS = ['percentDiscount', 'amountDiscount', 'bonusDays', 'bonusLessons'];
packages.post('/tenants/:tenantId/promotions', async (c) => {
  if (!(await isAdmin(c))) return forbidden(c);
  const b = await body(c);
  if (typeof b.name !== 'string' || !b.name.trim() || !PROMO_KINDS.includes(b.kind) || typeof b.value !== 'number' || !(b.value > 0)
      || !Array.isArray(b.appliesTo) || typeof b.isActive !== 'boolean') return bad(c, 'bad promotion');
  if (b.kind === 'percentDiscount' && b.value > 100) return bad(c, 'percent > 100');
  const { id: _i, tenantId: _t, redeemed: _r, ...data } = b;
  const id = newId('pr');
  await c.env.DB.prepare(`INSERT INTO promotions (id, tenant_id, data) VALUES (?, ?, ?)`)
    .bind(id, c.req.param('tenantId'), JSON.stringify({ ...data, redeemed: 0, createdAt: Date.now() })).run();
  return c.json({ id }, 201);
});
packages.put('/tenants/:tenantId/promotions/:id', async (c) => {
  if (!(await isAdmin(c))) return forbidden(c);
  const b = await body(c);
  if ('redeemed' in b) return bad(c, 'redeemed is server-owned');   // the only writer is assignment
  const { id: _i, tenantId: _t, ...patch } = b;
  await c.env.DB.prepare(`UPDATE promotions SET data = json_patch(data, ?) WHERE id = ? AND tenant_id = ?`)
    .bind(JSON.stringify(patch), c.req.param('id'), c.req.param('tenantId')).run();
  return c.json({ ok: true });
});
packages.delete('/tenants/:tenantId/promotions/:id', async (c) => {
  if (!(await isAdmin(c))) return forbidden(c);
  await c.env.DB.prepare(`DELETE FROM promotions WHERE id = ? AND tenant_id = ?`).bind(c.req.param('id'), c.req.param('tenantId')).run();
  return c.json({ ok: true });
});

// ---- assignment: package + credits + promotion redemption, one batch ----
export function applyPromotion(price: number, p: { kind: string; value: number }) {
  switch (p.kind) {
    case 'percentDiscount': return { finalPrice: Math.max(0, Math.round(price * (1 - p.value / 100))), bonusDays: 0, bonusLessons: 0 };
    case 'amountDiscount': return { finalPrice: Math.max(0, price - p.value), bonusDays: 0, bonusLessons: 0 };
    case 'bonusDays': return { finalPrice: price, bonusDays: p.value, bonusLessons: 0 };
    default: return { finalPrice: price, bonusDays: 0, bonusLessons: p.value };
  }
}

packages.post('/tenants/:tenantId/members/:memberId/packages', async (c) => {
  if (!(await isAdmin(c))) return forbidden(c);
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const b = await body(c);
  const now = Date.now();
  if (b.startsAt !== undefined && !(typeof b.startsAt === 'number' && Number.isSafeInteger(b.startsAt) && b.startsAt > 0)) return bad(c, 'startsAt');
  const startsAt = typeof b.startsAt === 'number' ? b.startsAt : now;
  if (typeof b.packageId !== 'string') return bad(c, 'packageId');
  if (b.paymentId !== undefined && b.paymentId !== null && typeof b.paymentId !== 'string') return bad(c, 'paymentId');
  const paymentId: string | null = typeof b.paymentId === 'string' ? b.paymentId : null;

  const m = await c.env.DB.prepare(`SELECT display_name FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active'`)
    .bind(tenantId, memberId).first<{ display_name: string | null }>();
  if (!m) return c.json({ error: 'member not active' }, 409);
  const pr = await c.env.DB.prepare(`SELECT data FROM gym_packages WHERE id = ? AND tenant_id = ?`).bind(b.packageId, tenantId).first<{ data: string }>();
  if (!pr) return c.json({ error: 'package not found' }, 404);
  const pkg = JSON.parse(pr.data);
  if (pkg.isActive !== true) return c.json({ error: 'package inactive' }, 409);
  // The payment this sale is booked against: a confirmed, non-reversed charge of THIS member in THIS gym.
  // (Re-checked inside the write below: a reversal landing in between must not slip through.)
  if (paymentId && !(await c.env.DB.prepare(`SELECT ${usablePaymentSql('?1', '?2', '?3')} AS ok`).bind(paymentId, tenantId, memberId).first<{ ok: number }>())?.ok) {
    return c.json({ error: 'payment is not a confirmed charge of this member' }, 409);
  }

  let promo: { id: string; name: string; kind: string; value: number } | null = null;
  if (typeof b.promotionId === 'string') {
    const p = await c.env.DB.prepare(`SELECT data FROM promotions WHERE id = ? AND tenant_id = ?`).bind(b.promotionId, tenantId).first<{ data: string }>();
    if (!p) return c.json({ error: 'promotion not found' }, 404);
    const d = JSON.parse(p.data);
    const applies = !d.appliesTo?.length || d.appliesTo.includes(b.packageId);
    if (d.isActive !== true || !applies || (d.startsAt && now < d.startsAt) || (d.endsAt && now > d.endsAt)) return c.json({ error: 'promotion not applicable' }, 409);
    promo = { id: b.promotionId, name: d.name, kind: d.kind, value: d.value };
  }
  const fx = promo ? applyPromotion(pkg.price, promo) : { finalPrice: pkg.price, bonusDays: 0, bonusLessons: 0 };
  const endsAt = pkg.kind === 'membership' ? startsAt + ((pkg.durationDays ?? 0) + fx.bonusDays) * DAY : startsAt + (pkg.lessonValidityDays ?? 0) * DAY;
  const lessonCount = pkg.kind === 'lessons' ? (pkg.lessonCount ?? 0) + fx.bonusLessons : 0;

  const id = newId('mp');
  const row = {
    packageName: pkg.name, kind: pkg.kind, entitlements: pkg.entitlements, ...(pkg.freezePolicy ? { freezePolicy: pkg.freezePolicy } : {}),
    listPrice: pkg.price, ...(promo ? { promotionId: promo.id, promotionName: promo.name, bonusDays: fx.bonusDays, bonusLessons: fx.bonusLessons } : {}),
    frozenDays: 0, freezes: [], memberName: m.display_name ?? '',
  };
  // Everything the sale depends on, re-checked INSIDE the first write that can take effect. With a
  // promotion that is the redemption UPDATE (the package row only exists if it matched, and the
  // redemption must not be spent on a sale that then fails); without one it is the package INSERT.
  // Optimistic lock on the catalog row: the price/terms we computed from must still be the stored ones.
  const gate = (m: string, t: string, pk: string, raw: string, pay: string) =>
    `EXISTS (SELECT 1 FROM memberships WHERE tenant_id = ${t} AND member_id = ${m} AND status = 'active')
     AND EXISTS (SELECT 1 FROM gym_packages WHERE id = ${pk} AND tenant_id = ${t} AND data = ${raw} AND json_extract(data, '$.isActive') = 1)
     AND (${pay} IS NULL OR ${usablePaymentSql(pay, t, m)})`;

  const stmts: D1PreparedStatement[] = [];
  if (promo) {
    stmts.push(c.env.DB.prepare(
      `UPDATE promotions SET data = json_set(data, '$.redeemed', COALESCE(json_extract(data, '$.redeemed'), 0) + 1)
       WHERE id = ?1 AND tenant_id = ?2 AND COALESCE(json_extract(data, '$.redeemed'), 0) < COALESCE(json_extract(data, '$.maxRedemptions'), 1000000000)
         AND ${gate('?3', '?2', '?4', '?5', '?6')}`,
    ).bind(promo.id, tenantId, memberId, b.packageId, pr.data, paymentId));
  }
  stmts.push(c.env.DB.prepare(
    `INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, payment_id, data, assigned_at, assigned_by)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', ?8, ?9, ?10, ?11
     WHERE ${promo ? 'changes() = 1' : gate('?3', '?2', '?4', '?12', '?8')}`,
  ).bind(id, tenantId, memberId, b.packageId, fx.finalPrice, startsAt, endsAt, paymentId, JSON.stringify(row), now, c.get('userId'), ...(promo ? [] : [pr.data])));
  stmts.push(...creditStatements(c.env.DB, { tenantId, memberId, assignmentId: id, pkg, startsAt, endsAt, lessonCount }));
  stmts.push(recountPackage(c.env.DB, tenantId, b.packageId));
  // Firebase resolveRenewalOnAssignment: this sale answers an open renewal request (adjacent pair, keep last).
  stmts.push(...renewalResolution(c.env.DB, { tenantId, memberId, assignmentId: id, packageName: pkg.name, by: c.get('userId'), now }));
  await c.env.DB.batch(stmts);

  const made = await c.env.DB.prepare(`SELECT 1 AS x FROM member_packages WHERE id = ?`).bind(id).first();
  if (made) return c.json({ id, finalPrice: fx.finalPrice, endsAt }, 201);
  // Nothing was written. Say why, from the state that won.
  if (promo) {
    const stillOk = await c.env.DB.prepare(`SELECT ${promoUsableSql('?1', '?2', '?3', '?4')} AS ok`).bind(promo.id, tenantId, now, b.packageId).first<{ ok: number }>();
    if (!stillOk?.ok) return c.json({ error: 'promotion exhausted' }, 409);
  }
  return c.json({ error: 'assignment conflict: member, package or payment changed; retry' }, 409);
});
