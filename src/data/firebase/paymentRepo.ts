import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

import { db } from '@/services/firebase';
import { splitAmount } from '@/utils/splitAmount';

import { PaymentMethod } from '../types';
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
  note?: string;
}): Promise<{ shares: number[] }> {
  if (params.children.length === 0) throw new Error('En az bir çocuk seçilmeli.');

  const shares = splitAmount(params.totalAmount, params.children.length);
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
