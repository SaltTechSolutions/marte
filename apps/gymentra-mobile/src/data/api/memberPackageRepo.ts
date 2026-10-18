import type { CancellationAccess } from '../firebase/memberPackageRepo';
import type { GymPackage, MemberCredit, MemberEntitlementsCache, MemberPackage, Promotion } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { ApiError, apiGet, apiPost } from './client';
import { selfInternalId, toInternalId } from './membershipIdentity';
import { entitlementsFromDto, entitlementsToCache, memberCreditFromDto, memberPackageFromDto } from './pkgDto';
import { applyPromotionEffect, memberEntitlementsId } from './pkgPure';
import { inTenantOf, pkgInvalidate, rememberTenant } from './pkgTenant';
import { watchPoll } from './pkgWatch';

/**
 * Member packages, credits and entitlements over the Worker.
 *
 * The SERVER owns the money and the dates: `assignPackageToMember` sends only the choices (package,
 * promotion, optional start, optional payment) and the Worker computes final price, bonus days/lessons,
 * end date and the credits (`POST /tenants/:t/members/:m/packages`). `applyPromotionEffect` stays exported
 * for the assign screen's price PREVIEW only.
 */
export { applyPromotionEffect, memberEntitlementsId };

type Raw = Record<string, any>;

async function fetchPackages(tenantId: string, memberId: string, limit: number): Promise<MemberPackage[]> {
  const internal = await toInternalId(memberId);
  await selfInternalId();   // primes the id translation used when mapping `cancelledBy` etc.
  const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/members/${internal}/packages?limit=${limit}`);
  const list = rows.map((r) => memberPackageFromDto(r, tenantId, memberId));
  rememberTenant('memberPackage', list, tenantId);
  return list;
}

async function fetchCredits(tenantId: string, memberId: string, kind: 'ptLesson' | 'groupClass'): Promise<MemberCredit[]> {
  const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/members/${await toInternalId(memberId)}/credits`);
  return rows
    .map((r) => memberCreditFromDto(r, tenantId, memberId))
    .filter((c) => c.kind === kind && c.status === 'active')
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
}

/**
 * Assigns a package: one `member_packages` row plus the credits its entitlements imply, written together by
 * the Worker (and the promotion's redemption counter, atomically). Direct assignment, no member approval,
 * for a first-time or additive grant only; swaps go through `package_change_requests`.
 *
 * `memberName` / `assignedBy` are not sent: the Worker takes both from its own records and the caller's
 * token, so a client cannot claim to be someone else.
 */
export async function assignPackageToMember(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  pkg: GymPackage;
  startsAt: Date;
  assignedBy: string;
  paymentId?: string;
  promotion?: Promotion;
}): Promise<void> {
  const { tenantId, memberId, pkg, startsAt, paymentId, promotion } = params;
  try {
    await apiPost(`/tenants/${tenantId}/members/${await toInternalId(memberId)}/packages`, {
      packageId: pkg.id,
      ...(promotion ? { promotionId: promotion.id } : {}),
      startsAt: startsAt.getTime(),
      ...(paymentId ? { paymentId } : {}),
    });
  } catch (e) {
    // The assign screen branches on this exact message (it has its own Turkish text for it).
    if (e instanceof ApiError && e.apiCode === 'promotion exhausted') throw new Error('PROMOTION_EXHAUSTED');
    throw e;
  }
  pkgInvalidate(tenantId, 'packages', 'credits', 'entitlements', 'promotions', 'renewal');
}

/** One-shot, the ten most recent (newest-ending first): check-in is a single decision point. */
export async function getMemberPackages(tenantId: string, memberId: string): Promise<MemberPackage[]> {
  return fetchPackages(tenantId, memberId, 10);
}

/**
 * One assignment by id (`GET /tenants/:t/member-packages/:id`: the member, gym staff or an approved guardian);
 * null when it does not exist or is not the caller's to see (the Worker answers 404 for both). The id alone does
 * not name the gym, so it comes from `pkgTenant`.
 */
