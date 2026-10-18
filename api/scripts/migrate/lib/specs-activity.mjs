// Table specs, part 2: classes, sessions, logs, ledger and notifications.
import { Reader } from './ctx.mjs';
import { memberOf } from './specs-core.mjs';
import { stableStringify } from './sql.mjs';
import { k } from './values.mjs';

const uniq = (list) => [...new Set(list)];
const strList = (v) => (Array.isArray(v) ? uniq(v.filter((x) => typeof x === 'string' && x)) : []);

// ---------------------------------------------------------------- group classes
export const classes = {
  table: 'classes', from: 'classes',
  key: (row) => row.id,
  before(ctx) { ctx.classMeta = new Map(); },
  build(doc, ctx) {
    const r = new Reader(ctx, 'classes', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    const startsAt = r.ts('date', { req: true });
    const createdAt = r.ts('createdAt');
    // When the migrations carry the child tables, those fields leave the JSON; otherwise nothing is lost.
    const hasWaitlist = ctx.schema.has('class_waitlist');
    const hasAttendance = ctx.schema.has('class_attendance');
    const omit = ['tenantId', 'date', 'bookedUserIds', 'bookingCredits', ...(hasWaitlist ? ['waitlistUserIds'] : []), ...(hasAttendance ? ['attendance'] : [])];
    const data = r.blob({ omit, uid: ['trainerId'], uidKeyed: hasAttendance ? [] : ['attendance'] });
    if (!hasWaitlist && strList(doc.waitlistUserIds).length) {
      // Kept in the JSON, but with internal ids so no Firebase uid survives in D1.
      const parsed = JSON.parse(data);
      parsed.waitlistUserIds = strList(doc.waitlistUserIds).map((u) => ctx.uidId(u));
      ctx.report.skippedCounts['class_waitlist: table not in migrations, waitlist kept inside classes.data'] =
        (ctx.report.skippedCounts['class_waitlist: table not in migrations, waitlist kept inside classes.data'] ?? 0) + parsed.waitlistUserIds.length;
      if (!r.finish()) return [];
      ctx.classMeta.set(doc.__id, { startsAt, base: createdAt ?? startsAt });
      return [{ id: doc.__id, tenantId, data: stableStringify(parsed), startsAt }];
    }
    if (!r.finish()) return [];
    ctx.classMeta.set(doc.__id, { startsAt, base: createdAt ?? startsAt });
    return [{ id: doc.__id, tenantId, data, startsAt }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, data: (v) => v.data, starts_at: (v) => v.startsAt },
};

/** One row per booked member. Booking time is not recorded in Firestore: array order is kept as created_at order. */
export const classBookings = {
  table: 'class_bookings', from: 'classes',
  key: (row) => k(row.class_id, row.member_id),
  build(doc, ctx) {
    const booked = strList(doc.bookedUserIds);
    if (!booked.length && !(doc.bookingCredits && Object.keys(doc.bookingCredits).length)) return [];
    const cls = ctx.get('classes', doc.__id);
    const credits = doc.bookingCredits && typeof doc.bookingCredits === 'object' ? doc.bookingCredits : {};
    for (const u of Object.keys(credits)) if (!booked.includes(u)) ctx.warn('stale-booking-credit', 'class_bookings', doc.__id, `bookingCredits has an entry for a member who is not booked (ignored)`);
    if (!cls) { for (const u of booked) ctx.orphan('class_bookings', `${doc.__id}/${ctx.uidId(u)}`, 'class was not migrated'); return []; }
    const meta = ctx.classMeta.get(doc.__id);
    const out = [];
    booked.forEach((u, i) => {
      const memberId = ctx.uidId(u);
      const id = `${doc.__id}/${memberId}`;
      if (!ctx.has('memberships', cls.tenant_id, memberId)) return ctx.orphan('class_bookings', id, 'booked member has no membership row', { memberId });
      let creditId = null;
      if (credits[u] !== undefined && credits[u] !== null) {
        if (typeof credits[u] !== 'string') return ctx.invalid('class_bookings', id, 'bookingCredits value is not a string');
        const c = ctx.get('member_credits', cls.tenant_id, credits[u]);
        if (!c) return ctx.orphan('class_bookings', id, `credit ${credits[u]} was not migrated (missing or itself rejected)`, { creditId: credits[u] });
        if (c.member_id !== memberId) return ctx.orphan('class_bookings', id, `credit ${credits[u]} belongs to another member`, { creditId: credits[u] });
        if (c.kind !== 'groupClass') ctx.warn('booking-credit-kind', 'class_bookings', id, `credit kind is ${c.kind}`);
        creditId = credits[u];
      }
      out.push({ tenantId: cls.tenant_id, classId: doc.__id, memberId, creditId, createdAt: meta.base + i });
    });
    return out;
  },
  columns: { tenant_id: (v) => v.tenantId, class_id: (v) => v.classId, member_id: (v) => v.memberId, credit_id: (v) => v.creditId, created_at: (v) => v.createdAt },
};

export const classWaitlist = {
  table: 'class_waitlist', from: 'classes', optional: true,
  key: (row) => k(row.class_id, row.member_id),
  build(doc, ctx) {
    const list = strList(doc.waitlistUserIds);
    if (!list.length) return [];
    const cls = ctx.get('classes', doc.__id);
    const meta = ctx.classMeta.get(doc.__id);
    const out = [];
    list.forEach((u, i) => {
      const memberId = ctx.uidId(u);
      const id = `${doc.__id}/${memberId}`;
      if (!cls) return ctx.orphan('class_waitlist', id, 'class was not migrated');
      if (!ctx.has('memberships', cls.tenant_id, memberId)) return ctx.orphan('class_waitlist', id, 'waitlisted member has no membership row', { memberId });
      out.push({ tenantId: cls.tenant_id, classId: doc.__id, memberId, createdAt: meta.base + i });
    });
    return out;
  },
  columns: { tenant_id: (v) => v.tenantId, class_id: (v) => v.classId, member_id: (v) => v.memberId, created_at: (v) => v.createdAt },
};

/** Firestore keeps only the mark ({uid: 'present'|'absent'}); who marked it and when are unknowable. */
export const MIGRATED_MARKER = 'migration:firestore';
export const classAttendance = {
  table: 'class_attendance', from: 'classes', optional: true,
  key: (row) => k(row.class_id, row.member_id),
  build(doc, ctx) {
    const map = doc.attendance && typeof doc.attendance === 'object' ? doc.attendance : {};
    const cls = ctx.get('classes', doc.__id);
    const meta = ctx.classMeta.get(doc.__id);
    const out = [];
    for (const u of Object.keys(map).sort()) {
      const memberId = ctx.uidId(u);
      const id = `${doc.__id}/${memberId}`;
      if (!cls) { ctx.orphan('class_attendance', id, 'class was not migrated'); continue; }
      if (map[u] !== 'present' && map[u] !== 'absent') { ctx.invalid('class_attendance', id, `mark ${JSON.stringify(map[u])} is not present/absent`); continue; }
      if (!ctx.has('class_bookings', doc.__id, memberId)) { ctx.orphan('class_attendance', id, 'mark for a member who has no migrated booking (D1 requires a booking)', { memberId }); continue; }
      out.push({ tenantId: cls.tenant_id, classId: doc.__id, memberId, mark: map[u], at: meta.startsAt });
    }
    return out;
  },
  columns: { tenant_id: (v) => v.tenantId, class_id: (v) => v.classId, member_id: (v) => v.memberId, mark: (v) => v.mark, marked_by: () => MIGRATED_MARKER, marked_at: (v) => v.at },
};

export const classCancellationRefunds = {
  table: 'class_cancellation_refunds', from: 'class_cancellation_refunds',
  key: (row) => k(row.tenant_id, row.class_id, row.member_id),
  build(doc, ctx) {
    const r = new Reader(ctx, 'class_cancellation_refunds', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    const classId = r.str('classId', { req: true });
    const memberRaw = r.str('memberId', { req: true });
    const memberId = memberRaw ? ctx.uidId(memberRaw) : null;
    let id = doc.__id;
    if (classId && memberRaw && id === `${classId}_${memberRaw}`) { id = `${classId}_${memberId}`; (ctx.docMap.class_cancellation_refunds ??= {})[doc.__id] = id; }
    const view = {
      id, tenantId, classId, memberId, className: r.str('className'), classDate: r.ts('classDate', { req: true }),
      creditId: r.str('creditId', { req: true }),
      outcome: r.enumStr('outcome', ['refunded', 'nothing-to-refund', 'credit-missing', 'credit-mismatch'], { req: true }),
      createdAt: r.ts('createdAt', { req: true, fallback: 0 }),
    };
    if (tenantId && classId && memberId && ctx.has('class_cancellation_refunds', tenantId, classId, memberId)) r.bad('duplicate (class, member) refund record');
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, class_id: (v) => v.classId, class_name: (v) => v.className,
    class_date: (v) => v.classDate, member_id: (v) => v.memberId, credit_id: (v) => v.creditId, outcome: (v) => v.outcome, created_at: (v) => v.createdAt,
  },
};

// ---------------------------------------------------------------- per-member records
export const checkins = {
  table: 'checkins', from: 'checkins',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'checkins', doc);
    const { tenantId, memberId } = memberOf(r, { field: 'userId' });
    const at = r.ts('checkedInAt', { req: true });
    // membershipId ("{tenantId}_{uid}") is derivable from (tenant_id, member_id) and would carry a Firebase uid.
    const data = r.blob({ omit: ['tenantId', 'userId', 'checkedInAt'], drop: ['membershipId'] });
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, memberId, data, at }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, data: (v) => v.data, created_at: (v) => v.at },
};

