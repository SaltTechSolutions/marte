import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isMaintenanceError, isRecovery, needsReroute, isUnderMaintenance, resetMaintenance, setMaintenance, subscribeMaintenance } from './maintenance';

beforeEach(() => resetMaintenance());

describe('isMaintenanceError', () => {
  it('is true only for a 503 whose api code is maintenance', () => {
    expect(isMaintenanceError({ status: 503, apiCode: 'maintenance' })).toBe(true);
    expect(isMaintenanceError({ status: 503, apiCode: 'other' })).toBe(false);
    expect(isMaintenanceError({ status: 503 })).toBe(false);
    expect(isMaintenanceError({ status: 500, apiCode: 'maintenance' })).toBe(false);
    expect(isMaintenanceError(new Error('maintenance'))).toBe(false);
    expect(isMaintenanceError(null)).toBe(false);
    expect(isMaintenanceError(undefined)).toBe(false);
    expect(isMaintenanceError('maintenance')).toBe(false);
  });
});

describe('maintenance store', () => {
  it('notifies only on a change, stops after unsubscribe, and reset clears the flag', () => {
    const fn = vi.fn();
    const off = subscribeMaintenance(fn);
    setMaintenance(false);
    expect(fn).not.toHaveBeenCalled();
    setMaintenance(true);
    setMaintenance(true);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isUnderMaintenance()).toBe(true);
    resetMaintenance();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(isUnderMaintenance()).toBe(false);
    off();
    setMaintenance(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('isRecovery', () => {
  it('fires only when the flag falls and the user is not leaving', () => {
    expect(isRecovery({ wasOn: true, nowOn: false, leaving: false })).toBe(true);
    expect(isRecovery({ wasOn: true, nowOn: false, leaving: true })).toBe(false); // sign-out reset
    expect(isRecovery({ wasOn: false, nowOn: false, leaving: false })).toBe(false);
    expect(isRecovery({ wasOn: true, nowOn: true, leaving: false })).toBe(false);
  });
});

describe('needsReroute', () => {
  it('resets the stack only for a misroute, never over an unsaved screen', () => {
    expect(needsReroute({ pathname: '/trainer/programs/new', hadMembershipAtStart: true })).toBe(false);
    expect(needsReroute({ pathname: '/onboarding/gym-code', hadMembershipAtStart: true })).toBe(true);
    expect(needsReroute({ pathname: '/member', hadMembershipAtStart: false })).toBe(true);
  });
});
