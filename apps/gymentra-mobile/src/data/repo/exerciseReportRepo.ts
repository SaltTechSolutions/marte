import * as api from '../api/exerciseReportRepo';
import * as fb from '../firebase/exerciseReportRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const reportExercise = impl.reportExercise;
