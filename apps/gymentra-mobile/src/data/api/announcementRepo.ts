import { Announcement } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { apiDelete, apiGet, apiPost } from './client';
import { fetchMe } from './membershipIdentity';
import { watchPoll } from './membershipWatch';
import { invalidate } from './poll';

export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 600;
/** How long a post stays on the home screen when the admin sets no date. */
export const ANNOUNCEMENT_DEFAULT_DAYS = 14;

interface AnnouncementDto {
  id: string;
  title: string;
  body: string | null;
  createdByName?: string | null;
  createdAt: number;
  expiresAt?: number | null;
}

/** `deleteAnnouncement(id)` has no gym in its signature but every Worker route is tenant-scoped: remember where each id was read. */
const tenantOf = new Map<string, string>();

/**
 * Newest first, capped. GAP(api, minor): the Worker lists only announcements that have not expired (and at most
 * 50), where Firestore returned expired ones too and `isLive` filtered them on the client; the admin list
 * therefore no longer shows expired posts. `createdBy` is not in the DTO ('').
 */
export function watchAnnouncements(
  tenantId: string,
  onChange: (items: Announcement[]) => void,
  onError?: WatchErrorHandler,
  max = 20,
) {
  const fetcher = async (): Promise<Announcement[]> => {
    const rows = await apiGet<AnnouncementDto[]>(`/tenants/${tenantId}/announcements`);
    rows.forEach((r) => tenantOf.set(r.id, tenantId));
    return rows.slice(0, max).map((r) => ({
      id: r.id,
      tenantId,
      title: r.title,
      body: r.body ?? '',
      createdBy: '',
      ...(r.createdByName ? { createdByName: r.createdByName } : {}),
      createdAt: new Date(r.createdAt),
      ...(r.expiresAt ? { expiresAt: new Date(r.expiresAt) } : {}),
    }));
  };
  return watchPoll(`t:${tenantId}:announcements:${max}`, fetcher, onChange, onError);
}

/** Still worth showing: not expired. */
export function isLive(a: Announcement, now: Date = new Date()): boolean {
  return !a.expiresAt || a.expiresAt > now;
}

/** `createdBy`/`createdByName` are the signed-in admin on the Worker; they are not sent. */
export async function createAnnouncement(params: {
  tenantId: string;
  title: string;
  body: string;
  createdBy: string;
  createdByName?: string;
  expiresInDays?: number;
}): Promise<void> {
  const days = params.expiresInDays ?? ANNOUNCEMENT_DEFAULT_DAYS;
  const res = await apiPost<{ id: string }>(`/tenants/${params.tenantId}/announcements`, {
    title: params.title.trim().slice(0, ANNOUNCEMENT_TITLE_MAX),
    body: params.body.trim().slice(0, ANNOUNCEMENT_BODY_MAX),
    expiresAt: Date.now() + days * 86_400_000,
  });
  tenantOf.set(res.id, params.tenantId);
  invalidate(`t:${params.tenantId}:announcements`);
}

export async function deleteAnnouncement(id: string): Promise<void> {
  let tenantId = tenantOf.get(id);
  if (!tenantId) {
    // Not read in this session: the only gym this can be is one the caller administers; exactly one is unambiguous.
    const admin = (await fetchMe()).memberships.filter((m) => m.status === 'active' && m.roles.includes('admin'));
    if (admin.length !== 1) throw new Error('deleteAnnouncement: duyurunun salonu bilinmiyor');
    tenantId = admin[0].tenantId;
  }
  await apiDelete(`/tenants/${tenantId}/announcements/${id}`);
  tenantOf.delete(id);
  invalidate(`t:${tenantId}:announcements`);
}
