import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { MemberNote } from '../types';
import { memberNoteFromDoc } from './convert';
import { WatchErrorHandler, watchDoc } from './watch';

/** Same limit as the trainer note; the rules enforce it too. */
export const MEMBER_ADMIN_NOTE_MAX = 2000;

export function memberAdminNoteId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/**
 * The owner's private note about a member. Admin-only by rule — a trainer or
 * the member themself is refused — so only the admin's detail screen calls it.
 * Lives in the gym's own collection, so it never follows the person to another
 * gym. Same shape as the trainer note, hence the shared converter.
 */
export function watchMemberAdminNote(
  tenantId: string,
  memberId: string,
  onChange: (note: MemberNote | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Yönetici notu',
    doc(db, 'member_admin_notes', memberAdminNoteId(tenantId, memberId)),
    memberNoteFromDoc,
    onChange,
    onError,
  );
}

/** An empty note is deleted rather than stored blank, like the trainer note. */
export async function setMemberAdminNote(params: {
  tenantId: string;
  memberId: string;
  text: string;
  updatedBy: string;
  updatedByName?: string;
}): Promise<void> {
  const ref = doc(db, 'member_admin_notes', memberAdminNoteId(params.tenantId, params.memberId));
  const text = params.text.trim();
  if (!text) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, {
    tenantId: params.tenantId,
    memberId: params.memberId,
    text: text.slice(0, MEMBER_ADMIN_NOTE_MAX),
    updatedBy: params.updatedBy,
    ...(params.updatedByName ? { updatedByName: params.updatedByName } : {}),
    updatedAt: serverTimestamp(),
  });
}
