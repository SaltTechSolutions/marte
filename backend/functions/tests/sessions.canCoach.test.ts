import { describe, expect, it } from 'vitest';

import { canHoldPtSessions } from '../src/sessions';

/**
 * DEN-6 / CX-08. The app's rule (AGENTS.md §4b, `canCoach` in `membership.ts`) is
 * that an admin always coaches: the person who runs a small gym is usually the
 * one training its members, and they need no separate `trainer` role for it.
 * `createPtSessionByStaff` used to accept only an explicit `trainer` role as the
 * calendar owner, so an admin-only owner could not put an appointment on their
 * own calendar. This is the decision it now makes.
 */
describe('canHoldPtSessions', () => {
  it('antrenör rolü olan takvim sahibi olabilir', () => {
    expect(canHoldPtSessions(['trainer'])).toBe(true);
    expect(canHoldPtSessions(['member', 'trainer'])).toBe(true);
  });

  it('yönetici ayrıca antrenör rolü almadan da takvim sahibi olabilir', () => {
    expect(canHoldPtSessions(['admin'])).toBe(true);
    expect(canHoldPtSessions(['admin', 'member'])).toBe(true);
  });

  it('yalnızca üye olan takvim sahibi olamaz', () => {
    expect(canHoldPtSessions(['member'])).toBe(false);
  });

  it('rolü olmayan ya da roller alanı eksik olan takvim sahibi olamaz', () => {
    expect(canHoldPtSessions([])).toBe(false);
    expect(canHoldPtSessions(undefined)).toBe(false);
    expect(canHoldPtSessions(null)).toBe(false);
  });
});
