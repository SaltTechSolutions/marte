import { Hono } from 'hono';

import { rolesIn } from './auth';
import { findMember } from './checkins';
import { formatTl } from './format';
import { bookClass, cancelBooking, deleteClass } from './groupClasses';
import { activeAdminIds, nameOf, outboxIfChanged, outboxWhere } from './guarded';
import { outboxStatement } from './outbox';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const writes2 = new Hono<App>();

const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');
const rolesOf = (c: Ctx) => rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
const body = async (c: Ctx) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
const bad = (c: Ctx, m: string) => c.json({ error: m }, 400);
const forbidden = (c: Ctx) => c.json({ error: 'forbidden' }, 403);
const newId = (p: string) => p + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
const isMember = async (c: Ctx, tenantId: string, memberId: string) =>
  !!(await c.env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, memberId).first());

/** Mirrors firestore.rules `canCheckIn`: admin, or an active member holding the delegated 'checkin' permission. */
async function canCheckIn(c: Ctx): Promise<boolean> {
  const uid = c.get('userId');
  if (!uid) return false;
  const row = await c.env.DB.prepare(`SELECT roles, permissions FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active'`)
    .bind(c.req.param('tenantId'), uid).first<any>();
  return !!row && (JSON.parse(row.roles).includes('admin') || JSON.parse(row.permissions).includes('checkin'));
}

/**
 * Records a visit. The member is named by `memberId` (internal id) or `subject` (the Firebase uid the card QR holds,
 * resolved inside THIS gym only). Who may: admin or an active holder of the delegated 'checkin' permission.
 */
writes2.post('/tenants/:tenantId/checkins', async (c) => {
  if (!(await canCheckIn(c))) return forbidden(c);
  const b = await body(c);
  const reasons = ['ok', 'guardian', 'no-package', 'no-session-today', 'frozen'];
  if (!reasons.includes(b.accessReason as string)) return bad(c, 'bad check-in');
  const tenantId = c.req.param('tenantId')!;
  const m = await findMember(c.env.DB, tenantId, { memberId: b.memberId, subject: b.subject });
  if (m === undefined) return bad(c, 'bad check-in');
  if (m === null) return c.json({ error: 'not found' }, 404);
  const id = newId('ci');
  await c.env.DB.prepare(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, tenantId, m.member_id, JSON.stringify({ accessReason: b.accessReason, by: c.get('userId') }), Date.now()).run();
  return c.json({ id }, 201);
});

// ---- classes ----
export const classData = (b: Record<string, unknown>): { startsAt: number; data: Record<string, unknown> } | null => {
  const { startsAt, ...rest } = b;
  const cap = rest.capacity;
  if (typeof startsAt !== 'number' || typeof cap !== 'number' || !Number.isInteger(cap) || cap < 1 || cap > 500) return null;
  if (typeof rest.name !== 'string' || !rest.name.trim() || rest.name.length > 100) return null;
  delete rest.id; delete rest.tenantId; delete rest.bookedUserIds;
  return { startsAt, data: rest };
};

writes2.post('/tenants/:tenantId/classes', async (c) => {
  const r = await rolesOf(c);
  const b = await body(c);
  const uid = c.get('userId');
  // A trainer creates only their own classes; an admin may assign any trainerId.
  if (!r.includes('admin') && !(r.includes('trainer') && b.trainerId === uid)) return forbidden(c);
  const parsed = classData(b);
  if (!parsed) return bad(c, 'bad class');
  const id = newId('k');
  await c.env.DB.prepare(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES (?, ?, ?, ?)`)
    .bind(id, c.req.param('tenantId'), JSON.stringify(parsed.data), parsed.startsAt).run();
  return c.json({ id }, 201);
});

async function loadClass(c: Ctx) {
  const row = await c.env.DB.prepare(`SELECT id, data FROM classes WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), c.req.param('tenantId')).first<{ id: string; data: string }>();
  return row ? { id: row.id, data: JSON.parse(row.data) as Record<string, unknown> } : null;
}
/** Admin always; a trainer only for a class whose trainerId is theirs (legacy classes without one stay admin-only). */
const mayEditClass = (r: string[], uid: string | null, data: Record<string, unknown>) =>
  r.includes('admin') || (r.includes('trainer') && !!uid && data.trainerId === uid);

