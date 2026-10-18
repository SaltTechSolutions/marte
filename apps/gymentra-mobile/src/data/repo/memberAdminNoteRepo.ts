import * as api from '../api/memberAdminNoteRepo';
import * as fb from '../firebase/memberAdminNoteRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const MEMBER_ADMIN_NOTE_MAX = impl.MEMBER_ADMIN_NOTE_MAX;
export const memberAdminNoteId = impl.memberAdminNoteId;
export const watchMemberAdminNote = impl.watchMemberAdminNote;
export const setMemberAdminNote = impl.setMemberAdminNote;
export type * from '../firebase/memberAdminNoteRepo';
