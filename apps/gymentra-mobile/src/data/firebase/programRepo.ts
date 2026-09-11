import { collection, deleteField, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { Program, ProgramDay, ProgramExercise, ProgramStatus } from '../types';
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
/**
 * Çok günlü programı kaydeder (PER-17).
 *
 * `days`'in yanına ilk günün egzersizleri `exercises`'a da yazılıyor: eski
 * sürümdeki bir telefon yalnızca `exercises` okuyor ve boş bir program
 * görmektense ilk günü görmeli. Tek doğruluk kaynağı `days`; `exercises`
 * onun aynası.
 */
/**
 * `exercises` aynası bilerek: eski istemciler `days`'i bilmiyor ve ilk günü
 * tek listelik program sanıyor (PER-17).
 *
 * `origin`, şablondan kopyalanınca yazılıyor — ısınma bloğu ve kaynağın
 * kimliği. Kopyadan sonra şablonla canlı bir bağ YOK; bu alanlar yalnızca
 * "bu program nereden geldi" sorusunu yanıtlıyor.
 */
export async function saveProgramDays(
  programId: string,
  days: ProgramDay[],
  origin?: { warmup?: string; templateId?: string },
): Promise<void> {
  await updateDoc(doc(db, 'programs', programId), {
    days,
    exercises: days[0]?.exercises ?? [],
    ...(origin?.warmup ? { warmup: origin.warmup } : {}),
    ...(origin?.templateId ? { templateId: origin.templateId } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Isınma ön bloğunu açar ya da kapatır.
 *
 * Kapatmak alanı SİLİYOR (`deleteField`), boş metin yazmıyor: "ısınma yok"
 * ile "ısınma kimliği boş" aynı şey değil ve okuma tarafı ikisini ayırt
 * etmek zorunda kalmamalı. Karar PER-18'in kendi cümlesi — ısınma otomatik
 * gelir, "antrenör kapatabilir".
 */
export async function setProgramWarmup(programId: string, warmup: string | null): Promise<void> {
  await updateDoc(doc(db, 'programs', programId), {
    warmup: warmup ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}

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
