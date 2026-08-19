import { addDoc, collection, limit, orderBy, query, serverTimestamp, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { measurementFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

export async function addMeasurement(params: {
  tenantId: string;
  memberId: string;
  weightKg: number;
  chestCm?: number;
  waistCm?: number;
  armCm?: number;
}): Promise<void> {
  await addDoc(collection(db, 'measurements'), {
    tenantId: params.tenantId,
    memberId: params.memberId,
    weightKg: params.weightKg,
    ...(params.chestCm != null ? { chestCm: params.chestCm } : {}),
    ...(params.waistCm != null ? { waistCm: params.waistCm } : {}),
    ...(params.armCm != null ? { armCm: params.armCm } : {}),
    recordedAt: serverTimestamp(),
  });
}

/** Newest-first history — Gelişim screen reads [0] as "current", the rest for the trend chart. */
export function watchMeasurements(
  tenantId: string,
  memberId: string,
  onChange: (entries: ReturnType<typeof measurementFromDoc>[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'measurements'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    orderBy('recordedAt', 'desc'),
    limit(100),
  );
  return watchQuery('Ölçümler', q, (snap) => snap.docs.map(measurementFromDoc), onChange, onError);
}
