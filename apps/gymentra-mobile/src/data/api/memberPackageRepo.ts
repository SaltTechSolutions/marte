import type { CancellationAccess } from '../firebase/memberPackageRepo';
import type { GymPackage, MemberCredit, MemberEntitlementsCache, MemberPackage, Promotion } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { ApiError, apiGet, apiPost } from './client';
import { selfInternalId, toInternalId } from './membershipIdentity';
import { entitlementsFromDto, entitlementsToCache, memberCreditFromDto, memberPackageFromDto } from './pkgDto';
import { localized, localizePkgError } from './pkgErrors';
import { applyPromotionEffect, memberEntitlementsId } from './pkgPure';
import { inTenantOf, pkgInvalidate, rememberTenant } from './pkgTenant';
import { unavailableWatch, watchPoll } from './pkgWatch';

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

/** Holder (gym + member) of every assignment id we have read, for `getMemberPackage(id)` which carries neither. */
const holders = new Map<string, { tenantId: string; memberId: string }>();

async function fetchPackages(tenantId: string, memberId: string, limit: number): Promise<MemberPackage[]> {
  const internal = await toInternalId(memberId);
  await selfInternalId();   // primes the id translation used when mapping `cancelledBy` etc.
  const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/members/${internal}/packages?limit=${limit}`);
  const list = rows.map((r) => memberPackageFromDto(r, tenantId, memberId));
  list.forEach((p) => {
    rememberTenant('memberPackage', p.id, tenantId);
    holders.set(p.id, { tenantId, memberId });
  });
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
    throw localizePkgError(e);
  }
  pkgInvalidate(tenantId, 'packages', 'credits', 'entitlements', 'promotions', 'renewal');
}

/** One-shot, the ten most recent (newest-ending first): check-in is a single decision point. */
export async function getMemberPackages(tenantId: string, memberId: string): Promise<MemberPackage[]> {
  return fetchPackages(tenantId, memberId, 10);
}

/**
 * GAP(api): the Worker has no `GET /tenants/:t/member-packages/:id`, and this function receives only the id.
 * It works for any assignment this device has already listed (the holder is remembered and the member's
 * list is re-read, so the answer is fresh); for an id it never saw it cannot know the gym or the member.
 */
export async function getMemberPackage(memberPackageId: string): Promise<MemberPackage | null> {
  const holder = holders.get(memberPackageId);
  if (!holder) {
    throw new Error(
      'GAP(api): getMemberPackage(id) needs GET /tenants/:t/member-packages/:id (the Worker only lists a member\'s packages) and this assignment was never listed on this device.',
    );
  }
  const all = await fetchPackages(holder.tenantId, holder.memberId, 200);
  return all.find((p) => p.id === memberPackageId) ?? null;
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
 * GAP(api): the gym-wide list of every member's assignments (reports screen: "whose package runs out this
 * week") has no route; `GET /tenants/:t/members/:m/packages` is per member. Needs
 * `GET /tenants/:t/member-packages?limit=1000` (admin/trainer, newest-ending first, same DTO plus `memberId`).
 */
export function watchTenantMemberPackages(
  _tenantId: string,
  _onChange: (packages: MemberPackage[]) => void,
  onError?: WatchErrorHandler,
) {
  return unavailableWatch('watchTenantMemberPackages needs GET /tenants/:t/member-packages (gym-wide list) which the Worker does not have', onError);
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
      const res = await localized(apiPost<{ resumesAt: string }>(`/tenants/${tenantId}/member-packages/${assignmentId}/freeze`, { days }));
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
      await localized(apiPost(`/tenants/${tenantId}/member-packages/${assignmentId}/cancel`, { reason, access }));
      pkgInvalidate(tenantId, 'packages', 'credits', 'entitlements');
    },
    { adminOnly: true },
  );
}
