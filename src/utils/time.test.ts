import { describe, expect, it } from 'vitest';

import { dateFromOffset, offsetFromDate, toHHMM, toMinutes } from './time';

describe('toMinutes / toHHMM', () => {
  it('round-trips a time', () => {
    for (const t of ['00:00', '07:15', '12:30', '23:45']) {
      expect(toHHMM(toMinutes(t))).toBe(t);
    }
  });

  it('pads single digits', () => {
    expect(toHHMM(9 * 60 + 5)).toBe('09:05');
  });

  // Stepping back from 00:00 to reach a late class is a normal thing to do,
  // so the unbounded stepper wraps rather than dead-ending at midnight.
  it('wraps at both ends of the day', () => {
    expect(toHHMM(-15)).toBe('23:45');
    expect(toHHMM(24 * 60)).toBe('00:00');
    expect(toHHMM(24 * 60 + 30)).toBe('00:30');
  });
});

describe('dateFromOffset / offsetFromDate', () => {
  it('round-trips an offset', () => {
    for (const offset of [0, 1, 2, 7, 45, 365]) {
      expect(offsetFromDate(dateFromOffset(offset))).toBe(offset);
    }
  });

  it('anchors offset 0 to midnight today', () => {
    const d = dateFromOffset(0);
    expect(d.getDate()).toBe(new Date().getDate());
    expect(d.getHours()).toBe(0);
  });

  // A class at 23:00 today is still offset 0 — the time of day must not round
  // the day forward, or reopening a late class would move it to tomorrow.
  it('ignores the time of day', () => {
    const lateToday = new Date();
    lateToday.setHours(23, 59, 0, 0);
    expect(offsetFromDate(lateToday)).toBe(0);
  });

  it('goes negative for a past date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(offsetFromDate(yesterday)).toBe(-1);
  });
});
