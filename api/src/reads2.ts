import { Hono } from 'hono';

import { rolesIn } from './auth';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const reads2 = new Hono<App>();

const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');

/** Mirrors firestore.rules `isGuardianOf`: only an APPROVED guardian link counts. */
async function isGuardian(c: Ctx, tenantId: string, childId: string): Promise<boolean> {
  const uid = c.get('userId');
  if (!uid) return false;
  const row = await c.env.DB.prepare(
    `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'approved'`,
  ).bind(tenantId, childId, uid).first();
  return !!row;
}

type Who = 'self+staff+guardian' | 'self+admin+guardian' | 'staff';

/** Returns an error Response when the caller may not see this member's records. */
async function guard(c: Ctx, who: Who): Promise<Response | null> {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const uid = c.get('userId');
  const roles = await rolesIn(c.env.DB, tenantId, uid);
  if (who === 'staff') return isStaff(roles) ? null : c.json({ error: 'forbidden' }, 403);
  if (uid && uid === memberId && roles.length > 0) return null;
  if (who === 'self+staff+guardian' ? isStaff(roles) : roles.includes('admin')) return null;
  if (await isGuardian(c, tenantId, memberId)) return null;
  return c.json({ error: 'forbidden' }, 403);
}

const json = (s: string) => JSON.parse(s) as Record<string, unknown>;
const page = (c: Ctx) => Math.min(Number(c.req.query('limit') ?? 100) || 100, 200);
/** ?limit= with its own default and ceiling; junk and non-positive values fall back to the default. */
export const limitOf = (c: Ctx, dflt: number, max: number) => {
  const n = Number(c.req.query('limit'));
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), max) : dflt;
};
/** ?from= (inclusive) and ?to= (exclusive) in unix ms; undefined when absent, null when unreadable. */
export function rangeOf(c: Ctx): { from?: number; to?: number } | null {
  const out: { from?: number; to?: number } = {};
  for (const k of ['from', 'to'] as const) {
    const v = c.req.query(k);
    if (v === undefined || v === '') continue;
    if (!Number.isFinite(Number(v))) return null;
    out[k] = Number(v);
  }
  return out;
}

/** The member-package DTO, identical in the per-member list, the gym-wide list and the single read. */
export const MEMBER_PACKAGE_COLS = `id, member_id, package_id, final_price, starts_at, ends_at, status, payment_id, data, assigned_at, assigned_by`;
export const memberPackageDto = (r: any) => ({
  ...json(r.data), id: r.id, memberId: r.member_id, packageId: r.package_id, finalPrice: r.final_price, startsAt: r.starts_at,
  endsAt: r.ends_at, status: r.status, paymentId: r.payment_id, assignedAt: r.assigned_at, assignedBy: r.assigned_by,
});

// ---- per-member records (rules: self, staff, approved guardian; payments: admin only) ----
const memberLists: Array<{ path: string; who: Who; sql: string; map: (r: any) => unknown }> = [
  { path: 'packages', who: 'self+staff+guardian',
    sql: `SELECT ${MEMBER_PACKAGE_COLS} FROM member_packages WHERE tenant_id = ? AND member_id = ? ORDER BY ends_at DESC LIMIT ?`,
    map: memberPackageDto },
  { path: 'programs', who: 'self+staff+guardian',
    sql: `SELECT id, member_id, data, updated_at FROM programs WHERE tenant_id = ? AND member_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?`,
    map: (r) => ({ ...json(r.data), id: r.id, memberId: r.member_id, updatedAt: r.updated_at }) },
  { path: 'workout-logs', who: 'self+staff+guardian',
    sql: `SELECT id, member_id, data, logged_at FROM workout_logs WHERE tenant_id = ? AND member_id = ? ORDER BY logged_at DESC LIMIT ?`,
    map: (r) => ({ ...json(r.data), id: r.id, memberId: r.member_id, loggedAt: r.logged_at }) },
  { path: 'measurements', who: 'self+staff+guardian',
    sql: `SELECT id, member_id, data, measured_at FROM measurements WHERE tenant_id = ? AND member_id = ? ORDER BY measured_at DESC LIMIT ?`,
    map: (r) => ({ ...json(r.data), id: r.id, memberId: r.member_id, measuredAt: r.measured_at }) },
  { path: 'payments', who: 'self+admin+guardian',
    sql: `SELECT id, member_id, amount, status, data, created_at FROM payments WHERE tenant_id = ? AND member_id = ? ORDER BY created_at DESC LIMIT ?`,
    map: (r) => ({ ...json(r.data), id: r.id, memberId: r.member_id, amount: r.amount, status: r.status, createdAt: r.created_at }) },
];
for (const l of memberLists) {
  reads2.get(`/tenants/:tenantId/members/:memberId/${l.path}`, async (c) => {
    const denied = await guard(c, l.who);
    if (denied) return denied;
    const { results } = await c.env.DB.prepare(l.sql).bind(c.req.param('tenantId'), c.req.param('memberId'), page(c)).all();
    return c.json(results.map(l.map));
  });
}

