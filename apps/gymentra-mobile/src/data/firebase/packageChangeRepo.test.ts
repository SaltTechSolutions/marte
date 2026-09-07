import { describe, expect, it } from 'vitest';

import { computeProratedRefund } from './packageChangeRepo';

describe('computeProratedRefund', () => {
  it('refunds the unused fraction of the price difference', () => {
    // 180-day package, 92 days remaining, downgrading from 1000 to 500.
    const current = { finalPrice: 1000, startsAt: new Date(2026, 0, 1), endsAt: new Date(2026, 5, 30) };
    const effectiveAt = new Date(2026, 2, 30); // 92 days before endsAt
    const { refundAmount, refundBasis } = computeProratedRefund(current, 500, effectiveAt);
    expect(refundAmount).toBeGreaterThan(0);
    expect(refundAmount).toBeLessThan(500);
    expect(refundBasis).toMatch(/^kalan \d+\/\d+ gün$/);
  });

  it('refunds nothing when the swap takes effect on the last day', () => {
    const current = { finalPrice: 1000, startsAt: new Date(2026, 0, 1), endsAt: new Date(2026, 5, 30) };
    const { refundAmount } = computeProratedRefund(current, 500, current.endsAt);
    expect(refundAmount).toBe(0);
  });

  it('refunds the full difference when the swap takes effect on day one', () => {
    const current = { finalPrice: 1000, startsAt: new Date(2026, 0, 1), endsAt: new Date(2026, 0, 31) };
    const { refundAmount } = computeProratedRefund(current, 400, current.startsAt);
    expect(refundAmount).toBe(600);
  });

  it('never divides by zero for a same-day start/end holding', () => {
    const current = { finalPrice: 1000, startsAt: new Date(2026, 0, 1), endsAt: new Date(2026, 0, 1) };
    const { refundAmount } = computeProratedRefund(current, 0, new Date(2026, 0, 1));
    expect(Number.isFinite(refundAmount)).toBe(true);
  });
});
