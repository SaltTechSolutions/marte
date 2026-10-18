import { MemberAddress } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { apiDelete, apiGet, apiPut } from './client';
import { toInternalId } from './membershipIdentity';
import { watchPoll } from './membershipWatch';
import { invalidate } from './poll';

export const MEMBER_ADDRESS_MAX = 300;

export function memberAddressId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/**
 * GAP(api, minor): the address DTO is `{ address }` only. `updatedBy` is '' and `updatedAt` is epoch 0;
 * no screen reads either. No address at all is `null`, as a missing Firestore doc was.
 */
async function fetchAddress(tenantId: string, memberId: string): Promise<MemberAddress | null> {
  const r = await apiGet<{ address: string }>(`/tenants/${tenantId}/members/${await toInternalId(memberId)}/address`);
  return r.address ? { tenantId, memberId, address: r.address, updatedBy: '', updatedAt: new Date(0) } : null;
}

/** Readable by the person and the gym's admins only (403 otherwise). */
export function watchMemberAddress(
  tenantId: string,
  memberId: string,
  onChange: (address: MemberAddress | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(`t:${tenantId}:address:${memberId}`, () => fetchAddress(tenantId, memberId), onChange, onError);
}

/** One read, for an edit form that must not be overwritten by a live poll while typing. */
export function getMemberAddress(tenantId: string, memberId: string): Promise<MemberAddress | null> {
  return fetchAddress(tenantId, memberId);
}

/**
 * Written by the person for themself, or by an admin for a member the admin added by hand — the Worker
 * decides which. A blank address is deleted rather than stored empty. `updatedBy` is the signed-in user
 * on the Worker, so it is not sent.
 */
export async function setMemberAddress(params: {
  tenantId: string;
  memberId: string;
  address: string;
  updatedBy: string;
}): Promise<void> {
  const path = `/tenants/${params.tenantId}/members/${await toInternalId(params.memberId)}/address`;
  const address = params.address.trim();
  if (!address) await apiDelete(path);
  else await apiPut(path, { address: address.slice(0, MEMBER_ADDRESS_MAX) });
  invalidate(`t:${params.tenantId}:address:${params.memberId}`);
}
