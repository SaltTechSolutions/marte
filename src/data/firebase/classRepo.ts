import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  orderBy,
  query,
  limit,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

import { ClassSession } from '../types';
import { classSessionFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

/** Live class schedule for a tenant, soonest first. */
export function watchClassesForTenant(
  tenantId: string,
  /** Window to load. The schedule is browsed a month at a time, so an
   * unbounded listener would grow with every session the gym ever ran. */
  range: { from: Date; to: Date },
  onChange: (sessions: ClassSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'classes'),
    where('tenantId', '==', tenantId),
    where('date', '>=', Timestamp.fromDate(range.from)),
    where('date', '<', Timestamp.fromDate(range.to)),
    orderBy('date', 'asc'),
    limit(200),
  );
  return watchQuery('Dersler', q, (snap) => snap.docs.map(classSessionFromDoc), onChange, onError);
}

export async function createClass(params: {
  tenantId: string;
  name: string;
  trainerName: string;
  date: Date;
  durationMinutes: number;
  capacity: number;
}): Promise<void> {
  await addDoc(collection(db, 'classes'), {
    tenantId: params.tenantId,
    name: params.name,
    trainerName: params.trainerName,
    date: params.date,
    durationMinutes: params.durationMinutes,
    capacity: params.capacity,
    bookedUserIds: [],
    waitlistUserIds: [],
    createdAt: serverTimestamp(),
  });
}

/**
 * Books the class if there's room, otherwise joins the waitlist — decided
 * inside a transaction so concurrent bookings can't overrun capacity. Each
 * write only ever touches one array (the security rules require that for
 * self-service updates) and only ever adds the caller's own uid.
 */
export async function bookClass(classId: string, userId: string): Promise<'booked' | 'waitlisted' | 'already-in'> {
  const ref = doc(db, 'classes', classId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data) throw new Error('CLASS_NOT_FOUND');
    const booked: string[] = data.bookedUserIds ?? [];
    const waitlist: string[] = data.waitlistUserIds ?? [];
    if (booked.includes(userId) || waitlist.includes(userId)) return 'already-in';
    if (booked.length < data.capacity) {
      tx.update(ref, { bookedUserIds: arrayUnion(userId) });
      return 'booked';
    }
    tx.update(ref, { waitlistUserIds: arrayUnion(userId) });
    return 'waitlisted';
  });
}

/** Cancels a booking or leaves the waitlist — whichever the member is currently in. */
export async function cancelBooking(classId: string, userId: string): Promise<void> {
  const ref = doc(db, 'classes', classId);
  const snap = await getDoc(ref);
  const data = snap.data();
  if (!data) return;
  if ((data.bookedUserIds ?? []).includes(userId)) {
    await updateDoc(ref, { bookedUserIds: arrayRemove(userId) });
  } else if ((data.waitlistUserIds ?? []).includes(userId)) {
    await updateDoc(ref, { waitlistUserIds: arrayRemove(userId) });
  }
}
