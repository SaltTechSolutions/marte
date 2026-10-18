import * as api from '../api/programTemplateRepo';
import * as fb from '../firebase/programTemplateRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const watchProgramTemplates = impl.watchProgramTemplates;
export const getProgramTemplate = impl.getProgramTemplate;
export type * from '../firebase/programTemplateRepo';
