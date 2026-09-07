import { addDoc, collection, doc, getDoc, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { GymPackage, PackageEntitlements, PackageKind } from '../types';
import { gymPackageFromDoc } from './convert';
import { WatchErrorHandler, watchQuery } from './watch';

/**
 * Seed content for a brand-new gym — a starting point, not a fixed catalog.
 * The app never branches on package *name* after this point; these three
 * documents are ordinary `gym_packages` rows the admin is free to rename,
 * re-price, or strip entitlements from the moment they're written.
 */
const DEFAULT_PACKAGE_TEMPLATES: {
  name: string;
  kind: PackageKind;
  price: number;
  durationDays?: number;
  entitlements: PackageEntitlements;
  sortOrder: number;
}[] = [
  {
    name: 'Silver',
    kind: 'membership',
    price: 0,
    durationDays: 30,
    entitlements: { gymAccess: true },
    sortOrder: 0,
  },
  {
    name: 'Gold',
    kind: 'membership',
    price: 0,
    durationDays: 30,
    entitlements: { gymAccess: true, groupClasses: { unlimited: true } },
    sortOrder: 1,
  },
  {
    name: 'Platinium',
    kind: 'membership',
    price: 0,
    durationDays: 30,
    entitlements: {
      gymAccess: true,
      groupClasses: { unlimited: true },
      ptLessons: { count: 12, periodDays: 90 },
    },
    sortOrder: 2,
  },
];

/**
 * Writes the three default packages for a just-created tenant. Prices are
 * seeded at 0 — a placeholder the admin is expected to fill in from Salon
 * Ayarları before selling anything, not a real free tier.
 *
 * Fire-and-forget by design: called right after `createTenantWithOwner`
 * commits the owner's admin membership, which is what the `gym_packages`
 * create rule checks. A failure here shouldn't block gym creation — an
 * admin with an empty catalog can still add packages by hand.
 */
export async function seedDefaultPackages(tenantId: string): Promise<void> {
  await Promise.all(
    DEFAULT_PACKAGE_TEMPLATES.map((template) =>
      addDoc(collection(db, 'gym_packages'), {
        tenantId,
        ...template,
        activeAssignmentCount: 0,
        isActive: true,
        createdAt: serverTimestamp(),
      }),
    ),
  );
}

/** A package with no live assignments — its content may still be edited directly. */
export function canEditPackage(pkg: GymPackage): boolean {
  return pkg.activeAssignmentCount === 0;
}

export interface PackageDraft {
  name: string;
  kind: PackageKind;
  price: number;
  durationDays?: number;
  lessonCount?: number;
  lessonValidityDays?: number;
  entitlements: PackageEntitlements;
  freezePolicy?: { minDays: number; maxCount: number };
}

export async function createGymPackage(tenantId: string, draft: PackageDraft): Promise<void> {
  await addDoc(collection(db, 'gym_packages'), {
    tenantId,
    ...draft,
    activeAssignmentCount: 0,
    isActive: true,
    sortOrder: Date.now(),
    createdAt: serverTimestamp(),
  });
}

/**
 * Edits a package's content in place. Only valid while `canEditPackage` is
 * true — the security rule enforces the same lock, so a stale client-side
 * check just fails loudly instead of silently corrupting the catalog.
 */
export async function updateGymPackage(packageId: string, draft: PackageDraft): Promise<void> {
  await updateDoc(doc(db, 'gym_packages', packageId), { ...draft, updatedAt: serverTimestamp() });
}

export async function setPackageActive(packageId: string, isActive: boolean): Promise<void> {
  await updateDoc(doc(db, 'gym_packages', packageId), { isActive, updatedAt: serverTimestamp() });
}

/**
 * Replaces a locked package (one with live assignments) with a new version
 * carrying the edited content. The old row is retired (`isActive: false`,
 * still readable by its existing holders) rather than deleted — deleting it
 * would strand `member_packages` rows that still point at it for their
 * original terms.
 *
 * One batch: the retirement and the new version either both land or neither
 * does, so the catalog is never seen mid-swap.
 */
export async function createPackageVersion(previous: GymPackage, draft: PackageDraft): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'gym_packages', previous.id), { isActive: false, updatedAt: serverTimestamp() });
  batch.set(doc(collection(db, 'gym_packages')), {
    tenantId: previous.tenantId,
    ...draft,
    activeAssignmentCount: 0,
    supersedesId: previous.id,
    isActive: true,
    sortOrder: previous.sortOrder,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

/** One-shot fetch for the edit form — the catalog list screen already streams live. */
export async function getGymPackage(packageId: string): Promise<GymPackage | null> {
  const snap = await getDoc(doc(db, 'gym_packages', packageId));
  return snap.exists() ? gymPackageFromDoc(snap) : null;
}

/** Full catalog for the admin screen — active and retired versions alike, oldest first. */
export function watchPackagesForTenant(
  tenantId: string,
  onChange: (packages: GymPackage[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(collection(db, 'gym_packages'), where('tenantId', '==', tenantId), orderBy('sortOrder', 'asc'));
  return watchQuery('Paket kataloğu', q, (snap) => snap.docs.map(gymPackageFromDoc), onChange, onError);
}
