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
  deleteDoc,
  deleteField,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { getFunctions, httpsCallable } from 'firebase/functions';

import { app, db } from '@/services/firebase';

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
  /** Omitted only when the gym has not added its trainers yet and the name
   *  was typed by hand — see `ClassSession.trainerId`. */
  trainerId?: string;
  trainerName: string;
  date: Date;
  durationMinutes: number;
  capacity: number;
}): Promise<void> {
  await addDoc(collection(db, 'classes'), {
    tenantId: params.tenantId,
    name: params.name,
    ...(params.trainerId ? { trainerId: params.trainerId } : {}),
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
 * Edits a class the gym already published — the time moves, the coach
 * changes, the room shrinks.
 *
 * Rules have always allowed a tenant admin to do this; there was simply no
 * client function, so a class typed in wrong stayed wrong forever while
 * members kept booking it.
 *
 * `bookedUserIds`/`waitlistUserIds` are deliberately NOT editable here: who
 * is in a class is the members' doing, and rewriting those arrays wholesale
 * would silently drop bookings made between read and write.
 */
export async function updateClass(
  classId: string,
  changes: {
    name?: string;
    trainerId?: string;
    trainerName?: string;
    date?: Date;
    durationMinutes?: number;
    capacity?: number;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) patch.name = changes.name.trim();
  if (changes.trainerId !== undefined) patch.trainerId = changes.trainerId;
  if (changes.trainerName !== undefined) patch.trainerName = changes.trainerName.trim();
  if (changes.date !== undefined) patch.date = changes.date;
  if (changes.durationMinutes !== undefined) patch.durationMinutes = changes.durationMinutes;
  if (changes.capacity !== undefined) patch.capacity = changes.capacity;
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, 'classes', classId), patch);
}

/**
 * Cancels a class outright.
 *
 * A hard delete rather than a `cancelled` flag, matching what the rules
 * already permit. The people who had booked it lose the row from their
 * schedule — see the caller, which warns about that count before asking.
 */
export async function deleteClass(classId: string): Promise<void> {
  await deleteDoc(doc(db, 'classes', classId));
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

/**
 * The group classes this member is booked into, from now on (MEMBER-3).
 *
 * `array-contains` on the booking list rather than a separate bookings
 * collection: the uid lists already live on the class doc because that is
 * what makes the single-uid-toggle booking rule expressible, and a parallel
 * collection would be a second source of truth to keep in step.
 */
export function watchMyUpcomingClasses(
  tenantId: string,
  userId: string,
  onChange: (classes: ClassSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'classes'),
    where('tenantId', '==', tenantId),
    where('bookedUserIds', 'array-contains', userId),
    where('date', '>=', Timestamp.fromDate(new Date())),
    orderBy('date', 'asc'),
    limit(30),
  );
  return watchQuery('Rezervasyonlarım', q, (snap) => snap.docs.map(classSessionFromDoc), onChange, onError);
}

/**
 * The classes one coach runs, in a window (PER-8).
 *
 * Needs `trainerId` — the whole reason the field exists. Before it, "benim
 * derslerim" could only be answered by loading every class in the gym and
 * string-matching a free-text name.
 */
export function watchClassesForTrainer(
  tenantId: string,
  trainerId: string,
  range: { from: Date; to: Date },
  onChange: (sessions: ClassSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'classes'),
    where('tenantId', '==', tenantId),
    where('trainerId', '==', trainerId),
    where('date', '>=', Timestamp.fromDate(range.from)),
    where('date', '<', Timestamp.fromDate(range.to)),
    orderBy('date', 'asc'),
    limit(200),
  );
  return watchQuery('Derslerim', q, (snap) => snap.docs.map(classSessionFromDoc), onChange, onError);
}

/**
 * Marks one person present or absent, or clears the mark.
 *
 * Clearing writes `deleteField()` rather than a third state: "nobody took the
 * register" and "they did not come" have to stay tellable apart, and a report
 * that treats an unmarked class as a room full of absentees would be lying
 * about every class nobody remembered to mark.
 */
