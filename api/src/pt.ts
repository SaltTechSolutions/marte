import { Hono } from 'hono';

import { rolesIn } from './auth';
import {
  computeCancellationDeadline, isBeforeDeadline, isWithinAvailability, tenantTimeFrom,
  type Availability, type TenantTime,
} from './cancellationDeadline';
import { outboxStatement } from './outbox';
import type { Env, Vars } from './types';

/**
 * Personal-training sessions (port of sessions.ts: bookPtSessions, cancelPtSession, createPtSessionByStaff,
 * plus the pt_sessions update rules of firestore.rules: complete, trainer hand-over / take-over).
 *
 * Shape of every write: pre-checks in JS give precise 4xx errors; the SAME invariants are repeated inside
 * the write statements (conditional SQL) so a race cannot slip through; multi-statement changes are ONE
 * db.batch() and a statement that must stop the others is followed by an `INSERT INTO pt_batch_abort ...
 * WHERE <violation>` which throws and rolls the whole batch back. A credit-linked session is only ever
 * written by `book` (credit decrement + session insert are one batch); no other route accepts a creditId.
 */
type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const pt = new Hono<App>();

const MAX_SLOTS = 20;                       // 3 statements per slot must stay far below D1's per-batch limits
const MAX_DURATION_MIN = 480;
const MAX_DURATION_MS = MAX_DURATION_MIN * 60_000;

const newId = (p: string) => p + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
const body = async (c: Ctx) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
const fail = (c: Ctx, status: 400 | 403 | 404 | 409, error: string, extra: Record<string, unknown> = {}) => c.json({ error, ...extra }, status);
const canHoldPtSessions = (roles: readonly string[]) => roles.includes('trainer') || roles.includes('admin');
const isAbort = (e: unknown) => /pt_batch_aborted|CHECK constraint failed|SQLITE_CONSTRAINT/i.test(String((e as Error)?.message ?? e));

/** A timestamp from the client: unix ms or an ISO string. NaN when unreadable. */
const toMs = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' ? new Date(v).getTime() : Number.NaN);

// ---- SQL fragments (the invariants live in the statements, not only in the pre-checks) ----
const hasRole = (alias: string, roles: string[]) =>
  `EXISTS (SELECT 1 FROM json_each(${alias}.roles) WHERE value IN (${roles.map((r) => `'${r}'`).join(',')}))`;
/** An active member of the gym whose roles include any of `roles`. Binds: tenant, member. */
const activeWith = (roles: string[]) =>
  `EXISTS (SELECT 1 FROM memberships x WHERE x.tenant_id = ? AND x.member_id = ? AND x.status = 'active' AND ${hasRole('x', roles)})`;
/** Binds: tenant, trainer, windowStart - 480min, end, start [, exceptSessionId]. Half-open interval overlap. */
const overlaps = (except: boolean) =>
  `EXISTS (SELECT 1 FROM pt_sessions o WHERE o.tenant_id = ? AND o.trainer_id = ? AND o.status != 'cancelled'
     AND o.starts_at > ? AND o.starts_at < ? AND o.starts_at + o.duration_minutes * 60000 > ?${except ? ' AND o.id != ?' : ''})`;
const overlapArgs = (tenantId: string, trainerId: string, start: number, durationMin: number, except?: string) =>
  [tenantId, trainerId, start - MAX_DURATION_MS, start + durationMin * 60_000, start, ...(except ? [except] : [])];
const abortUnless = (db: D1Database, existsSql: string, ...binds: unknown[]) =>
  db.prepare(`INSERT INTO pt_batch_abort (reason) SELECT 'pt' WHERE NOT EXISTS (${existsSql})`).bind(...binds);

async function tenantTime(db: D1Database, tenantId: string): Promise<TenantTime> {
  const r = await db.prepare(`SELECT settings FROM tenants WHERE id = ?`).bind(tenantId).first<{ settings: string }>();
  return tenantTimeFrom(r?.settings);
}

