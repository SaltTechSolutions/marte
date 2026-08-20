import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemberCredit, MemberPackage } from '../types';

const getMemberPackages = vi.fn();
const getActiveMemberCredits = vi.fn();
const getMemberPackage = vi.fn();
const hasSessionToday = vi.fn();

vi.mock('./memberPackageRepo', () => ({
  getMemberPackages: (...args: unknown[]) => getMemberPackages(...args),
  getActiveMemberCredits: (...args: unknown[]) => getActiveMemberCredits(...args),
  getMemberPackage: (...args: unknown[]) => getMemberPackage(...args),
}));

vi.mock('./ptSessionRepo', () => ({
  hasSessionToday: (...args: unknown[]) => hasSessionToday(...args),
}));

const { resolveAccess } = await import('./checkinRepo');

function lessonsPackage(overrides: Partial<MemberPackage> = {}): MemberPackage {
  const now = new Date();
  return {
    id: 'pkg-1',
    tenantId: 't1',
    memberId: 'm1',
    memberName: 'Test Üye',
    packageId: 'catalog-1',
    packageName: '12 Ders Paketi',
    kind: 'lessons',
    entitlements: { gymAccess: false, ptLessons: { count: 12, periodDays: 90 } },
    listPrice: 1000,
    finalPrice: 1000,
    frozenDays: 0,
    freezes: [],
    startsAt: new Date(now.getTime() - 86400000),
    endsAt: new Date(now.getTime() + 30 * 86400000),
    status: 'active',
    assignedAt: now,
    assignedBy: 'admin1',
    ...overrides,
  };
}

function ptCredit(overrides: Partial<MemberCredit> = {}): MemberCredit {
  const now = new Date();
  return {
    id: 'credit-1',
    tenantId: 't1',
    memberId: 'm1',
    kind: 'ptLesson',
    source: 'purchase',
    sourcePackageId: 'pkg-1',
    total: 12,
    used: 0,
    startsAt: new Date(now.getTime() - 86400000),
    expiresAt: new Date(now.getTime() + 30 * 86400000),
    status: 'active',
    ...overrides,
  };
}

describe('resolveAccess', () => {
  beforeEach(() => {
    getMemberPackages.mockReset().mockResolvedValue([]);
    getActiveMemberCredits.mockReset().mockResolvedValue([]);
    getMemberPackage.mockReset().mockResolvedValue(null);
    hasSessionToday.mockReset().mockResolvedValue(false);
  });

  it(
    // Regression: booking the last credit flips it to `exhausted`, so a
    // query filtered to status=='active' can no longer see it — the member
    // who just paid for today's session was getting turned away at the
    // door. See plan-eng-review Faz 1.1.
    'lets a member in on the day of their booked session even when the credit that paid for it is exhausted',
    async () => {
      getMemberPackages.mockResolvedValue([lessonsPackage()]);
      // The credit is exhausted — getActiveMemberCredits (status=='active')
      // would not return it, which is exactly the regression: access must
      // not depend on this call succeeding.
      getActiveMemberCredits.mockResolvedValue([]);
      hasSessionToday.mockResolvedValue(true);

      const result = await resolveAccess('t1', 'm1');

      expect(result.access).toBe('ok');
      expect(result.warnReason).toBeNull();
      expect(result.packageLabel).toContain('bugün randevulu');
    },
  );

  it('warns (does not block) when there is a usable credit but no session booked today', async () => {
    getMemberPackages.mockResolvedValue([lessonsPackage()]);
    getActiveMemberCredits.mockResolvedValue([ptCredit()]);
    hasSessionToday.mockResolvedValue(false);

    const result = await resolveAccess('t1', 'm1');

    expect(result.access).toBe('warn');
    expect(result.warnReason).toBe('no-session-today');
  });

  it('grants access via an active membership package regardless of credits or sessions', async () => {
    const now = new Date();
    getMemberPackages.mockResolvedValue([
      {
        ...lessonsPackage(),
        kind: 'membership',
        entitlements: { gymAccess: true },
        startsAt: new Date(now.getTime() - 86400000),
        endsAt: new Date(now.getTime() + 86400000),
      },
    ]);

    const result = await resolveAccess('t1', 'm1');

    expect(result.access).toBe('ok');
    expect(hasSessionToday).not.toHaveBeenCalled();
  });

  it('warns with no-package when nothing applies', async () => {
    const result = await resolveAccess('t1', 'm1');

    expect(result.access).toBe('warn');
    expect(result.warnReason).toBe('no-package');
    expect(result.packageLabel).toBeNull();
  });
});
