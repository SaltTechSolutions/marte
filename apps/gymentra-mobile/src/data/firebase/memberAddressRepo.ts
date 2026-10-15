import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { MemberAddress } from '../types';
import { memberAddressFromDoc } from './convert';
import { WatchErrorHandler, watchDoc } from './watch';

export const MEMBER_ADDRESS_MAX = 300;

export function memberAddressId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/**
 * A member's address. Readable by the person and the gym's admins only (a
 * trainer is refused by rule — it is deliberately not on the membership row,
 * which every trainer reads).
 */
export function watchMemberAddress(
  tenantId: string,
  memberId: string,
  onChange: (address: MemberAddress | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc('Üye adresi', doc(db, 'member_addresses', memberAddressId(tenantId, memberId)), memberAddressFromDoc, onChange, onError);
}

/** One read, for an edit form that must not be overwritten by a live listener while typing. */
export async function getMemberAddress(tenantId: string, memberId: string): Promise<MemberAddress | null> {
  const snap = await getDoc(doc(db, 'member_addresses', memberAddressId(tenantId, memberId)));
  return memberAddressFromDoc(snap);
}

/**
 * Written by the person for themself, or by an admin for a member the admin
 * added by hand — the rules decide which. A blank address is deleted rather
 * than stored empty.
 */
export async function setMemberAddress(params: {
  tenantId: string;
  memberId: string;
  address: string;
  updatedBy: string;
}): Promise<void> {
  const ref = doc(db, 'member_addresses', memberAddressId(params.tenantId, params.memberId));
  const address = params.address.trim();
  if (!address) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, {
    tenantId: params.tenantId,
    memberId: params.memberId,
    address: address.slice(0, MEMBER_ADDRESS_MAX),
    updatedBy: params.updatedBy,
    updatedAt: serverTimestamp(),
  });
}
