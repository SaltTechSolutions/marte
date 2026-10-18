import { RenewalRequest } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { apiGet, apiPost } from './client';
import { selfInternalId, toAppId, toInternalId } from './membershipIdentity';
import { watchPoll } from './membershipWatch';
import { invalidate } from './poll';

export function renewalRequestId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

interface RenewalDto {
  id: string;
  memberId: string;
  memberName?: string | null;
  status: RenewalRequest['status'];
  note?: string | null;
  createdAt: number;
  handledAt?: number | null;
}

/** GAP(api, minor): the DTO has no `handledBy` (nothing reads it). */
function map(tenantId: string, r: RenewalDto): RenewalRequest {
  return {
    tenantId,
    memberId: toAppId(r.memberId),
    memberName: r.memberName ?? '',
    status: r.status,
    ...(r.note ? { note: r.note } : {}),
    createdAt: new Date(r.createdAt),
    ...(r.handledAt ? { handledAt: new Date(r.handledAt) } : {}),
  };
}

async function list(tenantId: string): Promise<RenewalDto[]> {
  await selfInternalId();                                   // primes the id translation the mapper uses
  return apiGet<RenewalDto[]>(`/tenants/${tenantId}/renewal-requests`);
}

/** The member's own request, if any — one row per person (the Worker upserts on `{tenant}_{member}`). */
export function watchMyRenewalRequest(
  tenantId: string,
  memberId: string,
  onChange: (req: RenewalRequest | null) => void,
  onError?: WatchErrorHandler,
) {
  const fetcher = async (): Promise<RenewalRequest | null> => {
    const internal = await toInternalId(memberId);
    const mine = (await list(tenantId)).find((r) => r.memberId === internal);
    return mine ? map(tenantId, mine) : null;
  };
  return watchPoll(`t:${tenantId}:renewal:${memberId}`, fetcher, onChange, onError);
}

/**
 * A member who asks twice does not stack requests (one row per person). Unlike Firestore's `set`, asking
 * again while one is still open is refused by the Worker (409, "Zaten bekleyen bir talebin var"), which
 * reaches the screen as the usual error. `memberName` is the signed-in user's name on the Worker, not sent.
 */
export async function requestRenewal(params: { tenantId: string; memberId: string; memberName: string; note?: string }): Promise<void> {
  const note = params.note?.trim().slice(0, 300);
  await apiPost(`/tenants/${params.tenantId}/renewal-request`, note ? { note } : {});
  invalidate(`t:${params.tenantId}:renewal`);
}

export async function withdrawRenewal(tenantId: string, _memberId: string): Promise<void> {
  await apiPost(`/tenants/${tenantId}/renewal-request/withdraw`);
  invalidate(`t:${tenantId}:renewal`);
}

/** Every open request in the gym — the admin's panel and roster read this. */
export function watchPendingRenewals(tenantId: string, onChange: (reqs: RenewalRequest[]) => void, onError?: WatchErrorHandler) {
  const fetcher = async () => (await list(tenantId)).filter((r) => r.status === 'pending').map((r) => map(tenantId, r));
  return watchPoll(`t:${tenantId}:renewal:pending`, fetcher, onChange, onError);
}

/** Admin closes a request by hand. `adminUid` is the signed-in admin on the Worker, not sent. */
export async function markRenewalHandled(tenantId: string, memberId: string, _adminUid: string): Promise<void> {
  const id = renewalRequestId(tenantId, await toInternalId(memberId));
  await apiPost(`/tenants/${tenantId}/renewal-requests/${id}/handle`);
  invalidate(`t:${tenantId}:renewal`);
}
