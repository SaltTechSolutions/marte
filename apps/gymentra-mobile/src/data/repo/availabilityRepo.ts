import * as api from '../api/availabilityRepo';
import * as fb from '../firebase/availabilityRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const trainerAvailabilityId = impl.trainerAvailabilityId;
export const watchTrainerAvailability = impl.watchTrainerAvailability;
export const setTrainerAvailability = impl.setTrainerAvailability;
export const hasAnyAvailability = impl.hasAnyAvailability;
export const watchTrainerBusySlotsForDay = impl.watchTrainerBusySlotsForDay;
export const computeFreeSlots = impl.computeFreeSlots;
export type * from '../firebase/availabilityRepo';
