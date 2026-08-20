import { describe, expect, it } from 'vitest';

import { TrainerAvailability, TrainerBusySlot } from '../types';
import { computeFreeSlots, hasAnyAvailability } from './availabilityRepo';

function availabilityOn(weekday: 'mon' | 'tue' | 'wed', start: string, end: string, slotMinutes = 60): TrainerAvailability {
  return {
    tenantId: 't1',
    trainerId: 'tr1',
    weekly: { [weekday]: [{ start, end }] },
    slotMinutes,
    exceptions: [],
    updatedAt: new Date(),
  };
}

// Wednesday, arbitrary anchor date used throughout.
const WED = new Date(2026, 7, 19); // 2026-08-19 is a Wednesday

describe('hasAnyAvailability', () => {
  it('is false for null', () => {
    expect(hasAnyAvailability(null)).toBe(false);
  });

  it('is false when every day is empty', () => {
    expect(hasAnyAvailability({ tenantId: 't1', trainerId: 'tr1', weekly: {}, slotMinutes: 60, exceptions: [], updatedAt: new Date() })).toBe(
      false,
    );
  });

  it('is true when at least one day has a window', () => {
    expect(hasAnyAvailability(availabilityOn('wed', '09:00', '12:00'))).toBe(true);
  });
});

describe('computeFreeSlots', () => {
  it('returns empty for a day with no configured window', () => {
    const availability = availabilityOn('mon', '09:00', '12:00');
    expect(computeFreeSlots(availability, WED, [])).toEqual([]);
  });

  it('slices a window into slotMinutes increments', () => {
    const availability = availabilityOn('wed', '09:00', '11:00', 60);
    const slots = computeFreeSlots(availability, WED, [], new Date(2026, 0, 1));
    expect(slots.map((s) => s.getHours())).toEqual([9, 10]);
  });

  it('excludes a slot already taken by a non-cancelled busy slot', () => {
    const availability = availabilityOn('wed', '09:00', '11:00', 60);
    const busy: TrainerBusySlot[] = [{ date: new Date(2026, 7, 19, 9, 0), durationMinutes: 60, status: 'scheduled' }];
    const slots = computeFreeSlots(availability, WED, busy, new Date(2026, 0, 1));
    expect(slots.map((s) => s.getHours())).toEqual([10]);
  });

  it('does not exclude a slot whose busy entry was cancelled', () => {
    const availability = availabilityOn('wed', '09:00', '11:00', 60);
    const busy: TrainerBusySlot[] = [{ date: new Date(2026, 7, 19, 9, 0), durationMinutes: 60, status: 'cancelled' }];
    const slots = computeFreeSlots(availability, WED, busy, new Date(2026, 0, 1));
    expect(slots.map((s) => s.getHours())).toEqual([9, 10]);
  });

  it('excludes a slot in the past relative to `now`', () => {
    const availability = availabilityOn('wed', '09:00', '11:00', 60);
    // "now" is 09:30 on the same day — the 09:00 slot has already started.
    const now = new Date(2026, 7, 19, 9, 30);
    const slots = computeFreeSlots(availability, WED, [], now);
    expect(slots.map((s) => s.getHours())).toEqual([10]);
  });

  it('does not overshoot the window edge — a slot must fit fully before the window ends', () => {
    // 90-minute window, 60-minute slots: only one slot fits, the trailing
    // 30 minutes is not enough for a second one.
    const availability = availabilityOn('wed', '09:00', '10:30', 60);
    const slots = computeFreeSlots(availability, WED, [], new Date(2026, 0, 1));
    expect(slots).toHaveLength(1);
    expect(slots[0].getHours()).toBe(9);
  });

  it('uses the day exception window instead of the weekly pattern when one exists', () => {
    const availability: TrainerAvailability = {
      tenantId: 't1',
      trainerId: 'tr1',
      weekly: { wed: [{ start: '09:00', end: '12:00' }] },
      slotMinutes: 60,
      exceptions: [{ date: '2026-08-19', windows: [{ start: '14:00', end: '15:00' }] }],
      updatedAt: new Date(),
    };
    const slots = computeFreeSlots(availability, WED, [], new Date(2026, 0, 1));
    expect(slots.map((s) => s.getHours())).toEqual([14]);
  });

  it('returns empty when the day exception marks it closed', () => {
    const availability: TrainerAvailability = {
      tenantId: 't1',
      trainerId: 'tr1',
      weekly: { wed: [{ start: '09:00', end: '12:00' }] },
      slotMinutes: 60,
      exceptions: [{ date: '2026-08-19', closed: true }],
      updatedAt: new Date(),
    };
    expect(computeFreeSlots(availability, WED, [], new Date(2026, 0, 1))).toEqual([]);
  });
});
