import * as api from '../api/renewalRequestRepo';
import * as fb from '../firebase/renewalRequestRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const renewalRequestId = impl.renewalRequestId;
export const watchMyRenewalRequest = impl.watchMyRenewalRequest;
export const requestRenewal = impl.requestRenewal;
export const withdrawRenewal = impl.withdrawRenewal;
export const watchPendingRenewals = impl.watchPendingRenewals;
export const markRenewalHandled = impl.markRenewalHandled;
export type * from '../firebase/renewalRequestRepo';