export const programs = {
  table: 'programs', from: 'programs',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'programs', doc);
    const { tenantId, memberId } = memberOf(r);
    const created = r.ts('createdAt');
    const updatedAt = r.ts('updatedAt', { req: true, fallback: created ?? 0 });
    const data = r.blob({ omit: ['tenantId', 'memberId', 'updatedAt'], uid: ['trainerId'] });
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, memberId, data, updatedAt }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, data: (v) => v.data, updated_at: (v) => v.updatedAt },
};

export const programTemplates = {
  table: 'program_templates', from: 'program_templates',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'program_templates', doc);
    const tenantId = r.str('tenantId');   // absent / null = GLOBAL template -> tenant_id NULL
    if (tenantId) r.need('tenants', 'tenant', tenantId);
    const updatedAt = r.ts('updatedAt', { req: true, fallback: 0 });
    const data = r.blob({ omit: ['tenantId', 'updatedAt'] });
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, data, updatedAt }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, data: (v) => v.data, updated_at: (v) => v.updatedAt },
};

export const workoutLogs = {
  table: 'workout_logs', from: 'workout_logs',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'workout_logs', doc);
    const { tenantId, memberId } = memberOf(r);
    const loggedAt = r.ts('startedAt', { req: true });
    const data = r.blob({ omit: ['tenantId', 'memberId'] });   // startedAt/completedAt stay in the JSON, as ms
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, memberId, data, loggedAt }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, data: (v) => v.data, logged_at: (v) => v.loggedAt },
};

