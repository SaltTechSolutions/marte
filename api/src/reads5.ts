import { Hono } from 'hono';

import { rolesIn } from './auth';
import { limitOf, MEMBER_PACKAGE_COLS, memberPackageDto, rangeOf } from './reads2';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const reads5 = new Hono<App>();

const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');
const json = (s: string) => JSON.parse(s) as Record<string, unknown>;
// 404 for both "missing" and "not yours": an id never confirms that a record exists.
const notFound = (c: Ctx) => c.json({ error: 'not found' }, 404);

/** Admin, or an ACTIVE member holding the delegated 'checkin' permission (what the front desk runs on). */
export async function canSeeCheckins(c: Ctx, tenantId: string): Promise<{ admin: boolean; ok: boolean }> {
  const uid = c.get('userId');
  if (!uid) return { admin: false, ok: false };
  const m = await c.env.DB.prepare(`SELECT roles, permissions FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active'`)
    .bind(tenantId, uid).first<{ roles: string; permissions: string }>();
  if (!m) return { admin: false, ok: false };
  const admin = (JSON.parse(m.roles) as string[]).includes('admin');
  return { admin, ok: admin || (JSON.parse(m.permissions) as string[]).includes('checkin') };
}

// ---- member packages (gym-wide) ----

/** Staff: every assignment of the gym, newest `ends_at` first. Same DTO as the per-member list. Default 200, max 1000. */
reads5.get('/tenants/:tenantId/member-packages', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!isStaff(await rolesIn(c.env.DB, tenantId, c.get('userId')))) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT ${MEMBER_PACKAGE_COLS} FROM member_packages WHERE tenant_id = ? ORDER BY ends_at DESC, id LIMIT ?`,
  ).bind(tenantId, limitOf(c, 200, 1000)).all<any>();
  return c.json(results.map(memberPackageDto));
});

/** One assignment: the member themself, gym staff, or an APPROVED guardian. */
reads5.get('/tenants/:tenantId/member-packages/:id', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  const r = await c.env.DB.prepare(`SELECT ${MEMBER_PACKAGE_COLS} FROM member_packages WHERE id = ? AND tenant_id = ?`)
    .bind(c.req.param('id'), tenantId).first<any>();
  if (!r) return notFound(c);
  const roles = await rolesIn(c.env.DB, tenantId, uid);
  let ok = isStaff(roles) || (!!uid && uid === r.member_id && roles.length > 0);
  if (!ok && uid) {
    ok = !!(await c.env.DB.prepare(
      `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND guardian_id = ? AND guardian_status = 'approved'`,
    ).bind(tenantId, r.member_id, uid).first());
  }
  return ok ? c.json(memberPackageDto(r)) : notFound(c);
});

// ---- payments ledger (gym-wide, admin) ----

/**
 * Admin: the whole ledger, newest first. `memberName` is the membership's current name; a payment that was
 * anonymised (account deletion / removal from the gym) keeps its scrubbed name even if a membership row survives.
 */
reads5.get('/tenants/:tenantId/payments', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!(await rolesIn(c.env.DB, tenantId, c.get('userId'))).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.member_id, p.amount, p.status, p.data, p.created_at,
            CASE WHEN json_extract(p.data, '$.memberDeletedAt') IS NOT NULL THEN json_extract(p.data, '$.memberName')
                 ELSE COALESCE(m.display_name, json_extract(p.data, '$.memberName'), '') END AS member_name
     FROM payments p LEFT JOIN memberships m ON m.tenant_id = p.tenant_id AND m.member_id = p.member_id
     WHERE p.tenant_id = ? ORDER BY p.created_at DESC, p.rowid DESC LIMIT ?`,
  ).bind(tenantId, limitOf(c, 200, 1000)).all<any>();
  return c.json(results.map((r) => ({ ...json(r.data), id: r.id, memberId: r.member_id, memberName: r.member_name ?? '',
    amount: r.amount, status: r.status, createdAt: r.created_at })));
});

// ---- calendar shares ----

/**
 * Trainer: grants they gave (`as=owner`), grants they received (`as=viewer`), or both when `as` is absent.
 * Admin: every grant of the gym when `as` is absent (with `as`, the admin's own side, for an admin who also coaches).
 */
