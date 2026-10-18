import * as api from '../api/classRepo';
import * as fb from '../firebase/classRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const watchClassesForTenant = impl.watchClassesForTenant;
export const createClass = impl.createClass;
export const updateClass = impl.updateClass;
export const deleteClass = impl.deleteClass;
export const bookClass = impl.bookClass;
export const cancelBooking = impl.cancelBooking;
export const watchMyUpcomingClasses = impl.watchMyUpcomingClasses;
export const watchClassesForTrainer = impl.watchClassesForTrainer;
export const setClassAttendance = impl.setClassAttendance;
export const bookGroupClassWithCredit = impl.bookGroupClassWithCredit;
export const cancelGroupClassWithCredit = impl.cancelGroupClassWithCredit;
export const createClassSeries = impl.createClassSeries;
export const deleteClassSeriesFrom = impl.deleteClassSeriesFrom;
export type { GroupBookingResult } from '../firebase/classRepo';