writes2.put('/tenants/:tenantId/classes/:id', async (c) => {
  const cls = await loadClass(c);
  if (!cls) return c.json({ error: 'not found' }, 404);
  const r = await rolesOf(c);
  if (!mayEditClass(r, c.get('userId'), cls.data)) return forbidden(c);
  const b = await body(c);
  // A trainer cannot hand their class to someone else (the rules pinned trainerId).
  if (!r.includes('admin') && b.trainerId !== cls.data.trainerId) return forbidden(c);
  const parsed = classData(b);
  if (!parsed) return bad(c, 'bad class');
  await c.env.DB.prepare(`UPDATE classes SET data = ?, starts_at = ? WHERE id = ? AND tenant_id = ?`)
    .bind(JSON.stringify(parsed.data), parsed.startsAt, cls.id, c.req.param('tenantId')).run();
  return c.json({ ok: true });
});
// Deleting a class refunds credit-paid bookings, notifies and cascades in one batch (F3, groupClasses.ts).
writes2.delete('/tenants/:tenantId/classes/:id', deleteClass);

// ---- group-class booking: unlimited entitlement or one credit; waitlist routes live in groupClasses.ts ----
writes2.post('/tenants/:tenantId/classes/:id/book', bookClass);
writes2.delete('/tenants/:tenantId/classes/:id/book', cancelBooking);

