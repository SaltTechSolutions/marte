import * as api from '../api/tenantRepo';
import * as fb from '../firebase/tenantRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const findTenantByCode = impl.findTenantByCode;
export const getTenant = impl.getTenant;
export const watchTenant = impl.watchTenant;
export const createTenantWithOwner = impl.createTenantWithOwner;
export const updateTenantBranding = impl.updateTenantBranding;
export const updateTenantIdentity = impl.updateTenantIdentity;
export const updateTenantCancellationHours = impl.updateTenantCancellationHours;
export const updateTenantOpeningHours = impl.updateTenantOpeningHours;
export const getTenantContact = impl.getTenantContact;
export const updateTenantContact = impl.updateTenantContact;
export const uploadTenantLogo = impl.uploadTenantLogo;
