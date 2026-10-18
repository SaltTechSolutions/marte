/**
 * "Current entitlements" of a member (Firestore `member_entitlements`).
 *
 * Firebase kept a one-document cache per member, rebuilt by `syncMemberEntitlements` on every
 * member_packages write, because security rules could not run a query. In D1 there is no cache to
 * drift: the answer is a query over member_packages, so it is exact at read time and needs no
 * trigger. Check-in, group-class booking and PT booking all ask THIS, never their own copy.
 *
 * "Current" = the member's active MEMBERSHIP-kind package that has not ended, the one lasting longest
 * if two overlap (mid-upgrade). `lessons` packages carry no entitlements (they only create credits).
 * The boundary is strict (`ends_at > now`), as in the old rules' `endsAt > request.time`.
 * Like the old cache, `starts_at` is not consulted: a swap with a future effective date grants access
 * from approval (see the decision notes in the lead report).
 */

export type Entitlements = {
  gymAccess: boolean;
  groupClasses?: { unlimited?: boolean; count?: number; periodDays?: number };
  ptLessons?: { count?: number; periodDays?: number };
};

export type CurrentEntitlements = {
  tenantId: string;
  memberId: string;
  /** member_packages.id of the package these rights come from (Firebase cache field `packageId`). */
  packageId: string;
  entitlements: Entitlements;
  endsAt: number;
  updatedAt: number;
};

export async function currentEntitlements(
  db: D1Database, tenantId: string, memberId: string, now: number = Date.now(),
): Promise<CurrentEntitlements | null> {
  const row = await db.prepare(
    `SELECT id, data, ends_at FROM member_packages
     WHERE tenant_id = ? AND member_id = ? AND status = 'active' AND json_extract(data, '$.kind') = 'membership' AND ends_at > ?
     ORDER BY ends_at DESC LIMIT 1`,
  ).bind(tenantId, memberId, now).first<{ id: string; data: string; ends_at: number }>();
  if (!row) return null;
  const data = JSON.parse(row.data) as { entitlements?: Entitlements };
  return { tenantId, memberId, packageId: row.id, entitlements: data.entitlements ?? { gymAccess: false }, endsAt: row.ends_at, updatedAt: now };
}

/** Group classes are bookable without a credit only under the `unlimited` entitlement (rules `canBookGroupClassFor`). */
export const hasUnlimitedGroupClasses = (e: CurrentEntitlements | null) => e?.entitlements.groupClasses?.unlimited === true;

/** Door access: the current membership grants `gymAccess`. */
export const hasGymAccess = (e: CurrentEntitlements | null) => e?.entitlements.gymAccess === true;

/**
 * Same question as an SQL fragment, for use INSIDE a conditional write (so a booking and the entitlement
 * it relies on are checked in one statement). Pass the placeholder text of each value; `extra` is an
 * additional condition on the package row aliased `ep` (default none).
 * Example: entitlementExistsSql({ tenant: '?1', member: '?3', now: '?4' }, `json_extract(ep.data, '$.entitlements.groupClasses.unlimited') = 1`)
 */
export const entitlementExistsSql = (p: { tenant: string; member: string; now: string }, extra = '1 = 1') =>
  `EXISTS (SELECT 1 FROM member_packages ep WHERE ep.tenant_id = ${p.tenant} AND ep.member_id = ${p.member}
     AND ep.status = 'active' AND json_extract(ep.data, '$.kind') = 'membership' AND ep.ends_at > ${p.now} AND ${extra})`;