export const measurements = {
  table: 'measurements', from: 'measurements',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'measurements', doc);
    const { tenantId, memberId } = memberOf(r);
    const measuredAt = r.ts('recordedAt', { req: true });
    const data = r.blob({ omit: ['tenantId', 'memberId'] });
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, memberId, data, measuredAt }];
  },
  columns: { id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, data: (v) => v.data, measured_at: (v) => v.measuredAt },
};

// ---------------------------------------------------------------- ledger
export const payments = {
  table: 'payments', from: 'payments',
  key: (row) => row.id,
  build(doc, ctx) {
    if (doc.tenantId === undefined || doc.tenantId === null || doc.tenantId === '') {
      ctx.skip('payments', doc.__id, 'no tenantId (legacy marte06 payment in the shared collection)');
      return [];
    }
    const r = new Reader(ctx, 'payments', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    const raw = r.str('memberId', { req: true });
    const memberId = raw ? ctx.uidId(raw) : null;
    if (tenantId && memberId && !ctx.has('memberships', tenantId, memberId)) {
      // deleteMyAccount anonymises payments instead of deleting them (the gym's ledger must survive).
      if (doc.memberDeletedAt) r.warn('payment-of-deleted-account', 'kept: account deleted, ledger row anonymised by the old backend');
      else r.orphans.push(`member: no membership row for ${memberId} and the payment is not marked memberDeletedAt`);
    }
    const amount = r.money('amount', { req: true });
    if (amount !== null && amount <= 0) r.bad(`amount ${amount} is not positive`);
    const status = r.enumStr('status', ['pending', 'confirmed', 'rejected'], { req: true });
    const kind = r.enumStr('kind', ['charge', 'refund', 'reversal'], { def: 'charge' });
    if (!doc.kind) r.warn('payment-kind-defaulted', 'absent kind written as "charge" (D1 reversal logic matches kind = charge)');
    const method = r.str('method');
    if (method && !['cash', 'bank_transfer', 'card'].includes(method)) r.warn('payment-method-unknown', method);
    const createdAt = r.ts('createdAt', { req: true });
    const data = r.blob({ omit: ['tenantId', 'memberId', 'amount', 'status', 'createdAt'], uid: ['submittedBy'], defaults: { kind } });
    if (!r.finish()) return [];
    return [{ id: doc.__id, tenantId, memberId, amount, status, data, createdAt }];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, amount: (v) => v.amount,
    status: (v) => v.status, data: (v) => v.data, created_at: (v) => v.createdAt,
  },
};

// ---------------------------------------------------------------- personal training
/** Allowed by the D1 CHECK (0010). Anything else is dropped with a warning rather than failing the INSERT. */
const PT_ROLES = ['member', 'guardian', 'trainer', 'admin', 'system'];
/**
 * Firestore stores only `creditRefunded` (boolean). D1 (0010) has a five-value refund_outcome:
 * no credit paid -> 'no-credit'; refunded -> 'refunded'; a member/guardian cancel that burned the credit -> 'late';
 * a staff cancel with nothing refunded (credit document missing) -> 'nothing-to-refund'.
 * Rows cancelled before the flag existed get NULL. Derived, not recorded: stated in the report.
 */
export function ptRefundOutcome({ status, creditId, creditRefunded, role }) {
  if (status !== 'cancelled') return null;
  if (!creditId) return 'no-credit';
  if (creditRefunded === true) return 'refunded';
  if (creditRefunded === false) return role === 'member' || role === 'guardian' ? 'late' : 'nothing-to-refund';
  return null;
}

export const ptSessions = {
  table: 'pt_sessions', from: 'pt_sessions',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'pt_sessions', doc);
    const { tenantId, memberId } = memberOf(r);
    const trainerRaw = r.str('trainerId', { req: true });
    const trainerId = trainerRaw ? ctx.uidId(trainerRaw) : null;
    if (tenantId && trainerId) r.need('memberships', 'trainer', tenantId, trainerId);
    const creditId = r.str('creditId');
    if (creditId && tenantId) {
      if (r.need('member_credits', 'credit', tenantId, creditId) && ctx.get('member_credits', tenantId, creditId).member_id !== memberId) {
        r.warn('credit-member-mismatch', `credit ${creditId} belongs to another member`);
      }
    }
    let id = doc.__id;
    const prefix = `${tenantId}_${trainerRaw}_`;
    if (tenantId && trainerRaw && id.startsWith(prefix)) { id = `${tenantId}_${trainerId}_${id.slice(prefix.length)}`; (ctx.docMap.pt_sessions ??= {})[doc.__id] = id; }
    const role = r.str('cancelledByRole');
    let cancelledByRole = null;
    if (role) {
      if (PT_ROLES.includes(role)) cancelledByRole = role;
      else r.warn('pt-cancelled-by-role-dropped', `"${role}" is not allowed by the D1 CHECK; cancelled_by_role left NULL`);
    }
    const refunded = r.raw('creditRefunded');
    const status = r.enumStr('status', ['scheduled', 'completed', 'cancelled'], { req: true });
    const createdAt = r.ts('createdAt', { req: true, fallback: 0 });
    const view = {
      id, tenantId, trainerId, memberId, creditId,
      originalTrainerId: r.uid('originalTrainerId'), startsAt: r.ts('date', { req: true }),
      duration: r.int('durationMinutes', { req: true, min: 1, max: 480 }), status,
      deadline: r.ts('cancellationDeadlineAt'), cancelledAt: r.ts('cancelledAt'), cancelledBy: r.uid('cancelledBy'), cancelledByRole,
      refundOutcome: ptRefundOutcome({ status, creditId, creditRefunded: refunded, role: cancelledByRole }),
      reminderSentAt: r.ts('reminderSentAt'), createdAt, updatedAt: r.ts('updatedAt', { req: true, fallback: createdAt ?? 0 }),
    };
    if (!r.finish(['trainerName', 'memberName'])) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, trainer_id: (v) => v.trainerId, member_id: (v) => v.memberId,
    original_trainer_id: (v) => v.originalTrainerId, starts_at: (v) => v.startsAt, duration_minutes: (v) => v.duration, status: (v) => v.status,
    credit_id: (v) => v.creditId, cancellation_deadline_at: (v) => v.deadline, cancelled_at: (v) => v.cancelledAt, cancelled_by: (v) => v.cancelledBy,
    cancelled_by_role: (v) => v.cancelledByRole, refund_outcome: (v) => v.refundOutcome, reminder_sent_at: (v) => v.reminderSentAt,
    created_at: (v) => v.createdAt, updated_at: (v) => v.updatedAt,
  },
};

