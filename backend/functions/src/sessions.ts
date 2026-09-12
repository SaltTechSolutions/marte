import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

function isoDateOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function timeAt(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * PER-6: does a proposed session collide with one that already exists?
 *
 * The deterministic per-slot document id below stops two bookings for the
 * *same start time*, and that was enough while every session came from the
 * member flow, where the duration is always the trainer's own `slotMinutes`
 * grid. It stops nothing once sessions can have arbitrary starts and
 * durations (a trainer adding one by hand): 10:00–11:00 and 10:30–11:30 are
 * two different ids and two happy writes onto one trainer's calendar.
 *
 * Half-open interval comparison — a session ending exactly when the next
 * begins is not a conflict, which is the normal back-to-back case.
 */
export interface ExistingSession {
  id: string;
  startMs: number;
  durationMinutes: number;
  status?: string;
}

export function findOverlap(
  existing: ExistingSession[],
  startMs: number,
  durationMinutes: number,
  ignoreIds: Set<string> = new Set(),
): ExistingSession | undefined {
  const endMs = startMs + durationMinutes * 60000;
  return existing.find((s) => {
    if (s.status === 'cancelled') return false;
    if (ignoreIds.has(s.id)) return false;
    const otherEnd = s.startMs + (s.durationMinutes || 60) * 60000;
    return startMs < otherEnd && s.startMs < endMs;
  });
}

/** Start of the day a date falls in, and start of the day after the last one. */
function dayBounds(dates: Date[]): { from: Date; to: Date } {
  const from = new Date(Math.min(...dates.map((d) => d.getTime())));
  from.setHours(0, 0, 0, 0);
  const to = new Date(Math.max(...dates.map((d) => d.getTime())));
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

async function readTrainerSessions(
  tx: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  trainerId: string,
  dates: Date[],
): Promise<ExistingSession[]> {
  const { from, to } = dayBounds(dates);
  const snap = await tx.get(
    db
      .collection('pt_sessions')
      .where('tenantId', '==', tenantId)
      .where('trainerId', '==', trainerId)
      .where('date', '>=', admin.firestore.Timestamp.fromDate(from))
      .where('date', '<', admin.firestore.Timestamp.fromDate(to)),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    startMs: (d.data().date as FirebaseFirestore.Timestamp).toMillis(),
    durationMinutes: (d.data().durationMinutes as number) ?? 60,
    status: d.data().status as string | undefined,
  }));
}

/**
 * Same rule the client's `computeFreeSlots` shows the member — re-derived
 * here because a client-side "this slot looked free" is UX, not a
 * guarantee; this is the actual gate.
 *
 * Checks three things a bare "is the start time inside the window" test
 * missed (plan-eng-review Faz 1.7): the slot must fall exactly on a
 * `slotMinutes` boundary from the window's own start (grid alignment —
 * without this, `09:00–12:00` at 60-minute slots would still accept
 * `11:37`), and the slot must *end* before the window closes, not just
 * start inside it (without this, a 60-minute slot at `11:30` in a
 * `09:00–12:00` window passes a start-only check but runs 30 minutes past
 * close).
 */
export function isWithinAvailability(availability: FirebaseFirestore.DocumentData, slot: Date): boolean {
  const exception = (availability.exceptions ?? []).find((e: { date: string }) => e.date === isoDateOf(slot));
  if (exception?.closed) return false;
  const windows: { start: string; end: string }[] = exception?.windows ?? availability.weekly?.[weekdayOf(slot)] ?? [];
  const slotMinutes = availability.slotMinutes ?? 60;
  const slotMs = slotMinutes * 60000;

  return windows.some((w) => {
    const windowStart = timeAt(slot, w.start).getTime();
    const windowEnd = timeAt(slot, w.end).getTime();
    if (slot.getTime() < windowStart || slot.getTime() + slotMs > windowEnd) return false;
    return (slot.getTime() - windowStart) % slotMs === 0;
  });
}

/**
 * GymEntra (PKG-8): a member spends their own ders credit on a specific
 * trainer/time. Has to be a callable rather than a client transaction (the
 * pattern `assignPackageToMember`/promotion redemption use) because it
 * needs to *query* the member's credits and sum across however many rows
 * are active, then decide which ones absorb the booking — Firestore rules
 * can guard one document's before/after, not "does this set of documents
 * add up to enough." Same reasoning as every other "sayan her şey
 * callable'da" case in this schema.
 */
