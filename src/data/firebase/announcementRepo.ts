import { addDoc, collection, deleteDoc, doc, limit, orderBy, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { Announcement } from '../types';
import { announcementFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 600;
/** How long a post stays on the home screen when the admin sets no date. */
export const ANNOUNCEMENT_DEFAULT_DAYS = 14;

/** Newest first, capped — the home screen shows the top one or two, the admin list a page. */
export function watchAnnouncements(
  tenantId: string,
  onChange: (items: Announcement[]) => void,
  onError?: WatchErrorHandler,
  max = 20,
) {
  const q = query(collection(db, 'announcements'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'), limit(max));
  return watchQuery('Duyurular', q, (snap) => snap.docs.map(announcementFromDoc), onChange, onError);
}

/** Still worth showing: not expired. Filtered on the client so one listener serves both screens. */
export function isLive(a: Announcement, now: Date = new Date()): boolean {
  return !a.expiresAt || a.expiresAt > now;
}

export async function createAnnouncement(params: {
  tenantId: string;
  title: string;
  body: string;
  createdBy: string;
  createdByName?: string;
  expiresInDays?: number;
}): Promise<void> {
  const days = params.expiresInDays ?? ANNOUNCEMENT_DEFAULT_DAYS;
  await addDoc(collection(db, 'announcements'), {
    tenantId: params.tenantId,
    title: params.title.trim().slice(0, ANNOUNCEMENT_TITLE_MAX),
    body: params.body.trim().slice(0, ANNOUNCEMENT_BODY_MAX),
    createdBy: params.createdBy,
    ...(params.createdByName ? { createdByName: params.createdByName } : {}),
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + days * 86400000),
  });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(doc(db, 'announcements', id));
}
