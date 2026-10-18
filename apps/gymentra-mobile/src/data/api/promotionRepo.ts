import type { WatchErrorHandler } from '../firebase/watch';
import type { PromotionDraft } from '../firebase/promotionRepo';
import type { Promotion } from '../types';
import { ApiError, apiGet, apiPost, apiPut } from './client';
import { promotionFromDto } from './pkgDto';
import { toApiMoney } from './pkgMoney';
import { isPromotionUsable } from './pkgPure';
import { inTenantOf, pkgInvalidate, rememberTenant } from './pkgTenant';
import { watchPoll } from './pkgWatch';

/**
 * Promotions over the Worker (`/tenants/:t/promotions`, staff-only read, admin-only write).
 * `redeemed` is server-owned (assignment is its only writer), so it is never sent.
 */
export { isPromotionUsable };

type Raw = Record<string, any>;

async function fetchPromotions(tenantId: string): Promise<Promotion[]> {
  const rows = await apiGet<Raw[]>(`/tenants/${tenantId}/promotions`);
  const list = rows.map((r) => promotionFromDto(r, tenantId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  rememberTenant('promotion', list, tenantId);
  return list;
}

async function findPromotion(tenantId: string, promotionId: string): Promise<Promotion> {
  const found = (await fetchPromotions(tenantId)).find((p) => p.id === promotionId);
  if (!found) throw new ApiError(404, 'Aradığın kayıt bulunamadı.');
  return found;
}

const body = (draft: PromotionDraft) => ({
  name: draft.name,
  kind: draft.kind,
  // Only an amount discount is money; a percent or a day / lesson bonus goes as it is.
  value: draft.kind === 'amountDiscount' ? toApiMoney(draft.value) : draft.value,
  appliesTo: draft.appliesTo,
  startsAt: draft.startsAt.getTime(),
  endsAt: draft.endsAt.getTime(),
});

export async function createPromotion(tenantId: string, draft: PromotionDraft): Promise<void> {
  await apiPost(`/tenants/${tenantId}/promotions`, {
    ...body(draft),
    ...(draft.maxRedemptions != null ? { maxRedemptions: draft.maxRedemptions } : {}),
    isActive: true,
  });
  pkgInvalidate(tenantId, 'promotions');
}

/**
 * The Worker merges the body into the stored promotion (JSON merge patch), so a cleared cap has to be sent
 * as an explicit `null` to remove it; leaving the key out would silently keep the old cap.
 */
export async function updatePromotion(promotionId: string, draft: PromotionDraft): Promise<void> {
  await inTenantOf(
    'promotion',
    promotionId,
    async (tenantId) => {
      await findPromotion(tenantId, promotionId);   // the PUT answers 200 for an unknown id; the lookup makes it a 404
      await apiPut(`/tenants/${tenantId}/promotions/${promotionId}`, { ...body(draft), maxRedemptions: draft.maxRedemptions ?? null });
      pkgInvalidate(tenantId, 'promotions');
    },
    { adminOnly: true },
  );
}

export async function setPromotionActive(promotionId: string, isActive: boolean): Promise<void> {
  await inTenantOf(
    'promotion',
    promotionId,
    async (tenantId) => {
      await findPromotion(tenantId, promotionId);   // the PUT answers 200 for an unknown id; the lookup makes it a 404
      await apiPut(`/tenants/${tenantId}/promotions/${promotionId}`, { isActive });
      pkgInvalidate(tenantId, 'promotions');
    },
    { adminOnly: true },
  );
}

/** One-shot fetch for the edit form (null when the promotion does not exist). */
export async function getPromotion(promotionId: string): Promise<Promotion | null> {
  try {
    return await inTenantOf('promotion', promotionId, (tenantId) => findPromotion(tenantId, promotionId), {
      miss: (e) => e.status === 404 || e.status === 403,   // a plain member of a gym may not list its promotions
    });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** Full list for the admin screen — active and expired alike, newest first. */
export function watchPromotionsForTenant(
  tenantId: string,
  onChange: (promotions: Promotion[]) => void,
  onError?: WatchErrorHandler,
) {
  return watchPoll(`t:${tenantId}:promotions:list`, () => fetchPromotions(tenantId), onChange, onError);
}
