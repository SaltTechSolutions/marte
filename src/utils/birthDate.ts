/**
 * Birth dates as the app writes them: `1990-05-21`.
 *
 * Shared because two screens now edit the same field — the admin correcting a
 * member's record and the member correcting their own — and a date parser that
 * disagrees between them would write two different things into one field.
 */

/** `1990-05-21` in, Date out — null for anything that isn't a real date, so a
 *  half-typed value never silently becomes 1 Jan 1970. */
export function parseBirthDate(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  // `new Date(1990, 12, 32)` rolls over instead of failing, so a nonsense
  // month or day would come back as a plausible date in the wrong place.
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    return null;
  }
  return d;
}

export function formatBirthDate(d?: Date): string {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Whole years old today.
 *
 * Derived, never stored: an `age` or `isMinor` field is correct on the day it
 * is written and wrong every day after, and the one decision it feeds — is
 * this member a minor — is exactly the one that must not go stale.
 */
export function ageFrom(birthDate: Date, today = new Date()): number {
  let age = today.getFullYear() - birthDate.getFullYear();
  const beforeBirthdayThisYear =
    today.getMonth() < birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}
