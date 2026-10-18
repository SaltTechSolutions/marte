import * as api from '../api/packageRepo';
import * as fb from '../firebase/packageRepo';
import { BACKEND } from '../backend';

/** The api module must keep exactly the Firebase module's exports and signatures (typed below). */
const impl: typeof fb = BACKEND === 'api' ? api : fb;

export const seedDefaultPackages = impl.seedDefaultPackages;
export const canEditPackage = impl.canEditPackage;
export const createGymPackage = impl.createGymPackage;
export const updateGymPackage = impl.updateGymPackage;
export const setPackageActive = impl.setPackageActive;
export const createPackageVersion = impl.createPackageVersion;
export const getGymPackage = impl.getGymPackage;
export const watchPackagesForTenant = impl.watchPackagesForTenant;
export type * from '../firebase/packageRepo';
