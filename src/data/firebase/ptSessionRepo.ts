import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { PtSession, PtSessionStatus } from '../types';
import { ptSessionFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

export async function createPtSession(params: {
  tenantId: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  memberName: string;
  date: Date;
  durationMinutes: number;
}): Promise<void> {
  const ref = doc(collection(db, 'pt_sessions'));
  await setDoc(ref, {
    tenantId: params.tenantId,
    trainerId: params.trainerId,
    trainerName: params.trainerName,
    memberId: params.memberId,
    memberName: params.memberName,
    date: params.date,
    durationMinutes: params.durationMinutes,
    status: 'scheduled',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** A trainer's own calendar — or, when called by an admin, any trainer's. */
/** A trainer's calendar for one month window. Scoped so the listener doesn't
 * grow with every session the trainer has ever run — the calendar screen only
 * ever renders one month at a time. */
export function watchSessionsForTrainer(
  tenantId: string,
  trainerId: string,
  range: { from: Date; to: Date },
  onChange: (sessions: PtSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'pt_sessions'),
    where('tenantId', '==', tenantId),
    where('trainerId', '==', trainerId),
    where('date', '>=', Timestamp.fromDate(range.from)),
    where('date', '<', Timestamp.fromDate(range.to)),
    orderBy('date', 'asc'),
  );
  return watchQuery('Antrenör takvimi', q, (snap) => snap.docs.map(ptSessionFromDoc), onChange, onError);
}

/**
 * A member's own upcoming PT sessions.
 *
 * Security rules already allowed this (`memberId == request.auth.uid`); there
 * was simply no query for it, so the member had no way to see a booking made
 * for them. `limit` keeps the home card cheap — it only ever shows the next one.
 */
export function watchUpcomingSessionsForMember(
  tenantId: string,
  memberId: string,
  onChange: (sessions: PtSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'pt_sessions'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('date', '>=', Timestamp.fromDate(new Date())),
    orderBy('date', 'asc'),
    limit(3),
  );
  return watchQuery('Randevularım', q, (snap) => snap.docs.map(ptSessionFromDoc), onChange, onError);
}

/**
 * Whether a member has a non-cancelled PT session scheduled today —
 * check-in's ders-paketi path (PKG-3) uses this to decide whether the
 * whole day is open to them or their credit alone isn't enough.
 */
export async function hasSessionToday(tenantId: string, memberId: string, now: Date): Promise<boolean> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const snap = await getDocs(
    query(
      collection(db, 'pt_sessions'),
      where('tenantId', '==', tenantId),
      where('memberId', '==', memberId),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<', Timestamp.fromDate(end)),
    ),
  );
  return snap.docs.some((d) => d.data().status !== 'cancelled');
}

/** Every PT session in the tenant — admin oversight, e.g. to spot an absent trainer's day. */
export function watchSessionsForTenant(
  tenantId: string,
  range: { from: Date; to: Date },
  onChange: (sessions: PtSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'pt_sessions'),
    where('tenantId', '==', tenantId),
    where('date', '>=', Timestamp.fromDate(range.from)),
    where('date', '<', Timestamp.fromDate(range.to)),
    orderBy('date', 'asc'),
  );
  return watchQuery('Salon takvimi', q, (snap) => snap.docs.map(ptSessionFromDoc), onChange, onError);
}

/**
 * Moves a session to a new trainer — used both for a colleague "taking over"
 * (self-service, requires a calendar_share) and for an admin reassigning an
 * absent trainer's session (unconditional). `originalTrainerId` is set once,
 * on the first reassignment, so history survives even multiple hand-offs.
 */
export async function reassignSession(session: PtSession, newTrainerId: string, newTrainerName: string): Promise<void> {
  await updateDoc(doc(db, 'pt_sessions', session.id), {
    trainerId: newTrainerId,
    trainerName: newTrainerName,
    originalTrainerId: session.originalTrainerId ?? session.trainerId,
    updatedAt: serverTimestamp(),
  });
}

export async function setSessionStatus(sessionId: string, status: PtSessionStatus): Promise<void> {
  await updateDoc(doc(db, 'pt_sessions', sessionId), { status, updatedAt: serverTimestamp() });
}
