import { describe, expect, it } from 'vitest';

import { TrainerAvailability } from '../types';
import { computeFreeSlots } from './availabilityRepo';

/**
 * plan-eng-review Faz 3.2. `isWithinAvailability` (server,
 * `backend/functions/src/sessions.ts` — the actual booking gate) and
 * `computeFreeSlots` (client, `availabilityRepo.ts` — what the member sees
 * as bookable) implement the same grid/window rule independently, in two
 * separate npm packages with no shared code. This file and
 * `backend/functions/tests/sessions.isWithinAvailability.test.ts` run the
 * SAME literal case table against each implementation — kept in sync by
 * hand, not by import, since a shared package for one function was judged
 * not worth the monorepo complexity (see plan.md's PKG-7/8 section). If one
 * side's logic drifts from the other, its own copy of this table starts
 * failing.
 *
 * Anchor date matches `availabilityRepo.test.ts`'s WED constant — Wednesday
 * 2026-08-19.
 */
const WED = new Date(2026, 7, 19);
const FAR_PAST = new Date(2000, 0, 1); // so `computeFreeSlots`'s "past" filter never excludes a candidate

function isSlotFree(availability: TrainerAvailability, candidate: Date): boolean {
  return computeFreeSlots(availability, WED, [], FAR_PAST).some((s) => s.getTime() === candidate.getTime());
}

function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 19, hour, minute);
}

interface Case {
  name: string;
  weekly: TrainerAvailability['weekly'];
  exceptions: TrainerAvailability['exceptions'];
  slotMinutes: number;
  slot: Date;
  expected: boolean;
}

const CASES: Case[] = [
  {
    name: 'exactly at window start is valid',
    weekly: { wed: [{ start: '09:00', end: '12:00' }] },
    exceptions: [],
    slotMinutes: 60,
    slot: at(9),
    expected: true,
  },
  {
    name: 'grid-misaligned slot is rejected',
    weekly: { wed: [{ start: '09:00', end: '12:00' }] },
    exceptions: [],
    slotMinutes: 60,
    slot: at(9, 30),
    expected: false,
  },
  {
    name: 'a slot that fits exactly before window end is valid',
    weekly: { wed: [{ start: '09:00', end: '10:30' }] },
    exceptions: [],
    slotMinutes: 60,
    slot: at(9),
    expected: true,
  },
  {
    name: 'a grid-aligned slot that would run past window end is rejected',
    weekly: { wed: [{ start: '09:00', end: '10:30' }] },
    exceptions: [],
    slotMinutes: 60,
    slot: at(10),
    expected: false,
  },
  {
    name: 'a slot before window start is rejected',
    weekly: { wed: [{ start: '09:00', end: '12:00' }] },
    exceptions: [],
    slotMinutes: 60,
    slot: at(8),
    expected: false,
  },
  {
    name: 'a non-60-minute grid is respected',
    weekly: { wed: [{ start: '09:00', end: '12:00' }] },
    exceptions: [],
    slotMinutes: 30,
    slot: at(9, 30),
    expected: true,
  },
  {
    name: "a day exception's window overrides the weekly pattern entirely",
    weekly: { wed: [{ start: '09:00', end: '12:00' }] },
    exceptions: [{ date: '2026-08-19', windows: [{ start: '14:00', end: '15:00' }] }],
    slotMinutes: 60,
    slot: at(14),
    expected: true,
  },
  {
    name: "the weekly-pattern slot is rejected once a day exception overrides it",
    weekly: { wed: [{ start: '09:00', end: '12:00' }] },
    exceptions: [{ date: '2026-08-19', windows: [{ start: '14:00', end: '15:00' }] }],
    slotMinutes: 60,
    slot: at(9),
    expected: false,
  },
  {
    name: 'a day exception marked closed rejects every slot that day',
    weekly: { wed: [{ start: '09:00', end: '12:00' }] },
    exceptions: [{ date: '2026-08-19', closed: true }],
    slotMinutes: 60,
    slot: at(9),
    expected: false,
  },
  {
    name: 'a weekday with no configured window at all is rejected',
    weekly: {},
    exceptions: [],
    slotMinutes: 60,
    slot: at(9),
    expected: false,
  },
];

describe('availability contract — client/server case parity', () => {
  it.each(CASES)('$name', ({ weekly, exceptions, slotMinutes, slot, expected }) => {
    const availability: TrainerAvailability = { tenantId: 't1', trainerId: 'tr1', weekly, slotMinutes, exceptions, updatedAt: new Date() };
    expect(isSlotFree(availability, slot)).toBe(expected);
  });
});
