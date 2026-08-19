import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { Program, ProgramExercise, ProgramStatus } from '../types';
import { programFromDoc } from './convert';
import { sharedWatch } from './sharedWatch';
import { WatchErrorHandler, watchDoc, watchQuery } from './watch';

/** Mints a random Firestore-style id locally, no network call — used for stable
 * per-exercise ids inside a program's embedded exercises array. */
export function newLocalId(): string {
  return doc(collection(db, 'programs')).id;
}

/**
 * Trainer taps a client → land on a program to edit. Reuses an existing draft
 * or active program for that member instead of spawning duplicates; only
 * creates a fresh draft if the member truly has none yet.
 */
export async function findOrCreateDraftProgram(params: {
  tenantId: string;
  trainerId: string;
  memberId: string;
  memberName: string;
}): Promise<string> {
  const base = [where('tenantId', '==', params.tenantId), where('memberId', '==', params.memberId)];

  const draftSnap = await getDocs(query(collection(db, 'programs'), ...base, where('status', '==', 'draft')));
  if (!draftSnap.empty) return draftSnap.docs[0].id;

  const activeSnap = await getDocs(query(collection(db, 'programs'), ...base, where('status', '==', 'active')));
  if (!activeSnap.empty) return activeSnap.docs[0].id;

  const ref = doc(collection(db, 'programs'));
  await setDoc(ref, {
    tenantId: params.tenantId,
    memberId: params.memberId,
    memberName: params.memberName,
    trainerId: params.trainerId,
    name: `${params.memberName} Programı`,
    status: 'draft',
    exercises: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function watchProgram(
  programId: string,
  onChange: (program: Program | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Program',
    doc(db, 'programs', programId),
    (snap) => (snap.exists() ? programFromDoc(snap) : null),
    onChange,
    onError,
  );
}

/** Whole-array rewrite on every edit — matches the builder screen's own
 * "autosaves on every change" design intent, and embedded arrays don't
 * support granular per-object updates anyway. */
export async function saveProgramExercises(programId: string, exercises: ProgramExercise[]): Promise<void> {
  await updateDoc(doc(db, 'programs', programId), { exercises, updatedAt: serverTimestamp() });
}

export async function setProgramStatus(programId: string, status: ProgramStatus): Promise<void> {
  await updateDoc(doc(db, 'programs', programId), { status, updatedAt: serverTimestamp() });
}

/** Member's own workout tab — their current active program, if any. */
export function watchActiveProgramForMember(
  tenantId: string,
  memberId: string,
  onChange: (program: Program | null) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'programs'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('status', '==', 'active'),
  );
  return watchQuery('Aktif program', q, (snap) => (snap.empty ? null : programFromDoc(snap.docs[0])), onChange, onError);
}

/** Trainer client list — which members currently have an active program. */
export function watchActiveProgramsForTenant(
  tenantId: string,
  onChange: (programs: Program[]) => void,
  onError?: WatchErrorHandler,
) {
  return sharedWatch(
    `activePrograms:${tenantId}`,
    (change, err) => {
      const q = query(collection(db, 'programs'), where('tenantId', '==', tenantId), where('status', '==', 'active'));
      return watchQuery('Aktif programlar', q, (snap) => snap.docs.map(programFromDoc), change, err);
    },
    onChange,
    onError,
  );
}

/** Every program in the gym, drafts included — the trainer's Programlar tab.
 * Sorted client-side by last edit so no composite index is needed. */
export function watchProgramsForTenant(
  tenantId: string,
  onChange: (programs: Program[]) => void,
  onError?: WatchErrorHandler,
) {
  return sharedWatch(
    `programs:${tenantId}`,
    (change, err) => {
      const q = query(collection(db, 'programs'), where('tenantId', '==', tenantId));
      return watchQuery(
        'Programlar',
        q,
        (snap) => snap.docs.map(programFromDoc).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
        change,
        err,
      );
    },
    onChange,
    onError,
  );
}
