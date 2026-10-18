import { Hono } from 'hono';

import { rolesIn } from './auth';
import { currentEntitlements } from './entitlements';
import { applyPromotion } from './packages';
import {
  activeAdminIds, creditStatements, DAY, guardedOutbox, newId, pkgPush, promoUsableSql, recountPackage, renewalResolution, trDate,
} from './pkgSupport';
import type { Env, Vars } from './types';

/**
 * Package lifecycle (F3): change requests (PKG-6), cancel (ADMIN-4) and freeze (PKG-10).
 * Mounted by the lead under /v1. Conventions as in packages.ts / writes2.ts: role gate at the route,
 * every invariant repeated INSIDE the write, one db.batch() per logical change, side effects as outbox
 * rows in the SAME batch, 4xx on bad input.
 *
 * Batches here gate their dependent statements on a one-shot token written by the FIRST statement
 * (the "gate"): if the gate matched zero rows the token is absent and every later statement is a
 * no-op, so the batch cannot half-commit. The token is removed again by the last statement.
 */
type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const packageLifecycle = new Hono<App>();

const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');
const rolesOf = (c: Ctx) => rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
const body = async (c: Ctx) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, any>;
const bad = (c: Ctx, m: string) => c.json({ error: m }, 400);
const forbidden = (c: Ctx) => c.json({ error: 'forbidden' }, 403);
const conflict = (c: Ctx, code: string, error: string, extra: Record<string, unknown> = {}) => c.json({ error, code, ...extra }, 409);
const parse = (s: string) => JSON.parse(s) as Record<string, any>;

const KINDS = ['upgrade', 'downgrade', 'promotion', 'addon'];
const memberActive = (m: string, t: string) => `EXISTS (SELECT 1 FROM memberships WHERE tenant_id = ${t} AND member_id = ${m} AND status = 'active')`;

// ---- current entitlements (Firestore member_entitlements) ----

/** Readable by the member and by staff (rules). No package = 200 with null, never a permission error. */
packageLifecycle.get('/tenants/:tenantId/members/:memberId/entitlements', async (c) => {
  const r = await rolesOf(c);
  const uid = c.get('userId');
  if (!(isStaff(r) || (uid && uid === c.req.param('memberId') && r.length))) return forbidden(c);
  return c.json(await currentEntitlements(c.env.DB, c.req.param('tenantId')!, c.req.param('memberId')!, Date.now()));
});

// ---- package change requests (PKG-6) ----

/**
 * Prorated refund on a downgrade: the unused part of what was paid for the current holding, as of the
 * moment the swap takes effect. Same arithmetic as the app's computeProratedRefund; the SERVER owns it
 * now, so an admin client cannot invent a refund.
 */
export function computeProratedRefund(current: { finalPrice: number; startsAt: number; endsAt: number }, newFinalPrice: number, effectiveAt: number) {
  const totalDays = Math.max(1, Math.round((current.endsAt - current.startsAt) / DAY));
  const remainingDays = Math.max(0, Math.round((current.endsAt - effectiveAt) / DAY));
  return {
    refundAmount: Math.round((current.finalPrice - newFinalPrice) * (remainingDays / totalDays)),
    refundBasis: `kalan ${remainingDays}/${totalDays} gün`,
  };
}

const requestDto = (r: any) => ({
  ...parse(r.data), id: r.id, memberId: r.member_id, status: r.status, effectiveAt: r.effective_at, expiresAt: r.expires_at,
  appliedAt: r.applied_at, createdBy: r.created_by, createdAt: r.created_at, respondedAt: r.responded_at,
});
// One-shot token (see header): written by the gate UPDATE, read by every dependent statement.
const TOKEN_GUARD = `EXISTS (SELECT 1 FROM package_change_requests WHERE id = ? AND json_extract(data, '$.applyToken') = ?)`;

/**
 * Admin proposes a swap/addition. The request is only a proposal: nothing touches member_packages
 * until the member answers. Body: { memberId, kind, proposedPackageId, currentPackageAssignmentId?,
 * proposedPromotionId?, note?, effectiveInDays? (0..365, default 0), expiresInDays? (1..30, default 3) }.
 * Prices, summaries, refund and dates are computed here from the catalog, never taken from the client.
 */
