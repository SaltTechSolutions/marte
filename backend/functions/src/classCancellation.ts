import * as admin from 'firebase-admin';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';

const db = () => admin.firestore();

/** Why a (class, member) pair ended the way it did — kept on the refund record. */
export type RefundOutcome = 'refunded' | 'nothing-to-refund' | 'credit-missing' | 'credit-mismatch';

export interface ClassRefundSummary {
  /** Credits actually put back. */
  refunded: number;
  /** Pairs left alone: already handled, or nothing to hand back. */
  skipped: number;
  /** Pairs whose transaction threw — the trigger retries these. */
  failed: number;
}

/**
 * Puts back the group-class credits of everyone booked into a class the gym has
 * just cancelled (DEN-8 / CX-03).
 *
 * Cancelling a class is a hard delete straight from the client (`deleteClass`,
 * `deleteClassSeriesFrom`). `cancelGroupClassBooking` refunds a credit when ONE
 * member cancels, but staff deleting the whole class never went through it: the
 * class vanished, the member was told "ders iptal edildi", and the credit that
 * paid for the seat stayed spent.
 *
 * This runs off the delete rather than being a new callable on purpose. The
 * shipped app (iOS build 27, Android 8) deletes the document directly; a
 * callable would need an app update AND a rule forbidding the direct delete,
 * after which those builds could not cancel a class at all. A trigger covers
 * every client without touching either.
 *
 * Rules, each pinned by `tests/classCancellation.refund.test.ts`:
 * - Only a member still in `bookedUserIds`. `bookingCredits` alone is not
 *   enough: a member can drop themselves from the array directly and the map
 *   entry stays behind; they left, the gym did not cancel on them.
 * - Only a class that has not started. A class that already ran was attended
 *   (or its no-show was the member's own), and refunding it is a free lesson.
 * - Only the member's OWN, same-gym, `groupClass` credit. Staff can write any
 *   id into `bookingCredits` before deleting, so the credit is checked, not
 *   trusted.
 * - Once per (class, member). Triggers are at-least-once, so a marker document
 *   with a deterministic id is written in the same transaction as the refund; a
 *   redelivery finds it and stops. It is also the refund history: the class
 *   document itself is gone.
 * - Waitlisted members and unlimited-package members have no `bookingCredits`
 *   entry, so nothing was spent and nothing comes back.
 */
export async function refundCancelledClass(
  classId: string,
  klass: FirebaseFirestore.DocumentData,
  nowMs: number = Date.now(),
): Promise<ClassRefundSummary> {
  const summary: ClassRefundSummary = { refunded: 0, skipped: 0, failed: 0 };

  const tenantId = klass.tenantId as string | undefined;
  const classDate = klass.date as FirebaseFirestore.Timestamp | undefined;
  if (!tenantId || !classDate) return summary;

  const targets = refundTargets(klass, nowMs);
  if (targets.length === 0 && classDate.toMillis() <= nowMs) {
    console.log(`Class ${classId} deleted after its start; credits are not refunded.`);
  }

  const results = await Promise.allSettled(
    targets.map(({ memberId, creditId }) => refundOne(classId, klass, tenantId, classDate, memberId, creditId)),
  );

  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') {
      summary.failed += 1;
      console.error(`Class ${classId}: refund for ${targets[i].memberId} failed`, r.reason);
    } else if (r.value === 'refunded') {
      summary.refunded += 1;
    } else {
      summary.skipped += 1;
    }
  }
  return summary;
}

/**
 * WHO a cancelled class owes a credit to — no Firestore, so it is testable
 * without the emulator (`tests/classCancellation.decision.test.ts`).
 *
 * Empty for a class that has already started. Otherwise every member who is
 * still in `bookedUserIds` AND has a `bookingCredits` entry.
 */
export function refundTargets(
  klass: FirebaseFirestore.DocumentData,
  nowMs: number,
): { memberId: string; creditId: string }[] {
  const classDate = klass.date as FirebaseFirestore.Timestamp | undefined;
  if (!classDate || classDate.toMillis() <= nowMs) return [];

  const booked = new Set<string>((klass.bookedUserIds as string[] | undefined) ?? []);
  const bookingCredits = (klass.bookingCredits ?? {}) as Record<string, unknown>;
  return Object.entries(bookingCredits)
    .filter(([memberId, creditId]) => booked.has(memberId) && typeof creditId === 'string' && creditId !== '')
    .map(([memberId, creditId]) => ({ memberId, creditId: creditId as string }));
}

/**
 * WHAT to do with one credit document — also Firestore-free.
 *
 * `patch` is the update to apply, or null when the credit must not be touched.
 * The credit is CHECKED, never trusted: staff can write any id into
 * `bookingCredits` before deleting the class.
 */
export function decideRefund(
  credit: FirebaseFirestore.DocumentData | undefined,
  tenantId: string,
  memberId: string,
): { outcome: RefundOutcome; patch: Record<string, unknown> | null } {
  if (!credit) return { outcome: 'credit-missing', patch: null };
  if (credit.tenantId !== tenantId || credit.memberId !== memberId || credit.kind !== 'groupClass') {
    return { outcome: 'credit-mismatch', patch: null };
  }
  if (typeof credit.used !== 'number' || credit.used <= 0) return { outcome: 'nothing-to-refund', patch: null };
  return {
    outcome: 'refunded',
    patch: { used: credit.used - 1, ...(credit.status === 'exhausted' ? { status: 'active' } : {}) },
  };
}

async function refundOne(
  classId: string,
  klass: FirebaseFirestore.DocumentData,
  tenantId: string,
  classDate: FirebaseFirestore.Timestamp,
  memberId: string,
  creditId: string,
): Promise<RefundOutcome | 'already-processed'> {
  const markerRef = db().doc(`class_cancellation_refunds/${classId}_${memberId}`);
  const creditRef = db().doc(`member_credits/${creditId}`);

  return db().runTransaction(async (tx) => {
    // All reads before any write.
    const markerSnap = await tx.get(markerRef);
    if (markerSnap.exists) return 'already-processed' as const;
    const creditSnap = await tx.get(creditRef);

    const { outcome, patch } = decideRefund(creditSnap.data(), tenantId, memberId);
    if (patch) tx.update(creditRef, patch);

    tx.set(markerRef, {
      tenantId,
      classId,
      className: (klass.name as string | undefined) ?? null,
      classDate,
      memberId,
      creditId,
      outcome,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return outcome;
  });
}

/**
 * Trigger for `refundCancelledClass`. `retry: true` because a failed refund would
 * otherwise be lost silently; every pair is idempotent (marker document), so a
 * retry only redoes what did not commit.
 */
export const refundOnClassCancelled = onDocumentDeleted(
  { document: 'classes/{classId}', region: 'europe-west1', retry: true },
  async (event) => {
    const klass = event.data?.data();
    if (!klass) return;

    const summary = await refundCancelledClass(event.params.classId, klass);
    if (summary.refunded > 0 || summary.failed > 0) {
      console.log(`Class ${event.params.classId} cancelled: ${JSON.stringify(summary)}`);
    }
    // Throw so the platform retries the pairs that did not commit.
    if (summary.failed > 0) {
      throw new Error(`Class ${event.params.classId}: ${summary.failed} refund(s) failed; retrying.`);
    }
  },
);