import { computeCancellationDeadline, isBeforeDeadline } from './cancellationDeadline';

export const bookPtSessions = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Giriş yapmış olmanız gerekiyor.');

    const { tenantId, trainerId, slots: slotStrings, memberId: onBehalfOf } = request.data as {
      tenantId?: string;
      trainerId?: string;
      slots?: string[];
      /** MEMBER-5c: a parent booking for their child. Omitted = booking for
       *  yourself, which is every other caller. */
      memberId?: string;
    };
    if (!tenantId || !trainerId || !slotStrings?.length) {
      throw new HttpsError('invalid-argument', 'Eksik bilgi.');
    }
    const slots = slotStrings.map((s) => new Date(s)).sort((a, b) => a.getTime() - b.getTime());
    if (slots.some((s) => s.getTime() <= Date.now())) {
      throw new HttpsError('invalid-argument', 'Geçmiş bir saat seçilemez.');
    }
    // A duplicate in the request itself (double-tap, retried request) would
    // otherwise book the same slot against itself — the per-slot
    // deterministic-id existence check below only catches a slot that's
    // already taken by SOME OTHER booking, not two copies within this one.
    if (new Set(slots.map((s) => s.getTime())).size !== slots.length) {
      throw new HttpsError('invalid-argument', 'Aynı saat birden fazla kez seçilemez.');
    }

    const db = admin.firestore();

    // Who the booking is FOR. Everything below — the membership checked, the
    // credit spent, the session written — belongs to this person, not to the
    // caller. Defaulting to the caller keeps every existing call unchanged.
    const memberId = onBehalfOf && onBehalfOf !== uid ? onBehalfOf : uid;
    if (memberId !== uid) {
      const childSnap = await db.doc(`tenant_memberships/${tenantId}_${memberId}`).get();
      const child = childSnap.data();
      // Only an APPROVED link carries authority. A pending one lets the parent
      // see the request; it must not let them spend the child's credits.
      if (!childSnap.exists || child?.guardianId !== uid || child?.guardianStatus !== 'approved') {
        throw new HttpsError('permission-denied', 'Bu üye adına işlem yapamazsın.');
      }
    }

    const membershipRef = db.doc(`tenant_memberships/${tenantId}_${memberId}`);
    const trainerMembershipRef = db.doc(`tenant_memberships/${tenantId}_${trainerId}`);
    const availabilityRef = db.doc(`trainer_availability/${tenantId}_${trainerId}`);
    // Deterministic per-slot id (plan-eng-review Faz 1.5): a query-then-
    // auto-ID-write ("is this slot taken? no → create a new doc") only
    // protects against contention Firestore can actually detect if the
    // two racing transactions' read sets overlap. A *query's* result set is
    // not a tracked read for that purpose — two concurrent bookings for the
    // same slot could both see "no session yet" and both write, producing
    // two sessions for one slot (a classic phantom read). Reading this
    // exact document inside the transaction, instead, means both
    // transactions share a read on the *same* document; Firestore's
    // optimistic concurrency then guarantees only one of them commits.
    const sessionRefs = slots.map((slot) => db.collection('pt_sessions').doc(`${tenantId}_${trainerId}_${slot.getTime()}`));

    const result = await db.runTransaction(async (tx) => {
      const [membershipSnap, trainerMembershipSnap, availabilitySnap, ...sessionSnaps] = await Promise.all([
        tx.get(membershipRef),
        tx.get(trainerMembershipRef),
        tx.get(availabilityRef),
        ...sessionRefs.map((ref) => tx.get(ref)),
      ]);
      if (!membershipSnap.exists || membershipSnap.data()!.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Bu salonda aktif üyeliğin yok.');
      }
      // Faz 1.8: `trainerMembershipSnap` used to be read only for its
      // display name — never checked for existing, active, or actually
      // holding the trainer role. A trainer who left the gym (membership
      // `status` flipped away from `active`) could still be booked and
      // burn the member's credit for a session that will never happen.
      const trainerMembership = trainerMembershipSnap.data();
      if (!trainerMembershipSnap.exists || trainerMembership!.status !== 'active' || !(trainerMembership!.roles ?? []).includes('trainer')) {
        throw new HttpsError('failed-precondition', 'Bu antrenör artık salonda çalışmıyor.');
      }
      if (!availabilitySnap.exists) {
        throw new HttpsError('failed-precondition', 'Bu antrenör çalışma saatlerini henüz tanımlamamış.');
      }
      const availability = availabilitySnap.data()!;
      for (const slot of slots) {
        if (!isWithinAvailability(availability, slot)) {
          throw new HttpsError('failed-precondition', `${slot.toLocaleString('tr-TR')} antrenörün çalışma saatleri dışında.`);
        }
      }

      sessionSnaps.forEach((snap, i) => {
        if (snap.exists && snap.data()!.status !== 'cancelled') {
          throw new HttpsError('failed-precondition', `${slots[i].toLocaleString('tr-TR')} az önce doldu, başka bir saat seç.`);
        }
      });

      // PER-6: the id check above only catches an identical start time. A
      // session a trainer added by hand can sit at any minute and run any
      // length, so a member's grid-aligned slot can still land inside one.
      const slotMinutes = (availability.slotMinutes as number) ?? 60;
      const existing = await readTrainerSessions(tx, db, tenantId, trainerId, slots);
      const beingCreated = new Set(sessionRefs.map((ref) => ref.id));
      for (const slot of slots) {
        const clash = findOverlap(existing, slot.getTime(), slotMinutes, beingCreated);
        if (clash) {
          throw new HttpsError('failed-precondition', `${slot.toLocaleString('tr-TR')} antrenörün başka bir randevusuyla çakışıyor.`);
        }
      }

      // Faz 1.4: credits must still be unexpired *as of now* (the stored
      // read-time-check discipline every other quota in this schema uses —
      // see `member_entitlements.endsAt > request.time`) — and, separately,
      // a credit can only pay for a slot that falls before it expires. A
      // credit expiring in 3 days must not be spent on a session 3 months
      // out.
      const now = admin.firestore.Timestamp.now();
      const creditsSnap = await tx.get(
        db
          .collection('member_credits')
          .where('tenantId', '==', tenantId)
          .where('memberId', '==', memberId)
          .where('kind', '==', 'ptLesson')
          .where('status', '==', 'active')
          .where('expiresAt', '>', now)
          .orderBy('expiresAt', 'asc'),
      );
      const credits = creditsSnap.docs.map((d) => ({
        ref: d.ref,
        total: d.data().total as number,
        used: d.data().used as number,
        expiresAt: d.data().expiresAt as FirebaseFirestore.Timestamp,
      }));

      // Spend earliest-expiring-first, but only among credits still valid
      // on THIS slot's date — not a single upfront balance sum.
      const remaining = new Map(credits.map((c) => [c.ref.id, c.total - c.used]));
      const creditIdBySlot: string[] = [];
      for (const slot of slots) {
        const eligible = credits.find((c) => (remaining.get(c.ref.id) ?? 0) > 0 && c.expiresAt.toMillis() >= slot.getTime());
        if (!eligible) {
          throw new HttpsError('failed-precondition', `${slot.toLocaleString('tr-TR')} tarihi için geçerli ders kredin yok.`);
        }
        remaining.set(eligible.ref.id, remaining.get(eligible.ref.id)! - 1);
        creditIdBySlot.push(eligible.ref.id);
      }

      const trainerName = trainerMembership!.userDisplayName ?? trainerMembership!.userEmail ?? 'Antrenör';
      const memberName = membershipSnap.data()?.userDisplayName ?? membershipSnap.data()?.userEmail ?? 'Üye';

      // The deadline is frozen at booking, not recomputed at cancellation.
      // A gym that tightens its notice period next week must not retroactively
      // move the line under sessions somebody already booked — "the rule was
      // different when I booked" is a fair objection, and this is what makes
      // it unnecessary. It is also the number the member is shown up front.
      const tenantSnap = await tx.get(db.doc(`tenants/${tenantId}`));
      const tenantData = tenantSnap.data();
      const deadlines = slots.map((slot) =>
        computeCancellationDeadline({
          sessionStart: slot,
          cancellationHours: tenantData?.cancellationHours as number | undefined,
          openingHours: tenantData?.openingHours as Record<string, { open: string; close: string } | null> | undefined,
        }),
      );

      slots.forEach((slot, i) => {
        tx.set(sessionRefs[i], {
          tenantId,
          trainerId,
          trainerName,
          memberId,
          memberName,
          date: admin.firestore.Timestamp.fromDate(slot),
          durationMinutes: availability.slotMinutes ?? 60,
          status: 'scheduled',
          creditId: creditIdBySlot[i],
          cancellationDeadlineAt: admin.firestore.Timestamp.fromDate(deadlines[i]),
          createdAt: now,
          updatedAt: now,
        });
      });

      const spendPerCredit = new Map<string, number>();
      for (const id of creditIdBySlot) spendPerCredit.set(id, (spendPerCredit.get(id) ?? 0) + 1);
      for (const credit of credits) {
        const spent = spendPerCredit.get(credit.ref.id);
        if (!spent) continue;
        const newUsed = credit.used + spent;
        tx.update(credit.ref, { used: newUsed, ...(newUsed >= credit.total ? { status: 'exhausted' } : {}) });
      }

      return { booked: slots.length };
    });

    console.log(`Member ${memberId} booked ${result.booked} session(s) with trainer ${trainerId} (by ${uid})`);
    return result;
  },
);

