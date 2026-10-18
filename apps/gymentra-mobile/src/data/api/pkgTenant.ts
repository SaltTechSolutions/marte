import { ApiError, apiGet } from './client';
import { invalidate } from './poll';

/**
 * Several package/promotion/payment/change-request functions of the Firebase repos take ONLY a document id
 * (`freezeMemberPackage(assignmentId, days)`, `confirmPayment(paymentId)`, `getPromotion(id)` ...), while
 * every Worker route is tenant-scoped (`/tenants/:t/...`). Signatures cannot change, so the tenant is
 * recovered here:
 *   1. from a registry filled by every read of these repos (the screen always loaded the row before it
 *      acted on it), else
 *   2. by trying the caller's active gyms (`GET /me`, admin gyms only for admin-only actions). Ids are
 *      random and unique, so the wrong gym answers 404 and the next one is tried; nothing can leak or
 *      write across gyms because each attempt is an ordinary authorised tenant route.
 */
export type IdKind = 'package' | 'promotion' | 'memberPackage' | 'changeRequest' | 'payment';

const registry = new Map<string, string>();
const k = (kind: IdKind, id: string) => `${kind}:${id}`;

export function rememberTenant(kind: IdKind, items: { id: string }[] | string, tenantId: string): void {
  if (typeof items === 'string') registry.set(k(kind, items), tenantId);
  else items.forEach((i) => registry.set(k(kind, i.id), tenantId));
}

/** The gym of an id this device has already read, if any (used to build poll keys that `invalidate('t:<id>')` reaches). */
export function knownTenant(kind: IdKind, id: string): string | undefined {
  return registry.get(k(kind, id));
}

/** Test seam / sign-out hygiene. */
export function forgetTenants(): void {
  registry.clear();
}

async function candidates(kind: IdKind, id: string, adminOnly: boolean): Promise<string[]> {
  const known = registry.get(k(kind, id));
  if (known) return [known];
  const me = await apiGet<{ memberships: { tenantId: string; roles: string[]; status: string }[] }>('/me');
  return me.memberships
    .filter((m) => m.status === 'active' && (!adminOnly || m.roles.includes('admin')))
    .map((m) => m.tenantId);
}

/**
 * Runs `attempt(tenantId)` for the gym that owns `id`. `miss` says which failure means "not this gym"
 * (default: 404); any other failure, or a miss in the last candidate, is thrown as is.
 */
export async function inTenantOf<T>(
  kind: IdKind,
  id: string,
  attempt: (tenantId: string) => Promise<T>,
  opts: { adminOnly?: boolean; miss?: (e: ApiError) => boolean } = {},
): Promise<T> {
  const miss = opts.miss ?? ((e: ApiError) => e.status === 404);
  const list = await candidates(kind, id, opts.adminOnly ?? false);
  if (list.length === 0) throw new ApiError(404, 'Aradığın kayıt bulunamadı.');
  for (let i = 0; i < list.length; i++) {
    try {
      const out = await attempt(list[i]);
      rememberTenant(kind, id, list[i]);
      return out;
    } catch (e) {
      if (e instanceof ApiError && miss(e) && i < list.length - 1) continue;
      throw e;
    }
  }
  throw new ApiError(404, 'Aradığın kayıt bulunamadı.');
}

/**
 * Poll keys are `t:<tenantId>:<area>:...` so `invalidate('t:<tenantId>')` reaches them. After a write the
 * affected areas refresh at once (the screen's own change must show without waiting for the next poll).
 * Areas used by these repos: packages (catalog + holdings), credits, entitlements, promotions, pkgchg,
 * payments; `renewal` belongs to another repo but an assignment closes the member's renewal request.
 */
export function pkgInvalidate(tenantId: string, ...areas: string[]): void {
  areas.forEach((a) => invalidate(`t:${tenantId}:${a}`));
}
