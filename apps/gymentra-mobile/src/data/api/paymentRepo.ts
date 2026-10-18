import type { WatchErrorHandler } from '../firebase/watch';
import type { Payment, PaymentMethod } from '../types';
import { ApiError, apiGet, apiPost, apiPut } from './client';
import { selfInternalId, toInternalId } from './membershipIdentity';
import { paymentFromDto } from './pkgDto';
import { splitAmount } from '@/utils/splitAmount';
import { toApiMoney } from './pkgMoney';
import { inTenantOf, pkgInvalidate, rememberTenant } from './pkgTenant';
import { watchPoll } from './pkgWatch';

/**
 * The payment ledger over the Worker (`/tenants/:t/payments`, `…/payments/:id/decision`,
 * `…/payments/group`, `…/members/:m/payments`). The ledger is append-only: a wrong entry is cancelled by a
 * `reversal` row that points at it, never edited. Amounts are lira in the app and integer kuruş on the wire (see `pkgMoney.ts`).
 */
type Raw = Record<string, any>;

type Entry = { tenantId: string; memberId: string; amount: number; method: PaymentMethod; note?: string };

const entryBody = async (p: Entry) => ({
  memberId: await toInternalId(p.memberId),
  amount: toApiMoney(p.amount),
  method: p.method,
  ...(p.note ? { note: p.note } : {}),
});

const paymentsChanged = (tenantId: string) => pkgInvalidate(tenantId, 'payments');

/** Admin enters a payment they actually received: the Worker confirms it at once. `memberName` is the Worker's own record. */
export async function recordPayment(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
}): Promise<void> {
  await apiPost(`/tenants/${params.tenantId}/payments`, await entryBody(params));
  paymentsChanged(params.tenantId);
}

/** Member flags "I sent this": the Worker files it `pending` (a member cannot confirm their own). */
export async function submitPaymentNotice(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
}): Promise<void> {
  await apiPost(`/tenants/${params.tenantId}/payments`, await entryBody(params));
  paymentsChanged(params.tenantId);
}

const decisionMiss = (e: ApiError) => e.status === 404 || (e.status === 409 && e.apiCode === 'not pending');

async function decide(paymentId: string, status: 'confirmed' | 'rejected'): Promise<void> {
  await inTenantOf(
    'payment',
    paymentId,
    async (tenantId) => {
      await apiPut(`/tenants/${tenantId}/payments/${paymentId}/decision`, { status });
      paymentsChanged(tenantId);
    },
    { adminOnly: true, miss: decisionMiss },
  );
}

export async function confirmPayment(paymentId: string): Promise<void> {
  await decide(paymentId, 'confirmed');
}

export async function rejectPayment(paymentId: string): Promise<void> {
  await decide(paymentId, 'rejected');
}

/**
 * The admin's gym-wide ledger, newest first, capped at 200 like the Firebase listener
 * (`GET /tenants/:t/payments`, admin only; every row carries `memberId` and `memberName`).
 */
export function watchPaymentsForTenant(
  tenantId: string,
  onChange: (payments: Payment[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    `t:${tenantId}:payments:all`,
    async () => {
      await selfInternalId();
      const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/payments?limit=200`);
      const list = rows.map((r) => paymentFromDto(r, tenantId, ''));
      rememberTenant('payment', list, tenantId);
      return list;
    },
    onChange,
    onError,
  );
}

/** A member's own payment history, newest first (self, the gym's admins, or an approved guardian). */
export function watchPaymentsForMember(
  tenantId: string,
  memberId: string,
  onChange: (payments: Payment[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(
    `t:${tenantId}:payments:member:${memberId}`,
    async () => {
      const internal = await toInternalId(memberId);
      await selfInternalId();
      const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/members/${internal}/payments?limit=50`);
      const list = rows.map((r) => paymentFromDto(r, tenantId, memberId));
      rememberTenant('payment', list, tenantId);
      return list;
    },
    onChange,
    onError,
  );
}

/**
 * A parent files ONE payment for one or more children: one pending entry per child (their own ledger stays
 * right) sharing a `paymentGroupId`, written all-or-nothing by the Worker.
 *
 * With `amounts` the shares are the parent's own; without it the total is split equally with the same
 * `splitAmount` the screen previews (the odd kuruş goes to the last share). `submittedBy` /
 * `submittedByName` are the Worker's own records of the caller.
 */
export async function submitGroupPaymentNotice(params: {
  tenantId: string;
  children: { memberId: string; memberName: string }[];
  totalAmount: number;
  method: PaymentMethod;
  submittedBy: string;
  submittedByName: string;
  /** One amount per child, in the same order. Omit for an equal split. */
  amounts?: number[];
  note?: string;
}): Promise<{ shares: number[] }> {
  if (params.children.length === 0) throw new Error('En az bir çocuk seçilmeli.');

  // The shares are decided HERE (the parent's own, or the screen's `splitAmount` preview) and sent per
  // child, so what the Worker stores is exactly what the screen previewed: 1000,00 TL over 3 children is
  // 333,33 / 333,33 / 333,34.
  const shares = params.amounts ?? splitAmount(params.totalAmount, params.children.length);
  if (shares.length !== params.children.length) throw new Error('Her çocuk için bir tutar gerekiyor.');
  // Compared in kuruş: summing lira in floating point is exactly the trap `splitAmount` exists to avoid.
  const sumKurus = shares.reduce((acc, v) => acc + Math.round(v * 100), 0);
  if (sumKurus !== Math.round(params.totalAmount * 100)) throw new Error('Girilen tutarların toplamı ödeme tutarına eşit değil.');
  if (shares.some((v) => v <= 0)) throw new Error('Her tutar sıfırdan büyük olmalı.');

  const ids = await Promise.all(params.children.map((c) => toInternalId(c.memberId)));
  await apiPost(`/tenants/${params.tenantId}/payments/group`, {
    method: params.method,
    ...(params.note ? { note: params.note } : {}),
    totalAmount: sumKurus,
    entries: ids.map((memberId, i) => ({ memberId, amount: toApiMoney(shares[i]) })),
  });
  paymentsChanged(params.tenantId);
  return { shares };
}

/**
 * Cancels a wrongly recorded payment: a `reversal` row of the same amount is written against it and the
 * original is flagged, in one Worker batch (a second reversal of the same row loses). Admin only.
 */
export async function reversePayment(params: { payment: Payment; reason: string; reversedBy: string }): Promise<void> {
  const { payment, reason } = params;
  if (payment.reversedAt) throw new Error('Bu ödeme zaten düzeltilmiş.');
  await apiPost(`/tenants/${payment.tenantId}/payments`, {
    memberId: await toInternalId(payment.memberId),
    amount: toApiMoney(payment.amount),
    method: payment.method,
    kind: 'reversal',
    reversesPaymentId: payment.id,
    reason,
  });
  paymentsChanged(payment.tenantId);
}
