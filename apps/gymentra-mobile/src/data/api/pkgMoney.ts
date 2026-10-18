import { ApiError } from './client';

/**
 * Money unit on the wire: INTEGER KURUŞ (1 TL = 100) everywhere in the Worker/D1 (decision of 18 Oct 2026,
 * superseding the earlier whole-lira note). The app thinks and shows LIRA (decimals allowed: 250,50), so
 * every money field converts at the client boundary through these two functions:
 *  - out: package `price`, promotion `value` of an `amountDiscount`, payment `amount`, group-payment
 *    `totalAmount` and entry `amount`;
 *  - in: gym package `price`, promotion `value` (amountDiscount only: percent / bonus kinds are not money),
 *    member package `listPrice` / `finalPrice`, change-request `priceDelta`, `refundAmount` and summary
 *    `price`, payment `amount`.
 * The pure preview helpers (`pkgPure.ts`) stay in lira and use the same kuruş rounding as the Worker.
 */
export const MONEY_SCALE = 100;

/** Lira (maybe with decimals) to the Worker's integer kuruş. More than 2 decimals or a non-finite number is refused, never rounded. */
export function toApiMoney(amount: number): number {
  const scaled = amount * MONEY_SCALE;
  const whole = Math.round(scaled);
  if (!Number.isFinite(scaled) || Math.abs(scaled - whole) > 1e-6) {
    throw new ApiError(400, 'Tutar en fazla 2 ondalık basamak içerebilir.');
  }
  return whole;
}

/** The Worker's integer kuruş to lira. */
export const fromApiMoney = (stored: number): number => stored / MONEY_SCALE;