/**
 * GymEntra (PKG-11, plan-eng-review Faz 1.9): cancels a PT session and
 * decides whether the credit that paid for it comes back.
 *
 * A credit-linked session's direct `status: 'cancelled'` client write is
 * closed in the rule (see `firestore.rules`) — refunding has to be decided
 * atomically with the cancellation itself, and rules can't run the
 * "how many hours until the appointment" arithmetic this needs. A session
 * with no `creditId` (a trainer's own, package-independent booking) has no
 * refund decision to make, but still routes through here so cancellation
 * behaves the same way regardless of who's cancelling — one code path, not
 * "credit sessions cancel here, everything else cancels by direct write."
 *
 * Refund policy: the trainer or an admin cancelling always refunds — the
 * member didn't cause the cancellation. A member cancelling refunds only if
 * they are inside the session's own `cancellationDeadlineAt`, frozen when the
 * session was booked (see `computeCancellationDeadline`); later than that the
 * credit burns, which is why the client states it before the member confirms.
 * Sessions booked before that field existed fall back to the plain
 * `cancellationHours` arithmetic.
 *
 * Every cancellation writes down who did it, when, and whether the credit came
 * back. Before this the row kept only `status` and `updatedAt`, so "I didn't
 * come, why was my lesson taken" had no answer anywhere — the gym could only
 * assert, and the member could only disagree.
 */