/** Session row plus the names a calendar needs (membership name first, the account's own as fallback). */
const PT_SELECT = `SELECT s.*, COALESCE(tm.display_name, tu.display_name) AS trainer_name, COALESCE(mm.display_name, mu.display_name) AS member_name
  FROM pt_sessions s
  LEFT JOIN memberships tm ON tm.tenant_id = s.tenant_id AND tm.member_id = s.trainer_id
  LEFT JOIN users tu ON tu.id = s.trainer_id
  LEFT JOIN memberships mm ON mm.tenant_id = s.tenant_id AND mm.member_id = s.member_id
  LEFT JOIN users mu ON mu.id = s.member_id`;
const rangeSql = (r: { from?: number; to?: number }) => ({
  sql: `${r.from !== undefined ? ' AND s.starts_at >= ?' : ''}${r.to !== undefined ? ' AND s.starts_at < ?' : ''}`,
  args: [...(r.from !== undefined ? [r.from] : []), ...(r.to !== undefined ? [r.to] : [])],
});

reads2.get('/tenants/:tenantId/members/:memberId/pt-sessions', async (c) => {
  const denied = await guard(c, 'self+staff+guardian');
  if (denied) return denied;
  const range = rangeOf(c);
  if (!range) return c.json({ error: 'bad range' }, 400);
  const rs = rangeSql(range);
  const { results } = await c.env.DB.prepare(
    `${PT_SELECT} WHERE s.tenant_id = ? AND s.member_id = ?${rs.sql} ORDER BY s.starts_at DESC LIMIT ?`,
  ).bind(c.req.param('tenantId'), c.req.param('memberId'), ...rs.args, page(c)).all();
  return c.json(results.map(ptDto));
});

// Staff-only: a trainer's own sessions, or any trainer's for admin / calendar-share viewers.
// `from` defaults to a week ago (the calendar window); `to` is exclusive.
reads2.get('/tenants/:tenantId/trainers/:trainerId/pt-sessions', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const trainerId = c.req.param('trainerId')!;
  const uid = c.get('userId');
  const roles = await rolesIn(c.env.DB, tenantId, uid);
  let ok = roles.includes('admin') || (uid === trainerId && roles.includes('trainer'));
  if (!ok && uid) {
    ok = !!(await c.env.DB.prepare(
      `SELECT 1 AS x FROM calendar_shares WHERE tenant_id = ? AND owner_trainer_id = ? AND viewer_trainer_id = ?`,
    ).bind(tenantId, trainerId, uid).first());
  }
  if (!ok) return c.json({ error: 'forbidden' }, 403);
  const range = rangeOf(c);
  if (!range) return c.json({ error: 'bad range' }, 400);
  const rs = rangeSql({ ...range, from: range.from ?? Date.now() - 7 * 86_400_000 });
  const { results } = await c.env.DB.prepare(
    `${PT_SELECT} WHERE s.tenant_id = ? AND s.trainer_id = ?${rs.sql} ORDER BY s.starts_at LIMIT ?`,
  ).bind(tenantId, trainerId, ...rs.args, page(c)).all();
  return c.json(results.map(ptDto));
});

