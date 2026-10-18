import * as api from '../api/measurementRepo';
import * as fb from '../firebase/measurementRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const addMeasurement = impl.addMeasurement;
export const watchMeasurements = impl.watchMeasurements;
export type * from '../firebase/measurementRepo';
