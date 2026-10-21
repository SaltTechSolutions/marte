import { describe, expect, it } from 'vitest';

import { formatLira } from './money';

describe('formatLira', () => {
  it('whole amounts have no decimals, fractions always have two, thousands are dotted (tr-TR)', () => {
    expect(formatLira(250)).toBe('250');
    expect(formatLira(250.5)).toBe('250,50');
    expect(formatLira(1999.99)).toBe('1.999,99');
    expect(formatLira(0)).toBe('0');
    expect(formatLira(1000)).toBe('1.000');
  });
});