type Existing = { id: string; starts_at: number; duration_minutes: number };
/** The existing session a proposed [start, start+duration) collides with, if any (cancelled ones never do). */
async function findClash(db: D1Database, tenantId: string, trainerId: string, start: number, durationMin: number, except?: string): Promise<Existing | null> {
  const a = overlapArgs(tenantId, trainerId, start, durationMin, except);
  return db.prepare(
    `SELECT o.id, o.starts_at, o.duration_minutes FROM pt_sessions o WHERE o.tenant_id = ? AND o.trainer_id = ? AND o.status != 'cancelled'
       AND o.starts_at > ? AND o.starts_at < ? AND o.starts_at + o.duration_minutes * 60000 > ?${except ? ' AND o.id != ?' : ''} LIMIT 1`,
  ).bind(...a).first<Existing>();
}
const clashError = (c: Ctx, clash: Existing, start: number) =>
  fail(c, 409, clash.starts_at === start ? 'slot_taken' : 'slot_overlap', { slot: start, clashStartsAt: clash.starts_at });

// =====================================================================================================
// bookPtSessions: a member (or an approved guardian, for the child) spends credits on trainer slots.
// =====================================================================================================
type Plan = {
  ok: true; memberId: string; trainerId: string; avUpdatedAt: number; durationMin: number; slots: number[];
  creditFor: string[]; deadlines: number[]; time: TenantTime;
} | { ok: false; status: 400 | 403 | 409; error: string; extra?: Record<string, unknown> };

async function planBooking(db: D1Database, tenantId: string, uid: string, memberId: string, trainerId: string, slots: number[], now: number): Promise<Plan> {
  const no = (status: 400 | 403 | 409, error: string, extra?: Record<string, unknown>): Plan => ({ ok: false, status, error, extra });

  const m = await db.prepare(`SELECT status, guardian_id, guardian_status FROM memberships WHERE tenant_id = ? AND member_id = ?`)
    .bind(tenantId, memberId).first<{ status: string; guardian_id: string | null; guardian_status: string | null }>();
  if (memberId !== uid) {
    // Only an APPROVED link carries authority; a pending one must not let a parent spend the child's credits.
    if (!m || m.guardian_id !== uid || m.guardian_status !== 'approved') return no(403, 'forbidden');
    if (m.status !== 'active') return no(409, 'member_not_active');
  } else if (!m || m.status !== 'active') {
    return no(403, 'forbidden');
  }

  const trainer = await db.prepare(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, trainerId).first<{ status: string; roles: string }>();
  if (!trainer || trainer.status !== 'active' || !canHoldPtSessions(JSON.parse(trainer.roles))) return no(409, 'trainer_unavailable');

  const avRow = await db.prepare(`SELECT weekly, slot_minutes, exceptions, updated_at FROM trainer_availability WHERE tenant_id = ? AND trainer_id = ?`)
    .bind(tenantId, trainerId).first<{ weekly: string; slot_minutes: number; exceptions: string; updated_at: number }>();
  if (!avRow) return no(409, 'no_availability');
  const av: Availability = { weekly: JSON.parse(avRow.weekly), slotMinutes: avRow.slot_minutes, exceptions: JSON.parse(avRow.exceptions) };
  const time = await tenantTime(db, tenantId);
  for (const s of slots) if (!isWithinAvailability(av, s, time.timeZone)) return no(409, 'outside_availability', { slot: s });

  // Same-start AND different-start collisions (PER-6): a hand-added session can sit at any minute.
  for (const s of slots) {
    const clash = await findClash(db, tenantId, trainerId, s, avRow.slot_minutes);
    if (clash) return no(409, clash.starts_at === s ? 'slot_taken' : 'slot_overlap', { slot: s, clashStartsAt: clash.starts_at });
  }

  // Credits unexpired as of now, spent earliest-expiring-first, but only among those still valid ON the slot's date.
  const { results: credits } = await db.prepare(
    `SELECT id, total - used AS left, expires_at FROM member_credits
     WHERE tenant_id = ? AND member_id = ? AND kind = 'ptLesson' AND status = 'active' AND expires_at > ? ORDER BY expires_at, id`,
  ).bind(tenantId, memberId, now).all<{ id: string; left: number; expires_at: number }>();
  const left = new Map(credits.map((cr) => [cr.id, cr.left]));
  const creditFor: string[] = [];
  for (const s of slots) {
    const pick = credits.find((cr) => (left.get(cr.id) ?? 0) > 0 && cr.expires_at >= s);
    if (!pick) return no(409, 'no_credit', { slot: s });
    left.set(pick.id, left.get(pick.id)! - 1);
    creditFor.push(pick.id);
  }
  return {
    ok: true, memberId, trainerId, avUpdatedAt: avRow.updated_at, durationMin: avRow.slot_minutes, slots, creditFor, time,
    // Frozen at booking: a gym tightening its notice period later must not move the line under booked sessions.
    deadlines: slots.map((s) => computeCancellationDeadline(s, time)),
  };
}

