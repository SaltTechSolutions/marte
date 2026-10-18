import * as api from '../api/calendarShareRepo';
import * as fb from '../firebase/calendarShareRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const calendarShareId = impl.calendarShareId;
export const grantCalendarShare = impl.grantCalendarShare;
export const revokeCalendarShare = impl.revokeCalendarShare;
export const watchSharesIGranted = impl.watchSharesIGranted;
export const watchSharesGrantedToMe = impl.watchSharesGrantedToMe;
export type * from '../firebase/calendarShareRepo';