reads5.get('/tenants/:tenantId/calendar-shares', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  const roles = await rolesIn(c.env.DB, tenantId, uid);
  const as = c.req.query('as');
  if (as !== undefined && as !== 'owner' && as !== 'viewer') return c.json({ error: 'bad as' }, 400);
  const admin = roles.includes('admin');
  if (!uid || !(admin || roles.includes('trainer'))) return c.json({ error: 'forbidden' }, 403);
  const where = as === 'owner' ? 's.owner_trainer_id = ?2' : as === 'viewer' ? 's.viewer_trainer_id = ?2'
    : admin ? '1 = 1' : '(s.owner_trainer_id = ?2 OR s.viewer_trainer_id = ?2)';
  const needsUid = where.includes('?2');
  const { results } = await c.env.DB.prepare(
    `SELECT s.owner_trainer_id, COALESCE(om.display_name, ou.display_name) AS owner_name,
            s.viewer_trainer_id, COALESCE(vm.display_name, vu.display_name) AS viewer_name, s.created_at
     FROM calendar_shares s
     LEFT JOIN memberships om ON om.tenant_id = s.tenant_id AND om.member_id = s.owner_trainer_id
     LEFT JOIN users ou ON ou.id = s.owner_trainer_id
     LEFT JOIN memberships vm ON vm.tenant_id = s.tenant_id AND vm.member_id = s.viewer_trainer_id
     LEFT JOIN users vu ON vu.id = s.viewer_trainer_id
     WHERE s.tenant_id = ?1 AND ${where} ORDER BY s.created_at, s.owner_trainer_id, s.viewer_trainer_id LIMIT 500`,
  ).bind(...(needsUid ? [tenantId, uid] : [tenantId])).all<any>();
  return c.json(results.map((r) => ({ ownerTrainerId: r.owner_trainer_id, ownerName: r.owner_name ?? null,
    viewerTrainerId: r.viewer_trainer_id, viewerName: r.viewer_name ?? null, createdAt: r.created_at })));
});

// ---- check-ins ----

/** Admin or a 'checkin' holder: the visit log in a window (`from` inclusive, `to` exclusive), newest first. Default 200, max 1000. */
reads5.get('/tenants/:tenantId/checkins', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!(await canSeeCheckins(c, tenantId)).ok) return c.json({ error: 'forbidden' }, 403);
  const range = rangeOf(c);
  if (!range) return c.json({ error: 'bad range' }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT k.id, k.member_id, k.data, k.created_at, COALESCE(m.display_name, u.display_name) AS member_name
     FROM checkins k LEFT JOIN memberships m ON m.tenant_id = k.tenant_id AND m.member_id = k.member_id
     LEFT JOIN users u ON u.id = k.member_id
     WHERE k.tenant_id = ?${range.from !== undefined ? ' AND k.created_at >= ?' : ''}${range.to !== undefined ? ' AND k.created_at < ?' : ''}
     ORDER BY k.created_at DESC, k.rowid DESC LIMIT ?`,
  ).bind(tenantId, ...(range.from !== undefined ? [range.from] : []), ...(range.to !== undefined ? [range.to] : []), limitOf(c, 200, 1000)).all<any>();
  return c.json(results.map((r) => ({ id: r.id, memberId: r.member_id, memberName: r.member_name ?? null,
    accessReason: (json(r.data).accessReason as string | undefined) ?? null, createdAt: r.created_at })));
});

// ---- guardians ----

/** Staff and 'checkin' holders: the people who point at this member as their guardian (any link state). */
reads5.get('/tenants/:tenantId/guardians/:guardianId/children', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const roles = await rolesIn(c.env.DB, tenantId, c.get('userId'));
  if (!isStaff(roles) && !(await canSeeCheckins(c, tenantId)).ok) return c.json({ error: 'forbidden' }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT member_id, display_name, birth_date, status, guardian_status FROM memberships
     WHERE tenant_id = ? AND guardian_id = ? ORDER BY display_name, member_id LIMIT 100`,
  ).bind(tenantId, c.req.param('guardianId')).all<any>();
  return c.json(results.map((r) => ({ memberId: r.member_id, name: r.display_name, birthDate: r.birth_date, status: r.status, guardianStatus: r.guardian_status })));
});
