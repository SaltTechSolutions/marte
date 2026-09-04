import { collection, doc, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { RenewalRequest } from '../types';
import { renewalRequestFromDoc } from './convert';
import { WatchErrorHandler, watchDoc, watchQuery } from './watch';

export function renewalRequestId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/** The member's own request, if any — the home screen shows its state. */
export function watchMyRenewalRequest(
  tenantId: string,
  memberId: string,
  onChange: (req: RenewalRequest | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc('Yenileme talebi', doc(db, 'renewal_requests', renewalRequestId(tenantId, memberId)), renewalRequestFromDoc, onChange, onError);
}

/**
 * `set`, not `add`: a member who asks twice overwrites their own open request
 * instead of stacking a second one. The id pins one request per person.
 */
export async function requestRenewal(params: { tenantId: string; memberId: string; memberName: string; note?: string }): Promise<void> {
  await setDoc(doc(db, 'renewal_requests', renewalRequestId(params.tenantId, params.memberId)), {
    tenantId: params.tenantId,
    memberId: params.memberId,
    memberName: params.memberName,
    status: 'pending',
    ...(params.note?.trim() ? { note: params.note.trim().slice(0, 300) } : {}),
    createdAt: serverTimestamp(),
  });
}

export async function withdrawRenewal(tenantId: string, memberId: string): Promise<void> {
  await updateDoc(doc(db, 'renewal_requests', renewalRequestId(tenantId, memberId)), { status: 'withdrawn' });
}

/** Every open request in the gym — the admin's panel and roster read this. */
export function watchPendingRenewals(
  tenantId: string,
  onChange: (reqs: RenewalRequest[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(collection(db, 'renewal_requests'), where('tenantId', '==', tenantId), where('status', '==', 'pending'));
  return watchQuery('Yenileme talepleri', q, (snap) => snap.docs.map(renewalRequestFromDoc).filter((r): r is RenewalRequest => r !== null), onChange, onError);
}

/** Admin closes a request by hand (e.g. the member renewed at the desk with cash and no package was assigned in-app). */
export async function markRenewalHandled(tenantId: string, memberId: string, adminUid: string): Promise<void> {
  await updateDoc(doc(db, 'renewal_requests', renewalRequestId(tenantId, memberId)), {
    status: 'handled',
    handledAt: serverTimestamp(),
    handledBy: adminUid,
  });
}
