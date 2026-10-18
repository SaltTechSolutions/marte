import * as api from '../api/memberAddressRepo';
import * as fb from '../firebase/memberAddressRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const MEMBER_ADDRESS_MAX = impl.MEMBER_ADDRESS_MAX;
export const memberAddressId = impl.memberAddressId;
export const watchMemberAddress = impl.watchMemberAddress;
export const getMemberAddress = impl.getMemberAddress;
export const setMemberAddress = impl.setMemberAddress;
export type * from '../firebase/memberAddressRepo';