// ---- programs & templates (staff) ----
writes2.post('/tenants/:tenantId/programs', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  const { memberId, ...data } = await body(c);
  const tenantId = c.req.param('tenantId')!;
  if (typeof memberId !== 'string' || !(await isMember(c, tenantId, memberId))) return bad(c, 'memberId');
  const id = newId('pg');
  await c.env.DB.prepare(`INSERT INTO programs (id, tenant_id, member_id, data, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, tenantId, memberId, JSON.stringify(data), Date.now()).run();
  return c.json({ id }, 201);
});
writes2.put('/tenants/:tenantId/programs/:id', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  const { memberId: _ignored, ...data } = await body(c);   // tenant and member are pinned
  const db = c.env.DB;
  const tenantId = c.req.param('tenantId')!;
  const id = c.req.param('id')!;
  const before = await db.prepare(
    `SELECT p.member_id, p.updated_at, json_extract(p.data, '$.status') AS status, m.managed
       FROM programs p LEFT JOIN memberships m ON m.tenant_id = p.tenant_id AND m.member_id = p.member_id
      WHERE p.id = ? AND p.tenant_id = ?`,
  ).bind(id, tenantId).first<{ member_id: string; updated_at: number; status: string | null; managed: number | null }>();
  const stmts = [db.prepare(`UPDATE programs SET data = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
    .bind(JSON.stringify(data), Date.now(), id, tenantId)];
  // Draft (or archived) to active is "your trainer prepared a program for you" (Firebase notifyOnProgramAssigned).
  // Keyed by the version it replaces: a concurrent double save is one push, a later re-activation is a new one.
  if (before && before.status !== 'active' && data.status === 'active' && !before.managed) {
    stmts.push(outboxStatement(db, 'push', {
      userIds: [before.member_id], category: 'programs', title: 'Yeni programın hazır 💪',
      body: `Antrenörün senin için "${String(data.name ?? '')}" programını hazırladı.`, data: { screen: 'member/workout' },
    }, `program-active:${id}:${before.updated_at}`));
  }
  await db.batch(stmts);
  return c.json({ ok: true });
});
writes2.delete('/tenants/:tenantId/programs/:id', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  await c.env.DB.prepare(`DELETE FROM programs WHERE id = ? AND tenant_id = ?`).bind(c.req.param('id'), c.req.param('tenantId')).run();
  return c.json({ ok: true });
});
writes2.post('/tenants/:tenantId/program-templates', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  const id = newId('pt');
  await c.env.DB.prepare(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)`)
    .bind(id, c.req.param('tenantId'), JSON.stringify(await body(c)), Date.now()).run();
  return c.json({ id }, 201);
});
writes2.put('/tenants/:tenantId/program-templates/:id', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  await c.env.DB.prepare(`UPDATE program_templates SET data = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`)
    .bind(JSON.stringify(await body(c)), Date.now(), c.req.param('id'), c.req.param('tenantId')).run();
  return c.json({ ok: true });
});
writes2.delete('/tenants/:tenantId/program-templates/:id', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  await c.env.DB.prepare(`DELETE FROM program_templates WHERE id = ? AND tenant_id = ?`).bind(c.req.param('id'), c.req.param('tenantId')).run();
  return c.json({ ok: true });
});

// ---- member-owned logs ----
writes2.post('/tenants/:tenantId/workout-logs', async (c) => {
  const uid = c.get('userId');
  if (!uid || !(await rolesOf(c)).length) return forbidden(c);
  const { programId, ...data } = await body(c);
  if (typeof programId !== 'string') return bad(c, 'programId');
  const id = newId('wl');
  await c.env.DB.prepare(`INSERT INTO workout_logs (id, tenant_id, member_id, data, logged_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, c.req.param('tenantId'), uid, JSON.stringify({ programId, ...data }), Date.now()).run();
  return c.json({ id }, 201);
});
writes2.put('/tenants/:tenantId/workout-logs/:id', async (c) => {
  const uid = c.get('userId');
  const b = await body(c);
  const row = await c.env.DB.prepare(`SELECT data FROM workout_logs WHERE id = ? AND tenant_id = ? AND member_id = ?`)
    .bind(c.req.param('id'), c.req.param('tenantId'), uid ?? '').first<{ data: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);
  // Only exerciseLogs and completedAt may change (rules pinned everything else).
  const next = { ...JSON.parse(row.data), ...(b.exerciseLogs !== undefined ? { exerciseLogs: b.exerciseLogs } : {}), ...(b.completedAt !== undefined ? { completedAt: b.completedAt } : {}) };
  await c.env.DB.prepare(`UPDATE workout_logs SET data = ? WHERE id = ? AND tenant_id = ? AND member_id = ?`)
    .bind(JSON.stringify(next), c.req.param('id'), c.req.param('tenantId'), uid).run();
  return c.json({ ok: true });
});
writes2.post('/tenants/:tenantId/measurements', async (c) => {
  const uid = c.get('userId');
  if (!uid || !(await rolesOf(c)).length) return forbidden(c);
  const b = await body(c);
  if (typeof b.weightKg !== 'number' || !(b.weightKg > 0 && b.weightKg < 500)) return bad(c, 'weightKg');
  const id = newId('ms');
  await c.env.DB.prepare(`INSERT INTO measurements (id, tenant_id, member_id, data, measured_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, c.req.param('tenantId'), uid, JSON.stringify(b), Date.now()).run();
  return c.json({ id }, 201);
});

// ---- payments ledger (balances/credits are F3) ----
const METHODS = ['cash', 'bank_transfer', 'card'];
writes2.post('/tenants/:tenantId/payments', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  const r = await rolesOf(c);
  const b = await body(c);
  const memberId = b.memberId;
  if (typeof memberId !== 'string' || !uid) return bad(c, 'memberId');
  if (typeof b.amount !== 'number' || !Number.isInteger(b.amount) || b.amount <= 0 || b.amount > 100_000_000 || !METHODS.includes(b.method as string)) return bad(c, 'amount/method');
  const isAdmin = r.includes('admin');
  const reversal = b.kind === 'reversal';
  let status: 'pending' | 'confirmed';
  if (isAdmin) status = 'confirmed';
  else if (reversal) return forbidden(c);
  else if (memberId === uid && r.length) status = 'pending';
  else {
    const g = await c.env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'approved'`)
      .bind(tenantId, memberId, uid).first();
    if (!g) return forbidden(c);
    status = 'pending';
  }
  if (!(await isMember(c, tenantId, memberId))) return c.json({ error: 'not found' }, 404);
  const id = newId('pay');
  const data: Record<string, unknown> = { method: b.method, kind: reversal ? 'reversal' : 'charge', submittedBy: uid };
  if (typeof b.note === 'string') data.note = b.note.slice(0, 300);
  const now = Date.now();
  const ins = c.env.DB.prepare(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  if (!reversal) {
    const stmts = [ins.bind(id, tenantId, memberId, b.amount, status, JSON.stringify(data), now)];
    // A notice waiting in the approval queue tells the admins (Firebase notifyAdminsOnPaymentNotice); the one who filed it already knows.
    // An admin recording a payment they just took lands as confirmed and needs no queue.
    const admins = status === 'pending' ? await activeAdminIds(c.env.DB, tenantId, uid) : [];
    if (admins.length) {
      stmts.push(outboxIfChanged(c.env.DB, 'push', {
        userIds: admins, category: 'payments', title: 'Yeni ödeme bildirimi',
        body: `${(await nameOf(c.env.DB, memberId)) ?? 'Bir üye'} · ${formatTl(b.amount)} onayını bekliyor.`,
        data: { screen: 'admin/payments', paymentId: id },
      }, `payment-notice:${id}`));
    }
    await c.env.DB.batch(stmts);
    return c.json({ id }, 201);
  }
  // Reversal: the original must be this member's, in this gym, and not already reversed — one batch, one winner.
  if (typeof b.reversesPaymentId !== 'string') return bad(c, 'reversesPaymentId');
  data.reversesPaymentId = b.reversesPaymentId;
  // Both sides hear about a correction (Firebase notifyOnPaymentReversed): the member sees why, the other admins see who did it.
  const reason = typeof b.reason === 'string' ? b.reason.slice(0, 200).trim() : '';
  const detail = reason ? ` Gerekçe: ${reason}` : '';
  const memberName = await nameOf(c.env.DB, memberId);
  const reverseAdmins = await activeAdminIds(c.env.DB, tenantId, uid);
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE payments SET data = json_set(data, '$.reversedAt', ?, '$.reversedByPaymentId', ?, '$.reversalReason', ?)
       WHERE id = ? AND tenant_id = ? AND member_id = ? AND json_extract(data, '$.reversedAt') IS NULL AND json_extract(data, '$.kind') = 'charge'`,
    ).bind(now, id, typeof b.reason === 'string' ? b.reason.slice(0, 200) : null, b.reversesPaymentId, tenantId, memberId),
    c.env.DB.prepare(
      `INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) SELECT ?, ?, ?, ?, 'confirmed', ?, ? WHERE changes() = 1`,
    ).bind(id, tenantId, memberId, b.amount, JSON.stringify(data), now),
    // Each outbox row is guarded by the statement right before it: a lost race (nothing reversed) queues nothing.
    outboxIfChanged(c.env.DB, 'push', {
      userIds: [memberId], category: 'payments', title: 'Ödeme kaydın düzeltildi',
      body: `${formatTl(b.amount)} tutarındaki kaydın salon tarafından düzeltildi.${detail}`,
      data: { screen: 'member/payments', paymentId: b.reversesPaymentId },
    }, `payment-reversed:${b.reversesPaymentId}`),
  ];
  if (reverseAdmins.length) {
    stmts.push(outboxIfChanged(c.env.DB, 'push', {
      userIds: reverseAdmins, category: 'payments', title: 'Ödeme kaydı düzeltildi',
      body: `${memberName ?? 'Bir üye'} · ${formatTl(b.amount)}${detail}`,
      data: { screen: 'admin/payments', paymentId: b.reversesPaymentId },
    }, `payment-reversed-admins:${b.reversesPaymentId}`));
  }
  await c.env.DB.batch(stmts);
  const made = await c.env.DB.prepare(`SELECT 1 AS x FROM payments WHERE id = ?`).bind(id).first();
  return made ? c.json({ id }, 201) : c.json({ error: 'cannot reverse' }, 409);
});
writes2.put('/tenants/:tenantId/payments/:id/decision', async (c) => {
  if (!(await rolesOf(c)).includes('admin')) return forbidden(c);
  const to = (await body(c)).status;
  if (to !== 'confirmed' && to !== 'rejected') return bad(c, 'status');
  const tenantId = c.req.param('tenantId')!;
  const id = c.req.param('id')!;
  const pay = await c.env.DB.prepare(`SELECT member_id, amount FROM payments WHERE id = ? AND tenant_id = ? AND status = 'pending'`)
    .bind(id, tenantId).first<{ member_id: string; amount: number }>();
  if (!pay) return c.json({ error: 'not pending' }, 409);
  const now = Date.now();
  const amount = formatTl(pay.amount);
  // The member hears the answer (Firebase notifyOnPaymentStatusChange). Keyed off the row this statement decided, so a lost race says nothing.
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE payments SET status = ?, data = json_set(data, '$.confirmedAt', ?) WHERE id = ? AND tenant_id = ? AND status = 'pending'`)
      .bind(to, now, id, tenantId),
    outboxWhere(c.env.DB, 'push', {
      userIds: [pay.member_id], category: 'payments',
      title: to === 'confirmed' ? 'Ödemen onaylandı ✓' : 'Ödemen onaylanmadı',
      body: to === 'confirmed' ? `${amount} tutarındaki ödemen onaylandı.` : `${amount} tutarındaki ödeme bildirimin reddedildi. Detay için salonla iletişime geç.`,
      data: { screen: 'member/payments', paymentId: id },
    }, `payment-decision:${id}`,
    `EXISTS (SELECT 1 FROM payments WHERE id = ? AND status = ? AND json_extract(data, '$.confirmedAt') = ?)`, id, to, now),
  ]);
  const decided = await c.env.DB.prepare(`SELECT 1 AS x FROM payments WHERE id = ? AND status = ? AND json_extract(data, '$.confirmedAt') = ?`).bind(id, to, now).first();
  return decided ? c.json({ status: to }) : c.json({ error: 'not pending' }, 409);
});

