import type { GymPackage, Promotion } from '../types';

/**
 * Pure helpers shared by the package/promotion/payment API repos. They are copies (not imports) of the
 * Firebase module's pure exports on purpose: `api/` must not pull `data/firebase/**` in, so the Firebase
 * layer can be deleted after the cut-over without touching this one.
 */

/** Deterministic id the Firebase rules relied on. Kept exported and identical (callers may still build keys with it). */
export function memberEntitlementsId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

/**
 * What a promotion does to a price/term, for PREVIEW only (the assign screen shows the discounted price
 * before the admin presses the button). The Worker recomputes it with the same arithmetic and is the only
 * thing that decides what the member is charged: write functions send the CHOICE, never these numbers.
 */
export function applyPromotionEffect(price: number, promotion: Pick<Promotion, 'kind' | 'value'>): { finalPrice: number; bonusDays: number; bonusLessons: number } {
  // Worked in whole kuruş like the Worker (price and discount are integer kuruş there); lira in, lira out.
  const k = Math.round(price * 100);
  switch (promotion.kind) {
    case 'percentDiscount':
      return { finalPrice: Math.max(0, Math.round(k * (1 - promotion.value / 100))) / 100, bonusDays: 0, bonusLessons: 0 };
    case 'amountDiscount':
      return { finalPrice: Math.max(0, k - Math.round(promotion.value * 100)) / 100, bonusDays: 0, bonusLessons: 0 };
    case 'bonusDays':
      return { finalPrice: price, bonusDays: promotion.value, bonusLessons: 0 };
    case 'bonusLessons':
      return { finalPrice: price, bonusDays: 0, bonusLessons: promotion.value };
  }
}

/**
 * Prorated refund on a downgrade (PREVIEW; the Worker computes the real one when the request is created).
 * Same arithmetic as `api/src/packageLifecycle.ts#computeProratedRefund`, in lira.
 */
export function computeProratedRefund(
  current: { finalPrice: number; startsAt: Date; endsAt: Date },
  newFinalPrice: number,
  effectiveAt: Date,
): { refundAmount: number; refundBasis: string } {
  const totalDays = Math.max(1, Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / 86400000));
  const remainingDays = Math.max(0, Math.round((current.endsAt.getTime() - effectiveAt.getTime()) / 86400000));
  // Rounded to the kuruş, as the Worker does (it works in integer kuruş); lira in, lira out.
  const refundAmount = Math.round(Math.round((current.finalPrice - newFinalPrice) * 100) * (remainingDays / totalDays)) / 100;
  const refundBasis = `kalan ${remainingDays}/${totalDays} gün`;
  return { refundAmount, refundBasis };
}

/** A package with no live assignments — its content may still be edited directly. */
export function canEditPackage(pkg: GymPackage): boolean {
  return pkg.activeAssignmentCount === 0;
}

/** Whether `promo` can still be applied to `packageId` right now (the Worker re-checks this when it assigns). */
export function isPromotionUsable(promo: Promotion, packageId: string, now: Date = new Date()): boolean {
  return (
    promo.isActive &&
    promo.startsAt <= now &&
    promo.endsAt >= now &&
    (promo.appliesTo.length === 0 || promo.appliesTo.includes(packageId)) &&
    (promo.maxRedemptions == null || promo.redeemed < promo.maxRedemptions)
  );
}
