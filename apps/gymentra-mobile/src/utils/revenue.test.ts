import { describe, expect, it } from 'vitest';

import { Payment } from '@/data/types';

import { signedAmount, sumPayments } from './revenue';

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'p1',
    tenantId: 't1',
    memberId: 'm1',
    memberName: 'Üye',
    amount: 500,
    method: 'cash',
    status: 'confirmed',
    kind: 'charge',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('signedAmount', () => {
  it('counts a charge as income', () => {
    expect(signedAmount(payment({ kind: 'charge' }))).toBe(500);
  });

  // The bug this function exists to prevent: the dashboard summed raw
  // amounts, so recording a refund made revenue go UP.
  it('counts a refund and a reversal against income', () => {
    expect(signedAmount(payment({ kind: 'refund' }))).toBe(-500);
    expect(signedAmount(payment({ kind: 'reversal' }))).toBe(-500);
  });

  it('treats a missing kind as a charge — every row written before the field existed', () => {
    expect(signedAmount(payment({ kind: undefined }))).toBe(500);
  });
});

describe('sumPayments', () => {
  it('is zero for an empty ledger', () => {
    expect(sumPayments([])).toBe(0);
  });

  it('a reversal cancels the row it undoes exactly', () => {
    const total = sumPayments([
      payment({ id: 'a', amount: 500, kind: 'charge' }),
      payment({ id: 'b', amount: 500, kind: 'reversal' }),
    ]);
    expect(total).toBe(0);
  });

  it('adds up a mixed month', () => {
    expect(
      sumPayments([
        payment({ id: 'a', amount: 1000 }),
        payment({ id: 'b', amount: 250, kind: 'refund' }),
        payment({ id: 'c', amount: 300 }),
      ]),
    ).toBe(1050);
  });
});