// ---- trainer availability & calendar shares & reports ----
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
writes2.put('/tenants/:tenantId/trainers/:trainerId/availability', async (c) => {
  const r = await rolesOf(c);
  const trainerId = c.req.param('trainerId')!;
  if (!(r.includes('admin') || (r.includes('trainer') && c.get('userId') === trainerId))) return forbidden(c);
  const b = await body(c);
  const weekly = (b.weekly ?? {}) as Record<string, unknown>;
  if (typeof weekly !== 'object' || Object.keys(weekly).some((k) => !DAYS.includes(k))) return bad(c, 'weekly');
  if (![30, 45, 60, 90].includes(b.slotMinutes as number)) return bad(c, 'slotMinutes');
  if (b.exceptions !== undefined && !Array.isArray(b.exceptions)) return bad(c, 'exceptions');
  await c.env.DB.prepare(
    `INSERT INTO trainer_availability (tenant_id, trainer_id, weekly, slot_minutes, exceptions, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, trainer_id) DO UPDATE SET weekly = excluded.weekly, slot_minutes = excluded.slot_minutes,
       exceptions = excluded.exceptions, updated_at = excluded.updated_at`,
  ).bind(c.req.param('tenantId'), trainerId, JSON.stringify(weekly), b.slotMinutes, JSON.stringify(b.exceptions ?? []), Date.now()).run();
  return c.json({ ok: true });
});
writes2.put('/tenants/:tenantId/calendar-shares/:viewerId', async (c) => {
  const uid = c.get('userId');
  const viewer = c.req.param('viewerId')!;
  if (!uid || !(await rolesOf(c)).includes('trainer') || viewer === uid) return forbidden(c);
  const vr = await rolesIn(c.env.DB, c.req.param('tenantId')!, viewer);
  if (!vr.includes('trainer')) return bad(c, 'viewer must be a trainer');
  await c.env.DB.prepare(`INSERT OR IGNORE INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES (?, ?, ?, ?)`)
    .bind(c.req.param('tenantId'), uid, viewer, Date.now()).run();
  return c.json({ ok: true });
});
writes2.delete('/tenants/:tenantId/calendar-shares/:ownerId/:viewerId', async (c) => {
  const uid = c.get('userId');
  const r = await rolesOf(c);
  if (!(r.includes('admin') || (uid && uid === c.req.param('ownerId')))) return forbidden(c);
  await c.env.DB.prepare(`DELETE FROM calendar_shares WHERE tenant_id = ? AND owner_trainer_id = ? AND viewer_trainer_id = ?`)
    .bind(c.req.param('tenantId'), c.req.param('ownerId'), c.req.param('viewerId')).run();
  return c.json({ ok: true });
});
writes2.post('/tenants/:tenantId/exercise-reports', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  const b = await body(c);
  if (typeof b.exerciseId !== 'string' || !b.exerciseId || b.exerciseId.length > 64 || !['pose', 'muscles', 'text', 'other'].includes(b.reason as string)
      || typeof b.note !== 'string' || b.note.length > 500) return bad(c, 'bad report');
  const u = await c.env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`).bind(c.get('userId')).first<any>();
  await c.env.DB.prepare(
    `INSERT INTO exercise_reports (id, exercise_id, exercise_name, tenant_id, reported_by, reported_by_name, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(newId('er'), b.exerciseId, typeof b.exerciseName === 'string' ? b.exerciseName : null, c.req.param('tenantId'), c.get('userId'),
    u?.display_name ?? null, b.reason, b.note, Date.now()).run();
  // The e-mail to the content owner is a trigger in Firebase; here it becomes an outbox row in F3.
  return c.json({ ok: true }, 201);
});
