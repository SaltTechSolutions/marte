import * as api from '../api/userSettingsRepo';
import * as fb from '../firebase/userSettingsRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const watchUserSettings = impl.watchUserSettings;
export const setNotificationPreference = impl.setNotificationPreference;
