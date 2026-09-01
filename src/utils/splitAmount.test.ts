import { describe, expect, it } from 'vitest';

import { splitAmount } from './splitAmount';

/** The one property that matters: the parts must add back up to the whole.
 *  A parent who paid 1000₺ must see exactly 1000₺ across their children. */
function sum(parts: number[]): number {
  return Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
}

describe('splitAmount', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(splitAmount(900, 3)).toEqual([300, 300, 300]);
  });

  it('puts the leftover kuruş on the last share', () => {
    expect(splitAmount(1000, 3)).toEqual([333.33, 333.33, 333.34]);
  });

  it.each([
    [1000, 3],
    [100, 7],
    [0.03, 2],
    [1234.56, 5],
    [50, 1],
    [10, 4],
    [0.01, 3],
    [99999.99, 7],
  ])('%s over %s children still totals the original', (total, parts) => {
    expect(sum(splitAmount(total, parts))).toBe(total);
  });

  it('never loses a kuruş to floating point', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; working in integer kuruş is
    // the whole reason this function exists rather than a bare division.
    expect(sum(splitAmount(0.3, 3))).toBe(0.3);
  });

  it('returns nothing for a non-positive number of parts', () => {
    expect(splitAmount(100, 0)).toEqual([]);
    expect(splitAmount(100, -1)).toEqual([]);
  });
});
