import { Hono } from 'hono';

import { rolesIn } from './auth';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const reads3 = new Hono<App>();

const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');
const roles = (c: Ctx) => rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
const parse = (s: string) => JSON.parse(s) as Record<string, unknown>;

reads3.get('/tenants/:tenantId/packages', async (c) => {
  if (!(await roles(c)).length) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(`SELECT id, data, active_assignment_count FROM gym_packages WHERE tenant_id = ? LIMIT 200`)
    .bind(c.req.param('tenantId')).all<any>();
  return c.json(results.map((r) => ({ ...parse(r.data), id: r.id, activeAssignmentCount: r.active_assignment_count })));
});

reads3.get('/tenants/:tenantId/packages/:id', async (c) => {
  if (!(await roles(c)).length) return c.json({ error: 'forbidden' }, 403);
  const r = await c.env.DB.prepare(`SELECT id, data, active_assignment_count FROM gym_packages WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), c.req.param('tenantId')).first<any>();
  if (!r) return c.json({ error: 'not found' }, 404);
  return c.json({ ...parse(r.data), id: r.id, activeAssignmentCount: r.active_assignment_count });
});

reads3.get('/tenants/:tenantId/promotions/:id', async (c) => {
  if (!isStaff(await roles(c))) return c.json({ error: 'forbidden' }, 403);
  const r = await c.env.DB.prepare(`SELECT id, data FROM promotions WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), c.req.param('tenantId')).first<any>();
  if (!r) return c.json({ error: 'not found' }, 404);
  return c.json({ ...parse(r.data), id: r.id });
});

reads3.get('/tenants/:tenantId/promotions', async (c) => {
  if (!isStaff(await roles(c))) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(`SELECT id, data FROM promotions WHERE tenant_id = ? LIMIT 200`)
    .bind(c.req.param('tenantId')).all<any>();
  return c.json(results.map((r) => ({ ...parse(r.data), id: r.id })));
});

const reqRow = (r: any) => ({ ...parse(r.data), id: r.id, memberId: r.member_id, status: r.status, effectiveAt: r.effective_at,
  expiresAt: r.expires_at, appliedAt: r.applied_at, createdBy: r.created_by, createdAt: r.created_at,
  respondedAt: r.responded_at });

const CHANGE_STATUSES = ['pending', 'approved', 'rejected', 'expired', 'cancelled'];

/** Staff see every request; a member sees only their own. Filters: ?memberId= ?status= ?limit= (default 200, max 1000). */
reads3.get('/tenants/:tenantId/package-change-requests', async (c) => {
  const r = await roles(c);
  if (!r.length) return c.json({ error: 'forbidden' }, 403);
  const staff = isStaff(r);
  const memberId = c.req.query('memberId'), status = c.req.query('status');
  if (status !== undefined && !CHANGE_STATUSES.includes(status)) return c.json({ error: 'bad status' }, 400);
  const n = Number(c.req.query('limit'));
  const limit = Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 1000) : 200;
  // A member's own scope is not widened by ?memberId=: asking for someone else's simply matches nothing.
  const conds = ['tenant_id = ?', ...(staff ? [] : ['member_id = ?']), ...(memberId ? ['member_id = ?'] : []), ...(status ? ['status = ?'] : [])];
  const args = [c.req.param('tenantId'), ...(staff ? [] : [c.get('userId')]), ...(memberId ? [memberId] : []), ...(status ? [status] : []), limit];
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM package_change_requests WHERE ${conds.join(' AND ')} ORDER BY created_at DESC, id LIMIT ?`,
  ).bind(...args).all<any>();
  return c.json(results.map(reqRow));
});

reads3.get('/tenants/:tenantId/renewal-requests', async (c) => {
  const r = await roles(c);
  if (!r.length) return c.json({ error: 'forbidden' }, 403);
  const own = isStaff(r) ? '' : ' AND member_id = ?';
  const args = [c.req.param('tenantId'), ...(isStaff(r) ? [] : [c.get('userId')])];
  const { results } = await c.env.DB.prepare(
    `SELECT id, member_id, member_name, status, note, created_at, handled_at FROM renewal_requests WHERE tenant_id = ?${own} ORDER BY created_at DESC LIMIT 200`,
  ).bind(...args).all<any>();
  return c.json(results.map((x) => ({ id: x.id, memberId: x.member_id, memberName: x.member_name, status: x.status,
    note: x.note, createdAt: x.created_at, handledAt: x.handled_at })));
});

/**
 * Program templates: global ones (tenant_id NULL) plus the caller's own gyms'.
 * Firestore let any signed-in user read every gym's templates; that was a
 * leak, deliberately not reproduced.
 */
reads3.get('/program-templates', async (c) => {
  const uid = c.get('userId');
  const { results } = await c.env.DB.prepare(
    `SELECT id, tenant_id, data, updated_at FROM program_templates
     WHERE tenant_id IS NULL OR tenant_id IN (SELECT tenant_id FROM memberships WHERE member_id = ? AND status = 'active')
     ORDER BY updated_at DESC LIMIT 500`,
  ).bind(uid ?? '').all<any>();
  return c.json(results.map((r) => ({ ...parse(r.data), id: r.id, tenantId: r.tenant_id, updatedAt: r.updated_at })));
});

/** One membership row: self, staff, any member for trainer rows, or a guardian (any link state). */
reads3.get('/tenants/:tenantId/members/:memberId', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const uid = c.get('userId');
  const row = await c.env.DB.prepare(`SELECT * FROM memberships WHERE tenant_id = ? AND member_id = ?`)
    .bind(tenantId, memberId).first<any>();
  const r = await roles(c);
  const allowed = !!row && (uid === memberId || isStaff(r) ||
    (r.length > 0 && (JSON.parse(row.roles) as string[]).includes('trainer')) ||
    (!!uid && row.guardian_id === uid));
  // Same answer for "missing" and "not yours": no existence leak.
  if (!allowed) return c.json({ error: 'not found' }, 404);
  return c.json({ memberId: row.member_id, tenantId, status: row.status, roles: JSON.parse(row.roles),
    permissions: JSON.parse(row.permissions), displayName: row.display_name, email: row.email, phone: row.phone,
    birthDate: row.birth_date, heightCm: row.height_cm, photoUrl: row.photo_url, shortCode: row.short_code,
    managed: !!row.managed, guardianId: row.guardian_id, guardianName: row.guardian_name,
    guardianStatus: row.guardian_status, guardianConsentAt: row.guardian_consent_at, guardianConsentVersion: row.guardian_consent_version,
    requestedAt: row.requested_at, approvedAt: row.approved_at, leftAt: row.left_at, createdBy: row.created_by });
});

/** Children a user is (or is asking to become) guardian of. */
reads3.get('/me/children', async (c) => {
  const uid = c.get('userId');
  if (!uid) return c.json([]);
  const { results } = await c.env.DB.prepare(
    `SELECT tenant_id, member_id, display_name, guardian_status FROM memberships WHERE guardian_id = ?`,
  ).bind(uid).all<any>();
  return c.json(results.map((r) => ({ tenantId: r.tenant_id, memberId: r.member_id, displayName: r.display_name, guardianStatus: r.guardian_status })));
});
