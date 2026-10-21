import { Hono } from 'hono';

import { rolesIn } from './auth';
import { activeAdminIds, nameOf, outboxIfChanged, outboxWhere } from './guarded';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const membership = new Hono<App>();

export const FREE_MEMBER_LIMIT = 10;
export const ADMIN_LIMIT = 3;
/** 18 years plus the most leap days that span can hold: errs on "still a minor" (as the rules did). */
const MINOR_MS = 6575 * 86_400_000;

/** First sign-in: create the internal user and map the provider subject, idempotently. */
membership.post('/me/bootstrap', async (c) => {
  if (c.get('userId')) return c.json({ userId: c.get('userId') });
  const subject = c.get('subject');
  const id = 'u' + [...crypto.getRandomValues(new Uint8Array(10))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const body = (await c.req.json().catch(() => ({}))) as { displayName?: unknown; email?: unknown };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 254) : null);
  await c.env.DB.batch([
    // OR IGNORE on identities makes a double-tap harmless; the orphan user is removed below.
    c.env.DB.prepare(`INSERT INTO users (id, display_name, email, created_at) VALUES (?, ?, ?, ?)`)
      .bind(id, str(body.displayName), str(body.email), Date.now()),
    c.env.DB.prepare(`INSERT OR IGNORE INTO identities (provider, subject, user_id) VALUES ('firebase', ?, ?)`).bind(subject, id),
  ]);
  const row = await c.env.DB.prepare(`SELECT user_id FROM identities WHERE provider = 'firebase' AND subject = ?`)
    .bind(subject).first<{ user_id: string }>();
  if (row && row.user_id !== id) await c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
  return c.json({ userId: row!.user_id }, 201);
});

const needUser = (c: Ctx) => (c.get('userId') ? null : c.json({ error: 'bootstrap required' }, 409));

/** Self-service join: always a pending 'member'; a re-join after leaving/rejection resets the row. */
membership.post('/tenants/:tenantId/join', async (c) => {
  const denied = needUser(c);
  if (denied) return denied;
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId')!;
  const t = await c.env.DB.prepare(`SELECT code, name FROM tenants WHERE id = ?`).bind(tenantId).first();
  if (!t) return c.json({ error: 'not found' }, 404);
  const u = await c.env.DB.prepare(`SELECT display_name, email FROM users WHERE id = ?`).bind(uid).first<any>();
  const prior = await c.env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, uid).first();
  const admins = await activeAdminIds(c.env.DB, tenantId, uid);
  const who = u?.display_name || u?.email || 'Biri';
  const now = Date.now();
  // The row is inserted or reset only when absent / left / rejected; anything else is untouched (the WHERE).
  const stmts = [c.env.DB.prepare(
    `INSERT INTO memberships (tenant_id, member_id, status, roles, display_name, email, requested_at)
     VALUES (?, ?, 'pending', '["member"]', ?, ?, ?)
     ON CONFLICT (tenant_id, member_id) DO UPDATE SET status = 'pending', roles = '["member"]', permissions = '[]',
       approved_at = NULL, left_at = NULL, requested_at = excluded.requested_at,
       display_name = excluded.display_name, email = excluded.email,   -- a scrubbed tombstone (removed from the gym) must not keep its blank name
       guardian_id = NULL, guardian_name = NULL, guardian_status = NULL
     WHERE memberships.status IN ('left','rejected')`,
  ).bind(tenantId, uid, u?.display_name ?? null, u?.email ?? null, now)];
  // The owner's most time-sensitive event (Firebase notifyAdminsOnJoinRequest); written iff the request was.
  if (admins.length) {
    stmts.push(outboxIfChanged(c.env.DB, 'push', {
      userIds: admins, category: 'account', title: 'Yeni katılım isteği',
      body: prior ? `${who} salona tekrar katılmak istiyor.` : `${who} salona katılmak istiyor.`, data: { screen: 'admin/members' },
    }, `join-request:${tenantId}:${uid}:${now}`));
  }
  await c.env.DB.batch(stmts);
  // Written iff the row now carries the timestamp this very statement stamped (insert, or reset of a left/rejected row).
  const written = await c.env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'pending' AND requested_at = ?`)
    .bind(tenantId, uid, now).first();
  if (!written) {
    const row = await c.env.DB.prepare(`SELECT status FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, uid).first<{ status: string }>();
    return c.json({ error: 'already a member', status: row?.status }, 409);
  }
  return c.json({ status: 'pending' }, 201);
});

