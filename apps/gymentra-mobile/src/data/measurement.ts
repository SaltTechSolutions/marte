import { MeasurementEntry } from './types';

export type MeasureField = 'weightKg' | 'chestCm' | 'waistCm' | 'armCm';

/** `null` = the member has not entered this measurement; it is not saved. */
export type MeasurementDraft = Record<MeasureField, number | null>;

/**
 * Where a stepper STARTS once the member chooses to add a field it has no
 * earlier value for. Never saved on its own: a field is only written after the
 * member opts it in.
 *
 * The form used to open with these numbers already filled in (75 / 100 / 85 /
 * 35) and save all four, so someone recording only their weight also wrote a
 * chest, waist and arm nobody had measured. Records are append-only, and the
 * first entry is the baseline of the "first → current" comparison, so the
 * invented numbers then showed up as progress (DEN-4).
 */
export const MEASURE_START: Record<MeasureField, number> = {
  weightKg: 75,
  chestCm: 100,
  waistCm: 85,
  armCm: 35,
};

/**
 * The form's opening state: last entry's values that were actually entered,
 * nothing else. Only the NEWEST entry counts — a measurement the member has
 * stopped taking must not come back by itself.
 */
export function draftFromEntries(entries: MeasurementEntry[] | undefined): MeasurementDraft {
  const last = entries?.[0];
  return {
    weightKg: last?.weightKg ?? null,
    chestCm: last?.chestCm ?? null,
    waistCm: last?.waistCm ?? null,
    armCm: last?.armCm ?? null,
  };
}

/**
 * The number a stepper starts on when the member adds a field: their newest
 * recorded value for it (entries are newest-first), else the generic start.
 */
export function startValue(entries: MeasurementEntry[] | undefined, field: MeasureField): number {
  return entries?.find((e) => e[field] != null)?.[field] ?? MEASURE_START[field];
}
