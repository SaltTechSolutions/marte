import { PackageChangeSummary } from './types';

/**
 * Built from the `entitlements` map, never hand-written — otherwise a screen
 * showing this lies the moment an admin adds a right the copy here doesn't
 * know about yet.
 *
 * Extracted from `member/package-offer.tsx` so it can be unit-tested without
 * pulling in React Native (see plan-eng-review Faz 3.1).
 */
export function entitlementRows(summary: PackageChangeSummary): string[] {
  const rows: string[] = [];
  if (summary.entitlements.gymAccess) rows.push('Salon girişi');
  const gc = summary.entitlements.groupClasses;
  if (gc?.unlimited) rows.push('Sınırsız grup dersi');
  else if (gc) rows.push(`${gc.periodDays} günde ${gc.count} grup dersi`);
  const pt = summary.entitlements.ptLessons;
  if (pt) rows.push(`${pt.periodDays} günde ${pt.count} özel ders`);
  return rows;
}