packageLifecycle.post('/tenants/:tenantId/package-change-requests', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  if (!uid || !(await rolesOf(c)).includes('admin')) return forbidden(c);
  const b = await body(c);
  if (b.createdBy !== undefined && b.createdBy !== uid) return forbidden(c);   // "only as themselves"
  if (typeof b.memberId !== 'string' || !b.memberId) return bad(c, 'memberId');
  if (!KINDS.includes(b.kind)) return bad(c, 'kind');
  if (typeof b.proposedPackageId !== 'string') return bad(c, 'proposedPackageId');
  for (const k of ['currentPackageAssignmentId', 'proposedPromotionId']) if (b[k] !== undefined && b[k] !== null && typeof b[k] !== 'string') return bad(c, k);
  if (b.note !== undefined && (typeof b.note !== 'string' || b.note.length > 500)) return bad(c, 'note');
  const effectiveInDays = b.effectiveInDays ?? 0, expiresInDays = b.expiresInDays ?? 3;
  if (!Number.isInteger(effectiveInDays) || effectiveInDays < 0 || effectiveInDays > 365) return bad(c, 'effectiveInDays');
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) return bad(c, 'expiresInDays');
  const curId: string | null = b.currentPackageAssignmentId ?? null;
  const promoId: string | null = b.proposedPromotionId ?? null;

  const db = c.env.DB;
  const now = Date.now();
  const member = await db.prepare(`SELECT display_name FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active'`)
    .bind(tenantId, b.memberId).first<{ display_name: string | null }>();
  if (!member) return conflict(c, 'member-not-active', 'member not active');
  const pr = await db.prepare(`SELECT data FROM gym_packages WHERE id = ? AND tenant_id = ?`).bind(b.proposedPackageId, tenantId).first<{ data: string }>();
  if (!pr) return c.json({ error: 'package not found' }, 404);
  const pkg = parse(pr.data);
  if (pkg.isActive !== true) return conflict(c, 'package-inactive', 'package inactive');

  let current: { packageName: string; entitlements: unknown; finalPrice: number; startsAt: number; endsAt: number } | null = null;
  if (curId) {
    const cur = await db.prepare(`SELECT final_price, starts_at, ends_at, data FROM member_packages WHERE id = ? AND tenant_id = ? AND member_id = ? AND status = 'active'`)
      .bind(curId, tenantId, b.memberId).first<any>();
    if (!cur) return conflict(c, 'current-not-active', 'current assignment is not an active package of this member');
    const d = parse(cur.data);
    current = { packageName: d.packageName, entitlements: d.entitlements, finalPrice: cur.final_price, startsAt: cur.starts_at, endsAt: cur.ends_at };
  }
  let promo: { name: string; kind: string; value: number } | null = null;
  if (promoId) {
    const p = await db.prepare(`SELECT data, ${promoUsableSql('?1', '?2', '?3', '?4')} AS ok FROM promotions WHERE id = ?1 AND tenant_id = ?2`)
      .bind(promoId, tenantId, now, b.proposedPackageId).first<{ data: string; ok: number }>();
    if (!p) return c.json({ error: 'promotion not found' }, 404);
    if (!p.ok) return conflict(c, 'promotion-not-applicable', 'promotion not applicable');
    promo = parse(p.data) as { name: string; kind: string; value: number };
  }

  const effectiveAt = now + effectiveInDays * DAY;
  const fx = promo ? applyPromotion(pkg.price, promo) : { finalPrice: pkg.price, bonusDays: 0, bonusLessons: 0 };
  const proposedEndsAt = pkg.kind === 'membership'
    ? effectiveAt + ((pkg.durationDays ?? 0) + fx.bonusDays) * DAY
    : effectiveAt + (pkg.lessonValidityDays ?? 0) * DAY;
  const priceDelta = fx.finalPrice - (current?.finalPrice ?? 0);
  const refund = current && priceDelta < 0 ? computeProratedRefund(current, fx.finalPrice, effectiveAt) : null;

  const id = newId('pcr');
  const data = {
    memberName: member.display_name ?? '', kind: b.kind,
    ...(current && curId ? { currentPackageAssignmentId: curId, currentSummary: { packageName: current.packageName, entitlements: current.entitlements, price: current.finalPrice, endsAt: current.endsAt } } : {}),
    proposedPackageId: b.proposedPackageId, ...(promoId ? { proposedPromotionId: promoId } : {}),
    proposedSummary: { packageName: pkg.name, entitlements: pkg.entitlements, price: fx.finalPrice, endsAt: proposedEndsAt },
    priceDelta, ...(refund && refund.refundAmount > 0 ? refund : {}), ...(b.note ? { note: b.note } : {}),
  };
  await db.batch([
    db.prepare(
      `INSERT INTO package_change_requests (id, tenant_id, member_id, data, effective_at, expires_at, status, created_by, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8
       WHERE ${memberActive('?3', '?2')}
         AND EXISTS (SELECT 1 FROM gym_packages WHERE id = ?9 AND tenant_id = ?2 AND data = ?10 AND json_extract(data, '$.isActive') = 1)
         AND (?11 IS NULL OR EXISTS (SELECT 1 FROM member_packages WHERE id = ?11 AND tenant_id = ?2 AND member_id = ?3 AND status = 'active'))
         AND (?12 IS NULL OR (${promoUsableSql('?12', '?2', '?8', '?9')}
              AND EXISTS (SELECT 1 FROM promotions WHERE id = ?12 AND json_extract(data, '$.kind') = ?13 AND json_extract(data, '$.value') = ?14)))`,
    ).bind(id, tenantId, b.memberId, JSON.stringify(data), effectiveAt, now + expiresInDays * DAY, uid, now,
      b.proposedPackageId, pr.data, curId, promoId, promo?.kind ?? null, promo?.value ?? null),
    // Firebase notifyOnPackageChangeRequested
    guardedOutbox(db, 'push',
      pkgPush([b.memberId], 'Paket teklifin var', `${pkg.name ?? 'Yeni paket'} için bir teklif bekliyor.`, 'member/index'),
      `pkgchg-new:${id}`, 'EXISTS (SELECT 1 FROM package_change_requests WHERE id = ?)', [id], now),
  ]);
  const made = await db.prepare(`SELECT 1 AS x FROM package_change_requests WHERE id = ?`).bind(id).first();
  if (!made) return conflict(c, 'state-changed', 'member, package, current assignment or promotion changed; retry');
  return c.json({ id, priceDelta, ...(refund && refund.refundAmount > 0 ? refund : {}), finalPrice: fx.finalPrice, effectiveAt, expiresAt: now + expiresInDays * DAY }, 201);
});

