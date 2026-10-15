import { Hono } from 'hono';

import { rolesIn } from './auth';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
export const reads = new Hono<App>();

/** Safe public DTO: never exposes owner, counters, subscription or contact data. */
reads.get('/tenants/by-code/:code', async (c) => {
  const row = await c.env.DB.prepare(`SELECT id, code, name, branding FROM tenants WHERE code = ?`)
    .bind(c.req.param('code').toUpperCase()).first<{ id: string; code: string; name: string; branding: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ id: row.id, code: row.code, name: row.name, branding: JSON.parse(row.branding) });
});

/** Caller must be in the gym with an active membership (any role). */
const requireMember = async (c: import('hono').Context<App>, next: () => Promise<void>) => {
  const roles = await rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
  if (roles.length === 0) return c.json({ error: 'forbidden' }, 403);
  await next();
};

/** Classes are gym-wide: any active member may list them. */
reads.get('/tenants/:tenantId/classes', requireMember, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, data, starts_at FROM classes WHERE tenant_id = ? AND starts_at >= ? ORDER BY starts_at LIMIT 200`,
  ).bind(c.req.param('tenantId'), Number(c.req.query('from') ?? Date.now() - 86_400_000))
    .all<{ id: string; data: string; starts_at: number }>();
  return c.json(results.map((r) => ({ ...JSON.parse(r.data), id: r.id, startsAt: r.starts_at })));
});

/**
 * A member's credits: the member themself, or gym staff. Another member's
 * balance is never visible to a member (404-shaped 403, no existence leak).
 */
reads.get('/tenants/:tenantId/members/:memberId/credits', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const roles = await rolesIn(c.env.DB, tenantId, c.get('userId'));
  const staff = roles.includes('admin') || roles.includes('trainer');
  const uid = c.get('userId');
  const guardian = !staff && uid !== memberId && !!uid && !!(await c.env.DB.prepare(
    `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'approved'`,
  ).bind(tenantId, memberId, uid).first());
  // Self needs a live membership (a 'left' row grants nothing); a guardian needs only the approved link.
  const self = !!uid && uid === memberId && roles.length > 0;
  if (!staff && !self && !guardian) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT id, kind, source, source_package_id, total, used, starts_at, expires_at, status
     FROM member_credits WHERE tenant_id = ? AND member_id = ? ORDER BY expires_at LIMIT 200`,
  ).bind(tenantId, memberId).all<Record<string, unknown>>();
  return c.json(results.map((r) => ({
    id: r.id, kind: r.kind, source: r.source, sourcePackageId: r.source_package_id,
    total: r.total, used: r.used, startsAt: r.starts_at, expiresAt: r.expires_at, status: r.status,
  })));
});
