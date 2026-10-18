import * as api from '../api/pushTokenRepo';
import * as fb from '../firebase/pushTokenRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const registerPushToken = impl.registerPushToken;
export const unregisterPushToken = impl.unregisterPushToken;
export type * from '../firebase/pushTokenRepo';
