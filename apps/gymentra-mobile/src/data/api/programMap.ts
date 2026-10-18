import { toAppId } from './membershipIdentity';
import type { MeasurementEntry, Program, ProgramTemplate, WorkoutLog } from '../types';

/**
 * DTO -> app type mappers for programs, program templates, workout logs and measurements.
 *
 * The Worker stores each body as JSON in a `data` column next to real columns and returns
 * `{ ...data, id, <column timestamp> }` (api/src/reads2.ts, reads3.ts). Rules these mappers follow:
 *
 *  - timestamps are ms numbers (Firestore Timestamps were converted by the migration); every Date the
 *    app type declares is rebuilt with `msToDate`;
 *  - server-owned values win over anything the body carries: `id`, the real timestamp column
 *    (`updatedAt` / `loggedAt` / `measuredAt`), and tenant / member (the DTO does not carry them for
 *    these lists; the caller knows them from the URL it asked);
 *  - person ids are shown to the screens through `toAppId` (my internal id -> my Firebase uid);
 *  - fallbacks are DETERMINISTIC (never `new Date()`): the pollers compare payloads and a clock-based
 *    fallback would make every poll look like a change.
 */
export type Dto = { id: string } & Record<string, unknown>;

export function msToDate(v: unknown): Date | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? new Date(v) : undefined;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/** Fields the server owns on a program / log body; never sent back in a write. */
const SERVER_FIELDS = ['id', 'tenantId', 'memberId', 'updatedAt', 'loggedAt', 'measuredAt'];

/** The editable JSON body of a DTO: what a read-modify-write PUT starts from. */
export function bodyOf(dto: Dto): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) if (!SERVER_FIELDS.includes(k)) out[k] = v;
  return out;
}

export function programFromDto(dto: Dto, tenantId: string, memberId: string): Program {
  const updatedAt = msToDate(dto.updatedAt) ?? new Date(0);
  return {
    id: dto.id,
    tenantId,
    memberId: toAppId(memberId),
    memberName: dto.memberName as string,
    trainerId: toAppId(dto.trainerId as string),
    name: dto.name as string,
    status: dto.status as Program['status'],
    exercises: (dto.exercises as Program['exercises'] | undefined) ?? [],
    ...(dto.days ? { days: dto.days as NonNullable<Program['days']> } : {}),
    ...(dto.warmup ? { warmup: dto.warmup as string } : {}),
    ...(dto.templateId ? { templateId: dto.templateId as string } : {}),
    createdAt: msToDate(dto.createdAt) ?? updatedAt,
    updatedAt,
  };
}

/** `tenantId` is the column (NULL = global template), not whatever the body says. */
export function programTemplateFromDto(dto: Dto): ProgramTemplate {
  return {
    id: dto.id,
    tenantId: (dto.tenantId as string | null | undefined) ?? null,
    category: (dto.category as string | undefined) ?? '',
    level: (dto.level as ProgramTemplate['level'] | undefined) ?? 'all',
    title: (dto.title as string | undefined) ?? dto.id,
    durationMinutes: (dto.durationMinutes as number | undefined) ?? 0,
    weeklyFrequency: (dto.weeklyFrequency as string | undefined) ?? '',
    equipment: (dto.equipment as string[] | undefined) ?? [],
    summary: (dto.summary as string | undefined) ?? '',
    limits: (dto.limits as string[] | undefined) ?? [],
    sources: (dto.sources as string[] | undefined) ?? [],
    ...(dto.warmup ? { warmup: dto.warmup as string } : {}),
    days: (dto.days as ProgramTemplate['days'] | undefined) ?? [],
    ...(typeof dto.sessionsPerWeek === 'number' ? { sessionsPerWeek: dto.sessionsPerWeek } : {}),
    ...(dto.targets ? { targets: dto.targets as string[] } : {}),
    ...(dto.goal ? { goal: dto.goal as NonNullable<ProgramTemplate['goal']> } : {}),
  };
}

/** `startedAt` is the `logged_at` column (equal to the body's own `startedAt` for migrated rows). */
export function workoutLogFromDto(dto: Dto, tenantId: string, memberId: string): WorkoutLog {
  const completedAt = msToDate(dto.completedAt);
  return {
    id: dto.id,
    tenantId,
    memberId: toAppId(memberId),
    programId: dto.programId as string,
    programName: dto.programName as string,
    ...(dto.dayId ? { dayId: dto.dayId as string } : {}),
    ...(dto.dayName ? { dayName: dto.dayName as string } : {}),
    startedAt: msToDate(dto.loggedAt) ?? msToDate(dto.startedAt) ?? new Date(0),
    completedAt,
    exerciseLogs: (dto.exerciseLogs as WorkoutLog['exerciseLogs'] | undefined) ?? [],
  };
}

/** `recordedAt` is the `measured_at` column. */
export function measurementFromDto(dto: Dto, tenantId: string, memberId: string): MeasurementEntry {
  return {
    id: dto.id,
    tenantId,
    memberId: toAppId(memberId),
    recordedAt: msToDate(dto.measuredAt) ?? msToDate(dto.recordedAt) ?? new Date(0),
    weightKg: dto.weightKg as number,
    chestCm: num(dto.chestCm),
    waistCm: num(dto.waistCm),
    armCm: num(dto.armCm),
  };
}
