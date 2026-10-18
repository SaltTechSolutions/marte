import * as api from '../api/memberPhotoRepo';
import * as fb from '../firebase/memberPhotoRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const uploadMemberPhoto = impl.uploadMemberPhoto;
export const deleteMemberPhoto = impl.deleteMemberPhoto;
