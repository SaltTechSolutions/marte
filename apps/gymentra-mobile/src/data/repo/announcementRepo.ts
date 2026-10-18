import * as api from '../api/announcementRepo';
import * as fb from '../firebase/announcementRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const ANNOUNCEMENT_TITLE_MAX = impl.ANNOUNCEMENT_TITLE_MAX;
export const ANNOUNCEMENT_BODY_MAX = impl.ANNOUNCEMENT_BODY_MAX;
export const ANNOUNCEMENT_DEFAULT_DAYS = impl.ANNOUNCEMENT_DEFAULT_DAYS;
export const watchAnnouncements = impl.watchAnnouncements;
export const isLive = impl.isLive;
export const createAnnouncement = impl.createAnnouncement;
export const deleteAnnouncement = impl.deleteAnnouncement;
