import { auth } from '@/services/firebase';

import { OpeningHours, Tenant, TenantBranding, TenantContact, TenantSubscription } from '../types';
import type { WatchErrorHandler } from '../firebase/watch';
import { ApiError, apiGet, apiPatch, apiPost, apiPut } from './client';
import { ensureSelfInternalId, selfInternalId, toAppId } from './membershipIdentity';
import { watchPoll } from './membershipWatch';
import { invalidate } from './poll';
import { seedDefaultPackages } from './packageRepo';

// Logo upload needs object storage (R2 + signed URL) that the Worker does not have yet, so this one function
// keeps using the existing Firebase callable. Caveat for the lead: that callable authorises the caller against
// FIRESTORE memberships, which stop being maintained once the app runs on the Worker. It must either learn to
// ask the Worker (or read D1) or be replaced by an R2 route; see the report.
export { uploadTenantLogo } from '../firebase/tenantRepo';

/** `GET /tenants/by-code/:code` (public DTO) or `GET /tenants/:t/settings` (members and applicants). */
interface TenantDto {
  id: string;
  code: string;
  name: string;
  branding: TenantBranding;
  address?: string | null;
  openingHours?: OpeningHours | null;
  cancellationHours?: number | null;
  subscription?: { status: TenantSubscription['status']; plan: TenantSubscription['plan']; platform?: 'ios' | 'android' | null; expiresAt?: number | null } | null;
  ownerUserId?: string;
  activeMemberCount?: number;
  activeAdminCount?: number;
}

/**
 * GAP(api, minor): neither tenant DTO carries `createdAt`/`updatedAt` (no screen reads them). They are
 * epoch 0 / undefined here rather than "now", so an unchanged gym is not re-delivered on every poll.
 */
function mapTenant(d: TenantDto): Tenant {
  return {
    id: d.id,
    code: d.code,
    name: d.name,
    branding: d.branding,
    ownerUid: toAppId(d.ownerUserId),
    address: d.address ?? undefined,
    openingHours: d.openingHours ?? undefined,
    activeMemberCount: d.activeMemberCount,
    activeAdminCount: d.activeAdminCount,
    cancellationHours: d.cancellationHours ?? undefined,
    subscription: d.subscription
      ? {
          status: d.subscription.status,
          plan: d.subscription.plan,
          expiresAt: d.subscription.expiresAt ? new Date(d.subscription.expiresAt) : undefined,
          platform: d.subscription.platform ?? undefined,
        }
      : undefined,
    createdAt: new Date(0),
  };
}

const notFoundAsNull = (e: unknown): null => {
  if (e instanceof ApiError && e.status === 404) return null;
  throw e;
};

/** Look up a gym by its join code (e.g. "TARABYA-01"). Case-insensitive. */
export async function findTenantByCode(code: string): Promise<Tenant | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  try {
    return mapTenant(await apiGet<TenantDto>(`/tenants/by-code/${encodeURIComponent(clean)}`));
  } catch (e) {
    return notFoundAsNull(e);
  }
}

async function fetchTenant(tenantId: string): Promise<Tenant | null> {
  await selfInternalId();                                   // primes the id translation for ownerUid
  try {
    return mapTenant(await apiGet<TenantDto>(`/tenants/${tenantId}/settings`));
  } catch (e) {
    return notFoundAsNull(e);
  }
}

export function getTenant(tenantId: string): Promise<Tenant | null> {
  return fetchTenant(tenantId);
}

/**
 * The gym document, live (DEN-3): opening hours, cancellation window, subscription, branding. `null` means the
 * server says the gym is gone (404). A 403 (membership revoked meanwhile) is an error, as a Firestore
 * permission-denied was.
 */
export function watchTenant(tenantId: string, onChange: (tenant: Tenant | null) => void, onError?: WatchErrorHandler) {
  return watchPoll(`t:${tenantId}:tenant`, () => fetchTenant(tenantId), onChange, onError);
}

/**
 * Creates a gym and its owner's active admin membership in ONE atomic write on the Worker (Firebase needed two
 * sequential writes). A taken code surfaces as the same `Error('CODE_TAKEN')` the create-gym screen checks.
 */
export async function createTenantWithOwner(params: {
  name: string;
  code: string;
  branding: TenantBranding;
  ownerUid: string;
}): Promise<Tenant> {
  await ensureSelfInternalId({ displayName: auth.currentUser?.displayName, email: auth.currentUser?.email });
  const code = params.code.trim().toUpperCase();
  let created: { id: string; code: string; name: string };
  try {
    created = await apiPost(`/tenants`, { name: params.name.trim(), code, branding: params.branding });
  } catch (e) {
    if (e instanceof ApiError && e.apiCode === 'code taken') throw new Error('CODE_TAKEN');
    throw e;
  }
  // Best-effort, like Firebase: an admin with an empty catalog can still add packages by hand.
  await seedDefaultPackages(created.id).catch((e) => console.warn('[tenantRepo] Varsayılan paketler oluşturulamadı:', e));
  invalidate(`t:${created.id}`);
  return { id: created.id, code: created.code, name: created.name, branding: params.branding, ownerUid: params.ownerUid, createdAt: new Date() };
}

async function patchSettings(tenantId: string, body: Record<string, unknown>): Promise<void> {
  await apiPatch(`/tenants/${tenantId}/settings`, body);
  invalidate(`t:${tenantId}`);
}

/** Admin settings screen "Kaydet" — writes the tenant's live branding. */
export function updateTenantBranding(tenantId: string, branding: TenantBranding): Promise<void> {
  return patchSettings(tenantId, { branding });
}

/**
 * The gym's public identity. The name lives only on the gym row in D1 (memberships carry no copy), so there
 * is nothing to fan out. An empty address clears it, as `deleteField()` did.
 */
export function updateTenantIdentity(tenantId: string, identity: { name: string; address?: string }): Promise<void> {
  return patchSettings(tenantId, { name: identity.name, address: identity.address?.trim() || null });
}

/** The gym's own refund window (PKG-11), in hours. */
export function updateTenantCancellationHours(tenantId: string, hours: number): Promise<void> {
  return patchSettings(tenantId, { cancellationHours: hours });
}

/** Opening hours; `null` per day means "closed that day". */
export function updateTenantOpeningHours(tenantId: string, hours: OpeningHours): Promise<void> {
  return patchSettings(tenantId, { openingHours: hours });
}

/** Contact details, readable by active members and by an applicant waiting in that gym. */
export async function getTenantContact(tenantId: string): Promise<TenantContact> {
  const c = await apiGet<{ phone: string | null; email: string | null }>(`/tenants/${tenantId}/contact`);
  return { ...(c.phone ? { phone: c.phone } : {}), ...(c.email ? { email: c.email } : {}) };
}

export async function updateTenantContact(tenantId: string, contact: TenantContact): Promise<void> {
  // Full replacement on the Worker: an empty field removes the stored value, like the merge + deleteField did.
  await apiPut(`/tenants/${tenantId}/contact`, { phone: contact.phone?.trim() || null, email: contact.email?.trim() || null });
  invalidate(`t:${tenantId}`);
}