pt.post('/tenants/:tenantId/pt-sessions/book', async (c) => {
  const uid = c.get('userId');
  if (!uid) return fail(c, 403, 'forbidden');
  const tenantId = c.req.param('tenantId')!;
  const b = await body(c);
  if (typeof b.trainerId !== 'string' || !b.trainerId || !Array.isArray(b.slots) || b.slots.length === 0) return fail(c, 400, 'trainerId and slots required');
  if (b.memberId !== undefined && (typeof b.memberId !== 'string' || !b.memberId)) return fail(c, 400, 'memberId');
  if (b.slots.length > MAX_SLOTS) return fail(c, 400, `at most ${MAX_SLOTS} slots per request`);
  const now = Date.now();
  const slots = b.slots.map(toMs).sort((x, y) => x - y);
  if (slots.some((s) => !Number.isFinite(s))) return fail(c, 400, 'unreadable slot');
  if (slots.some((s) => s <= now)) return fail(c, 400, 'slot in the past');
  if (new Set(slots).size !== slots.length) return fail(c, 400, 'duplicate slot');   // double-tap / retry inside one request
  const memberId = (b.memberId as string | undefined) ?? uid;
  if (memberId === b.trainerId) return fail(c, 400, 'a trainer cannot book themselves');

  const db = c.env.DB;
  const plan = await planBooking(db, tenantId, uid, memberId, b.trainerId, slots, now);
  if (!plan.ok) return fail(c, plan.status, plan.error, plan.extra);

  const ids = slots.map(() => newId('ps'));
  const stmts: D1PreparedStatement[] = [];
  slots.forEach((s, i) => {
    // 1) reserve one lesson. Matching 0 rows (lost race: credit spent/expired meanwhile) is caught by the abort below.
    stmts.push(db.prepare(
      `UPDATE member_credits SET used = used + 1, status = CASE WHEN used + 1 >= total THEN 'exhausted' ELSE status END
       WHERE id = ? AND tenant_id = ? AND member_id = ? AND kind = 'ptLesson' AND status = 'active'
         AND used < total AND expires_at > ? AND expires_at >= ?`,
    ).bind(plan.creditFor[i], tenantId, memberId, now, s));
    // 2) the session, only if the credit was just taken AND nothing overlaps AND the people/availability are still as checked.
    stmts.push(db.prepare(
      `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, cancellation_deadline_at, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?
       WHERE changes() = 1
         AND NOT ${overlaps(false)}
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = ? AND m.member_id = ? AND m.status = 'active'
                     AND (m.member_id = ? OR (m.guardian_id = ? AND m.guardian_status = 'approved')))
         AND ${activeWith(['trainer', 'admin'])}
         AND (SELECT updated_at FROM trainer_availability WHERE tenant_id = ? AND trainer_id = ?) = ?`,
    ).bind(ids[i], tenantId, plan.trainerId, memberId, s, plan.durationMin, plan.creditFor[i], plan.deadlines[i], now, now,
      ...overlapArgs(tenantId, plan.trainerId, s, plan.durationMin),
      tenantId, memberId, uid, uid,
      tenantId, plan.trainerId,
      tenantId, plan.trainerId, plan.avUpdatedAt));
    // 3) any slot that did not land aborts the whole request: all slots or none, and the credit comes back with the rollback.
    stmts.push(abortUnless(db, `SELECT 1 FROM pt_sessions WHERE id = ?`, ids[i]));
  });

  try {
    await db.batch(stmts);
  } catch (e) {
    if (!isAbort(e)) throw e;
    // Lost a race. Re-run the checks to tell the caller what is wrong now; if nothing is, ask for a retry.
    const again = await planBooking(db, tenantId, uid, memberId, b.trainerId, slots, Date.now());
    return again.ok ? fail(c, 409, 'conflict') : fail(c, again.status, again.error, again.extra);
  }
  return c.json({
    booked: slots.length,
    sessions: slots.map((s, i) => ({ id: ids[i], startsAt: s, durationMinutes: plan.durationMin, creditId: plan.creditFor[i], cancellationDeadlineAt: plan.deadlines[i] })),
  }, 201);
});

