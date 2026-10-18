import type { WatchErrorHandler } from '../firebase/watch';
import type { GymPackage, PackageEntitlements, PackageKind } from '../types';
import type { PackageDraft } from '../firebase/packageRepo';
import { ApiError, apiGet, apiPost, apiPut } from './client';
import { gymPackageFromDto } from './pkgDto';
import { localized } from './pkgErrors';
import { toApiMoney } from './pkgMoney';
import { canEditPackage } from './pkgPure';
import { inTenantOf, pkgInvalidate, rememberTenant } from './pkgTenant';
import { watchPoll } from './pkgWatch';

/**
 * The gym's package catalog over the Worker (`/tenants/:t/packages`).
 *
 * Server rules this layer relies on: a package in use (`activeAssignmentCount > 0`) accepts only
 * `isActive` / `sortOrder` changes; a package NOT in use is replaced as a whole and must therefore be sent
 * whole (including `isActive`), unlike Firestore's field-merge `updateDoc`.
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

/** The catalog row, or a 404 ApiError (so `inTenantOf` moves on to the next gym). */
async function findPackage(tenantId: string, packageId: string): Promise<GymPackage> {
  const found = (await fetchCatalog(tenantId)).find((p) => p.id === packageId);
  if (!found) throw new ApiError(404, 'Aradığın kayıt bulunamadı.');
  return found;
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

/**
 * Edits a package's content in place — only valid while `canEditPackage` is true (the Worker enforces the
 * same lock and answers 409 otherwise). `isActive` / `sortOrder` are carried over from the stored row
 * because the Worker replaces the whole package.
 */
export async function updateGymPackage(packageId: string, draft: PackageDraft): Promise<void> {
  await inTenantOf(
    'package',
    packageId,
    async (tenantId) => {
      const existing = await findPackage(tenantId, packageId);
      await localized(apiPut(`/tenants/${tenantId}/packages/${packageId}`, { ...wire(draft), isActive: existing.isActive, sortOrder: existing.sortOrder }));
      pkgInvalidate(tenantId, 'packages');
    },
    { adminOnly: true },
  );
}

/**
 * Retire / re-offer a package. A package in use accepts the bare toggle; one that is not in use is replaced
 * whole by the Worker, so it is re-sent with its stored content.
 */
export async function setPackageActive(packageId: string, isActive: boolean): Promise<void> {
  await inTenantOf(
    'package',
    packageId,
    async (tenantId) => {
      const existing = await findPackage(tenantId, packageId);
      const body: Record<string, unknown> = existing.activeAssignmentCount > 0 ? { isActive } : packageBody(existing, isActive);
      await apiPut(`/tenants/${tenantId}/packages/${packageId}`, body);
      pkgInvalidate(tenantId, 'packages');
    },
    { adminOnly: true },
  );
}

function packageBody(p: GymPackage, isActive: boolean): Record<string, unknown> {
  return {
    name: p.name,
    kind: p.kind,
    price: toApiMoney(p.price),
    ...(p.durationDays != null ? { durationDays: p.durationDays } : {}),
    ...(p.lessonCount != null ? { lessonCount: p.lessonCount } : {}),
    ...(p.lessonValidityDays != null ? { lessonValidityDays: p.lessonValidityDays } : {}),
    entitlements: p.entitlements,
    ...(p.freezePolicy ? { freezePolicy: p.freezePolicy } : {}),
    ...(p.supersedesId ? { supersedesId: p.supersedesId } : {}),
    sortOrder: p.sortOrder,
    isActive,
  };
}

/**
 * Replaces a locked package with a new version carrying the edited content; the old one is retired, not
 * deleted (existing holders keep pointing at it).
 *
 * NOT atomic (GAP(api): the Worker has no single "new version" route; Firebase did this in one batch).
 * The new version is created FIRST and the old one retired second, so a failure in between leaves two
 * active versions (visible, harmless, fixable) and never a catalog with nothing sellable.
 */
export async function createPackageVersion(previous: GymPackage, draft: PackageDraft): Promise<void> {
  const { tenantId } = previous;
  await apiPost(`/tenants/${tenantId}/packages`, { ...wire(draft), isActive: true, sortOrder: previous.sortOrder, supersedesId: previous.id });
  try {
    await apiPut(`/tenants/${tenantId}/packages/${previous.id}`, { isActive: false });
  } finally {
    pkgInvalidate(tenantId, 'packages');
  }
}

/** One-shot fetch for the edit form (null when the package does not exist). */
export async function getGymPackage(packageId: string): Promise<GymPackage | null> {
  try {
    return await inTenantOf('package', packageId, (tenantId) => findPackage(tenantId, packageId));
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
