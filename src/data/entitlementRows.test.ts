import { describe, expect, it } from 'vitest';

import { entitlementRows } from './entitlementRows';
import { PackageChangeSummary } from './types';

function summary(entitlements: PackageChangeSummary['entitlements']): PackageChangeSummary {
  return { packageName: 'Test', entitlements, price: 0, endsAt: new Date() };
}

describe('entitlementRows', () => {
  it('lists gym access', () => {
    expect(entitlementRows(summary({ gymAccess: true }))).toEqual(['Salon girişi']);
  });

  it('lists unlimited group classes distinctly from quota\'d ones', () => {
    expect(entitlementRows(summary({ gymAccess: false, groupClasses: { unlimited: true } }))).toEqual(['Sınırsız grup dersi']);
    expect(entitlementRows(summary({ gymAccess: false, groupClasses: { count: 4, periodDays: 30 } }))).toEqual(['30 günde 4 grup dersi']);
  });

  it('lists PT lessons', () => {
    expect(entitlementRows(summary({ gymAccess: false, ptLessons: { count: 2, periodDays: 30 } }))).toEqual(['30 günde 2 özel ders']);
  });

  it('returns an empty list when a package has no rights at all', () => {
    expect(entitlementRows(summary({ gymAccess: false }))).toEqual([]);
  });

  it('never invents a right not present in the entitlements map', () => {
    // Regression guard for the doc comment's own promise: a package with
    // only gym access must not silently show class/lesson rows.
    const rows = entitlementRows(summary({ gymAccess: true }));
    expect(rows).not.toContain('Sınırsız grup dersi');
    expect(rows.some((r) => r.includes('özel ders'))).toBe(false);
  });
});
