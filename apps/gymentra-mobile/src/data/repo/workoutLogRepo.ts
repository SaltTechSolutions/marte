import * as api from '../api/workoutLogRepo';
import * as fb from '../firebase/workoutLogRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const startWorkoutLog = impl.startWorkoutLog;
export const getRecentLogs = impl.getRecentLogs;
export const watchWorkoutLog = impl.watchWorkoutLog;
export const saveExerciseLogs = impl.saveExerciseLogs;
export const completeWorkoutLog = impl.completeWorkoutLog;
export const watchWorkoutLogsForMember = impl.watchWorkoutLogsForMember;
export const watchCompletedThisWeek = impl.watchCompletedThisWeek;
