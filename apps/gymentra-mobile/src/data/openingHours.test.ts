import { describe, expect, it } from 'vitest';

import { gymWindowFor, hasOpeningHours } from './openingHours';
import { OpeningHours } from './types';

const hours: OpeningHours = {
  '1': { open: '08:00', close: '22:00' },
  '0': null,
};

describe('gymWindowFor', () => {
  it('maps a weekday key onto its getDay() number', () => {
    expect(gymWindowFor(hours, 'mon')).toEqual({ open: '08:00', close: '22:00' });
  });

  // The distinction the whole feature rests on: a gym that never set its
  // hours must stay unconstrained, not read as closed every day.
  it('is undefined when the gym has never set hours', () => {
    expect(gymWindowFor(undefined, 'mon')).toBeUndefined();
  });

  it('is null for a day the gym set closed', () => {
    expect(gymWindowFor(hours, 'sun')).toBeNull();
  });

  it('is null for a day left unfilled once hours exist', () => {
    expect(gymWindowFor(hours, 'sat')).toBeNull();
  });
});

describe('hasOpeningHours', () => {
  it('separates unset from set', () => {
    expect(hasOpeningHours(undefined)).toBe(false);
    expect(hasOpeningHours({})).toBe(false);
    expect(hasOpeningHours(hours)).toBe(true);
  });
});
