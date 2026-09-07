import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { calendarShareFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

/** Deterministic id — a trainer can grant at most one share per viewer. */
export function calendarShareId(tenantId: string, ownerTrainerId: string, viewerTrainerId: string): string {
  return `${tenantId}_${ownerTrainerId}_${viewerTrainerId}`;
}

export async function grantCalendarShare(params: {
  tenantId: string;
  ownerTrainerId: string;
  ownerTrainerName: string;
  viewerTrainerId: string;
}): Promise<void> {
  const id = calendarShareId(params.tenantId, params.ownerTrainerId, params.viewerTrainerId);
  await setDoc(doc(db, 'calendar_shares', id), {
    tenantId: params.tenantId,
    ownerTrainerId: params.ownerTrainerId,
    ownerTrainerName: params.ownerTrainerName,
    viewerTrainerId: params.viewerTrainerId,
    createdAt: serverTimestamp(),
  });
}

export async function revokeCalendarShare(tenantId: string, ownerTrainerId: string, viewerTrainerId: string): Promise<void> {
  await deleteDoc(doc(db, 'calendar_shares', calendarShareId(tenantId, ownerTrainerId, viewerTrainerId)));
}

/** Who I (a trainer) have granted access to — shown on my Profil screen. */
export function watchSharesIGranted(
  tenantId: string,
  ownerTrainerId: string,
  onChange: (shares: ReturnType<typeof calendarShareFromDoc>[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(collection(db, 'calendar_shares'), where('tenantId', '==', tenantId), where('ownerTrainerId', '==', ownerTrainerId));
  return watchQuery('Paylaştığım takvimler', q, (snap) => snap.docs.map(calendarShareFromDoc), onChange, onError);
}

/** Colleagues who have granted ME access — populates the trainer picker on Takvim. */
export function watchSharesGrantedToMe(
  tenantId: string,
  viewerTrainerId: string,
  onChange: (shares: ReturnType<typeof calendarShareFromDoc>[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(collection(db, 'calendar_shares'), where('tenantId', '==', tenantId), where('viewerTrainerId', '==', viewerTrainerId));
  return watchQuery('Bana açılan takvimler', q, (snap) => snap.docs.map(calendarShareFromDoc), onChange, onError);
}
