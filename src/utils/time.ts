/**
 * Clock and calendar arithmetic used by the steppers.
 *
 * Kept out of the components that render them: this is domain logic with no
 * presentation in it, the layering rule says components should not hold it,
 * and — practically — a component file imports `react-native`, which the
 * test runner cannot parse, so logic buried there cannot be tested at all.
 */

/** Minutes since midnight ⇄ "HH:MM". */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Midnight today plus `offset` days. */
export function dateFromOffset(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

/** Whole days between midnight today and midnight of `date`. */
export function offsetFromDate(date: Date): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - dateFromOffset(0).getTime()) / 86400000);
}