// =====================================================================================================
// createPtSessionByStaff: a trainer (own calendar) or admin (any calendar) adds a session; no credit.
// =====================================================================================================
pt.post('/tenants/:tenantId/pt-sessions', async (c) => {
  const uid = c.get('userId');
  const tenantId = c.req.param('tenantId')!;
  const roles = await rolesIn(c.env.DB, tenantId, uid);
  const admin = roles.includes('admin');
  if (!uid || !(admin || roles.includes('trainer'))) return fail(c, 403, 'forbidden');
  const b = await body(c);
  // The credit-linked path is `book` alone: a staff request that names a credit is refused, not ignored.
  if (b.creditId !== undefined) return fail(c, 400, 'creditId is not accepted here');
  if (typeof b.trainerId !== 'string' || !b.trainerId || typeof b.memberId !== 'string' || !b.memberId) return fail(c, 400, 'trainerId and memberId required');
  if (!admin && b.trainerId !== uid) return fail(c, 403, 'forbidden');        // a trainer writes onto their OWN calendar only
  const duration = b.durationMinutes;
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0 || duration > MAX_DURATION_MIN) return fail(c, 400, 'durationMinutes');
  const start = toMs(b.startsAt ?? b.date);
  if (!Number.isFinite(start)) return fail(c, 400, 'startsAt');
  const now = Date.now();
  if (start <= now) return fail(c, 400, 'slot in the past');
  if (b.memberId === b.trainerId) return fail(c, 400, 'a trainer cannot book themselves');

  const db = c.env.DB;
  const t = await db.prepare(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, b.trainerId).first<{ status: string; roles: string }>();
  if (!t || t.status !== 'active' || !canHoldPtSessions(JSON.parse(t.roles))) return fail(c, 409, 'trainer_unavailable');
  const m = await db.prepare(`SELECT status FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, b.memberId).first<{ status: string }>();
  if (!m || m.status !== 'active') return fail(c, 409, 'member_not_active');
  const clash = await findClash(db, tenantId, b.trainerId, start, duration);
  if (clash) return clashError(c, clash, start);

  // Availability windows and opening hours are deliberately NOT enforced: the trainer is the authority over
  // their own calendar (the 07:00 session agreed by phone, the extra hour on a closed Sunday).
  const deadline = computeCancellationDeadline(start, await tenantTime(db, tenantId));
  const id = newId('ps');
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, cancellation_deadline_at, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, 'scheduled', NULL, ?, ?, ?
         WHERE NOT ${overlaps(false)}
           AND ${activeWith(['trainer', 'admin'])}
           AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = ? AND m.member_id = ? AND m.status = 'active')
           AND ${activeWith(admin ? ['admin'] : ['trainer', 'admin'])}`,
      ).bind(id, tenantId, b.trainerId, b.memberId, start, duration, deadline, now, now,
        ...overlapArgs(tenantId, b.trainerId, start, duration),
        tenantId, b.trainerId,
        tenantId, b.memberId,
        tenantId, uid),
      abortUnless(db, `SELECT 1 FROM pt_sessions WHERE id = ?`, id),
    ]);
  } catch (e) {
    if (!isAbort(e)) throw e;
    const again = await findClash(db, tenantId, b.trainerId, start, duration);
    return again ? clashError(c, again, start) : fail(c, 409, 'conflict');
  }
  return c.json({ id, cancellationDeadlineAt: deadline }, 201);
});

