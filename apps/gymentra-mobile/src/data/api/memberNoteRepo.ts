import { MemberNote } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { apiDelete, apiGet, apiPut } from './client';
import { toInternalId } from './membershipIdentity';
import { watchPoll } from './membershipWatch';
import { invalidate } from './poll';

export const MEMBER_NOTE_MAX = 2000;

export function memberNoteId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/**
 * Staff-only (the Worker answers 403 to anyone else). "No note" is `null`, as a missing Firestore doc was.
 *
 * GAP(api, minor): the note DTO has no `updatedBy`; it is '' here. No screen reads it (only `updatedByName`).
 */
export function watchMemberNote(
  tenantId: string,
  memberId: string,
  onChange: (note: MemberNote | null) => void,
  onError?: WatchErrorHandler,
) {
  const fetcher = async (): Promise<MemberNote | null> => {
    const r = await apiGet<{ text: string; updatedByName?: string | null; updatedAt?: number }>(
      `/tenants/${tenantId}/members/${await toInternalId(memberId)}/note`,
    );
    if (!r.text) return null;
    return {
      tenantId,
      memberId,
      text: r.text,
      updatedBy: '',
      ...(r.updatedByName ? { updatedByName: r.updatedByName } : {}),
      updatedAt: new Date(r.updatedAt ?? 0),
    };
  };
  return watchPoll(`t:${tenantId}:note:${memberId}`, fetcher, onChange, onError);
}

/**
 * An empty note is deleted rather than stored blank. The author and their display name are taken from the
 * signed-in user on the Worker, so `updatedBy`/`updatedByName` in the params are not sent.
 */
export async function setMemberNote(params: {
  tenantId: string;
  memberId: string;
  text: string;
  updatedBy: string;
  updatedByName?: string;
}): Promise<void> {
  const path = `/tenants/${params.tenantId}/members/${await toInternalId(params.memberId)}/note`;
  const text = params.text.trim();
  if (!text) await apiDelete(path);
  else await apiPut(path, { text: text.slice(0, MEMBER_NOTE_MAX) });
  invalidate(`t:${params.tenantId}:note:${params.memberId}`);
}
