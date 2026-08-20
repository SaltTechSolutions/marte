import { describe, expect, it } from 'vitest';

import { applyPromotionEffect } from './memberPackageRepo';

describe('applyPromotionEffect', () => {
  it('applies a percent discount and rounds', () => {
    expect(applyPromotionEffect(1000, { kind: 'percentDiscount', value: 15 })).toEqual({
      finalPrice: 850,
      bonusDays: 0,
      bonusLessons: 0,
    });
  });

  it('applies a flat amount discount, floored at zero', () => {
    expect(applyPromotionEffect(500, { kind: 'amountDiscount', value: 800 })).toEqual({
      finalPrice: 0,
      bonusDays: 0,
      bonusLessons: 0,
    });
  });

  it('bonusDays leaves price untouched', () => {
    expect(applyPromotionEffect(1000, { kind: 'bonusDays', value: 14 })).toEqual({
      finalPrice: 1000,
      bonusDays: 14,
      bonusLessons: 0,
    });
  });

  it('bonusLessons leaves price untouched', () => {
    expect(applyPromotionEffect(1000, { kind: 'bonusLessons', value: 2 })).toEqual({
      finalPrice: 1000,
      bonusDays: 0,
      bonusLessons: 2,
    });
  });
});