// =====================================================================================================
// cancelPtSession: cancellation + refund decision + refund marker, one batch.
// =====================================================================================================
type SessionRow = {
  id: string; trainer_id: string; member_id: string; starts_at: number; status: string; credit_id: string | null;
  cancellation_deadline_at: number | null;
};
type Actor = 'member' | 'guardian' | 'trainer' | 'admin';

/** The state the pre-check saw, plus the caller's authority, re-asserted inside the statement. Binds: see `args`. */
function gate(alias: string, s: SessionRow, tenantId: string, actor: Actor, uid: string) {
  const auth = {
    member: { sql: `${alias}.member_id = ?`, args: [uid] },
    trainer: { sql: `${alias}.trainer_id = ?`, args: [uid] },
    admin: { sql: `EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = ${alias}.tenant_id AND a.member_id = ? AND a.status = 'active' AND ${hasRole('a', ['admin'])})`, args: [uid] },
    guardian: { sql: `EXISTS (SELECT 1 FROM memberships g WHERE g.tenant_id = ${alias}.tenant_id AND g.member_id = ${alias}.member_id AND g.guardian_id = ? AND g.guardian_status = 'approved')`, args: [uid] },
  }[actor];
  return {
    sql: `${alias}.id = ? AND ${alias}.tenant_id = ? AND ${alias}.status = 'scheduled' AND ${alias}.trainer_id = ? AND ${alias}.credit_id IS ? AND ${auth.sql}`,
    args: [s.id, tenantId, s.trainer_id, s.credit_id, ...auth.args],
  };
}