export const trainerAvailability = {
  table: 'trainer_availability', from: 'trainer_availability',
  key: (row) => k(row.tenant_id, row.trainer_id),
  build(doc, ctx) {
    const r = new Reader(ctx, 'trainer_availability', doc);
    const { tenantId, memberId: trainerId } = memberOf(r, { field: 'trainerId' });
    const view = {
      tenantId, trainerId, weekly: r.json('weekly', {}), slotMinutes: r.int('slotMinutes', { def: 60 }) ?? 60,
      exceptions: r.json('exceptions', []), updatedAt: r.ts('updatedAt', { req: true, fallback: 0 }),
    };
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    tenant_id: (v) => v.tenantId, trainer_id: (v) => v.trainerId, weekly: (v) => v.weekly, slot_minutes: (v) => v.slotMinutes,
    exceptions: (v) => v.exceptions, updated_at: (v) => v.updatedAt,
  },
};

export const calendarShares = {
  table: 'calendar_shares', from: 'calendar_shares',
  key: (row) => k(row.tenant_id, row.owner_trainer_id, row.viewer_trainer_id),
  build(doc, ctx) {
    const r = new Reader(ctx, 'calendar_shares', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    const owner = r.uid('ownerTrainerId', { req: true });
    const viewer = r.uid('viewerTrainerId', { req: true });
    if (tenantId) { r.need('memberships', 'owner', tenantId, owner); r.need('memberships', 'viewer', tenantId, viewer); }
    const view = { tenantId, owner, viewer, createdAt: r.ts('createdAt', { req: true, fallback: 0 }) };
    if (!r.finish(['ownerTrainerName'])) return [];
    return [view];
  },
  columns: { tenant_id: (v) => v.tenantId, owner_trainer_id: (v) => v.owner, viewer_trainer_id: (v) => v.viewer, created_at: (v) => v.createdAt },
};

// ---------------------------------------------------------------- notifications and requests
export const pushTokens = {
  table: 'push_tokens', from: 'push_tokens',
  key: (row) => row.token,
  build(doc, ctx) {
    const r = new Reader(ctx, 'push_tokens', doc);
    const userId = r.uid('userId', { req: true });
    if (userId && ctx.excludedUsers.has(userId)) r.orphans.push('user: account no longer exists in Firebase Auth');
    else if (userId) r.need('users', 'user', userId);
    const platform = r.str('platform');
    const view = { token: doc.__id, userId, tenantId: r.str('tenantId'), platform: ['ios', 'android'].includes(platform) ? platform : null, updatedAt: r.ts('updatedAt', { req: true, fallback: 0 }) };
    if (!r.finish()) return [];
    return [view];
  },
  columns: { token: (v) => v.token, user_id: (v) => v.userId, tenant_id: (v) => v.tenantId, platform: (v) => v.platform, updated_at: (v) => v.updatedAt },
};

export const announcements = {
  table: 'announcements', from: 'announcements',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'announcements', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    const view = {
      id: doc.__id, tenantId, title: r.text('title', { req: true }), body: r.text('body', { req: true }),
      createdBy: r.uid('createdBy', { req: true }), createdByName: r.str('createdByName'),
      createdAt: r.ts('createdAt', { req: true }), expiresAt: r.ts('expiresAt'),
    };
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, title: (v) => v.title, body: (v) => v.body, created_by: (v) => v.createdBy,
    created_by_name: (v) => v.createdByName, created_at: (v) => v.createdAt, expires_at: (v) => v.expiresAt,
  },
};