export async function setClassAttendance(
  classId: string,
  userId: string,
  value: 'present' | 'absent' | null,
): Promise<void> {
  await updateDoc(doc(db, 'classes', classId), {
    [`attendance.${userId}`]: value === null ? deleteField() : value,
  });
}

// Functions are deployed to europe-west1, same as the rest of the project.
const functions = getFunctions(app, 'europe-west1');

export type GroupBookingResult = 'booked' | 'waitlisted' | 'already-booked' | 'already-waitlisted';

/**
 * Books a place using a QUOTA'd group-class allowance (PER-9).
 *
 * Goes through a callable because spending a credit and taking the place have
 * to happen together, and rules cannot do arithmetic — the same reason
 * `bookPtSessions` exists. Members with an unlimited entitlement keep the
 * existing direct write in `bookClass`: that path is in production and works,
 * and rerouting it unverified would risk a working flow to tidy a seam.
 */
export async function bookGroupClassWithCredit(
  classId: string,
  memberId?: string,
): Promise<GroupBookingResult> {
  const call = httpsCallable<{ classId: string; memberId?: string }, { status: GroupBookingResult }>(
    functions,
    'bookGroupClass',
  );
  const { data } = await call({ classId, ...(memberId ? { memberId } : {}) });
  return data.status;
}

/** Cancels a quota-paid booking; the server decides whether the credit returns. */
export async function cancelGroupClassWithCredit(
  classId: string,
  memberId?: string,
): Promise<{ refunded: boolean }> {
  const call = httpsCallable<{ classId: string; memberId?: string }, { refunded: boolean }>(
    functions,
    'cancelGroupClassBooking',
  );
  const { data } = await call({ classId, ...(memberId ? { memberId } : {}) });
  return { refunded: data.refunded };
}

/**
 * Creates a weekly repeat of the same class (PER-10 / PKG-9).
 *
 * A gym running twenty classes a week had to enter roughly 240 records to lay
 * out a term, one at a time. `weeks` counts occurrences INCLUDING the first,
 * so 1 is an ordinary single class and the caller needs no special case.
 *
 * One batch, so a term is all-or-nothing: half a series is worse than none —
 * the members see a schedule with holes in it and nobody can tell whether the
 * missing weeks were cancelled or never created. Rules still apply per write,
 * so a trainer cannot batch their way past the ownership check.
 */
export async function createClassSeries(
  params: {
    tenantId: string;
    name: string;
    trainerId?: string;
    trainerName: string;
    date: Date;
    durationMinutes: number;
    capacity: number;
  },
  weeks: number,
): Promise<{ created: number; seriesId?: string }> {
  const count = Math.max(1, Math.floor(weeks));
  if (count === 1) {
    await createClass(params);
    return { created: 1 };
  }

  const seriesId = doc(collection(db, 'classes')).id;
  const batch = writeBatch(db);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(params.date);
    date.setDate(date.getDate() + i * 7);
    batch.set(doc(collection(db, 'classes')), {
      tenantId: params.tenantId,
      name: params.name,
      ...(params.trainerId ? { trainerId: params.trainerId } : {}),
      trainerName: params.trainerName,
      seriesId,
      date,
      durationMinutes: params.durationMinutes,
      capacity: params.capacity,
      bookedUserIds: [],
      waitlistUserIds: [],
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return { created: count, seriesId };
}

/**
 * Cancels the rest of a repeating class, from `fromDate` onward.
 *
 * Deliberately forward-only. Past occurrences already happened — people
 * attended them, and deleting the record of a class that ran would take its
 * attendance with it.
 */
export async function deleteClassSeriesFrom(
  tenantId: string,
  seriesId: string,
  fromDate: Date,
): Promise<{ deleted: number }> {
  const q = query(
    collection(db, 'classes'),
    where('tenantId', '==', tenantId),
    where('seriesId', '==', seriesId),
    where('date', '>=', Timestamp.fromDate(fromDate)),
    limit(200),
  );
  const snap = await getDocs(q);
  if (snap.empty) return { deleted: 0 };
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return { deleted: snap.size };
}
