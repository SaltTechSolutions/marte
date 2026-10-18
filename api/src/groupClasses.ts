import { Hono } from 'hono';

import { rolesIn } from './auth';
import type { Env, Vars } from './types';

/**
 * Group classes beyond the unlimited entitlement (F3). Ports `bookGroupClass`, `cancelGroupClassBooking`,
 * `refundOnClassCancelled`, `promoteFromClassWaitlist`, `notifyOnClassCancelled` and the class half of
 * `sendClassReminders`, plus the class register (attendance).
 *
 * Every invariant is enforced INSIDE the write statement (capacity, "class has not started", live membership,
 * entitlement, one booking per member), and every logical change is one `db.batch()`: credit decrement + seat
 * + waitlist removal + outbox row commit or roll back together. A conditional statement that matches nothing
 * is not an error, so each dependent statement is guarded by `changes()` of its immediate predecessor (or by
 * re-stating the condition) and the caller re-reads to decide between 2xx and 409.
 */
type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const groupClasses = new Hono<App>();

const HOUR = 3_600_000;
const DEFAULT_CANCELLATION_HOURS = 24;
const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');
const rolesOf = (c: Ctx) => rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
const readBody = async (c: Ctx) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
const bad = (c: Ctx, m: string) => c.json({ error: m }, 400);
const forbidden = (c: Ctx) => c.json({ error: 'forbidden' }, 403);
const istanbul = (ms: number, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', ...o }).format(ms);

type ClassRow = { id: string; tenantId: string; data: Record<string, unknown>; startsAt: number };

async function loadClass(c: Ctx): Promise<ClassRow | null> {
  const tenantId = c.req.param('tenantId') ?? '';
  const row = await c.env.DB.prepare(`SELECT id, data, starts_at FROM classes WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), tenantId).first<{ id: string; data: string; starts_at: number }>();
  return row ? { id: row.id, tenantId, data: JSON.parse(row.data), startsAt: row.starts_at } : null;
}
/** Admin always; a trainer only for a class whose trainerId is theirs (legacy classes without one stay admin-only). */
export const mayEditClass = (r: string[], uid: string | null, data: Record<string, unknown>) =>
  r.includes('admin') || (r.includes('trainer') && !!uid && data.trainerId === uid);

const approvedGuardian = async (db: D1Database, tenantId: string, child: string, parent: string) =>
  !!(await db.prepare(
    `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'approved'`,
  ).bind(tenantId, child, parent).first());

/**
 * Whom the caller acts for: themself, or (MEMBER-5c) an approved guardian for their child. With `staffClass`,
 * the admin / owning trainer of that class may also act for any member (cancellation only).
 */
async function actFor(c: Ctx, requested: unknown, staffClass?: ClassRow | null): Promise<{ who: string; staff: boolean } | Response> {
  const uid = c.get('userId');
  const r = await rolesOf(c);
  if (!uid || !r.length) return forbidden(c);
  if (requested !== undefined && requested !== null && typeof requested !== 'string') return bad(c, 'memberId');
  const who = requested || uid;
  if (who === uid) return { who, staff: false };
  if (staffClass && mayEditClass(r, uid, staffClass.data)) return { who, staff: true };
  return (await approvedGuardian(c.env.DB, c.req.param('tenantId') ?? '', who, uid)) ? { who, staff: false } : forbidden(c);
}

// ---- seat eligibility & guards (SQL fragments; ?1 tenant, ?2 class, ?3 member, ?4 now, ?5 credit id) ----
const CLASS_START = `(SELECT starts_at FROM classes WHERE id = ?2)`;
const UNLIMITED = `EXISTS (SELECT 1 FROM member_packages WHERE tenant_id = ?1 AND member_id = ?3 AND status = 'active' AND ends_at > ?4
                            AND json_extract(data, '$.entitlements.groupClasses.unlimited') = 1)`;
/**
 * A credit that can pay for THIS class (PER-9): the member's own, groupClass, unspent, unexpired, valid until the
 * class takes place (a credit good for three more days must not buy a place three months out), and backed by a
 * package that is still active (a frozen package closes group-class booking, as the entitlement cache did).
 * Unqualified columns: use it as the WHERE of a statement over `member_credits`.
 */
const CREDIT_OK = `tenant_id = ?1 AND member_id = ?3 AND kind = 'groupClass' AND status = 'active' AND used < total
  AND expires_at > ?4 AND expires_at >= ${CLASS_START}
  AND EXISTS (SELECT 1 FROM member_packages p WHERE p.id = member_credits.source_package_id AND p.status = 'active' AND p.ends_at > ?4)`;
const HAS_CREDIT = `EXISTS (SELECT 1 FROM member_credits WHERE ${CREDIT_OK})`;
const NOT_STARTED = `EXISTS (SELECT 1 FROM classes WHERE id = ?2 AND tenant_id = ?1 AND starts_at > ?4)`;
const HAS_FREE_SEAT = `EXISTS (SELECT 1 FROM classes k WHERE k.id = ?2 AND k.tenant_id = ?1
  AND (SELECT count(*) FROM class_bookings b WHERE b.class_id = k.id) < json_extract(k.data, '$.capacity'))`;
const ACTIVE_MEMBER = `EXISTS (SELECT 1 FROM memberships WHERE tenant_id = ?1 AND member_id = ?3 AND status = 'active')`;
const NOT_BOOKED = `NOT EXISTS (SELECT 1 FROM class_bookings WHERE class_id = ?2 AND member_id = ?3)`;
const ON_WAITLIST = `EXISTS (SELECT 1 FROM class_waitlist WHERE class_id = ?2 AND member_id = ?3)`;
/** Everything that must hold to hand `?3` a place; `fromWaitlist` is the promotion variant. */
const seatGuard = (fromWaitlist: boolean) =>
  `${NOT_STARTED} AND ${HAS_FREE_SEAT} AND ${ACTIVE_MEMBER} AND ${NOT_BOOKED} AND ${fromWaitlist ? '' : 'NOT '}${ON_WAITLIST}`;

type Plan = { creditId: string | null };

/** How `who` would pay for a place: unlimited package (no credit), else earliest-expiring valid credit, else null. */
async function planSeat(db: D1Database, cls: ClassRow, who: string, now: number): Promise<Plan | null> {
  const args = [cls.tenantId, cls.id, who, now];
  if (await db.prepare(`SELECT 1 AS x WHERE ${UNLIMITED}`).bind(...args).first()) return { creditId: null };
  const credit = await db.prepare(`SELECT id FROM member_credits WHERE ${CREDIT_OK} ORDER BY expires_at, id LIMIT 1`)
    .bind(...args).first<{ id: string }>();
  return credit ? { creditId: credit.id } : null;
}

/** The statements that give `who` a place. Credit decrement and the seat are guarded by the same conditions. */
function seatStatements(db: D1Database, cls: ClassRow, who: string, now: number, plan: Plan, fromWaitlist: boolean): D1PreparedStatement[] {
  const base = [cls.tenantId, cls.id, who, now];
  if (plan.creditId === null) {
    return [db.prepare(
      `INSERT INTO class_bookings (tenant_id, class_id, member_id, credit_id, created_at)
       SELECT ?1, ?2, ?3, NULL, ?4 WHERE ${seatGuard(fromWaitlist)} AND ${UNLIMITED}`,
    ).bind(...base)];
  }
  return [
    db.prepare(
      `UPDATE member_credits SET used = used + 1, status = CASE WHEN used + 1 >= total THEN 'exhausted' ELSE status END
       WHERE id = ?5 AND ${CREDIT_OK} AND ${seatGuard(fromWaitlist)}`,
    ).bind(...base, plan.creditId),
    // changes() is the credit UPDATE: no spent credit, no seat.
    db.prepare(
      `INSERT INTO class_bookings (tenant_id, class_id, member_id, credit_id, created_at) SELECT ?1, ?2, ?3, ?5, ?4 WHERE changes() = 1`,
    ).bind(...base, plan.creditId),
  ];
}

/**
 * Outbox row whose existence depends on `whereSql` (so it can sit in the same batch as a conditional change).
 * Same columns as `outboxStatement`; that helper cannot carry a condition or a SQL-built payload.
 */
function outboxWhen(db: D1Database, o: { payloadSql: string; payloadBinds: unknown[]; dedupeKey: string | null; whereSql: string; whereBinds: unknown[] }, now: number) {
  const id = 'ob' + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
  return db.prepare(
    `INSERT OR IGNORE INTO outbox (id, kind, payload, dedupe_key, next_attempt_at, created_at)
     SELECT ?, 'push', ${o.payloadSql}, ?, ?, ? WHERE ${o.whereSql}`,
  ).bind(id, ...o.payloadBinds, o.dedupeKey, now, now, ...o.whereBinds);
}
/** json_object(...) payload with a userIds array computed from `userIdsSql` at execution time. */
const pushPayloadSql = (userIdsSql: string) =>
  `json_object('userIds', json((${userIdsSql})), 'title', ?, 'body', ?, 'category', 'bookings', 'data', json_object('screen', 'member/classes'))`;

const isBooked = async (db: D1Database, classId: string, who: string) =>
  !!(await db.prepare(`SELECT 1 AS x FROM class_bookings WHERE class_id = ? AND member_id = ?`).bind(classId, who).first());
const isWaitlisted = async (db: D1Database, classId: string, who: string) =>
  !!(await db.prepare(`SELECT 1 AS x FROM class_waitlist WHERE class_id = ? AND member_id = ?`).bind(classId, who).first());
const isActiveMember = async (db: D1Database, tenantId: string, who: string) =>
  !!(await db.prepare(`SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active'`).bind(tenantId, who).first());
async function isFull(db: D1Database, cls: ClassRow): Promise<boolean> {
  const n = await db.prepare(`SELECT count(*) AS n FROM class_bookings WHERE class_id = ?`).bind(cls.id).first<{ n: number }>();
  return (n?.n ?? 0) >= Number(cls.data.capacity);
}

// ---- booking ----
/** POST /tenants/:tenantId/classes/:id/book — unlimited entitlement or one groupClass credit; a full class is a 409 (join the waitlist). */
export async function bookClass(c: Ctx): Promise<Response> {
  const b = await readBody(c);
  const a = await actFor(c, b.memberId);
  if (a instanceof Response) return a;
  const cls = await loadClass(c);
  if (!cls) return c.json({ error: 'not found' }, 404);
  const db = c.env.DB;

  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    if (await isBooked(db, cls.id, a.who)) return c.json({ ok: true, status: 'already-booked' }, 201);
    if (cls.startsAt <= now) return c.json({ error: 'class already started' }, 409);
    if (await isWaitlisted(db, cls.id, a.who)) return c.json({ error: 'already on the waitlist', status: 'already-waitlisted' }, 409);
    if (!(await isActiveMember(db, cls.tenantId, a.who))) return c.json({ error: 'no active membership' }, 409);
    if (await isFull(db, cls)) return c.json({ error: 'class full', full: true }, 409);
    const plan = await planSeat(db, cls, a.who, now);
    if (!plan) return c.json({ error: 'not eligible' }, 409);
    await db.batch(seatStatements(db, cls, a.who, now, plan, false));
    // A racing booking may have taken the last place or the credit: re-read and, if only the credit moved, try the next one.
    if (await isBooked(db, cls.id, a.who)) return c.json({ ok: true, status: 'booked', ...(plan.creditId ? { creditId: plan.creditId } : {}) }, 201);
  }
  return c.json({ error: 'not eligible or class full' }, 409);
}

// ---- waitlist ----
/** POST …/classes/:id/waitlist — only a FULL class, only someone who could take the place; spends nothing. */
groupClasses.post('/tenants/:tenantId/classes/:id/waitlist', async (c) => {
  const b = await readBody(c);
  const a = await actFor(c, b.memberId);
  if (a instanceof Response) return a;
  const cls = await loadClass(c);
  if (!cls) return c.json({ error: 'not found' }, 404);
  const db = c.env.DB;
  const now = Date.now();
  if (await isBooked(db, cls.id, a.who)) return c.json({ error: 'already booked', status: 'already-booked' }, 409);
  if (await isWaitlisted(db, cls.id, a.who)) return c.json({ ok: true, status: 'already-waitlisted' });
  if (cls.startsAt <= now) return c.json({ error: 'class already started' }, 409);
  if (!(await isActiveMember(db, cls.tenantId, a.who))) return c.json({ error: 'no active membership' }, 409);
  if (!(await isFull(db, cls))) return c.json({ error: 'class has free places; book instead' }, 409);
  if (!(await planSeat(db, cls, a.who, now))) return c.json({ error: 'not eligible' }, 409);
  // Full-ness, eligibility and "not booked" are re-checked in the insert: a place that frees up meanwhile is never missed,
  // because the cancel that frees it runs the promotion after this row exists or this insert is refused.
  await db.prepare(
    `INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at)
     SELECT ?1, ?2, ?3, ?4
     WHERE ${NOT_STARTED} AND NOT (${HAS_FREE_SEAT}) AND ${ACTIVE_MEMBER} AND ${NOT_BOOKED} AND (${UNLIMITED} OR ${HAS_CREDIT})
     ON CONFLICT DO NOTHING`,
  ).bind(cls.tenantId, cls.id, a.who, now).run();
  return (await isWaitlisted(db, cls.id, a.who)) ? c.json({ ok: true, status: 'waitlisted' }, 201) : c.json({ error: 'class has free places or not eligible' }, 409);
});

groupClasses.delete('/tenants/:tenantId/classes/:id/waitlist', async (c) => {
  const a = await actFor(c, (await readBody(c)).memberId);
  if (a instanceof Response) return a;
  await c.env.DB.prepare(`DELETE FROM class_waitlist WHERE class_id = ? AND member_id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), a.who, c.req.param('tenantId')).run();
  return c.json({ ok: true });
});

/**
 * Hands freed places to the waitlist, first come first served (promoteFromClassWaitlist). Unlike the Firebase trigger
 * the promoted member PAYS: unlimited entitlement or one credit, decided and spent in the same batch as the seat.
 * Someone who can no longer pay is skipped and stays on the list. Safe to call any time; returns how many were promoted.
 */
export async function promoteWaitlist(db: D1Database, tenantId: string, classId: string, now = Date.now()): Promise<number> {
  let promoted = 0;
  for (let round = 0; round < 50; round++) {
    const row = await db.prepare(`SELECT id, data, starts_at FROM classes WHERE id = ? AND tenant_id = ?`).bind(classId, tenantId)
      .first<{ id: string; data: string; starts_at: number }>();
    if (!row || row.starts_at <= now) break;
    const cls: ClassRow = { id: row.id, tenantId, data: JSON.parse(row.data), startsAt: row.starts_at };
    if (await isFull(db, cls)) break;
    const { results } = await db.prepare(`SELECT member_id FROM class_waitlist WHERE class_id = ? ORDER BY created_at, rowid LIMIT 50`)
      .bind(classId).all<{ member_id: string }>();
    let gave = false;
    for (const { member_id: who } of results) {
      const plan = await planSeat(db, cls, who, now);
      if (!plan) continue;
      const when = istanbul(cls.startsAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      await db.batch([
        ...seatStatements(db, cls, who, now, plan, true),
        db.prepare(`DELETE FROM class_waitlist WHERE class_id = ?1 AND member_id = ?2 AND EXISTS (SELECT 1 FROM class_bookings WHERE class_id = ?1 AND member_id = ?2)`)
          .bind(classId, who),
        outboxWhen(db, {
          payloadSql: `json_object('userIds', json(?), 'title', ?, 'body', ?, 'category', 'bookings', 'data', json_object('screen', 'member/classes'))`,
          payloadBinds: [JSON.stringify([who]), 'Yerin açıldı 🎉', `"${cls.data.name ?? 'Ders'}" dersinde bekleme listesinden çıktın, yerin hazır. (${when})`],
          dedupeKey: `class-promoted:${classId}:${who}:${now}`,
          whereSql: `EXISTS (SELECT 1 FROM class_bookings WHERE class_id = ? AND member_id = ? AND created_at = ?)`,
          whereBinds: [classId, who, now],
        }, now),
      ]);
      if (await isBooked(db, classId, who)) { promoted++; gave = true; break; }
    }
    if (!gave) break;
  }
  return promoted;
}

/** Staff can re-run the promotion (e.g. after raising a class's capacity, which frees places without any cancellation). */
groupClasses.post('/tenants/:tenantId/classes/:id/waitlist/promote', async (c) => {
  const cls = await loadClass(c);
  if (!cls) return c.json({ error: 'not found' }, 404);
  if (!mayEditClass(await rolesOf(c), c.get('userId'), cls.data)) return forbidden(c);
  return c.json({ promoted: await promoteWaitlist(c.env.DB, cls.tenantId, cls.id) });
});

// ---- cancelling a booking ----
async function cancellationHours(db: D1Database, tenantId: string): Promise<number> {
  const t = await db.prepare(`SELECT settings FROM tenants WHERE id = ?`).bind(tenantId).first<{ settings: string }>();
  const h = t ? (JSON.parse(t.settings) as { cancellationHours?: unknown }).cancellationHours : undefined;
  return typeof h === 'number' && h >= 0 ? h : DEFAULT_CANCELLATION_HOURS;
}
const creditUsed = async (db: D1Database, id: string) =>
  (await db.prepare(`SELECT used FROM member_credits WHERE id = ?`).bind(id).first<{ used: number }>())?.used ?? null;

/**
 * DELETE /tenants/:tenantId/classes/:id/book — cancel own booking (or a child's, or — admin / owning trainer — anyone's).
 * The credit comes back when cancelled at least `cancellationHours` ahead; staff cancelling for someone else always
 * refunds (the member did not cause it). Cancelling off the waitlist costs and refunds nothing. A freed place goes to
 * the waitlist.
 */
export async function cancelBooking(c: Ctx): Promise<Response> {
  const b = await readBody(c);
  const cls = await loadClass(c);
  const a = await actFor(c, b.memberId, cls);
  if (a instanceof Response) return a;
  if (!cls) return c.json({ ok: true, wasBooked: false, refunded: false });   // a deleted class has nothing left to cancel
  const db = c.env.DB;
  const now = Date.now();

  const booking = await db.prepare(`SELECT credit_id FROM class_bookings WHERE class_id = ? AND member_id = ? AND tenant_id = ?`)
    .bind(cls.id, a.who, cls.tenantId).first<{ credit_id: string | null }>();
  if (!booking) {
    await db.prepare(`DELETE FROM class_waitlist WHERE class_id = ? AND member_id = ? AND tenant_id = ?`).bind(cls.id, a.who, cls.tenantId).run();
    return c.json({ ok: true, wasBooked: false, refunded: false });
  }

  const creditId = booking.credit_id;
  const inTime = (cls.startsAt - now) / HOUR >= (await cancellationHours(db, cls.tenantId));
  const refund = creditId !== null && (a.staff || inTime);
  const usedBefore = creditId ? await creditUsed(db, creditId) : null;

  const stmts = [
    // The booking row is the idempotency key: only the request that removes it may put the credit back.
    db.prepare(`DELETE FROM class_bookings WHERE class_id = ? AND member_id = ? AND tenant_id = ? AND credit_id IS ?`)
      .bind(cls.id, a.who, cls.tenantId, creditId),
  ];
  if (refund) {
    stmts.push(db.prepare(
      `UPDATE member_credits SET used = used - 1, status = CASE WHEN status = 'exhausted' AND expires_at > ?4 THEN 'active' ELSE status END
       WHERE id = ?1 AND tenant_id = ?2 AND member_id = ?3 AND kind = 'groupClass' AND used > 0 AND changes() = 1`,
    ).bind(creditId, cls.tenantId, a.who, now));
  }
  await db.batch(stmts);
  const promoted = await promoteWaitlist(db, cls.tenantId, cls.id, now);

  const usedAfter = creditId ? await creditUsed(db, creditId) : null;
  // `refunded` is informational (read before/after); the batch above is what guarantees at most one refund.
  return c.json({ ok: true, wasBooked: true, refunded: usedBefore !== null && usedAfter !== null && usedAfter < usedBefore, promoted });
}

// ---- deleting a class: refund every credit-paid booking, notify, remove — one batch ----
/**
 * DELETE /tenants/:tenantId/classes/:id (admin / owning trainer). A class that has not started refunds every credit-backed
 * booking (outcomes refunded / nothing-to-refund / credit-missing / credit-mismatch land in class_cancellation_refunds, unique per
 * class+member so a retry cannot refund twice), tells everyone booked or waitlisted, and cascades the bookings away.
 * A class that already took place refunds and notifies nobody. Set-based: a booking made between our read and the batch is covered too.
 */
export async function deleteClass(c: Ctx): Promise<Response> {
  const cls = await loadClass(c);
  if (!cls) return c.json({ ok: true });
  if (!mayEditClass(await rolesOf(c), c.get('userId'), cls.data)) return forbidden(c);
  const db = c.env.DB;
  const now = Date.now();
  const name = typeof cls.data.name === 'string' ? cls.data.name : null;
  const when = istanbul(cls.startsAt, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO class_cancellation_refunds (id, tenant_id, class_id, class_name, class_date, member_id, credit_id, outcome, created_at)
       SELECT 'cx' || lower(hex(randomblob(10))), ?1, ?2, ?3, ?4, b.member_id, b.credit_id,
              CASE WHEN cr.id IS NULL THEN 'credit-missing'
                   WHEN cr.tenant_id <> ?1 OR cr.member_id <> b.member_id OR cr.kind <> 'groupClass' THEN 'credit-mismatch'
                   WHEN cr.used <= 0 THEN 'nothing-to-refund'
                   ELSE 'refunded' END,
              ?5
       FROM class_bookings b LEFT JOIN member_credits cr ON cr.id = b.credit_id
       WHERE b.class_id = ?2 AND b.tenant_id = ?1 AND b.credit_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM classes WHERE id = ?2 AND tenant_id = ?1 AND starts_at > ?5)
       ON CONFLICT DO NOTHING`,
    ).bind(cls.tenantId, cls.id, name, cls.startsAt, now),
    // Only credits whose marker this very batch wrote, and whose booking is still there to be undone.
    db.prepare(
      `UPDATE member_credits SET used = used - 1, status = CASE WHEN status = 'exhausted' AND expires_at > ?3 THEN 'active' ELSE status END
       WHERE used > 0 AND id IN (
         SELECT r.credit_id FROM class_cancellation_refunds r
         JOIN class_bookings b ON b.class_id = r.class_id AND b.member_id = r.member_id AND b.credit_id = r.credit_id
         WHERE r.class_id = ?1 AND r.tenant_id = ?2 AND r.outcome = 'refunded' AND r.created_at = ?3)`,
    ).bind(cls.id, cls.tenantId, now),
    outboxWhen(db, {
      payloadSql: pushPayloadSql(`SELECT json_group_array(member_id) FROM (SELECT member_id FROM class_bookings WHERE class_id = ? UNION SELECT member_id FROM class_waitlist WHERE class_id = ?)`),
      payloadBinds: [cls.id, cls.id, 'Ders iptal edildi', `${name ?? 'Ders'} — ${when} iptal edildi.`],
      dedupeKey: `class-cancelled:${cls.id}`,
      whereSql: `EXISTS (SELECT 1 FROM classes WHERE id = ? AND tenant_id = ? AND starts_at > ?)
                 AND (SELECT count(*) FROM class_bookings WHERE class_id = ?) + (SELECT count(*) FROM class_waitlist WHERE class_id = ?) > 0`,
      whereBinds: [cls.id, cls.tenantId, now, cls.id, cls.id],
    }, now),
    db.prepare(`DELETE FROM classes WHERE id = ? AND tenant_id = ?`).bind(cls.id, cls.tenantId),
  ];
  await db.batch(stmts);

  const { results } = await db.prepare(`SELECT outcome, count(*) AS n FROM class_cancellation_refunds WHERE class_id = ? GROUP BY outcome`)
    .bind(cls.id).all<{ outcome: string; n: number }>();
  return c.json({ ok: true, refunds: Object.fromEntries(results.map((r) => [r.outcome, r.n])) });
}

// ---- register (attendance) ----
/** PUT …/classes/:id/attendance {memberId, value: 'present'|'absent'|null} — admin or the owning trainer; only booked members. */
groupClasses.put('/tenants/:tenantId/classes/:id/attendance', async (c) => {
  const cls = await loadClass(c);
  if (!cls) return c.json({ error: 'not found' }, 404);
  const uid = c.get('userId');
  if (!uid || !mayEditClass(await rolesOf(c), uid, cls.data)) return forbidden(c);
  const b = await readBody(c);
  if (typeof b.memberId !== 'string' || !b.memberId || (b.value !== null && b.value !== 'present' && b.value !== 'absent')) return bad(c, 'memberId/value');
  const db = c.env.DB;
  if (b.value === null) {
    await db.prepare(`DELETE FROM class_attendance WHERE class_id = ? AND member_id = ? AND tenant_id = ?`).bind(cls.id, b.memberId, cls.tenantId).run();
    return c.json({ ok: true });
  }
  await db.prepare(
    `INSERT INTO class_attendance (tenant_id, class_id, member_id, mark, marked_by, marked_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM class_bookings WHERE class_id = ?2 AND member_id = ?3 AND tenant_id = ?1)
     ON CONFLICT (class_id, member_id) DO UPDATE SET mark = excluded.mark, marked_by = excluded.marked_by, marked_at = excluded.marked_at`,
  ).bind(cls.tenantId, cls.id, b.memberId, b.value, uid, Date.now()).run();
  const row = await db.prepare(`SELECT mark FROM class_attendance WHERE class_id = ? AND member_id = ?`).bind(cls.id, b.memberId).first<{ mark: string }>();
  return row?.mark === b.value ? c.json({ ok: true }) : c.json({ error: 'member is not booked into this class' }, 409);
});

// ---- reads the class list DTO cannot carry (identities stay out of it) ----
/** Staff: who is booked (and how they paid), who waits, and the register. */
groupClasses.get('/tenants/:tenantId/classes/:id/roster', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  const cls = await loadClass(c);
  if (!cls) return c.json({ error: 'not found' }, 404);
  const db = c.env.DB;
  const booked = await db.prepare(
    `SELECT b.member_id, COALESCE(m.display_name, u.display_name) AS display_name, b.credit_id IS NOT NULL AS credit, b.created_at, a.mark
     FROM class_bookings b
     LEFT JOIN memberships m ON m.tenant_id = b.tenant_id AND m.member_id = b.member_id
     LEFT JOIN users u ON u.id = b.member_id
     LEFT JOIN class_attendance a ON a.class_id = b.class_id AND a.member_id = b.member_id
     WHERE b.class_id = ? AND b.tenant_id = ? ORDER BY b.created_at, b.rowid`,
  ).bind(cls.id, cls.tenantId).all<any>();
  const waiting = await db.prepare(
    `SELECT w.member_id, COALESCE(m.display_name, u.display_name) AS display_name, w.created_at FROM class_waitlist w
     LEFT JOIN memberships m ON m.tenant_id = w.tenant_id AND m.member_id = w.member_id
     LEFT JOIN users u ON u.id = w.member_id
     WHERE w.class_id = ? AND w.tenant_id = ? ORDER BY w.created_at, w.rowid`,
  ).bind(cls.id, cls.tenantId).all<any>();
  return c.json({
    capacity: cls.data.capacity,
    booked: booked.results.map((r: any) => ({ memberId: r.member_id, name: r.display_name, paidWithCredit: !!r.credit, bookedAt: r.created_at, attendance: r.mark ?? null })),
    waitlist: waiting.results.map((r: any) => ({ memberId: r.member_id, name: r.display_name, joinedAt: r.created_at })),
  });
});

/** Any member: seat counts per upcoming class (no identities). */
groupClasses.get('/tenants/:tenantId/class-occupancy', async (c) => {
  if (!(await rolesOf(c)).length) return forbidden(c);
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, (SELECT count(*) FROM class_bookings WHERE class_id = k.id) AS booked,
            (SELECT count(*) FROM class_waitlist WHERE class_id = k.id) AS waitlisted
     FROM classes k WHERE k.tenant_id = ? AND k.starts_at >= ? ORDER BY k.starts_at LIMIT 200`,
  ).bind(c.req.param('tenantId'), Number(c.req.query('from') ?? Date.now() - 86_400_000)).all<any>();
  return c.json(results.map((r: any) => ({ classId: r.id, booked: r.booked, waitlisted: r.waitlisted })));
});

/** A member's own bookings and waitlist places (?memberId= for an approved guardian; staff may ask for anyone). */
groupClasses.get('/tenants/:tenantId/class-bookings', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  const r = await rolesOf(c);
  if (!uid || !r.length) return forbidden(c);
  const who = c.req.query('memberId') || uid;
  if (who !== uid && !isStaff(r) && !(await approvedGuardian(c.env.DB, tenantId, who, uid))) return forbidden(c);
  const from = Number(c.req.query('from') ?? Date.now() - 86_400_000);
  const { results } = await c.env.DB.prepare(
    `SELECT k.id AS class_id, k.starts_at, 'booked' AS status, b.created_at AS since, b.credit_id IS NOT NULL AS credit
       FROM class_bookings b JOIN classes k ON k.id = b.class_id WHERE b.tenant_id = ?1 AND b.member_id = ?2 AND k.starts_at >= ?3
     UNION ALL
     SELECT k.id, k.starts_at, 'waitlisted', w.created_at, 0
       FROM class_waitlist w JOIN classes k ON k.id = w.class_id WHERE w.tenant_id = ?1 AND w.member_id = ?2 AND k.starts_at >= ?3
     ORDER BY starts_at LIMIT 200`,
  ).bind(tenantId, who, from).all<any>();
  return c.json(results.map((x: any) => ({ classId: x.class_id, startsAt: x.starts_at, status: x.status, since: x.since, paidWithCredit: !!x.credit })));
});

// ---- reminders (class half of sendClassReminders; the lead wires it to a cron) ----
const REMINDER_LEAD_MINUTES = 60;
const REMINDER_WINDOW_MINUTES = 20;
/**
 * "Your class starts in an hour": sweeps the classes starting in the next window and queues one push each to the booked
 * members (the waitlist is told when a place opens, not reminded). Idempotent: `reminderSentAt` is set in the same batch
 * as the outbox row, and the row has a dedupe key. Returns the number of classes reminded.
 */
export async function runClassReminders(db: D1Database, now = Date.now()): Promise<number> {
  const from = now + REMINDER_LEAD_MINUTES * 60_000;
  const to = now + (REMINDER_LEAD_MINUTES + REMINDER_WINDOW_MINUTES) * 60_000;
  const { results } = await db.prepare(
    `SELECT id, data, starts_at FROM classes WHERE starts_at >= ? AND starts_at < ? AND json_extract(data, '$.reminderSentAt') IS NULL LIMIT 200`,
  ).bind(from, to).all<{ id: string; data: string; starts_at: number }>();
  let sent = 0;
  for (const k of results) {
    const name = (JSON.parse(k.data) as { name?: string }).name ?? 'Ders';
    await db.batch([
      db.prepare(`UPDATE classes SET data = json_set(data, '$.reminderSentAt', ?) WHERE id = ? AND json_extract(data, '$.reminderSentAt') IS NULL`).bind(now, k.id),
      outboxWhen(db, {
        payloadSql: pushPayloadSql(`SELECT json_group_array(member_id) FROM class_bookings WHERE class_id = ?`),
        payloadBinds: [k.id, 'Dersin yaklaşıyor', `${name} bugün ${istanbul(k.starts_at, { hour: '2-digit', minute: '2-digit' })}'de başlıyor.`],
        dedupeKey: `class-reminder:${k.id}`,
        whereSql: `changes() = 1 AND EXISTS (SELECT 1 FROM class_bookings WHERE class_id = ?)`,
        whereBinds: [k.id],
      }, now),
    ]);
    sent++;
  }
  return sent;
}