export const renewalRequests = {
  table: 'renewal_requests', from: 'renewal_requests',
  key: (row) => row.id,
  before(ctx) { ctx.pendingRenewals = new Set(); },
  build(doc, ctx) {
    const r = new Reader(ctx, 'renewal_requests', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    const raw = r.str('memberId', { req: true });
    const memberId = raw ? ctx.uidId(raw) : null;
    // The API upserts on id = `${tenantId}_${internalMemberId}`: the id must follow the member's internal id.
    let id = doc.__id;
    if (tenantId && raw && id === `${tenantId}_${raw}`) { id = `${tenantId}_${memberId}`; (ctx.docMap.renewal_requests ??= {})[doc.__id] = id; }
    const status = r.enumStr('status', ['pending', 'handled', 'withdrawn'], { req: true });
    if (status === 'pending' && tenantId && memberId) {
      if (ctx.pendingRenewals.has(k(tenantId, memberId))) r.bad('second pending renewal request for the same member');
      else ctx.pendingRenewals.add(k(tenantId, memberId));
    }
    const view = {
      id, tenantId, memberId, memberName: r.str('memberName'), status, note: r.text('note'),
      createdAt: r.ts('createdAt', { req: true }), handledAt: r.ts('handledAt'), handledBy: r.uid('handledBy'),
    };
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, tenant_id: (v) => v.tenantId, member_id: (v) => v.memberId, member_name: (v) => v.memberName, status: (v) => v.status,
    note: (v) => v.note, created_at: (v) => v.createdAt, handled_at: (v) => v.handledAt, handled_by: (v) => v.handledBy,
  },
};

export const exerciseReports = {
  table: 'exercise_reports', from: 'exercise_reports',
  key: (row) => row.id,
  build(doc, ctx) {
    const r = new Reader(ctx, 'exercise_reports', doc);
    const tenantId = r.tenantId();
    r.need('tenants', 'tenant', tenantId);
    const view = {
      id: doc.__id, exerciseId: r.str('exerciseId', { req: true }), exerciseName: r.str('exerciseName'), tenantId,
      reportedBy: r.uid('reportedBy', { req: true }), reportedByName: r.str('reportedByName'),
      reason: r.enumStr('reason', ['pose', 'muscles', 'text', 'other'], { req: true }),
      note: r.text('note') ?? '', createdAt: r.ts('createdAt', { req: true }),
    };
    if (!r.finish()) return [];
    return [view];
  },
  columns: {
    id: (v) => v.id, exercise_id: (v) => v.exerciseId, exercise_name: (v) => v.exerciseName, tenant_id: (v) => v.tenantId,
    reported_by: (v) => v.reportedBy, reported_by_name: (v) => v.reportedByName, reason: (v) => v.reason, note: (v) => v.note, created_at: (v) => v.createdAt,
  },
};

export const ACTIVITY_SPECS = [
  classes, classBookings, classWaitlist, classAttendance, classCancellationRefunds,
  checkins, programs, programTemplates, workoutLogs, measurements, payments,
  ptSessions, trainerAvailability, calendarShares, pushTokens, announcements, renewalRequests, exerciseReports,
];
