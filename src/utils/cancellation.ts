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

/** "3 Eyl 22:00" — the deadline printed next to a booking. */
export function formatDeadline(d: Date): string {
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * The one-line outcome shown on a session that is over.
 *
 * Written for the member, not the ledger: the question being answered is
 * "why is my lesson gone", so the sentence names what happened rather than
 * the status value. Returns `null` while the session is still ahead — there
 * is no outcome yet, and inventing one would be a guess.
 */
export function sessionOutcome(session: {
  status: string;
  creditId?: string;
  creditRefunded?: boolean;
  cancelledByRole?: string;
}): string | null {
  if (session.status === 'completed') return 'Tamamlandı';
  if (session.status === 'no-show') {
    return session.creditId ? 'Gelmedin — ders hakkı kullanıldı' : 'Gelmedin';
  }
  if (session.status === 'cancelled') {
    if (!session.creditId) return 'İptal edildi';
    const byGym = session.cancelledByRole === 'trainer' || session.cancelledByRole === 'admin';
    if (session.creditRefunded) {
      return byGym ? 'Salon iptal etti — ders hakkın iade edildi' : 'İptal edildi — ders hakkın iade edildi';
    }
    return 'Son iptal saatinden sonra iptal edildi — ders hakkı kullanıldı';
  }
  return null;
}
