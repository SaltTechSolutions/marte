import type { WatchErrorHandler } from '../firebase/watch';
import type { GymPackage, PackageEntitlements, PackageKind } from '../types';
import type { PackageDraft } from '../firebase/packageRepo';
import { ApiError, apiGet, apiPost, apiPut } from './client';
import { gymPackageFromDto } from './pkgDto';
import { toApiMoney } from './pkgMoney';
import { canEditPackage } from './pkgPure';
import { inTenantOf, pkgInvalidate, rememberTenant } from './pkgTenant';
import { watchPoll } from './pkgWatch';

/**
 * The gym's package catalog over the Worker (`/tenants/:t/packages`).
 *
 * Server rules this layer relies on: a package in use (`activeAssignmentCount > 0`) accepts only
 * `isActive` / `sortOrder` changes (409 otherwise); a package NOT in use takes a PARTIAL body merged over the
 * stored one (a `null` removes a key) and the merged result is validated. A lost race is a 409, not a silent ok.
 */
export { canEditPackage };

type Raw = Record<string, any>;

/** Seed content for a brand-new gym: ordinary catalog rows the admin may rename, re-price or strip. */
const DEFAULT_PACKAGE_TEMPLATES: {
  name: string;
  kind: PackageKind;
  price: number;
  durationDays?: number;
  entitlements: PackageEntitlements;
  sortOrder: number;
}[] = [
  { name: 'Silver', kind: 'membership', price: 0, durationDays: 30, entitlements: { gymAccess: true }, sortOrder: 0 },
  { name: 'Gold', kind: 'membership', price: 0, durationDays: 30, entitlements: { gymAccess: true, groupClasses: { unlimited: true } }, sortOrder: 1 },
  {
    name: 'Platinium',
    kind: 'membership',
    price: 0,
    durationDays: 30,
    entitlements: { gymAccess: true, groupClasses: { unlimited: true }, ptLessons: { count: 12, periodDays: 90 } },
    sortOrder: 2,
  },
];

/** The draft as the Worker wants it: the price in kuruş (everything else is not money). */
const wire = (draft: PackageDraft) => ({ ...draft, price: toApiMoney(draft.price) });

async function fetchCatalog(tenantId: string): Promise<GymPackage[]> {
  const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/packages`);
  // The Worker lists without an order; the screen wants the catalog's own order, oldest first.
  const list = rows.map((r) => gymPackageFromDto(r, tenantId)).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  rememberTenant('package', list, tenantId);
  return list;
}

/** Fire-and-forget by design in the Firebase repo; here the caller is the gym's new admin, so it is plain admin writes. */
export async function seedDefaultPackages(tenantId: string): Promise<void> {
  await Promise.all(
    DEFAULT_PACKAGE_TEMPLATES.map((t) => apiPost(`/tenants/${tenantId}/packages`, { ...t, isActive: true })),
  );
  pkgInvalidate(tenantId, 'packages');
}

export async function createGymPackage(tenantId: string, draft: PackageDraft): Promise<void> {
  await apiPost(`/tenants/${tenantId}/packages`, { ...wire(draft), isActive: true, sortOrder: Date.now() });
  pkgInvalidate(tenantId, 'packages');
}

/** Optional draft fields the edit form may have cleared: sent as `null` so the Worker's merge removes them. */
const clearable = (draft: PackageDraft) => ({
  durationDays: draft.durationDays ?? null,
  lessonCount: draft.lessonCount ?? null,
  lessonValidityDays: draft.lessonValidityDays ?? null,
  freezePolicy: draft.freezePolicy ?? null,
});

/**
 * Edits a package's content in place - only valid while `canEditPackage` is true (the Worker enforces the same
 * lock and answers 409 with a Turkish message otherwise). `isActive` / `sortOrder` are not part of an edit.
 */
export async function updateGymPackage(packageId: string, draft: PackageDraft): Promise<void> {
  await inTenantOf(
    'package',
    packageId,
    async (tenantId) => {
      await apiPut(`/tenants/${tenantId}/packages/${packageId}`, { ...wire(draft), ...clearable(draft) });
      pkgInvalidate(tenantId, 'packages');
    },
    { adminOnly: true },
  );
}

/** Retire / re-offer a package (allowed for a package in use as well). */
export async function setPackageActive(packageId: string, isActive: boolean): Promise<void> {
  await inTenantOf(
    'package',
    packageId,
    async (tenantId) => {
      await apiPut(`/tenants/${tenantId}/packages/${packageId}`, { isActive });
      pkgInvalidate(tenantId, 'packages');
    },
    { adminOnly: true },
  );
}

/**
 * Replaces a locked package with a new version carrying the edited content; the old one is retired, not
 * deleted (existing holders keep pointing at it). One atomic Worker call (`POST …/packages/:id/version`):
 * the successor lands with `supersedesId`, and only then is the old version switched off.
 */
export async function createPackageVersion(previous: GymPackage, draft: PackageDraft): Promise<void> {
  const { tenantId } = previous;
  await apiPost(`/tenants/${tenantId}/packages/${previous.id}/version`, { ...wire(draft), isActive: true, sortOrder: previous.sortOrder });
  pkgInvalidate(tenantId, 'packages');
}

/** One-shot fetch for the edit form (null when the package does not exist). */
export async function getGymPackage(packageId: string): Promise<GymPackage | null> {
  try {
    return await inTenantOf('package', packageId, async (tenantId) =>
      gymPackageFromDto(await apiGet<Raw>(`/tenants/${tenantId}/packages/${packageId}`), tenantId));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Full catalog for the admin screen — active and retired versions alike, oldest first. */
export function watchPackagesForTenant(
  tenantId: string,
  onChange: (packages: GymPackage[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(`t:${tenantId}:packages:catalog`, () => fetchCatalog(tenantId), onChange, onError);
}
