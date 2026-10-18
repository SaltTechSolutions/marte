import * as api from '../api/programRepo';
import * as fb from '../firebase/programRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const newLocalId = impl.newLocalId;
export const findOrCreateDraftProgram = impl.findOrCreateDraftProgram;
export const watchProgram = impl.watchProgram;
export const saveProgramDays = impl.saveProgramDays;
export const setProgramWarmup = impl.setProgramWarmup;
export const saveProgramExercises = impl.saveProgramExercises;
export const setProgramStatus = impl.setProgramStatus;
export const watchActiveProgramForMember = impl.watchActiveProgramForMember;
export const watchActiveProgramsForTenant = impl.watchActiveProgramsForTenant;
export const watchProgramsForTenant = impl.watchProgramsForTenant;
