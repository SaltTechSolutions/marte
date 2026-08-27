import { describe, expect, test } from 'vitest';

import { canActivateAnotherMember, FREE_MEMBER_LIMIT } from './seats';
import { Tenant } from './types';

function tenant(subscription?: Tenant['subscription']): Tenant {
  return {
    id: 't1',
    code: 'TEST-01',
    name: 'Test',
    branding: { primaryColor: '#000', accentColor: '#000', themeMode: 'dark', appName: 'Test' },
    subscription,
    createdAt: new Date(),
  } as Tenant;
}

/**
 * These cases mirror the `withinMemberLimit` rule in
 * `marte06/firestore.rules`. If the rule changes, this table has to change
 * with it — a client that silently disagreed with the rule is what stopped
 * the pilot gym from approving members.
 */
describe('canActivateAnotherMember', () => {
  test('under the free limit without any subscription', () => {
    expect(canActivateAnotherMember(tenant(), FREE_MEMBER_LIMIT - 1)).toBe(true);
  });

  test('at the free limit without a subscription — blocked', () => {
    expect(canActivateAnotherMember(tenant(), FREE_MEMBER_LIMIT)).toBe(false);
  });

  test('over the limit with an active subscription — allowed', () => {
    expect(canActivateAnotherMember(tenant({ status: 'active', plan: 'monthly' }), 500)).toBe(true);
  });

  test('grandfathered counts as active — the pilot gym case', () => {
    expect(canActivateAnotherMember(tenant({ status: 'active', plan: 'grandfathered' }), 51)).toBe(true);
  });

  test('an expired subscription does not lift the limit', () => {
    expect(canActivateAnotherMember(tenant({ status: 'expired', plan: 'monthly' }), 51)).toBe(false);
  });

  test('a cancelled subscription does not lift the limit', () => {
    expect(canActivateAnotherMember(tenant({ status: 'cancelled', plan: 'yearly' }), 51)).toBe(false);
  });

  test('a missing tenant falls back to the count alone', () => {
    expect(canActivateAnotherMember(null, 3)).toBe(true);
    expect(canActivateAnotherMember(null, FREE_MEMBER_LIMIT)).toBe(false);
  });
});
