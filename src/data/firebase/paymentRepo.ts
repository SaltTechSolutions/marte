import { addDoc, collection, doc, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

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
