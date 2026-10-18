import * as api from '../api/paymentRepo';
import * as fb from '../firebase/paymentRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const recordPayment = impl.recordPayment;
export const submitPaymentNotice = impl.submitPaymentNotice;
export const confirmPayment = impl.confirmPayment;
export const rejectPayment = impl.rejectPayment;
export const watchPaymentsForTenant = impl.watchPaymentsForTenant;
export const watchPaymentsForMember = impl.watchPaymentsForMember;
export const submitGroupPaymentNotice = impl.submitGroupPaymentNotice;
export const reversePayment = impl.reversePayment;
