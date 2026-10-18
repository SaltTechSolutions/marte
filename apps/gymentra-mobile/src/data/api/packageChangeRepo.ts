import type { WatchErrorHandler } from '../firebase/watch';
import type { PackageChangeResponseOutcome } from '../firebase/packageChangeRepo';
import type { GymPackage, MemberPackage, PackageChangeKind, PackageChangeRequest, Promotion } from '../types';
import { ApiError, apiGet, apiPost } from './client';
import { selfInternalId, toInternalId } from './membershipIdentity';
import { packageChangeRequestFromDto } from './pkgDto';
import { localized } from './pkgErrors';
import { computeProratedRefund } from './pkgPure';
import { inTenantOf, knownTenant, pkgInvalidate, rememberTenant } from './pkgTenant';
import { invalidate } from './poll';
import { watchPoll } from './pkgWatch';

/**
 * Package-change offers (PKG-6) over the Worker. The SERVER computes price delta, prorated refund and
 * dates when the request is created (`POST /tenants/:t/package-change-requests`), and applies the swap when
 * the member answers (`…/:id/respond`) - the client sends only the choices. `computeProratedRefund` stays
 * exported (pure) for screens that preview a downgrade.
 */
export { computeProratedRefund };

type Raw = Record<string, any>;

async function fetchRequests(tenantId: string): Promise<PackageChangeRequest[]> {
  await selfInternalId();
  const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/package-change-requests`);
  const list = rows.map((r) => packageChangeRequestFromDto(r, tenantId));
  rememberTenant('changeRequest', list, tenantId);
  return list;
}

/** One request, or null when it does not exist / is not addressed to the caller (the Worker answers 404 for both). */
async function fetchRequest(requestId: string): Promise<PackageChangeRequest | null> {
  try {
    await selfInternalId();
    return await inTenantOf('changeRequest', requestId, async (tenantId) => {
      const row = await apiGet<Raw>(`/tenants/${tenantId}/package-change-requests/${requestId}`);
      return packageChangeRequestFromDto(row, tenantId);
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const refreshed = (tenantId: string) => {
  pkgInvalidate(tenantId, 'pkgchg');
  invalidate('t:?:pkgchg');
};

/**
 * Prepares - but does not apply - a swap for an already-holding member. Only the choices are sent; price,
 * refund, summaries and dates are the Worker's. `memberName`, `createdBy` and the pre-computed numbers of
 * the Firebase version are deliberately not sent.
 */
export async function createPackageChangeRequest(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  kind: PackageChangeKind;
  current?: { assignmentId: string; pkg: MemberPackage };
  proposedPackage: GymPackage;
  proposedPromotion?: Promotion;
  note?: string;
  effectiveInDays?: number;
  /** How long the member has to respond before a scheduled job marks this `expired`. */
  expiresInDays?: number;
  createdBy: string;
}): Promise<void> {
  const { tenantId, memberId, kind, current, proposedPackage, proposedPromotion, note, effectiveInDays = 0, expiresInDays = 3 } = params;
  await localized(
    apiPost(`/tenants/${tenantId}/package-change-requests`, {
      memberId: await toInternalId(memberId),
      kind,
      proposedPackageId: proposedPackage.id,
      ...(current ? { currentPackageAssignmentId: current.assignmentId } : {}),
      ...(proposedPromotion ? { proposedPromotionId: proposedPromotion.id } : {}),
      ...(note ? { note } : {}),
      effectiveInDays,
      expiresInDays,
    }),
  );
  refreshed(tenantId);
}

/** A member's own pending proposals — the card on Bugün/Hesabım. */
export function watchPendingPackageChangeRequests(
  tenantId: string,
  memberId: string,
  onChange: (requests: PackageChangeRequest[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    `t:${tenantId}:pkgchg:pending:${memberId}`,
    async () =>
      (await fetchRequests(tenantId))
        .filter((r) => r.memberId === memberId && r.status === 'pending')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    onChange,
    onError,
  );
}

export function watchPackageChangeRequest(
  requestId: string,
  onChange: (request: PackageChangeRequest | null) => void,
  onError?: WatchErrorHandler,
) {
  // The id alone does not name the gym; once a list or an earlier read has seen it the key carries the gym.
  return watchPoll(`t:${knownTenant('changeRequest', requestId) ?? '?'}:pkgchg:req:${requestId}`, () => fetchRequest(requestId), onChange, onError);
}

export async function getPackageChangeRequest(requestId: string): Promise<PackageChangeRequest | null> {
  return fetchRequest(requestId);
}

/**
 * The member's yes/no. `'promotion-expired'` is a real, distinct outcome - the promotion ran out between
 * the offer and this tap, so the Worker refused the whole swap instead of charging full price; the caller
 * must not present it as "onaylandı". Business refusals (already answered, expired offer ...) arrive as
 * ApiError with a Turkish message.
 */
export async function respondToPackageChangeRequest(requestId: string, approve: boolean): Promise<PackageChangeResponseOutcome> {
  return inTenantOf('changeRequest', requestId, async (tenantId) => {
    const res = await localized(apiPost<{ status: PackageChangeResponseOutcome }>(`/tenants/${tenantId}/package-change-requests/${requestId}/respond`, { approve }));
    // An approval replaces a holding, moves credits and entitlements and may book a refund row.
    pkgInvalidate(tenantId, 'pkgchg', 'packages', 'credits', 'entitlements', 'promotions', 'payments', 'renewal');
    invalidate('t:?:pkgchg');
    return res.status;
  });
}

/** Admin withdraws an offer before the member has responded to it. */
export async function cancelPackageChangeRequest(requestId: string): Promise<void> {
  await inTenantOf(
    'changeRequest',
    requestId,
    async (tenantId) => {
      await localized(apiPost(`/tenants/${tenantId}/package-change-requests/${requestId}/cancel`));
      refreshed(tenantId);
    },
    { adminOnly: true },
  );
}