/** Admin decision on a membership: approve (with every gate the rules had), reject or suspend. */
membership.put('/tenants/:tenantId/members/:memberId/status', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  if (!(await rolesIn(c.env.DB, tenantId, c.get('userId'))).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const body = (await c.req.json().catch(() => null)) as { status?: unknown } | null;
  const to = body?.status;
  if (to !== 'active' && to !== 'rejected' && to !== 'suspended') return c.json({ error: 'bad status' }, 400);

  const m = await c.env.DB.prepare(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = ?`)
    .bind(tenantId, memberId).first<{ status: string; roles: string }>();
  if (!m) return c.json({ error: 'not found' }, 404);
  const rowRoles = JSON.parse(m.roles) as string[];
  const isAdminRow = rowRoles.includes('admin');
  // Only the 'member' role takes a seat: hiring staff is never paywalled (as in the rules).
  const isSeat = rowRoles.includes('member');
  const now = Date.now();

  if (to === 'active') {
    if (m.status !== 'pending' && m.status !== 'suspended') return c.json({ error: 'invalid transition' }, 409);
    // Every gate lives inside the UPDATE itself, so parallel approvals cannot overshoot a cap.
    const stmts = [
      c.env.DB.prepare(
        `UPDATE memberships SET status = 'active', approved_at = ? WHERE tenant_id = ? AND member_id = ? AND status IN ('pending','suspended')
           AND (birth_date IS NULL OR birth_date + ${MINOR_MS} < ? OR guardian_status = 'approved')
           ${isSeat ? `AND ((SELECT subscription_status FROM tenants WHERE id = ?1) = 'active'
                OR (SELECT active_member_count FROM tenants WHERE id = ?1) < ${FREE_MEMBER_LIMIT})` : ''}
           ${isAdminRow ? `AND (SELECT active_admin_count FROM tenants WHERE id = ?1) < ${ADMIN_LIMIT}` : ''}`
          .replace(/\?1/g, '?'),
      ),
    ];
    // Positional rebind: the SQL above uses `?` for tenant ids in order.
    const args: unknown[] = [now, tenantId, memberId, now, ...(isSeat ? [tenantId, tenantId] : [])];
    if (isAdminRow) args.push(tenantId);
    stmts[0] = stmts[0].bind(...args);
    if (isSeat) stmts.push(c.env.DB.prepare(`UPDATE tenants SET active_member_count = active_member_count + 1 WHERE id = ? AND changes() = 1`).bind(tenantId));
    // changes() is still the membership UPDATE's when no seat statement ran before this one.
    if (isAdminRow) {
      stmts.push(c.env.DB.prepare(`UPDATE tenants SET active_admin_count = active_admin_count + 1 WHERE id = ? AND changes() = 1`).bind(tenantId));
    }
    // "Welcome" push (Firebase notifyOnMembershipApproved). Closes the batch and keys off the row this very statement stamped,
    // so a refused activation (cap, guardian) queues nothing and the seat statements above keep their `changes()` chain.
    const tenant = await c.env.DB.prepare(`SELECT name FROM tenants WHERE id = ?`).bind(tenantId).first<{ name: string }>();
    stmts.push(outboxWhere(c.env.DB, 'push', {
      userIds: [memberId], category: 'account', title: 'Üyeliğin onaylandı 🎉',
      body: `${tenant?.name ?? 'Salon'} ailesine hoş geldin! Üyelik kartın artık hazır.`, data: { screen: 'member/card' },
    }, `membership-approved:${tenantId}:${memberId}:${now}`,
    `EXISTS (SELECT 1 FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active' AND approved_at = ?)`, tenantId, memberId, now));
    await c.env.DB.batch(stmts);
    const after = await c.env.DB.prepare(`SELECT status FROM memberships WHERE tenant_id = ? AND member_id = ?`)
      .bind(tenantId, memberId).first<{ status: string }>();
    if (after?.status !== 'active') return c.json({ error: 'cannot activate (limit or guardian approval)' }, 409);
    return c.json({ status: 'active' });
  }

  // Leaving the active set releases the seat in the same batch.
  const wasActive = m.status === 'active';
  if (to === 'rejected' && m.status !== 'pending') return c.json({ error: 'invalid transition' }, 409);
  if (to === 'suspended' && !wasActive) return c.json({ error: 'invalid transition' }, 409);
  const stmts = [c.env.DB.prepare(`UPDATE memberships SET status = ? WHERE tenant_id = ? AND member_id = ? AND status = ?`)
    .bind(to, tenantId, memberId, m.status)];
  if (wasActive) {
    if (isSeat) stmts.push(c.env.DB.prepare(`UPDATE tenants SET active_member_count = MAX(active_member_count - 1, 0) WHERE id = ? AND changes() = 1`).bind(tenantId));
    if (isAdminRow) stmts.push(c.env.DB.prepare(`UPDATE tenants SET active_admin_count = MAX(active_admin_count - 1, 0) WHERE id = ? AND changes() = 1`).bind(tenantId));
  }
  await c.env.DB.batch(stmts);
  return c.json({ status: to });
});

/** A member leaves: history stays (credits, payments), the seat is freed. */
membership.post('/tenants/:tenantId/leave', async (c) => {
  const denied = needUser(c);
  if (denied) return denied;
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId')!;
  const m = await c.env.DB.prepare(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = ?`)
    .bind(tenantId, uid).first<{ status: string; roles: string }>();
  if (!m || m.status === 'left') return c.json({ error: 'not found' }, 404);
  const leaveRoles = JSON.parse(m.roles) as string[];
  const isAdminRow = leaveRoles.includes('admin');
  const isSeat = leaveRoles.includes('member');
  if (isAdminRow && m.status === 'active') {
    const other = await c.env.DB.prepare(
      `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id != ? AND status = 'active' AND roles LIKE '%"admin"%'`,
    ).bind(tenantId, uid).first();
    if (!other) return c.json({ error: 'last admin cannot leave' }, 409);
  }
  const leftAt = Date.now();
  const stmts = [c.env.DB.prepare(`UPDATE memberships SET status = 'left', left_at = ? WHERE tenant_id = ? AND member_id = ? AND status != 'left'`)
    .bind(leftAt, tenantId, uid)];
  if (m.status === 'active') {
    if (isSeat) stmts.push(c.env.DB.prepare(`UPDATE tenants SET active_member_count = MAX(active_member_count - 1, 0) WHERE id = ? AND changes() = 1`).bind(tenantId));
    if (isAdminRow) stmts.push(c.env.DB.prepare(`UPDATE tenants SET active_admin_count = MAX(active_admin_count - 1, 0) WHERE id = ? AND changes() = 1`).bind(tenantId));
  }
  // Tells the other admins a seat just freed up (Firebase notifyAdminsOnMemberLeft).
  const admins = await activeAdminIds(c.env.DB, tenantId, uid);
  if (admins.length) {
    stmts.push(outboxWhere(c.env.DB, 'push', {
      userIds: admins, category: 'account', title: 'Bir üye salondan ayrıldı',
      body: `${(await nameOf(c.env.DB, uid)) ?? 'Bir üye'} üyeliğini sonlandırdı.`, data: { screen: 'admin/members' },
    }, `member-left:${tenantId}:${uid}:${leftAt}`,
    `EXISTS (SELECT 1 FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'left' AND left_at = ?)`, tenantId, uid, leftAt));
  }
  await c.env.DB.batch(stmts);
  return c.json({ status: 'left' });
});
