import * as api from '../api/ptSessionRepo';
import * as fb from '../firebase/ptSessionRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const createPtSession = impl.createPtSession;
export const watchSessionsForTrainer = impl.watchSessionsForTrainer;
export const watchSessionsForMember = impl.watchSessionsForMember;
export const watchUpcomingSessionsForMember = impl.watchUpcomingSessionsForMember;
export const bookPtSessions = impl.bookPtSessions;
export const hasSessionToday = impl.hasSessionToday;
export const watchSessionsForTenant = impl.watchSessionsForTenant;
export const reassignSession = impl.reassignSession;
export const setSessionStatus = impl.setSessionStatus;
export const cancelPtSession = impl.cancelPtSession;
