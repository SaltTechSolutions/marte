import { Payment } from '@/data/types';

/**
 * What a set of ledger rows is actually worth.
 *
 * `kind` existed on the type but nothing ever read it: the dashboard summed
 * every amount, so recording a refund made revenue go UP. With reversals now
 * being written on purpose that stops being a latent bug and becomes a wrong
 * number on the owner's home screen, so the sign lives in one function that
 * every total goes through.
 */
export function signedAmount(p: Payment): number {
  return p.kind === 'refund' || p.kind === 'reversal' ? -p.amount : p.amount;
}

export function sumPayments(payments: Payment[]): number {
  return payments.reduce((total, p) => total + signedAmount(p), 0);
}
