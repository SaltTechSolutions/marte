import * as api from '../api/memberPackageRepo';
import * as fb from '../firebase/memberPackageRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const memberEntitlementsId = impl.memberEntitlementsId;
export const applyPromotionEffect = impl.applyPromotionEffect;
export const assignPackageToMember = impl.assignPackageToMember;
export const getMemberPackages = impl.getMemberPackages;
export const getMemberPackage = impl.getMemberPackage;
export const getActiveMemberCredits = impl.getActiveMemberCredits;
export const watchMemberEntitlements = impl.watchMemberEntitlements;
export const watchMemberPackages = impl.watchMemberPackages;
export const watchTenantMemberPackages = impl.watchTenantMemberPackages;
export const watchMemberCredits = impl.watchMemberCredits;
export const freezeMemberPackage = impl.freezeMemberPackage;
export const cancelPackageAssignment = impl.cancelPackageAssignment;
export type { CancellationAccess } from '../firebase/memberPackageRepo';