export const cancelPtSession = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Giriş yapmış olmanız gerekiyor.');

    const { sessionId } = request.data as { sessionId?: string };
    if (!sessionId) throw new HttpsError('invalid-argument', 'Eksik bilgi.');

    const db = admin.firestore();
    const sessionRef = db.doc(`pt_sessions/${sessionId}`);

    const result = await db.runTransaction(async (tx) => {
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new HttpsError('not-found', 'Randevu bulunamadı.');
      const session = sessionSnap.data()!;
      if (session.status === 'cancelled') throw new HttpsError('failed-precondition', 'Randevu zaten iptal edilmiş.');
      if (session.status === 'completed') throw new HttpsError('failed-precondition', 'Tamamlanmış randevu iptal edilemez.');

      const isMember = session.memberId === uid;
      const isTrainer = session.trainerId === uid;
      let isAdmin = false;
      let isGuardian = false;
      if (!isMember && !isTrainer) {
        const membershipSnap = await tx.get(db.doc(`tenant_memberships/${session.tenantId}_${uid}`));
        const membership = membershipSnap.data();
        isAdmin = !!membership && membership.status === 'active' && (membership.roles ?? []).includes('admin');
        if (!isAdmin) {
          // The parent of the member the session belongs to (MEMBER-5c).
          const childSnap = await tx.get(db.doc(`tenant_memberships/${session.tenantId}_${session.memberId}`));
          const child = childSnap.data();
          isGuardian = child?.guardianId === uid && child?.guardianStatus === 'approved';
        }
      }
      if (!isMember && !isTrainer && !isAdmin && !isGuardian) {
        throw new HttpsError('permission-denied', 'Bu randevuyu iptal edemezsin.');
      }

      let creditRef: FirebaseFirestore.DocumentReference | null = null;
      let creditSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      if (session.creditId) {
        creditRef = db.doc(`member_credits/${session.creditId}`);
        creditSnap = await tx.get(creditRef);
      }

      let refunded = false;
      if (creditRef && creditSnap?.exists) {
        let shouldRefund = isTrainer || isAdmin;
        // A parent cancelling is the member cancelling: same notice window,
        // same refund. Without the `isGuardian` here they fell through every
        // branch and got no refund at all — worse than if the child had
        // cancelled it themselves.
        if ((isMember || isGuardian) && !shouldRefund) {
          const stored = session.cancellationDeadlineAt as FirebaseFirestore.Timestamp | undefined;
          if (stored) {
            shouldRefund = isBeforeDeadline(stored.toDate(), new Date());
          } else {
            // Booked before deadlines were stored. Recompute from the gym's
            // current setting — the same answer the old code gave, and the
            // only one available for these rows.
            const tenantSnap = await tx.get(db.doc(`tenants/${session.tenantId}`));
            const tenantData = tenantSnap.data();
            const deadline = computeCancellationDeadline({
              sessionStart: (session.date as FirebaseFirestore.Timestamp).toDate(),
              cancellationHours: tenantData?.cancellationHours as number | undefined,
              openingHours: tenantData?.openingHours as Record<string, { open: string; close: string } | null> | undefined,
            });
            shouldRefund = isBeforeDeadline(deadline, new Date());
          }
        }
        if (shouldRefund) {
          const credit = creditSnap.data()!;
          tx.update(creditRef, {
            used: Math.max(0, (credit.used as number) - 1),
            ...(credit.status === 'exhausted' ? { status: 'active' } : {}),
          });
          refunded = true;
        }
      }

      tx.update(sessionRef, {
        status: 'cancelled',
        cancelledAt: admin.firestore.Timestamp.now(),
        cancelledBy: uid,
        // Who, in the member's terms — the row has to survive a role change
        // later without the reason for the refund becoming unreadable.
        cancelledByRole: isMember ? 'member' : isGuardian ? 'guardian' : isTrainer ? 'trainer' : 'admin',
        creditRefunded: refunded,
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return { refunded };
    });

    console.log(`Session ${sessionId} cancelled by ${uid}, refunded=${result.refunded}`);
    return result;
  },
);