/** One request: the member it is addressed to, or staff. */
packageLifecycle.get('/tenants/:tenantId/package-change-requests/:id', async (c) => {
  const r = await rolesOf(c);
  if (!r.length) return forbidden(c);
  const row = await c.env.DB.prepare(`SELECT * FROM package_change_requests WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), c.req.param('tenantId')).first<any>();
  if (!row || !(isStaff(r) || row.member_id === c.get('userId'))) return c.json({ error: 'not found' }, 404);
  return c.json(requestDto(row));
});

/** Admin withdraws an offer the member has not answered yet. Any admin of the gym (rules), not only its creator. */
packageLifecycle.post('/tenants/:tenantId/package-change-requests/:id/cancel', async (c) => {
  if (!(await rolesOf(c)).includes('admin')) return forbidden(c);
  const tenantId = c.req.param('tenantId')!, id = c.req.param('id')!;
  const won = await c.env.DB.prepare(`UPDATE package_change_requests SET status = 'cancelled' WHERE id = ? AND tenant_id = ? AND status = 'pending' RETURNING id`)
    .bind(id, tenantId).first();
  if (won) return c.json({ status: 'cancelled' });
  const row = await c.env.DB.prepare(`SELECT status FROM package_change_requests WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<{ status: string }>();
  return row ? conflict(c, 'already-answered', 'request is no longer pending', { status: row.status }) : c.json({ error: 'not found' }, 404);
});

/**
 * The member's yes/no (Firebase approvePackageChange). Body: { approve: boolean }.
 * 200 { status: 'rejected' } | { status: 'approved', packageId } | { status: 'promotion-expired' }.
 * 'promotion-expired' is a real outcome, not a success: the promotion the member agreed to ran out, the
 * whole swap is refused (never silently at full price) and the request is closed as expired.
 * Approval applies the swap in ONE batch: cancel the replaced holding and its credits, mint the new
 * holding + credits, redeem the promotion, book the refund, close the renewal request, queue the push.
 */
packageLifecycle.post('/tenants/:tenantId/package-change-requests/:id/respond', async (c) => {
  const tenantId = c.req.param('tenantId')!, reqId = c.req.param('id')!;
  const uid = c.get('userId');
  const b = await body(c);
  if (typeof b.approve !== 'boolean') return bad(c, 'approve');
  const db = c.env.DB;
  const row = await db.prepare(`SELECT * FROM package_change_requests WHERE id = ? AND tenant_id = ?`).bind(reqId, tenantId).first<any>();
  // Missing and "not yours" look the same: another member learns nothing about the request.
  if (!row || !uid || row.member_id !== uid) return c.json({ error: 'not found' }, 404);
  if (!(await rolesOf(c)).length) return forbidden(c);
  if (row.status !== 'pending') return conflict(c, 'already-answered', 'request is no longer pending', { status: row.status });
  const req = parse(row.data);
  const now = Date.now();
  const admins = await activeAdminIds(db, tenantId);
  const notify = [...new Set([...admins, row.created_by].filter(Boolean))] as string[];
  const label = `${req.memberName || 'Bir üye'} · ${req.proposedSummary?.packageName ?? 'paket değişikliği'}`;
  const answered = () => db.prepare(`SELECT status FROM package_change_requests WHERE id = ?`).bind(reqId).first<{ status: string }>();

  // ---- reject ----
  if (!b.approve) {
    await db.batch([
      db.prepare(`UPDATE package_change_requests SET status = 'rejected', responded_at = ? WHERE id = ? AND tenant_id = ? AND member_id = ? AND status = 'pending'`)
        .bind(now, reqId, tenantId, uid),
      guardedOutbox(db, 'push', pkgPush(notify, 'Paket teklifi reddedildi', label, 'admin/members'), `pkgchg-resp:${reqId}`,
        `EXISTS (SELECT 1 FROM package_change_requests WHERE id = ? AND status = 'rejected' AND responded_at = ?)`, [reqId, now], now),
    ]);
    const after = await answered();
    return after?.status === 'rejected' ? c.json({ status: 'rejected' }) : conflict(c, 'already-answered', 'request is no longer pending', { status: after?.status });
  }

  // ---- approve ----
  if (row.expires_at <= now) {
    await db.prepare(`UPDATE package_change_requests SET status = 'expired' WHERE id = ? AND status = 'pending' AND expires_at <= ?`).bind(reqId, now).run();
    return conflict(c, 'expired', 'offer expired');
  }
  const pr = await db.prepare(`SELECT data FROM gym_packages WHERE id = ? AND tenant_id = ?`).bind(req.proposedPackageId, tenantId).first<{ data: string }>();
  if (!pr) return conflict(c, 'package-gone', 'proposed package no longer exists');
  const pkg = parse(pr.data);

  let cur: { package_id: string } | null = null;
  if (req.currentPackageAssignmentId) {
    cur = await db.prepare(`SELECT package_id FROM member_packages WHERE id = ? AND tenant_id = ? AND member_id = ? AND status = 'active'`)
      .bind(req.currentPackageAssignmentId, tenantId, uid).first<{ package_id: string }>();
    // Another approval already replaced it, or it ended: approving on top would mint a second active holding.
    if (!cur) return conflict(c, 'current-not-active', 'the package to replace is no longer active');
  }

  let promo: Record<string, any> | null = null;
  if (req.proposedPromotionId) {
    const p = await db.prepare(`SELECT data, ${promoUsableSql('?1', '?2', '?3', '?4')} AS ok FROM promotions WHERE id = ?1 AND tenant_id = ?2`)
      .bind(req.proposedPromotionId, tenantId, now, req.proposedPackageId).first<{ data: string; ok: number }>();
    if (!p || !p.ok) {
      await db.batch([
        db.prepare(
          `UPDATE package_change_requests SET status = 'expired', responded_at = ?1 WHERE id = ?2 AND tenant_id = ?3 AND member_id = ?4 AND status = 'pending'
             AND NOT (${promoUsableSql('?5', '?3', '?1', '?6')})`,
        ).bind(now, reqId, tenantId, uid, req.proposedPromotionId, req.proposedPackageId),
        guardedOutbox(db, 'push',
          pkgPush([row.created_by], 'Promosyon süresi doldu',
            `${req.memberName || 'Üye'} teklifi onaylamak istedi ama bağlı promosyonun süresi bu arada doldu. Teklifi güncel fiyatla yenile.`, 'admin/members'),
          `pkgchg-promo-expired:${reqId}`, `EXISTS (SELECT 1 FROM package_change_requests WHERE id = ? AND status = 'expired' AND responded_at = ?)`, [reqId, now], now),
      ]);
      const after = await answered();
      return after?.status === 'expired' ? c.json({ status: 'promotion-expired' }) : conflict(c, 'state-changed', 'promotion changed; retry');
    }
    promo = parse(p.data);
  }

  const effectiveAt: number = row.effective_at;
  const fx = promo ? applyPromotion(pkg.price, promo as { kind: string; value: number }) : { finalPrice: pkg.price, bonusDays: 0, bonusLessons: 0 };
  const endsAt = pkg.kind === 'membership' ? effectiveAt + ((pkg.durationDays ?? 0) + fx.bonusDays) * DAY : effectiveAt + (pkg.lessonValidityDays ?? 0) * DAY;
  const lessonCount = pkg.kind === 'lessons' ? (pkg.lessonCount ?? 0) + fx.bonusLessons : 0;
  const newPkgId = newId('mp');
  const token = newId('tk');
  const g = [reqId, token];   // args of TOKEN_GUARD
  const refund = Number.isInteger(req.refundAmount) && req.refundAmount > 0 ? (req.refundAmount as number) : 0;
  const assignment = {
    memberName: req.memberName ?? '', packageName: pkg.name, kind: pkg.kind, entitlements: pkg.entitlements,
    ...(pkg.freezePolicy ? { freezePolicy: pkg.freezePolicy } : {}), listPrice: pkg.price,
    ...(promo ? { promotionId: req.proposedPromotionId, promotionName: promo.name, bonusDays: fx.bonusDays, bonusLessons: fx.bonusLessons } : {}),
    frozenDays: 0, freezes: [], changeRequestId: reqId,
  };

  const stmts: D1PreparedStatement[] = [
    // gate: every precondition again, in the statement that flips the request. Zero rows = nothing else happens.
    db.prepare(
      `UPDATE package_change_requests SET status = 'approved', responded_at = ?4, applied_at = ?4, data = json_set(data, '$.applyToken', ?5)
       WHERE id = ?1 AND tenant_id = ?2 AND member_id = ?3 AND status = 'pending' AND expires_at > ?4
         AND ${memberActive('?3', '?2')}
         AND EXISTS (SELECT 1 FROM gym_packages WHERE id = ?6 AND tenant_id = ?2 AND data = ?7)
         AND (?8 IS NULL OR EXISTS (SELECT 1 FROM member_packages WHERE id = ?8 AND tenant_id = ?2 AND member_id = ?3 AND status = 'active'))
         AND (?9 IS NULL OR (${promoUsableSql('?9', '?2', '?4', '?6')}
              AND EXISTS (SELECT 1 FROM promotions WHERE id = ?9 AND json_extract(data, '$.kind') = ?10 AND json_extract(data, '$.value') = ?11)))`,
    ).bind(reqId, tenantId, uid, now, token, req.proposedPackageId, pr.data, req.currentPackageAssignmentId ?? null,
      req.proposedPromotionId ?? null, promo?.kind ?? null, promo?.value ?? null),
  ];
  if (cur) {
    stmts.push(
      db.prepare(
        `UPDATE member_packages SET status = 'cancelled', frozen_until = NULL,
           data = json_set(data, '$.cancelledAt', ?, '$.cancelledBy', ?, '$.cancellationReason', 'package-change', '$.cancellationAccess', 'immediate', '$.changeRequestId', ?)
         WHERE id = ? AND tenant_id = ? AND status = 'active' AND ${TOKEN_GUARD}`,
      ).bind(now, uid, reqId, req.currentPackageAssignmentId, tenantId, ...g),
      // The replaced holding's credits must not survive next to the new ones (a member could spend both).
      db.prepare(`UPDATE member_credits SET status = 'cancelled' WHERE source_package_id = ? AND tenant_id = ? AND status IN ('active','exhausted') AND ${TOKEN_GUARD}`)
        .bind(req.currentPackageAssignmentId, tenantId, ...g),
    );
  }
  stmts.push(
    db.prepare(
      `INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, payment_id, data, assigned_at, assigned_by)
       SELECT ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ? WHERE ${TOKEN_GUARD}`,
    ).bind(newPkgId, tenantId, uid, req.proposedPackageId, fx.finalPrice, effectiveAt, endsAt, JSON.stringify(assignment), now, row.created_by, ...g),
    ...creditStatements(db, { tenantId, memberId: uid, assignmentId: newPkgId, pkg, startsAt: effectiveAt, endsAt, lessonCount }),
  );
  if (promo) {
    stmts.push(db.prepare(
      `UPDATE promotions SET data = json_set(data, '$.redeemed', COALESCE(json_extract(data, '$.redeemed'), 0) + 1)
       WHERE id = ? AND tenant_id = ? AND COALESCE(json_extract(data, '$.redeemed'), 0) < COALESCE(json_extract(data, '$.maxRedemptions'), 1000000000) AND ${TOKEN_GUARD}`,
    ).bind(req.proposedPromotionId, tenantId, ...g));
  }
  if (cur) stmts.push(recountPackage(db, tenantId, cur.package_id));
  stmts.push(recountPackage(db, tenantId, req.proposedPackageId));
  if (refund) {
    // The amount the member saw at approval time, not a recomputation: they agreed to a specific figure.
    stmts.push(db.prepare(
      `INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) SELECT ?, ?, ?, ?, 'confirmed', ?, ? WHERE ${TOKEN_GUARD}`,
    ).bind(newId('pay'), tenantId, uid, refund, JSON.stringify({
      method: 'cash', kind: 'refund', memberName: req.memberName ?? '', confirmedAt: now, packageChangeRequestId: reqId,
      note: `${req.currentSummary?.packageName ?? 'eski paket'} → ${pkg.name} geçişi (${req.refundBasis ?? ''})`,
    }), now, ...g));
  }
  // Firebase resolveRenewalOnAssignment fires on ANY new member_packages row. Adjacent pair; nothing between.
  stmts.push(...renewalResolution(db, { tenantId, memberId: uid, assignmentId: newPkgId, packageName: pkg.name, by: row.created_by, now }));
  if (admins.length) stmts.push(guardedOutbox(db, 'push', pkgPush(admins, 'Paket teklifi kabul edildi', label, 'admin/members'), `pkgchg-resp:${reqId}`, TOKEN_GUARD, g, now));
  stmts.push(
    db.prepare(`UPDATE package_change_requests SET data = json_remove(data, '$.applyToken') WHERE id = ? AND json_extract(data, '$.applyToken') = ?`).bind(...g),
  );
  await db.batch(stmts);

  const made = await db.prepare(`SELECT 1 AS x FROM member_packages WHERE id = ?`).bind(newPkgId).first();
  if (made) return c.json({ status: 'approved', packageId: newPkgId });
  const after = await answered();
  return after?.status !== 'pending'
    ? conflict(c, 'already-answered', 'request is no longer pending', { status: after?.status })
    : conflict(c, 'state-changed', 'package, promotion or current assignment changed; retry');
});

// ---- cancel an assignment (ADMIN-4) ----

/**
 * Admin undoes an assignment made by mistake, or ends it at its natural end.
 * Body: { reason: string, access?: 'immediate' (default) | 'until-end' }.
 *  - immediate: status 'cancelled', ends_at pulled back to now (never extended), credits revoked (spent
 *    credits keep `used`). Refused (409 blocking-sessions) while PT appointments paid from this package
 *    are still scheduled in the future: silently cancelling someone's appointments is worse than making
 *    the admin do it deliberately.
 *  - until-end: the member paid for a period and keeps it. Status stays 'active' (one question - "does this
 *    grant access now" - one answer); cancelledAt/cancellationAccess record the decision. Only renewal stops.
 * The assignment row is never deleted: history shows it happened and was taken back.
 */
packageLifecycle.post('/tenants/:tenantId/member-packages/:id/cancel', async (c) => {
  const tenantId = c.req.param('tenantId')!, id = c.req.param('id')!;
  const uid = c.get('userId');
  if (!uid || !(await rolesOf(c)).includes('admin')) return forbidden(c);
  const b = await body(c);
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (!reason || reason.length > 500) return bad(c, 'reason');
  const access = b.access ?? 'immediate';
  if (access !== 'immediate' && access !== 'until-end') return bad(c, 'access');
  const db = c.env.DB;
  const row = await db.prepare(`SELECT member_id, package_id, status, ends_at, data FROM member_packages WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<any>();
  if (!row) return c.json({ error: 'not found' }, 404);
  const data = parse(row.data);
  if (row.status === 'cancelled') return conflict(c, 'already-cancelled', 'assignment already cancelled');
  if (access === 'until-end' && !(['active', 'frozen'].includes(row.status) && data.cancelledAt == null)) {
    return conflict(c, 'not-endable', 'assignment already ended or already marked to end');
  }
  const now = Date.now();
  const blockingSql = `NOT EXISTS (SELECT 1 FROM pt_sessions s WHERE s.tenant_id = ?2 AND s.status <> 'cancelled' AND s.starts_at >= ?3
       AND s.credit_id IN (SELECT mc.id FROM member_credits mc WHERE mc.source_package_id = ?1 AND mc.tenant_id = ?2))`;
  if (access === 'immediate') {
    const n = await db.prepare(
      `SELECT count(*) AS n FROM pt_sessions s WHERE s.tenant_id = ?2 AND s.status <> 'cancelled' AND s.starts_at >= ?3
         AND s.credit_id IN (SELECT mc.id FROM member_credits mc WHERE mc.source_package_id = ?1 AND mc.tenant_id = ?2)`,
    ).bind(id, tenantId, now).first<{ n: number }>();
    if (n && n.n > 0) return conflict(c, 'blocking-sessions', `${n.n} upcoming appointment(s) are booked on this package; cancel them first`, { blocking: n.n });
  }
  const revokable = (await db.prepare(`SELECT count(*) AS n FROM member_credits WHERE source_package_id = ? AND tenant_id = ? AND status IN ('active','exhausted')`)
    .bind(id, tenantId).first<{ n: number }>())?.n ?? 0;

  const token = newId('tk');
  const note = { cancelledAt: now, cancelledBy: uid, cancellationReason: reason, cancellationAccess: access };
  const guard = `EXISTS (SELECT 1 FROM member_packages WHERE id = ? AND json_extract(data, '$.cancelToken') = ?)`;
  const stmts: D1PreparedStatement[] = [
    access === 'immediate'
      ? db.prepare(
        `UPDATE member_packages SET status = 'cancelled', ends_at = MIN(ends_at, ?3), frozen_until = NULL,
           data = json_set(data, '$.cancelledAt', ?3, '$.cancelledBy', ?4, '$.cancellationReason', ?5, '$.cancellationAccess', 'immediate', '$.cancelToken', ?6)
         WHERE id = ?1 AND tenant_id = ?2 AND status <> 'cancelled' AND ${blockingSql}`,
      ).bind(id, tenantId, now, uid, reason, token)
      : db.prepare(
        `UPDATE member_packages SET data = json_set(data, '$.cancelledAt', ?3, '$.cancelledBy', ?4, '$.cancellationReason', ?5, '$.cancellationAccess', 'until-end', '$.cancelToken', ?6)
         WHERE id = ?1 AND tenant_id = ?2 AND status IN ('active','frozen') AND json_extract(data, '$.cancelledAt') IS NULL`,
      ).bind(id, tenantId, now, uid, reason, token),
  ];
  if (access === 'immediate') {
    // Only live credits change state; already expired/cancelled ones keep their own history.
    stmts.push(db.prepare(`UPDATE member_credits SET status = 'revoked' WHERE source_package_id = ? AND tenant_id = ? AND status IN ('active','exhausted') AND ${guard}`).bind(id, tenantId, id, token));
  }
  stmts.push(recountPackage(db, tenantId, row.package_id));
  const title = access === 'immediate' ? 'Paketin geri alındı' : 'Paketin yenilenmeyecek';
  const text = access === 'immediate'
    ? `${data.packageName} paketin salon tarafından geri alındı. Gerekçe: ${reason}`
    : `${data.packageName} paketin ${trDate(row.ends_at)} tarihinde bitecek ve yenilenmeyecek. O güne kadar salonu kullanmaya devam edebilirsin.`;
  stmts.push(
    guardedOutbox(db, 'push', pkgPush([row.member_id], title, text, 'member/index'), `pkg-cancel:${id}:${access}`, guard, [id, token], now),
    db.prepare(`UPDATE member_packages SET data = json_remove(data, '$.cancelToken') WHERE id = ? AND json_extract(data, '$.cancelToken') = ?`).bind(id, token),
  );
  await db.batch(stmts);

  const after = await db.prepare(`SELECT status, data FROM member_packages WHERE id = ?`).bind(id).first<any>();
  const ad = after ? parse(after.data) : {};
  if (ad.cancelledAt === now && ad.cancelledBy === uid && ad.cancellationAccess === access) return c.json({ revokedCredits: access === 'immediate' ? revokable : 0 });
  // The gate matched nothing: someone else changed it (cancelled, or a booking landed). Say which.
  if (after?.status === 'cancelled') return conflict(c, 'already-cancelled', 'assignment already cancelled');
  if (access === 'immediate') return conflict(c, 'blocking-sessions', 'an appointment was booked on this package meanwhile; cancel it first');
  return conflict(c, 'not-endable', 'assignment already ended or already marked to end');
});

// ---- freeze (PKG-10) ----

/**
 * Admin pauses a membership for `days` (1..365), starting now. Not a discount, not a refund: the member
 * keeps the days they paid for, they just move. ends_at and every live credit's expiry shift by exactly
 * the frozen span, so freezing never costs the periodic lessons already banked. Quota and minimum length
 * come from the freezePolicy COPIED onto the assignment at sale time (a gym tightening its policy later
 * must not shorten what this member bought). The daily sweep un-freezes when the span has passed.
 */
packageLifecycle.post('/tenants/:tenantId/member-packages/:id/freeze', async (c) => {
  const tenantId = c.req.param('tenantId')!, id = c.req.param('id')!;
  const uid = c.get('userId');
  if (!uid || !(await rolesOf(c)).includes('admin')) return forbidden(c);
  const days = (await body(c)).days;
  if (!Number.isInteger(days) || days <= 0) return bad(c, 'days');
  if (days > 365) return bad(c, 'days (max 365)');
  const db = c.env.DB;
  const row = await db.prepare(`SELECT member_id, status, ends_at, data FROM member_packages WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).first<any>();
  if (!row) return c.json({ error: 'not found' }, 404);
  const now = Date.now();
  const blocked = freezeBlock(row, days, now);
  if (blocked) return conflict(c, blocked[0], blocked[1]);

  const data = parse(row.data);
  const shift = days * DAY;
  const resumesAt = now + shift;
  const used = (data.freezes ?? []).length;
  const freeze = { startsAt: now, endsAt: resumesAt, days, createdBy: uid, createdAt: now };
  const shifted = (await db.prepare(`SELECT count(*) AS n FROM member_credits WHERE source_package_id = ? AND tenant_id = ? AND status IN ('active','exhausted')`)
    .bind(id, tenantId).first<{ n: number }>())?.n ?? 0;
  const token = newId('tk');
  const guard = `EXISTS (SELECT 1 FROM member_packages WHERE id = ? AND json_extract(data, '$.freezeToken') = ?)`;
  await db.batch([
    // gate: the same policy checks again, atomically with the state flip.
    db.prepare(
      `UPDATE member_packages SET status = 'frozen', ends_at = ends_at + ?4, frozen_until = ?3 + ?4,
         data = json_set(data, '$.frozenDays', COALESCE(json_extract(data, '$.frozenDays'), 0) + ?5,
           '$.freezes', json(json_insert(COALESCE(json_extract(data, '$.freezes'), '[]'), '$[#]', json(?6))), '$.freezeToken', ?7)
       WHERE id = ?1 AND tenant_id = ?2 AND status = 'active' AND json_extract(data, '$.kind') = 'membership'
         AND json_extract(data, '$.cancelledAt') IS NULL AND json_extract(data, '$.freezePolicy') IS NOT NULL
         AND COALESCE(json_array_length(json_extract(data, '$.freezes')), 0) < COALESCE(json_extract(data, '$.freezePolicy.maxCount'), 0)
         AND ?5 >= COALESCE(json_extract(data, '$.freezePolicy.minDays'), 0)
         AND ends_at > ?3`,
    ).bind(id, tenantId, now, shift, days, JSON.stringify(freeze), token),
    // Credits move with the package (live ones only; expired / revoked credits keep their history).
    db.prepare(`UPDATE member_credits SET expires_at = expires_at + ? WHERE source_package_id = ? AND tenant_id = ? AND status IN ('active','exhausted') AND ${guard}`)
      .bind(shift, id, tenantId, id, token),
    guardedOutbox(db, 'push',
      pkgPush([row.member_id], 'Üyeliğin donduruldu', `${data.packageName} paketin ${trDate(resumesAt)} tarihine kadar duraklatıldı. Bitiş tarihin ${days} gün ileri alındı.`, 'member/index'),
      `pkg-freeze:${id}:${used + 1}`, guard, [id, token], now),
    db.prepare(`UPDATE member_packages SET data = json_remove(data, '$.freezeToken') WHERE id = ? AND json_extract(data, '$.freezeToken') = ?`).bind(id, token),
  ]);

  const after = await db.prepare(`SELECT status, frozen_until, data FROM member_packages WHERE id = ?`).bind(id).first<any>();
  const frozen = after && after.status === 'frozen' && after.frozen_until === resumesAt && (parse(after.data).freezes ?? []).length === used + 1;
  if (frozen) return c.json({ resumesAt: new Date(resumesAt).toISOString(), shiftedCredits: shifted });
  const fresh = after ? freezeBlock({ ...after, ends_at: row.ends_at }, days, now) : null;
  return fresh ? conflict(c, fresh[0], fresh[1]) : conflict(c, 'state-changed', 'assignment changed; retry');
});

/** First reason a freeze is not allowed, as [code, message]; null when it is. Mirrors the gate in the UPDATE. */
function freezeBlock(row: { status: string; ends_at: number; data: string }, days: number, now: number): [string, string] | null {
  const d = parse(row.data);
  if (d.kind !== 'membership') return ['not-membership', 'only a membership package can be frozen'];
  if (row.status === 'frozen') return ['already-frozen', 'package is already frozen'];
  if (row.status !== 'active') return ['not-active', 'only an active package can be frozen'];
  if (d.cancelledAt != null) return ['cancelled', 'an ended package cannot be frozen'];
  const policy = d.freezePolicy as { minDays?: number; maxCount?: number } | undefined;
  if (!policy) return ['no-freeze-right', 'this package has no freeze right'];
  if ((d.freezes ?? []).length >= (policy.maxCount ?? 0)) return ['freeze-quota', `freeze quota used up (${policy.maxCount ?? 0} times)`];
  if (days < (policy.minDays ?? 0)) return ['min-days', `a freeze must be at least ${policy.minDays} days`];
  if (row.ends_at <= now) return ['expired', 'an expired package cannot be frozen'];
  return null;
}