/** Admin: every session of the gym in a window (`from` defaults to a week ago, `to` exclusive), oldest first. Default 200, max 1000. */
reads2.get('/tenants/:tenantId/pt-sessions', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!(await rolesIn(c.env.DB, tenantId, c.get('userId'))).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const range = rangeOf(c);
  if (!range) return c.json({ error: 'bad range' }, 400);
  const rs = rangeSql({ ...range, from: range.from ?? Date.now() - 7 * 86_400_000 });
  const { results } = await c.env.DB.prepare(
    `${PT_SELECT} WHERE s.tenant_id = ?${rs.sql} ORDER BY s.starts_at, s.id LIMIT ?`,
  ).bind(tenantId, ...rs.args, limitOf(c, 200, 1000)).all();
  return c.json(results.map(ptDto));
});

export function ptDto(r: any) {
  return { id: r.id, trainerId: r.trainer_id, trainerName: r.trainer_name ?? null, memberId: r.member_id, memberName: r.member_name ?? null,
    originalTrainerId: r.original_trainer_id, startsAt: r.starts_at, durationMinutes: r.duration_minutes, status: r.status, creditId: r.credit_id,
    cancellationDeadlineAt: r.cancellation_deadline_at, cancelledAt: r.cancelled_at, cancelledBy: r.cancelled_by,
    cancelledByRole: r.cancelled_by_role, refundOutcome: r.refund_outcome, createdAt: r.created_at, updatedAt: r.updated_at };
}

// ---- gym-wide, any active member ----
async function memberOnly(c: Ctx): Promise<Response | null> {
  const roles = await rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
  return roles.length ? null : c.json({ error: 'forbidden' }, 403);
}

/** Busy slots carry NO identity (no member, no credit): only when and how long. */
reads2.get('/tenants/:tenantId/trainers/:trainerId/busy', async (c) => {
  const denied = await memberOnly(c);
  if (denied) return denied;
  const { results } = await c.env.DB.prepare(
    `SELECT starts_at, duration_minutes, status FROM pt_sessions WHERE tenant_id = ? AND trainer_id = ? AND status != 'cancelled' AND starts_at >= ? ORDER BY starts_at LIMIT 500`,
  ).bind(c.req.param('tenantId'), c.req.param('trainerId'), Number(c.req.query('from') ?? Date.now() - 86_400_000)).all<any>();
  return c.json(results.map((r) => ({ startsAt: r.starts_at, durationMinutes: r.duration_minutes, status: r.status })));
});

reads2.get('/tenants/:tenantId/trainers/:trainerId/availability', async (c) => {
  const denied = await memberOnly(c);
  if (denied) return denied;
  const r = await c.env.DB.prepare(`SELECT weekly, slot_minutes, exceptions, updated_at FROM trainer_availability WHERE tenant_id = ? AND trainer_id = ?`)
    .bind(c.req.param('tenantId'), c.req.param('trainerId')).first<any>();
  if (!r) return c.json({ error: 'not found' }, 404);
  return c.json({ weekly: JSON.parse(r.weekly), slotMinutes: r.slot_minutes, exceptions: JSON.parse(r.exceptions), updatedAt: r.updated_at });
});

