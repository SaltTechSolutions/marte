/** Shared helpers for the package lifecycle routes and jobs. */

export const DAY = 86_400_000;
/** Europe/Istanbul has had no DST since 2016: a fixed UTC+3 is exact for every date we will see. */
export const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

export const newId = (p: string) => p + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Midnight (Istanbul) at the start of the Istanbul day containing `ms`, as a UTC instant. */
export const istanbulDayStart = (ms: number) => Math.floor((ms + ISTANBUL_OFFSET_MS) / DAY) * DAY - ISTANBUL_OFFSET_MS;

/** dd.mm.yyyy in Istanbul time (what `toLocaleDateString('tr-TR')` gave in the Firebase push texts). */
export function trDate(ms: number): string {
  const d = new Date(ms + ISTANBUL_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/**
 * Outbox row that only exists when `guardSql` holds, so a side effect can never outlive a state change
 * that did not happen. `guardSql` must use plain positional `?` placeholders (`guardArgs`, in order).
 * Same row shape and INSERT OR IGNORE dedupe as `outboxStatement` in outbox.ts.
 *
 * Push payload: { userIds, title, body, category, data? } (see outbox.ts).
 */
export function guardedOutbox(
  db: D1Database,
  kind: 'push' | 'email',
  payload: Record<string, unknown>,
  dedupeKey: string | null,
  guardSql: string,
  guardArgs: unknown[],
  now = Date.now(),
): D1PreparedStatement {
  return db.prepare(
    `INSERT OR IGNORE INTO outbox (id, kind, payload, dedupe_key, next_attempt_at, created_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE ${guardSql}`,
  ).bind(newId('ob'), kind, JSON.stringify(payload), dedupeKey, now, now, ...guardArgs);
}

/** Push payload for `category: 'packages'`, the one every package notification uses. */
export const pkgPush = (userIds: string[], title: string, body: string, screen: 'member/index' | 'admin/members') =>
  ({ userIds, title, body, category: 'packages', data: { screen } });

/** Users.id of every ACTIVE admin of a gym (Firebase `notifyTenantAdmins`). */
export async function activeAdminIds(db: D1Database, tenantId: string): Promise<string[]> {
  const { results } = await db.prepare(
    `SELECT member_id FROM memberships WHERE tenant_id = ? AND status = 'active'
       AND EXISTS (SELECT 1 FROM json_each(memberships.roles) WHERE value = 'admin')`,
  ).bind(tenantId).all<{ member_id: string }>();
  return results.map((r) => r.member_id);
}

/**
 * Recomputes gym_packages.active_assignment_count (Firebase `syncPackageAssignmentCount`): 'active' and
 * 'frozen' assignments are "in use", 'expired' / 'cancelled' free the slot. A recount is idempotent, so it
 * is safe to put in any batch that can move an assignment in or out of use.
 */
export const recountPackage = (db: D1Database, tenantId: string, packageId: string) =>
  db.prepare(
    `UPDATE gym_packages SET active_assignment_count =
       (SELECT count(*) FROM member_packages WHERE tenant_id = ?1 AND package_id = ?2 AND status IN ('active','frozen'))
     WHERE id = ?2 AND tenant_id = ?1`,
  ).bind(tenantId, packageId);

/**
 * Firebase `resolveRenewalOnAssignment`: a NEW member_packages row answers the member's open renewal
 * request and tells them so. Returns an ADJACENT pair: the outbox row relies on `changes()` of the UPDATE
 * right before it, so nothing may be inserted between the two.
 */
export function renewalResolution(db: D1Database, p: { tenantId: string; memberId: string; assignmentId: string; packageName: string; by: string | null; now: number }) {
  return [
    db.prepare(
      `UPDATE renewal_requests SET status = 'handled', handled_at = ?, handled_by = ?
       WHERE tenant_id = ? AND member_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM member_packages WHERE id = ?)`,
    ).bind(p.now, p.by ?? 'system', p.tenantId, p.memberId, p.assignmentId),
    guardedOutbox(
      db, 'push',
      pkgPush([p.memberId], 'Paketin yenilendi', `${p.packageName} paketin tanımlandı. Yenileme talebin kapatıldı.`, 'member/index'),
      `renewal-handled:${p.assignmentId}`, 'changes() = 1', [], p.now,
    ),
  ];
}

/**
 * SQL (positional-free: pass the placeholder TEXT for each value, e.g. '?3' or ':x') that is true when a promotion
 * can be redeemed right now: active, inside its window, under its cap, and (when `pkg` is given) valid for that package.
 */
export const promoUsableSql = (id: string, tenant: string, now: string, pkg?: string) =>
  `EXISTS (SELECT 1 FROM promotions pr WHERE pr.id = ${id} AND pr.tenant_id = ${tenant}
     AND json_extract(pr.data, '$.isActive') = 1
     AND (json_extract(pr.data, '$.startsAt') IS NULL OR json_extract(pr.data, '$.startsAt') <= ${now})
     AND (json_extract(pr.data, '$.endsAt') IS NULL OR json_extract(pr.data, '$.endsAt') >= ${now})
     AND COALESCE(json_extract(pr.data, '$.redeemed'), 0) < COALESCE(json_extract(pr.data, '$.maxRedemptions'), 1000000000)
     ${pkg ? `AND (COALESCE(json_array_length(json_extract(pr.data, '$.appliesTo')), 0) = 0
        OR EXISTS (SELECT 1 FROM json_each(pr.data, '$.appliesTo') WHERE value = ${pkg}))` : ''})`;

/** A confirmed, non-reversed charge of this member in this gym (payments.data.kind is absent on pre-PKG-6 rows = charge). */
export const usablePaymentSql = (id: string, tenant: string, member: string) =>
  `EXISTS (SELECT 1 FROM payments pay WHERE pay.id = ${id} AND pay.tenant_id = ${tenant} AND pay.member_id = ${member}
     AND pay.status = 'confirmed' AND COALESCE(json_extract(pay.data, '$.kind'), 'charge') = 'charge'
     AND json_extract(pay.data, '$.reversedAt') IS NULL)`;

/** Splits a list into chunks (D1 allows 100 bound parameters per statement). */
export function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * Credits an assignment creates (identical for a direct sale and for an approved package change):
 *  - lessons package: one 'purchase' PT credit (count + bonus lessons), valid until the package ends;
 *  - membership package: a periodic 'entitlement' credit per quota the package carries (group classes
 *    unless unlimited, PT lessons), each valid for its own period.
 * Every INSERT only lands if the member_packages row `assignmentId` exists, so it follows the
 * package insert and can never create credits for an assignment that was not written.
 */
export function creditStatements(
  db: D1Database,
  p: { tenantId: string; memberId: string; assignmentId: string; pkg: Record<string, any>; startsAt: number; endsAt: number; lessonCount: number },
): D1PreparedStatement[] {
  const credit = (kind: string, source: string, total: number, expiresAt: number) =>
    db.prepare(
      `INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
       SELECT ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'active' WHERE EXISTS (SELECT 1 FROM member_packages WHERE id = ?)`,
    ).bind(newId('cr'), p.tenantId, p.memberId, kind, source, p.assignmentId, total, p.startsAt, expiresAt, p.assignmentId);
  const out: D1PreparedStatement[] = [];
  if (p.pkg.kind === 'lessons' && p.lessonCount > 0) out.push(credit('ptLesson', 'purchase', p.lessonCount, p.endsAt));
  if (p.pkg.kind === 'membership') {
    const gc = p.pkg.entitlements?.groupClasses, pt = p.pkg.entitlements?.ptLessons;
    if (gc && !gc.unlimited && gc.count && gc.periodDays) out.push(credit('groupClass', 'entitlement', gc.count, p.startsAt + gc.periodDays * DAY));
    if (pt?.count && pt.periodDays) out.push(credit('ptLesson', 'entitlement', pt.count, p.startsAt + pt.periodDays * DAY));
  }
  return out;
}
