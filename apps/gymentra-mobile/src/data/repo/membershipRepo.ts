import * as api from '../api/membershipRepo';
import * as fb from '../firebase/membershipRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const membershipId = impl.membershipId;
export const getMembership = impl.getMembership;
export const getMembershipById = impl.getMembershipById;
export const watchMembership = impl.watchMembership;
export const requestJoin = impl.requestJoin;
export const getActiveMemberships = impl.getActiveMemberships;
export const watchActiveMembers = impl.watchActiveMembers;
export const watchActiveTrainers = impl.watchActiveTrainers;
export const watchActiveAdmins = impl.watchActiveAdmins;
export const watchPendingRequests = impl.watchPendingRequests;
export const approveMembership = impl.approveMembership;
export const rejectMembership = impl.rejectMembership;
export const countActiveMembers = impl.countActiveMembers;
export const setMembershipPermissions = impl.setMembershipPermissions;
export const setMembershipRoles = impl.setMembershipRoles;
export const updateMemberDetails = impl.updateMemberDetails;
export const createManagedMember = impl.createManagedMember;
export const removeMemberFromTenant = impl.removeMemberFromTenant;
export const leaveTenant = impl.leaveTenant;
export const requestGuardian = impl.requestGuardian;
export const respondToGuardian = impl.respondToGuardian;
export const watchMyChildren = impl.watchMyChildren;
