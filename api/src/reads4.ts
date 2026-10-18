import { Hono } from 'hono';

import { rolesIn } from './auth';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const reads4 = new Hono<App>();

const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');
const json = (s: string) => JSON.parse(s) as Record<string, unknown>;
const page = (c: Ctx) => Math.min(Number(c.req.query('limit') ?? 200) || 200, 500);

/** Same audience as the per-member lists: the member, gym staff, or an APPROVED guardian. */
async function mayRead(c: Ctx, tenantId: string, memberId: string): Promise<boolean> {
  const uid = c.get('userId');
  const roles = await rolesIn(c.env.DB, tenantId, uid);
  if (isStaff(roles) || (!!uid && uid === memberId && roles.length > 0)) return true;
  if (!uid) return false;
  return !!(await c.env.DB.prepare(
    `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'approved'`,
  ).bind(tenantId, memberId, uid).first());
}
// 404 for both "missing" and "not yours": an id never confirms that a record exists.
const notFound = (c: Ctx) => c.json({ error: 'not found' }, 404);

/** Gym-wide program list for staff (trainer home / Programlar tab). `?status=active` filters. */
reads4.get('/tenants/:tenantId/programs', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!isStaff(await rolesIn(c.env.DB, tenantId, c.get('userId')))) return c.json({ error: 'forbidden' }, 403);
  const status = c.req.query('status');
  const { results } = await c.env.DB.prepare(
    `SELECT id, member_id, data, updated_at FROM programs WHERE tenant_id = ?${status ? ` AND json_extract(data, '$.status') = ?` : ''} ORDER BY updated_at DESC LIMIT ?`,
  ).bind(...[tenantId, ...(status ? [status] : []), page(c)]).all<any>();
  return c.json(results.map((r) => ({ ...json(r.data), id: r.id, memberId: r.member_id, updatedAt: r.updated_at })));
});

reads4.get('/programs/:id', async (c) => {
  const r = await c.env.DB.prepare(`SELECT id, tenant_id, member_id, data, updated_at FROM programs WHERE id = ?`).bind(c.req.param('id')).first<any>();
  if (!r || !(await mayRead(c, r.tenant_id, r.member_id))) return notFound(c);
  return c.json({ ...json(r.data), id: r.id, tenantId: r.tenant_id, memberId: r.member_id, updatedAt: r.updated_at });
});

reads4.get('/workout-logs/:id', async (c) => {
  const r = await c.env.DB.prepare(`SELECT id, tenant_id, member_id, data, logged_at FROM workout_logs WHERE id = ?`).bind(c.req.param('id')).first<any>();
  if (!r || !(await mayRead(c, r.tenant_id, r.member_id))) return notFound(c);
  return c.json({ ...json(r.data), id: r.id, tenantId: r.tenant_id, memberId: r.member_id, loggedAt: r.logged_at });
});

/** A template is readable when it is global or belongs to one of the caller's active gyms. */
reads4.get('/program-templates/:id', async (c) => {
  const uid = c.get('userId');
  const r = await c.env.DB.prepare(
    `SELECT id, tenant_id, data, updated_at FROM program_templates WHERE id = ?
       AND (tenant_id IS NULL OR tenant_id IN (SELECT tenant_id FROM memberships WHERE member_id = ? AND status = 'active'))`,
  ).bind(c.req.param('id'), uid ?? '').first<any>();
  if (!r) return notFound(c);
  return c.json({ ...json(r.data), id: r.id, tenantId: r.tenant_id, updatedAt: r.updated_at });
});
