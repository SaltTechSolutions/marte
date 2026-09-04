import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { MemberNote } from '../types';
import { memberNoteFromDoc } from './convert';
import { WatchErrorHandler, watchDoc } from './watch';

export const MEMBER_NOTE_MAX = 2000;

export function memberNoteId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/** Staff-only by rule; a member's own screen never calls this. */
export function watchMemberNote(
  tenantId: string,
  memberId: string,
  onChange: (note: MemberNote | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc('Üye notu', doc(db, 'member_notes', memberNoteId(tenantId, memberId)), memberNoteFromDoc, onChange, onError);
}

/** An empty note is deleted rather than stored blank — "no note" should look like no note. */
export async function setMemberNote(params: {
  tenantId: string;
  memberId: string;
  text: string;
  updatedBy: string;
  updatedByName?: string;
}): Promise<void> {
  const ref = doc(db, 'member_notes', memberNoteId(params.tenantId, params.memberId));
  const text = params.text.trim();
  if (!text) {
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, {
    tenantId: params.tenantId,
    memberId: params.memberId,
    text: text.slice(0, MEMBER_NOTE_MAX),
    updatedBy: params.updatedBy,
    ...(params.updatedByName ? { updatedByName: params.updatedByName } : {}),
    updatedAt: serverTimestamp(),
  });
}
