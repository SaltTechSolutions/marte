import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

import { db } from '@/services/firebase';
import { splitAmount } from '@/utils/splitAmount';

import { Payment, PaymentMethod } from '../types';
import { paymentFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

/** Admin enters a payment they actually received (cash handed over, bank
 * transfer confirmed against a statement) — trusted immediately, no approval step. */
export async function recordPayment(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
}): Promise<void> {
  await addDoc(collection(db, 'payments'), {
    tenantId: params.tenantId,
    memberId: params.memberId,
    memberName: params.memberName,
    amount: params.amount,
    method: params.method,
    status: 'confirmed',
    ...(params.note ? { note: params.note } : {}),
    createdAt: serverTimestamp(),
    confirmedAt: serverTimestamp(),
  });
}

/** Member flags "I sent this" — sits as pending until the admin checks their
 * bank statement / cash drawer and confirms or rejects it. */
export async function submitPaymentNotice(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
}): Promise<void> {
  await addDoc(collection(db, 'payments'), {
    tenantId: params.tenantId,
    memberId: params.memberId,
    memberName: params.memberName,
    amount: params.amount,
    method: params.method,
    status: 'pending',
    ...(params.note ? { note: params.note } : {}),
    createdAt: serverTimestamp(),
  });
}

export async function confirmPayment(paymentId: string): Promise<void> {
  await updateDoc(doc(db, 'payments', paymentId), { status: 'confirmed', confirmedAt: serverTimestamp() });
}

export async function rejectPayment(paymentId: string): Promise<void> {
  await updateDoc(doc(db, 'payments', paymentId), { status: 'rejected', confirmedAt: serverTimestamp() });
}

/** Admin's full ledger for the tenant, newest first. */
export function watchPaymentsForTenant(
  tenantId: string,
  onChange: (payments: ReturnType<typeof paymentFromDoc>[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'payments'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(200),
  );
  return watchQuery('Ödemeler', q, (snap) => snap.docs.map(paymentFromDoc), onChange, onError);
}

/** A member's own payment history, newest first. */
export function watchPaymentsForMember(
  tenantId: string,
  memberId: string,
  onChange: (payments: ReturnType<typeof paymentFromDoc>[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'payments'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    orderBy('createdAt', 'desc'),
    limit(50),
  );
  return watchQuery('Ödemelerim', q, (snap) => snap.docs.map(paymentFromDoc), onChange, onError);
}

/**
 * A parent files ONE payment for one or more children (MEMBER-5e, decision 7).
 *
 * Each child gets their own entry — `memberId` is the child, so the per-child
 * ledger stays right — carrying `submittedBy` (who paid) and a shared
 * `paymentGroupId` (that these came from one act of paying). Without the group
 * id the gym sees three unrelated payments and cannot tell a 900₺ split from
 * three coincidental 300₺ ones.
 *
 * `amounts` lets the parent set each share by hand — three children rarely owe
 * the same thing, and an equal split is a convenience, not a rule. Omit it and
 * the total is divided equally.
 *
 * A batch, not a loop: half-written is the worst outcome here. The parent
 * would have paid 900₺ and be looking at a ledger showing 600₺, with no way to
 * tell which child is missing.
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

  const shares = params.amounts ?? splitAmount(params.totalAmount, params.children.length);
  if (shares.length !== params.children.length) {
    throw new Error('Her çocuk için bir tutar gerekiyor.');
  }
  // Compared in kuruş: summing lira in floating point is exactly the trap
  // `splitAmount` exists to avoid, and letting a 1-kuruş drift through would
  // put a total in the ledger that is not the amount the parent handed over.
  const sumKurus = shares.reduce((acc, v) => acc + Math.round(v * 100), 0);
  if (sumKurus !== Math.round(params.totalAmount * 100)) {
    throw new Error('Girilen tutarların toplamı ödeme tutarına eşit değil.');
  }
  if (shares.some((v) => v <= 0)) {
    throw new Error('Her tutar sıfırdan büyük olmalı.');
  }
  // The group id is generated client-side so every doc in the batch can carry
  // it: a server-assigned id would only exist after the write it has to be in.
  const paymentGroupId = doc(collection(db, 'payments')).id;

  const batch = writeBatch(db);
  params.children.forEach((child, i) => {
    batch.set(doc(collection(db, 'payments')), {
      tenantId: params.tenantId,
      memberId: child.memberId,
      memberName: child.memberName,
      amount: shares[i],
      method: params.method,
      status: 'pending',
      submittedBy: params.submittedBy,
      submittedByName: params.submittedByName,
      paymentGroupId,
      ...(params.note ? { note: params.note } : {}),
      createdAt: serverTimestamp(),
    });
  });
  await batch.commit();

  return { shares };
}

/**
 * Cancels a wrongly recorded payment (ADMIN-4).
 *
 * The original row is never edited: its amount, method and date are what the
 * admin originally believed, and overwriting them hides that a correction
 * happened at all. Instead a `reversal` row of the same amount is written
 * against it, and the original is flagged so the screens can strike it
 * through. Totals come out right on their own because `sumPayments` reads
 * the sign from `kind`.
 *
 * A batch: a reversal without its flag would let the same row be reversed
 * twice, and a flag without its reversal would show a cancelled payment that
 * still counts towards revenue.
 */
export async function reversePayment(params: {
  payment: Payment;
  reason: string;
  reversedBy: string;
}): Promise<void> {
  const { payment, reason, reversedBy } = params;
  if (payment.reversedAt) throw new Error('Bu ödeme zaten düzeltilmiş.');

  const reversalRef = doc(collection(db, 'payments'));
  const batch = writeBatch(db);

  batch.set(reversalRef, {
    tenantId: payment.tenantId,
    memberId: payment.memberId,
    memberName: payment.memberName,
    amount: payment.amount,
    method: payment.method,
    kind: 'reversal',
    // Confirmed straight away: an admin correcting their own books is not
    // filing a notice for someone else to approve.
    status: 'confirmed',
    reversesPaymentId: payment.id,
    reversalReason: reason,
    reversedBy,
    createdAt: serverTimestamp(),
    confirmedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'payments', payment.id), {
    reversedAt: serverTimestamp(),
    reversedByPaymentId: reversalRef.id,
    reversalReason: reason,
  });

  await batch.commit();
}
