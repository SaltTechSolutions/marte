import { describe, expect, it } from 'vitest';

import { ageFrom, formatBirthDate, parseBirthDate } from './birthDate';

describe('parseBirthDate', () => {
  it('reads a well-formed date', () => {
    expect(parseBirthDate('1990-05-21')).toEqual(new Date(1990, 4, 21));
  });

  it('rejects anything that is not exactly yyyy-mm-dd', () => {
    for (const input of ['', '1990', '1990-5-21', '21.05.1990', 'abc', '1990-05-21x']) {
      expect(parseBirthDate(input)).toBeNull();
    }
  });

  // `new Date(1990, 12, 32)` rolls over to February 1991 instead of failing,
  // so a nonsense month or day used to be stored as a plausible wrong date.
  it('rejects month and day overflow instead of rolling over', () => {
    expect(parseBirthDate('1990-13-01')).toBeNull();
    expect(parseBirthDate('1990-02-30')).toBeNull();
    expect(parseBirthDate('1990-00-10')).toBeNull();
  });

  it('accepts a real leap day and rejects a fake one', () => {
    expect(parseBirthDate('2000-02-29')).not.toBeNull();
    expect(parseBirthDate('1900-02-29')).toBeNull();
  });
});

describe('ageFrom', () => {
  it('counts whole years', () => {
    expect(ageFrom(new Date(2000, 0, 1), new Date(2020, 0, 1))).toBe(20);
  });

  // The boundary the guardian rules turn on: someone is 17 the day before
  // their eighteenth birthday and 18 on it.
  it('does not round up before the birthday', () => {
    expect(ageFrom(new Date(2008, 5, 15), new Date(2026, 5, 14))).toBe(17);
    expect(ageFrom(new Date(2008, 5, 15), new Date(2026, 5, 15))).toBe(18);
  });

  it('handles a birthday later in the year', () => {
    expect(ageFrom(new Date(2010, 11, 31), new Date(2026, 0, 1))).toBe(15);
  });
});

describe('formatBirthDate', () => {
  it('pads month and day', () => {
    expect(formatBirthDate(new Date(1990, 4, 3))).toBe('1990-05-03');
  });

  it('renders nothing for a missing date', () => {
    expect(formatBirthDate(undefined)).toBe('');
  });
});
