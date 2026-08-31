import { DayHours, OpeningHours, Weekday } from './types';

/** `Weekday` keys ⇄ the `getDay()` numbers `OpeningHours` is keyed by. */
const WEEKDAY_TO_INDEX: Record<Weekday, string> = {
  sun: '0',
  mon: '1',
  tue: '2',
  wed: '3',
  thu: '4',
  fri: '5',
  sat: '6',
};

/**
 * The gym's window for one weekday.
 *
 * `undefined` means "this gym has never set its hours" — every gym predates
 * the field, so that has to read as unconstrained rather than as closed.
 * `null` means the gym set that day closed, which is a real answer.
 */
export function gymWindowFor(hours: OpeningHours | undefined, day: Weekday): DayHours | null | undefined {
  if (!hours) return undefined;
  return hours[WEEKDAY_TO_INDEX[day]] ?? null;
}

export function hasOpeningHours(hours: OpeningHours | undefined): boolean {
  return !!hours && Object.keys(hours).length > 0;
}
