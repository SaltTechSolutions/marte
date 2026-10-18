import type { WatchErrorHandler } from '../firebase/watch';
import { ExerciseLog, Program, ProgramDay, WorkoutLog } from '../types';
import { apiPost, apiPut } from './client';
import { workoutLogFromDto } from './programMap';
import {
  fetchLog,
  fetchMemberLogs,
  internalId,
  locateLog,
  rememberLog,
  requireLog,
  touch,
  watchOne,
  watchPoll,
  writeThrough,
} from './programShared';

/**
 * Cloudflare Worker version of data/firebase/workoutLogRepo.ts: same exports, same signatures.
 *
 * Worker contract (api/src/writes2.ts): POST files the log under the CALLER and the current server time
 * (`logged_at` = our `startedAt`); PUT lets the owner change only `exerciseLogs` and `completedAt`.
 * `completedAt` is therefore the device clock (ms), where Firestore used the server's.
 */
const enc = encodeURIComponent;
const AREA = 'workoutLogs';

/** Member taps "Antrenmana başla" — snapshots the program's targets into a
 * fresh log so later edits to the program don't rewrite already-logged history. */
export async function startWorkoutLog(
  tenantId: string,
  memberId: string,
  program: Program,
  day?: ProgramDay,
): Promise<string> {
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
  const { id } = await apiPost<{ id: string }>(`/tenants/${enc(tenantId)}/workout-logs`, {
    programId: program.id,
    programName: program.name,
    // Hangi gün çalışıldığı kayda giriyor: sıradaki günü önermenin tek yolu
    // bu, ve programın günleri sonradan değişse bile geçmiş doğru kalıyor.
    ...(day ? { dayId: day.id, dayName: day.name } : {}),
    exerciseLogs,
  });
  rememberLog(id, tenantId, await internalId(memberId));
  touch(tenantId, AREA);
  return id;
}

/**
 * Son antrenmanlar — "geçen sefer" satırı ve sıradaki gün önerisi için.
 * Canlı dinleyici değil tek seferlik okuma. Newest first.
 */
export async function getRecentLogs(tenantId: string, memberId: string, count = 12): Promise<WorkoutLog[]> {
  const id = await internalId(memberId);
  return (await fetchMemberLogs(tenantId, id, count)).map((d) => workoutLogFromDto(d, tenantId, id));
}

export function watchWorkoutLog(
  logId: string,
  onChange: (log: WorkoutLog | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchOne<WorkoutLog>(
    'Antrenman kaydı',
    logId,
    locateLog,
    AREA,
    async () => {
      const dto = await fetchLog(logId);
      return dto ? workoutLogFromDto(dto, dto.tenantId, dto.memberId) : null;
    },
    onChange,
    onError,
  );
}

async function updateLog(logId: string, echo: Record<string, unknown>, body: Record<string, unknown>): Promise<void> {
  let tenantId: string | undefined;
  try {
    // Queued synchronously (before any lookup) so quick taps land in the order they were made.
    await writeThrough(logId, echo, async () => {
      const loc = await requireLog(logId);
      tenantId = loc.tenantId;
      await apiPut(`/tenants/${enc(loc.tenantId)}/workout-logs/${enc(logId)}`, body);
    });
  } finally {
    if (tenantId) touch(tenantId, AREA);   // success: refresh everyone; failure: replace the echo with the server's truth
  }
}

/** Whole-array rewrite, same reasoning as saveProgramExercises. */
export async function saveExerciseLogs(logId: string, exerciseLogs: ExerciseLog[]): Promise<void> {
  await updateLog(logId, { exerciseLogs }, { exerciseLogs });
}

export async function completeWorkoutLog(logId: string): Promise<void> {
  const now = Date.now();
  await updateLog(logId, { completedAt: new Date(now) }, { completedAt: now });
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

const MAX_HISTORY = 200;   // also the Worker's page cap

const memberLogs = async (tenantId: string, memberId: string, limit: number): Promise<WorkoutLog[]> => {
  const id = await internalId(memberId);
  return (await fetchMemberLogs(tenantId, id, limit)).map((d) => workoutLogFromDto(d, tenantId, id));
};

/** Full workout history for the Gelişim screen's totals and streak, oldest first (last 200 sessions). */
export function watchWorkoutLogsForMember(
  tenantId: string,
  memberId: string,
  onChange: (logs: WorkoutLog[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    'Antrenman geçmişi',
    `t:${tenantId}:${AREA}:member:${memberId}:history`,
    async () => (await memberLogs(tenantId, memberId, MAX_HISTORY)).reverse(),
    onChange,
    onError,
  );
}

/** Powers the member home "Haftada N/hedef antrenman" ring — completed sessions since this week's Monday. */
export function watchCompletedThisWeek(
  tenantId: string,
  memberId: string,
  onChange: (count: number) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    'Bu haftaki antrenmanlar',
    `t:${tenantId}:${AREA}:member:${memberId}:week`,
    async () => {
      const from = startOfWeek().getTime();
      // The newest sessions come first, so this week's are always inside the page.
      return (await memberLogs(tenantId, memberId, MAX_HISTORY)).filter((l) => l.startedAt.getTime() >= from && l.completedAt != null).length;
    },
    onChange,
    onError,
  );
}
