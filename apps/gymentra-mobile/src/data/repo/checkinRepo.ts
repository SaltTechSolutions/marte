import * as api from '../api/checkinRepo';
import * as fb from '../firebase/checkinRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const watchTodayCheckinCount = impl.watchTodayCheckinCount;
export const resolveAccess = impl.resolveAccess;
export const WARN_MESSAGE = impl.WARN_MESSAGE;
export const checkInByMembershipId = impl.checkInByMembershipId;
export const checkInByShortCode = impl.checkInByShortCode;
export const confirmCheckInDespiteWarning = impl.confirmCheckInDespiteWarning;
export const watchMyCheckins = impl.watchMyCheckins;
export const watchTodayCheckins = impl.watchTodayCheckins;
export type { CheckInWarnReason } from '../firebase/checkinRepo';