/** Members see live announcements only; `?all=1` is the admin's view and includes expired ones (cap 200 instead of 50). */
reads2.get('/tenants/:tenantId/announcements', async (c) => {
  const roles = await rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
  if (!roles.length) return c.json({ error: 'forbidden' }, 403);
  const all = c.req.query('all') === '1' && roles.includes('admin');
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, body, created_by_name, created_at, expires_at FROM announcements
     WHERE tenant_id = ?${all ? '' : ' AND (expires_at IS NULL OR expires_at > ?)'} ORDER BY created_at DESC, id DESC LIMIT ${all ? 200 : 50}`,
  ).bind(...[c.req.param('tenantId'), ...(all ? [] : [Date.now()])]).all<any>();
  return c.json(results.map((r) => ({ id: r.id, title: r.title, body: r.body, createdByName: r.created_by_name, createdAt: r.created_at, expiresAt: r.expires_at })));
});

// ---- staff-only ----
reads2.get('/tenants/:tenantId/members', async (c) => {
  const roles = await rolesIn(c.env.DB, c.req.param('tenantId')!, c.get('userId'));
  if (!isStaff(roles)) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT member_id, status, roles, permissions, display_name, email, phone, birth_date, height_cm, avatar_id, managed, short_code,
            requested_at, approved_at, left_at, created_by, guardian_id, guardian_name, guardian_status, guardian_consent_at, guardian_consent_version
     FROM memberships WHERE tenant_id = ? ORDER BY display_name, member_id LIMIT ?`,
  ).bind(c.req.param('tenantId'), limitOf(c, 500, 1000)).all<any>();
  return c.json(results.map((r) => ({ memberId: r.member_id, status: r.status, roles: JSON.parse(r.roles), permissions: JSON.parse(r.permissions),
    displayName: r.display_name, email: r.email, phone: r.phone, birthDate: r.birth_date, heightCm: r.height_cm, avatarId: r.avatar_id,
    managed: !!r.managed, shortCode: r.short_code, requestedAt: r.requested_at, approvedAt: r.approved_at, leftAt: r.left_at, createdBy: r.created_by,
    guardianId: r.guardian_id, guardianName: r.guardian_name, guardianStatus: r.guardian_status,
    guardianConsentAt: r.guardian_consent_at, guardianConsentVersion: r.guardian_consent_version })));
});

reads2.get('/tenants/:tenantId/members/:memberId/note', async (c) => {
  const denied = await guard(c, 'staff');
  if (denied) return denied;
  const r = await c.env.DB.prepare(`SELECT text, updated_by_name, updated_at FROM member_notes WHERE tenant_id = ? AND member_id = ?`)
    .bind(c.req.param('tenantId'), c.req.param('memberId')).first<any>();
  return c.json(r ? { text: r.text, updatedByName: r.updated_by_name, updatedAt: r.updated_at } : { text: '' });
});

/** Admin-only private note and the member's address (admin, or the member for the address). */
reads2.get('/tenants/:tenantId/members/:memberId/admin-note', async (c) => {
  const roles = await rolesIn(c.env.DB, c.req.param('tenantId')!, c.get('userId'));
  if (!roles.includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const r = await c.env.DB.prepare(`SELECT text, updated_at FROM member_admin_notes WHERE tenant_id = ? AND member_id = ?`)
    .bind(c.req.param('tenantId'), c.req.param('memberId')).first<any>();
  return c.json(r ? { text: r.text, updatedAt: r.updated_at } : { text: '' });
});

reads2.get('/tenants/:tenantId/members/:memberId/address', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const uid = c.get('userId');
  const roles = await rolesIn(c.env.DB, tenantId, uid);
  if (!(roles.includes('admin') || (uid === memberId && roles.length > 0))) return c.json({ error: 'forbidden' }, 403);
  const r = await c.env.DB.prepare(`SELECT address FROM member_addresses WHERE tenant_id = ? AND member_id = ?`)
    .bind(tenantId, memberId).first<any>();
  return c.json({ address: r?.address ?? '' });
});

/** Check-in history: the member, an approved guardian, an admin or a holder of the delegated 'checkin' permission. */
reads2.get('/tenants/:tenantId/members/:memberId/checkins', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const uid = c.get('userId');
  let ok = !!uid && uid === memberId;
  if (!ok && uid) {
    const m = await c.env.DB.prepare(`SELECT roles, permissions FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active'`)
      .bind(tenantId, uid).first<any>();
    ok = !!m && (JSON.parse(m.roles).includes('admin') || JSON.parse(m.permissions).includes('checkin'));
  }
  if (!ok && uid) ok = await isGuardian(c, tenantId, memberId);
  if (!ok) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT id, data, created_at FROM checkins WHERE tenant_id = ? AND member_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).bind(tenantId, memberId, page(c)).all<any>();
  return c.json(results.map((r) => ({ ...json(r.data), id: r.id, createdAt: r.created_at })));
});
