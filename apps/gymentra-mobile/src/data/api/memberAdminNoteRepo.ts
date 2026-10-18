import { MemberNote } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { apiGet, apiPut } from './client';
import { toInternalId } from './membershipIdentity';
import { watchPoll } from './membershipWatch';
import { invalidate } from './poll';

/** Same limit as the trainer note; the Worker enforces it too. */
export const MEMBER_ADMIN_NOTE_MAX = 2000;

export function memberAdminNoteId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/**
 * The owner's private note about a member. Admin-only on the Worker (403 for anyone else).
 *
 * GAP(api, minor): the DTO has no `updatedBy`/`updatedByName` (the Firebase doc stored the author's name);
 * `updatedBy` is '' and no name is shown. Nothing on screen reads either for this note.
 */
export function watchMemberAdminNote(
  tenantId: string,
  memberId: string,
  onChange: (note: MemberNote | null) => void,
  onError?: WatchErrorHandler,
) {
  const fetcher = async (): Promise<MemberNote | null> => {
    const r = await apiGet<{ text: string; updatedAt?: number }>(`/tenants/${tenantId}/members/${await toInternalId(memberId)}/admin-note`);
    if (!r.text) return null;
    return { tenantId, memberId, text: r.text, updatedBy: '', updatedAt: new Date(r.updatedAt ?? 0) };
  };
  return watchPoll(`t:${tenantId}:adminnote:${memberId}`, fetcher, onChange, onError);
}

/** An empty note is deleted rather than stored blank: the Worker's PUT with `text: ""` does exactly that. */
export async function setMemberAdminNote(params: {
  tenantId: string;
  memberId: string;
  text: string;
  updatedBy: string;
  updatedByName?: string;
}): Promise<void> {
  const text = params.text.trim().slice(0, MEMBER_ADMIN_NOTE_MAX);
  await apiPut(`/tenants/${params.tenantId}/members/${await toInternalId(params.memberId)}/admin-note`, { text });
  invalidate(`t:${params.tenantId}:adminnote:${params.memberId}`);
}
