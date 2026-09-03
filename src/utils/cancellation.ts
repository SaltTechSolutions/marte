import { DEFAULT_CANCELLATION_HOURS } from '@/data/types';

/**
 * What cancelling right now would cost the member (PKG-11 / PER-11).
 *
 * The screens used to say "randevuya 24 saatten az kaldıysa iade
 * edilmeyebilir" — wrong twice over. The number was hardcoded, so a gym that
 * set 48 hours had its members told the wrong rule; and it made the member do
 * the arithmetic on a threshold they had no way to look up. Both inputs are
 * known here, so the confirmation can state the outcome instead of a
 * condition.
 *
 * `hoursSetting` is the gym's `tenants.cancellationHours`. Undefined means the
 * gym never set one — the same fallback both `cancelPtSession` and
 * `cancelGroupClassBooking` apply, so the text and the server agree.
 */
export function willRefundOnCancel(
  sessionDate: Date,
  now: Date,
  hoursSetting: number | undefined,
): boolean {
  const threshold = hoursSetting ?? DEFAULT_CANCELLATION_HOURS;
  const hoursUntil = (sessionDate.getTime() - now.getTime()) / 3600000;
  return hoursUntil >= threshold;
}

/**
 * The sentence appended to a cancellation confirmation.
 *
 * `hasCredit` is false for a session no credit paid for (a trainer or admin
 * booked it). Promising a refund there would be nonsense — nothing was spent.
 */
export function cancellationConsequence(params: {
  sessionDate: Date;
  now: Date;
  hoursSetting: number | undefined;
  hasCredit: boolean;
}): string {
  if (!params.hasCredit) return 'Bu randevu bir ders hakkından düşmemişti.';
  const threshold = params.hoursSetting ?? DEFAULT_CANCELLATION_HOURS;
  return willRefundOnCancel(params.sessionDate, params.now, params.hoursSetting)
    ? 'Ders hakkın iade edilecek.'
    : `Ders hakkın yanacak — salonun iptal süresi ${threshold} saat ve o süre geçti.`;
}