const labelOf = (ms: number, tz: string) => {
  const d = new Date(ms);
  return `${new Intl.DateTimeFormat('tr-TR', { timeZone: tz, day: 'numeric', month: 'long' }).format(d)} ${new Intl.DateTimeFormat('tr-TR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d)}`;
};
const nameOfMember = async (db: D1Database, tenantId: string, memberId: string) => {
  const r = await db.prepare(`SELECT display_name, email FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, memberId).first<{ display_name: string | null; email: string | null }>();
  return r?.display_name || r?.email || null;
};

pt.post('/tenants/:tenantId/pt-sessions/:id/cancel', async (c) => {
  const uid = c.get('userId');
  if (!uid) return fail(c, 403, 'forbidden');
  const tenantId = c.req.param('tenantId')!;
  const db = c.env.DB;
  const s = await db.prepare(
    `SELECT id, trainer_id, member_id, starts_at, status, credit_id, cancellation_deadline_at FROM pt_sessions WHERE id = ? AND tenant_id = ?`,
  ).bind(c.req.param('id'), tenantId).first<SessionRow>();
  if (!s) return fail(c, 404, 'not found');
  if (s.status === 'cancelled') return fail(c, 409, 'already_cancelled');
  if (s.status === 'completed') return fail(c, 409, 'already_completed');

  let actor: Actor | null = s.member_id === uid ? 'member' : s.trainer_id === uid ? 'trainer' : null;
  if (!actor && (await rolesIn(db, tenantId, uid)).includes('admin')) actor = 'admin';
  if (!actor) {
    const child = await db.prepare(`SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'approved'`)
      .bind(tenantId, s.member_id, uid).first();
    if (child) actor = 'guardian';
  }
  if (!actor) return fail(c, 403, 'forbidden');

  const now = Date.now();
  const time = await tenantTime(db, tenantId);
  // Staff cancelling always refunds (the member did not cause it). A member or their parent refunds only
  // inside the deadline frozen at booking; rows booked before deadlines were stored recompute from today's setting.
  let refund = false;
  if (s.credit_id) {
    refund = actor === 'trainer' || actor === 'admin'
      || isBeforeDeadline(s.cancellation_deadline_at ?? computeCancellationDeadline(s.starts_at, time), now);
  }

  const g = gate('pt_sessions', s, tenantId, actor, uid);
  const gs = gate('s', s, tenantId, actor, uid);
  const stmts: D1PreparedStatement[] = [];
  if (refund) {
    // The lesson comes back only while THIS request is the one that cancels the session (the EXISTS), and a
    // reactivated credit that has already expired goes straight to 'expired' instead of 'active'.
    stmts.push(db.prepare(
      `UPDATE member_credits SET used = used - 1,
         status = CASE WHEN status = 'exhausted' THEN (CASE WHEN expires_at > ? THEN 'active' ELSE 'expired' END) ELSE status END
       WHERE id = ? AND tenant_id = ? AND used > 0 AND EXISTS (SELECT 1 FROM pt_sessions s WHERE ${gs.sql})`,
    ).bind(now, s.credit_id, tenantId, ...gs.args));
  }
  // The refund marker reads changes() of the statement just above: 1 = a lesson really came back.
  stmts.push(db.prepare(
    `UPDATE pt_sessions SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, cancelled_by_role = ?, updated_at = ?,
       refund_outcome = CASE WHEN ? = 1 THEN (CASE WHEN changes() = 1 THEN 'refunded' ELSE 'nothing-to-refund' END)
                             WHEN credit_id IS NULL THEN 'no-credit' ELSE 'late' END
     WHERE ${g.sql}`,
  ).bind(now, uid, actor, now, refund ? 1 : 0, ...g.args));
  stmts.push(abortUnless(db, `SELECT 1 FROM pt_sessions WHERE id = ? AND status = 'cancelled' AND cancelled_by = ? AND updated_at = ?`, s.id, uid, now));
  if (actor !== 'trainer') {
    // ADMIN-3: the trainer's hour just freed up and nobody knew. Skipped when the trainer cancelled it themselves.
    const who = (await nameOfMember(db, tenantId, s.member_id)) ?? 'Bir üye';
    const when = labelOf(s.starts_at, time.timeZone);
    stmts.push(outboxStatement(db, 'push', {
      userIds: [s.trainer_id], title: 'Randevu iptal edildi', category: 'bookings',
      body: actor === 'admin' ? `${who} · ${when} randevusu yönetici tarafından iptal edildi.` : `${who} · ${when} randevusunu iptal etti.`,
      data: { screen: 'trainer/calendar', sessionId: s.id },
    }, `pt-cancel:${s.id}`));
  }

  try {
    await db.batch(stmts);
  } catch (e) {
    if (!isAbort(e)) throw e;
    return fail(c, 409, 'conflict');   // the session changed under us (cancelled, completed, reassigned): reload and retry
  }
  const done = await db.prepare(`SELECT refund_outcome FROM pt_sessions WHERE id = ?`).bind(s.id).first<{ refund_outcome: string }>();
  return c.json({ refunded: done?.refund_outcome === 'refunded', outcome: done?.refund_outcome ?? null });
});

// =====================================================================================================
// complete / reassign: the other legal pt_sessions updates from firestore.rules.
// =====================================================================================================
pt.post('/tenants/:tenantId/pt-sessions/:id/complete', async (c) => {
  const uid = c.get('userId');
  const tenantId = c.req.param('tenantId')!;
  const db = c.env.DB;
  const roles = await rolesIn(db, tenantId, uid);
  const s = await db.prepare(`SELECT id, trainer_id, status FROM pt_sessions WHERE id = ? AND tenant_id = ?`).bind(c.req.param('id'), tenantId).first<{ id: string; trainer_id: string; status: string }>();
  const admin = roles.includes('admin');
  // The assigned trainer (not a calendar-share viewer) or an admin. A stranger cannot probe which ids exist.
  if (!uid || !(admin || (canHoldPtSessions(roles) && s?.trainer_id === uid))) return fail(c, 403, 'forbidden');
  if (!s) return fail(c, 404, 'not found');
  if (s.status !== 'scheduled') return fail(c, 409, `already_${s.status}`);
  const now = Date.now();
  await db.prepare(
    `UPDATE pt_sessions SET status = 'completed', updated_at = ? WHERE id = ? AND tenant_id = ? AND status = 'scheduled' AND trainer_id = ?`,
  ).bind(now, s.id, tenantId, s.trainer_id).run();
  const after = await db.prepare(`SELECT status, updated_at FROM pt_sessions WHERE id = ?`).bind(s.id).first<{ status: string; updated_at: number }>();
  return after?.status === 'completed' && after.updated_at === now ? c.json({ status: 'completed' }) : fail(c, 409, 'conflict');
});

/**
 * Hand a session to another trainer. Admin: to any active coach, unconditionally. The assigned trainer: to any
 * active coach. A colleague the owner shared the calendar with: only TO THEMSELVES (take-over). `originalTrainerId`
 * is set once, on the first move, so history survives several hand-offs. Unlike the Firestore rule, the new
 * trainer's own calendar must be free for the session's interval.
 */
pt.post('/tenants/:tenantId/pt-sessions/:id/reassign', async (c) => {
  const uid = c.get('userId');
  const tenantId = c.req.param('tenantId')!;
  const db = c.env.DB;
  const b = await body(c);
  if (typeof b.trainerId !== 'string' || !b.trainerId) return fail(c, 400, 'trainerId required');
  const target = b.trainerId;
  const s = await db.prepare(`SELECT id, trainer_id, member_id, starts_at, duration_minutes, status FROM pt_sessions WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), tenantId).first<{ id: string; trainer_id: string; member_id: string; starts_at: number; duration_minutes: number; status: string }>();
  const roles = await rolesIn(db, tenantId, uid);
  let mode: 'admin' | 'owner' | 'share' | null = null;
  if (uid) {
    if (roles.includes('admin')) mode = 'admin';
    else if (s && s.trainer_id === uid && canHoldPtSessions(roles)) mode = 'owner';
    else if (s && target === uid && canHoldPtSessions(roles)) {
      const share = await db.prepare(`SELECT 1 AS x FROM calendar_shares WHERE tenant_id = ? AND owner_trainer_id = ? AND viewer_trainer_id = ?`).bind(tenantId, s.trainer_id, uid).first();
      if (share) mode = 'share';
    }
  }
  if (!uid || !mode) return fail(c, 403, 'forbidden');      // an unknown session is 403 for non-admins: no id probing
  if (!s) return fail(c, 404, 'not found');
  if (s.status !== 'scheduled') return fail(c, 409, `already_${s.status}`);
  if (target === s.trainer_id) return fail(c, 409, 'already_assigned');
  if (target === s.member_id) return fail(c, 400, 'a trainer cannot book themselves');
  const t = await db.prepare(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, target).first<{ status: string; roles: string }>();
  if (!t || t.status !== 'active' || !canHoldPtSessions(JSON.parse(t.roles))) return fail(c, 409, 'trainer_unavailable');
  const clash = await findClash(db, tenantId, target, s.starts_at, s.duration_minutes, s.id);
  if (clash) return clashError(c, clash, s.starts_at);

  const authSql = {
    admin: `EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = pt_sessions.tenant_id AND a.member_id = ? AND a.status = 'active' AND ${hasRole('a', ['admin'])})`,
    owner: `pt_sessions.trainer_id = ?`,
    share: `EXISTS (SELECT 1 FROM calendar_shares cs WHERE cs.tenant_id = pt_sessions.tenant_id AND cs.owner_trainer_id = pt_sessions.trainer_id AND cs.viewer_trainer_id = ?)`,
  }[mode];
  const now = Date.now();
  await db.prepare(
    `UPDATE pt_sessions SET trainer_id = ?, original_trainer_id = COALESCE(original_trainer_id, trainer_id), updated_at = ?
     WHERE id = ? AND tenant_id = ? AND status = 'scheduled' AND trainer_id = ? AND ${authSql}
       AND ${activeWith(['trainer', 'admin'])}
       AND NOT ${overlaps(true)}`,
  ).bind(target, now, s.id, tenantId, s.trainer_id, uid, tenantId, target, ...overlapArgs(tenantId, target, s.starts_at, s.duration_minutes, s.id)).run();
  const after = await db.prepare(`SELECT trainer_id, updated_at FROM pt_sessions WHERE id = ?`).bind(s.id).first<{ trainer_id: string; updated_at: number }>();
  return after?.trainer_id === target && after.updated_at === now ? c.json({ trainerId: target }) : fail(c, 409, 'conflict');
});