/**
 * PER-6: a trainer (or an admin, on a trainer's behalf) puts a session on the
 * calendar for a member — no package credit involved.
 *
 * This used to be a direct client `setDoc` (`ptSessionRepo.createPtSession`).
 * Nothing checked anything: the same trainer could be booked twice for the
 * same hour, once by the member flow and once by hand, and both rows would
 * sit there until somebody noticed at the door. Every guarantee the member
 * flow already had — trainer still works here, member still belongs here,
 * the slot is actually free — was simply absent on the staff side.
 *
 * Deliberately NOT enforced here: the trainer's own availability windows and
 * the gym's opening hours. Both are checked for the member flow, where they
 * are the offer — the member picks from what the trainer published. A trainer
 * writing on their own calendar is the authority over it: the 07:00 session
 * agreed with a member by phone, the extra hour on a closed Sunday. Blocking
 * those would break a workflow that runs today, and the missing guarantee in
 * PER-6 was never "the trainer booked an odd hour" — it was two members in
 * one hour.
 */
export const createPtSessionByStaff = onCall(
  { region: 'europe-west1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Giriş yapmış olmanız gerekiyor.');

    const { tenantId, trainerId, memberId, date: dateString, durationMinutes } = request.data as {
      tenantId?: string;
      trainerId?: string;
      memberId?: string;
      date?: string;
      durationMinutes?: number;
    };
    if (!tenantId || !trainerId || !memberId || !dateString) {
      throw new HttpsError('invalid-argument', 'Eksik bilgi.');
    }
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration <= 0 || duration > 480) {
      throw new HttpsError('invalid-argument', 'Randevu süresi geçersiz.');
    }
    const start = new Date(dateString);
    if (Number.isNaN(start.getTime())) throw new HttpsError('invalid-argument', 'Tarih okunamadı.');
    if (start.getTime() <= Date.now()) throw new HttpsError('invalid-argument', 'Geçmiş bir saat seçilemez.');

    const db = admin.firestore();
    const callerRef = db.doc(`tenant_memberships/${tenantId}_${uid}`);
    const trainerRef = db.doc(`tenant_memberships/${tenantId}_${trainerId}`);
    const memberRef = db.doc(`tenant_memberships/${tenantId}_${memberId}`);
    // Same deterministic id the member flow uses, for the same reason: two
    // devices racing for one start time share a read on one document, so
    // exactly one of them commits.
    const sessionRef = db.collection('pt_sessions').doc(`${tenantId}_${trainerId}_${start.getTime()}`);

    await db.runTransaction(async (tx) => {
      const [callerSnap, trainerSnap, memberSnap, sessionSnap] = await Promise.all([
        tx.get(callerRef),
        tx.get(trainerRef),
        tx.get(memberRef),
        tx.get(sessionRef),
      ]);

      const caller = callerSnap.data();
      const callerRoles: string[] = caller?.roles ?? [];
      const callerIsAdmin = callerRoles.includes('admin');
      const callerIsTrainer = callerRoles.includes('trainer');
      if (!callerSnap.exists || caller?.status !== 'active' || !(callerIsAdmin || callerIsTrainer)) {
        throw new HttpsError('permission-denied', 'Bu işlem için yetkin yok.');
      }
      // A trainer writes onto their own calendar only; an admin may write onto
      // any trainer's. Mirrors the `pt_sessions` create rule.
      if (!callerIsAdmin && trainerId !== uid) {
        throw new HttpsError('permission-denied', 'Yalnızca kendi takvimine randevu ekleyebilirsin.');
      }

      const trainer = trainerSnap.data();
      if (!trainerSnap.exists || trainer?.status !== 'active' || !(trainer?.roles ?? []).includes('trainer')) {
        throw new HttpsError('failed-precondition', 'Bu antrenör artık salonda çalışmıyor.');
      }
      const member = memberSnap.data();
      if (!memberSnap.exists || member?.status !== 'active') {
        throw new HttpsError('failed-precondition', 'Bu üyenin salonda aktif üyeliği yok.');
      }

      if (sessionSnap.exists && sessionSnap.data()!.status !== 'cancelled') {
        throw new HttpsError('failed-precondition', 'Bu saatte zaten bir randevu var.');
      }
      const existing = await readTrainerSessions(tx, db, tenantId, trainerId, [start]);
      const clash = findOverlap(existing, start.getTime(), duration, new Set([sessionRef.id]));
      if (clash) {
        const clashStart = new Date(clash.startMs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        throw new HttpsError('failed-precondition', `Bu saat ${clashStart} randevusuyla çakışıyor.`);
      }

      const tenantSnap = await tx.get(db.doc(`tenants/${tenantId}`));
      const tenantData = tenantSnap.data();
      // Frozen at booking, same as the member flow (PKG-11): a session added
      // by hand had no deadline at all before this, so cancelling one fell
      // back to whatever the gym's setting happened to be that day.
      const deadline = computeCancellationDeadline({
        sessionStart: start,
        cancellationHours: tenantData?.cancellationHours as number | undefined,
        openingHours: tenantData?.openingHours as Record<string, { open: string; close: string } | null> | undefined,
      });

      const now = admin.firestore.Timestamp.now();
      tx.set(sessionRef, {
        tenantId,
        trainerId,
        trainerName: trainer?.userDisplayName ?? trainer?.userEmail ?? 'Antrenör',
        memberId,
        memberName: member?.userDisplayName ?? member?.userEmail ?? 'Üye',
        date: admin.firestore.Timestamp.fromDate(start),
        durationMinutes: duration,
        status: 'scheduled',
        cancellationDeadlineAt: admin.firestore.Timestamp.fromDate(deadline),
        createdAt: now,
        updatedAt: now,
      });
    });

    console.log(`Staff ${uid} created a session for member ${memberId} with trainer ${trainerId}`);
    return { id: sessionRef.id };
  },
);
