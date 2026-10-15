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

// ---- per-member records (rules: self, staff, approved guardian; payments: admin only) ----
const memberLists: Array<{ path: string; who: Who; sql: string; map: (r: any) => unknown }> = [
  { path: 'packages', who: 'self+staff+guardian',
    sql: `SELECT id, package_id, final_price, starts_at, ends_at, status, payment_id, data, assigned_at FROM member_packages WHERE tenant_id = ? AND member_id = ? ORDER BY ends_at DESC LIMIT ?`,
    map: (r) => ({ id: r.id, packageId: r.package_id, finalPrice: r.final_price, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, paymentId: r.payment_id, assignedAt: r.assigned_at, ...json(r.data) }) },
  { path: 'programs', who: 'self+staff+guardian',
    sql: `SELECT id, data, updated_at FROM programs WHERE tenant_id = ? AND member_id = ? ORDER BY updated_at DESC LIMIT ?`,
    map: (r) => ({ id: r.id, updatedAt: r.updated_at, ...json(r.data) }) },
  { path: 'workout-logs', who: 'self+staff+guardian',
    sql: `SELECT id, data, logged_at FROM workout_logs WHERE tenant_id = ? AND member_id = ? ORDER BY logged_at DESC LIMIT ?`,
    map: (r) => ({ id: r.id, loggedAt: r.logged_at, ...json(r.data) }) },
  { path: 'measurements', who: 'self+staff+guardian',
    sql: `SELECT id, data, measured_at FROM measurements WHERE tenant_id = ? AND member_id = ? ORDER BY measured_at DESC LIMIT ?`,
    map: (r) => ({ id: r.id, measuredAt: r.measured_at, ...json(r.data) }) },
  { path: 'payments', who: 'self+admin+guardian',
    sql: `SELECT id, amount, status, data, created_at FROM payments WHERE tenant_id = ? AND member_id = ? ORDER BY created_at DESC LIMIT ?`,
    map: (r) => ({ id: r.id, amount: r.amount, status: r.status, createdAt: r.created_at, ...json(r.data) }) },
];
for (const l of memberLists) {
  reads2.get(`/tenants/:tenantId/members/:memberId/${l.path}`, async (c) => {
    const denied = await guard(c, l.who);
    if (denied) return denied;
    const { results } = await c.env.DB.prepare(l.sql).bind(c.req.param('tenantId'), c.req.param('memberId'), page(c)).all();
    return c.json(results.map(l.map));
  });
}

reads2.get('/tenants/:tenantId/members/:memberId/pt-sessions', async (c) => {
  const denied = await guard(c, 'self+staff+guardian');
  if (denied) return denied;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM pt_sessions WHERE tenant_id = ? AND member_id = ? ORDER BY starts_at DESC LIMIT ?`,
  ).bind(c.req.param('tenantId'), c.req.param('memberId'), page(c)).all();
  return c.json(results.map(ptDto));
});

// Staff-only: a trainer's own sessions, or any trainer's for admin / calendar-share viewers.
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
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM pt_sessions WHERE tenant_id = ? AND trainer_id = ? AND starts_at >= ? ORDER BY starts_at LIMIT ?`,
  ).bind(tenantId, trainerId, Number(c.req.query('from') ?? Date.now() - 7 * 86_400_000), page(c)).all();
  return c.json(results.map(ptDto));
});

function ptDto(r: any) {
  return { id: r.id, trainerId: r.trainer_id, memberId: r.member_id, originalTrainerId: r.original_trainer_id,
    startsAt: r.starts_at, durationMinutes: r.duration_minutes, status: r.status, creditId: r.credit_id,
    cancellationDeadlineAt: r.cancellation_deadline_at };
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
    `SELECT starts_at, duration_minutes FROM pt_sessions WHERE tenant_id = ? AND trainer_id = ? AND status != 'cancelled' AND starts_at >= ? ORDER BY starts_at LIMIT 500`,
  ).bind(c.req.param('tenantId'), c.req.param('trainerId'), Number(c.req.query('from') ?? Date.now() - 86_400_000)).all<any>();
  return c.json(results.map((r) => ({ startsAt: r.starts_at, durationMinutes: r.duration_minutes })));
});

reads2.get('/tenants/:tenantId/trainers/:trainerId/availability', async (c) => {
  const denied = await memberOnly(c);
  if (denied) return denied;
  const r = await c.env.DB.prepare(`SELECT weekly, slot_minutes, exceptions FROM trainer_availability WHERE tenant_id = ? AND trainer_id = ?`)
    .bind(c.req.param('tenantId'), c.req.param('trainerId')).first<any>();
  if (!r) return c.json({ error: 'not found' }, 404);
  return c.json({ weekly: JSON.parse(r.weekly), slotMinutes: r.slot_minutes, exceptions: JSON.parse(r.exceptions) });
});

reads2.get('/tenants/:tenantId/announcements', async (c) => {
  const denied = await memberOnly(c);
  if (denied) return denied;
  const { results } = await c.env.DB.prepare(
    `SELECT id, title, body, created_by_name, created_at, expires_at FROM announcements
     WHERE tenant_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 50`,
  ).bind(c.req.param('tenantId'), Date.now()).all<any>();
  return c.json(results.map((r) => ({ id: r.id, title: r.title, body: r.body, createdByName: r.created_by_name, createdAt: r.created_at, expiresAt: r.expires_at })));
});

// ---- staff-only ----
reads2.get('/tenants/:tenantId/members', async (c) => {
  const roles = await rolesIn(c.env.DB, c.req.param('tenantId')!, c.get('userId'));
  if (!isStaff(roles)) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT member_id, status, roles, display_name, email, phone, birth_date, photo_url, managed, short_code
     FROM memberships WHERE tenant_id = ? ORDER BY display_name LIMIT 500`,
  ).bind(c.req.param('tenantId')).all<any>();
  return c.json(results.map((r) => ({ memberId: r.member_id, status: r.status, roles: JSON.parse(r.roles),
    displayName: r.display_name, email: r.email, phone: r.phone, birthDate: r.birth_date, photoUrl: r.photo_url,
    managed: !!r.managed, shortCode: r.short_code })));
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
