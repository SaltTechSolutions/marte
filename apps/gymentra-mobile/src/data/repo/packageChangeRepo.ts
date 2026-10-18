import * as api from '../api/packageChangeRepo';
import * as fb from '../firebase/packageChangeRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const computeProratedRefund = impl.computeProratedRefund;
export const createPackageChangeRequest = impl.createPackageChangeRequest;
export const watchPendingPackageChangeRequests = impl.watchPendingPackageChangeRequests;
export const watchPackageChangeRequest = impl.watchPackageChangeRequest;
export const getPackageChangeRequest = impl.getPackageChangeRequest;
export const respondToPackageChangeRequest = impl.respondToPackageChangeRequest;
export const cancelPackageChangeRequest = impl.cancelPackageChangeRequest;
export type * from '../firebase/packageChangeRepo';
