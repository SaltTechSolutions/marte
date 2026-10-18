import * as api from '../api/memberNoteRepo';
import * as fb from '../firebase/memberNoteRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const MEMBER_NOTE_MAX = impl.MEMBER_NOTE_MAX;
export const memberNoteId = impl.memberNoteId;
export const watchMemberNote = impl.watchMemberNote;
export const setMemberNote = impl.setMemberNote;
export type * from '../firebase/memberNoteRepo';