export async function getMemberPackage(memberPackageId: string): Promise<MemberPackage | null> {
  await selfInternalId();
  try {
    return await inTenantOf('memberPackage', memberPackageId, async (tenantId) =>
      memberPackageFromDto(await apiGet<Raw>(`/tenants/${tenantId}/member-packages/${memberPackageId}`), tenantId));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** One-shot version of `watchMemberCredits`. */
export async function getActiveMemberCredits(
  tenantId: string,
  memberId: string,
  kind: 'ptLesson' | 'groupClass',
): Promise<MemberCredit[]> {
  return fetchCredits(tenantId, memberId, kind);
}

/**
 * The member's CURRENT entitlements (`GET …/members/:id/entitlements`): the Worker answers from the live
 * package rows, so unlike the Firebase cache there is nothing to go stale, and a lapsed membership reads as
 * `null` as soon as it ends. `updatedAt` is when this device first saw this exact answer (the Worker stamps
 * every read with "now", which would make every poll look like a change).
 */
export function watchMemberEntitlements(
  tenantId: string,
  memberId: string,
  onChange: (cache: MemberEntitlementsCache | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    `t:${tenantId}:entitlements:${memberId}`,
    async () => {
      const raw = await apiGet<Raw | null>(`/tenants/${tenantId}/members/${await toInternalId(memberId)}/entitlements`);
      return raw ? entitlementsFromDto(raw) : null;
    },
    (dto) => onChange(dto ? entitlementsToCache(dto, memberId, new Date()) : null),
    onError,
  );
}

/** One member's package history — newest-ending first. */
export function watchMemberPackages(
  tenantId: string,
  memberId: string,
  onChange: (packages: MemberPackage[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(`t:${tenantId}:packages:member:${memberId}`, () => fetchPackages(tenantId, memberId, 200), onChange, onError);
}

/**
 * Every assignment in the gym, latest-ending first (`GET /tenants/:t/member-packages`, staff only) - the reporting
 * screen's source. Deliberately unfiltered by `status`: a package that ended in July can still read `active`
 * until the daily sweep, and the caller compares `endsAt`. Capped at 1000 like the Firebase listener.
 */
export function watchTenantMemberPackages(
  tenantId: string,
  onChange: (packages: MemberPackage[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    `t:${tenantId}:packages:all`,
    async () => {
      await selfInternalId();
      const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/member-packages?limit=1000`);
      const list = rows.map((r) => memberPackageFromDto(r, tenantId));
      rememberTenant('memberPackage', list, tenantId);
      return list;
    },
    onChange,
    onError,
  );
}

/** One member's active quota balances of a kind, soonest-expiring first. */
export function watchMemberCredits(
  tenantId: string,
  memberId: string,
  kind: 'ptLesson' | 'groupClass',
  onChange: (credits: MemberCredit[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(`t:${tenantId}:credits:${memberId}:${kind}`, () => fetchCredits(tenantId, memberId, kind), onChange, onError);
}

/**
 * Pauses a membership. The Worker moves `endsAt` and every live credit's expiry by the frozen span and
 * refuses (with the limit in the message) when the package's own quota or minimum length says no.
 * Only the assignment id is known here, so the gym comes from `pkgTenant`.
 */
export async function freezeMemberPackage(assignmentId: string, days: number): Promise<{ resumesAt: Date }> {
  return inTenantOf(
    'memberPackage',
    assignmentId,
    async (tenantId) => {
      const res = await apiPost<{ resumesAt: string }>(`/tenants/${tenantId}/member-packages/${assignmentId}/freeze`, { days });
      pkgInvalidate(tenantId, 'packages', 'credits', 'entitlements');
      return { resumesAt: new Date(res.resumesAt) };
    },
    { adminOnly: true },
  );
}

/**
 * Ends an assignment: `'immediate'` shuts access and revokes the quota (refused while PT appointments paid
 * from it are still ahead), `'until-end'` keeps the member in until `endsAt` and only stops renewal.
 */
export async function cancelPackageAssignment(assignmentId: string, reason: string, access: CancellationAccess): Promise<void> {
  await inTenantOf(
    'memberPackage',
    assignmentId,
    async (tenantId) => {
      await apiPost(`/tenants/${tenantId}/member-packages/${assignmentId}/cancel`, { reason, access });
      pkgInvalidate(tenantId, 'packages', 'credits', 'entitlements');
    },
    { adminOnly: true },
  );
}
