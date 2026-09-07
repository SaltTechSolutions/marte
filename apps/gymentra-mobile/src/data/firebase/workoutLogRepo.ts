import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { ExerciseLog, Program, ProgramDay, WorkoutLog } from '../types';
import { workoutLogFromDoc } from './convert';
import { WatchErrorHandler, watchDoc, watchQuery } from './watch';

/** Member taps "Antrenmana başla" — snapshots the program's targets into a
 * fresh log so later edits to the program don't rewrite already-logged history. */
export async function startWorkoutLog(
  tenantId: string,
  memberId: string,
  program: Program,
  day?: ProgramDay,
): Promise<string> {
  const ref = doc(collection(db, 'workout_logs'));
  const source = day?.exercises ?? program.exercises;
  const exerciseLogs: ExerciseLog[] = source.map((e) => ({
    exerciseId: e.id,
    name: e.name,
    ...(e.libraryId ? { libraryId: e.libraryId } : {}),
    setsTarget: e.sets,
    repsTarget: e.reps,
    setsCompleted: 0,
    weightKg: e.targetWeightKg,
  }));
  await setDoc(ref, {
    tenantId,
    memberId,
    programId: program.id,
    programName: program.name,
    // Hangi gün çalışıldığı kayda giriyor: sıradaki günü önermenin tek yolu
    // bu, ve programın günleri sonradan değişse bile geçmiş doğru kalıyor.
    ...(day ? { dayId: day.id, dayName: day.name } : {}),
    startedAt: serverTimestamp(),
    exerciseLogs,
  });
  return ref.id;
}

/**
 * Son antrenmanlar — "geçen sefer" satırı ve sıradaki gün önerisi için.
 *
 * Canlı dinleyici değil tek seferlik okuma: antrenman başlarken bir kez
 * bakılıyor, seans sürerken geçmişin değişmesi diye bir şey yok. Aynı
 * (tenantId, memberId, startedAt) bileşik dizinini kullanır.
 */
export async function getRecentLogs(tenantId: string, memberId: string, count = 12): Promise<WorkoutLog[]> {
  const snap = await getDocs(
    query(
      collection(db, 'workout_logs'),
      where('tenantId', '==', tenantId),
      where('memberId', '==', memberId),
      orderBy('startedAt', 'desc'),
      limit(count),
    ),
  );
  return snap.docs.map(workoutLogFromDoc);
}

export function watchWorkoutLog(
  logId: string,
  onChange: (log: WorkoutLog | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Antrenman kaydı',
    doc(db, 'workout_logs', logId),
    (snap) => (snap.exists() ? workoutLogFromDoc(snap) : null),
    onChange,
    onError,
  );
}

/** Whole-array rewrite, same reasoning as saveProgramExercises. */
export async function saveExerciseLogs(logId: string, exerciseLogs: ExerciseLog[]): Promise<void> {
  await updateDoc(doc(db, 'workout_logs', logId), { exerciseLogs });
}

export async function completeWorkoutLog(logId: string): Promise<void> {
  await updateDoc(doc(db, 'workout_logs', logId), { completedAt: serverTimestamp() });
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Full workout history for the Gelişim screen's totals and streak, oldest
 * first. Reuses the same (tenantId, memberId, startedAt) composite index as
 * watchCompletedThisWeek. */
export function watchWorkoutLogsForMember(
  tenantId: string,
  memberId: string,
  onChange: (logs: WorkoutLog[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'workout_logs'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    // Newest-first + limit so the listener stays bounded; the Gelişim screen
    // re-sorts ascending. ~200 sessions is several years of training, and
    // totals beyond that are reported as "son 200 antrenman".
    orderBy('startedAt', 'desc'),
    limit(200),
  );
  return watchQuery(
    'Antrenman geçmişi',
    q,
    (snap) => snap.docs.map(workoutLogFromDoc).reverse(),
    onChange,
    onError,
  );
}

/** Powers the member home "Haftada N/hedef antrenman" ring — live count of
 * completed sessions since this week's Monday. */
export function watchCompletedThisWeek(
  tenantId: string,
  memberId: string,
  onChange: (count: number) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'workout_logs'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('startedAt', '>=', Timestamp.fromDate(startOfWeek())),
  );
  return watchQuery(
    'Bu haftaki antrenmanlar',
    q,
    (snap) => snap.docs.filter((d) => d.data().completedAt != null).length,
    onChange,
    onError,
  );
}
