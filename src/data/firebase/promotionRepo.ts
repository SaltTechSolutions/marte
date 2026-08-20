import { addDoc, collection, doc, getDoc, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { Promotion, PromotionKind } from '../types';
import { promotionFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

export interface PromotionDraft {
  name: string;
  kind: PromotionKind;
  value: number;
  appliesTo: string[];
  startsAt: Date;
  endsAt: Date;
  maxRedemptions?: number;
}

export async function createPromotion(tenantId: string, draft: PromotionDraft): Promise<void> {
  await addDoc(collection(db, 'promotions'), {
    tenantId,
    ...draft,
    startsAt: Timestamp.fromDate(draft.startsAt),
    endsAt: Timestamp.fromDate(draft.endsAt),
    redeemed: 0,
    isActive: true,
    createdAt: serverTimestamp(),
  });
}

export async function updatePromotion(promotionId: string, draft: PromotionDraft): Promise<void> {
  await updateDoc(doc(db, 'promotions', promotionId), {
    ...draft,
    startsAt: Timestamp.fromDate(draft.startsAt),
    endsAt: Timestamp.fromDate(draft.endsAt),
  });
}

export async function setPromotionActive(promotionId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, 'promotions', promotionId), { isActive });
}

/** One-shot fetch for the edit form. */
export async function getPromotion(promotionId: string): Promise<Promotion | null> {
  const snap = await getDoc(doc(db, 'promotions', promotionId));
  return snap.exists() ? promotionFromDoc(snap) : null;
}

/** Full list for the admin screen — active and expired alike. */
export function watchPromotionsForTenant(
  tenantId: string,
  onChange: (promotions: Promotion[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(collection(db, 'promotions'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'));
  return watchQuery('Promosyonlar', q, (snap) => snap.docs.map(promotionFromDoc), onChange, onError);
}

/** Whether `promo` can still be applied to `packageId` right now — the same
 *  checks `assignPackageToMember`'s transaction re-verifies server-side. */
export function isPromotionUsable(promo: Promotion, packageId: string, now: Date = new Date()): boolean {
  return (
    promo.isActive &&
    promo.startsAt <= now &&
    promo.endsAt >= now &&
    (promo.appliesTo.length === 0 || promo.appliesTo.includes(packageId)) &&
    (promo.maxRedemptions == null || promo.redeemed < promo.maxRedemptions)
  );
}
