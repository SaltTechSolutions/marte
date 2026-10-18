import { Hono } from 'hono';

import { rolesIn } from './auth';
import { ADMIN_ROLE, eraseStatements } from './erase';
import { abortIf, type App } from './guarded';
import { outboxStatement } from './outbox';

/**
 * DELETE /tenants/:tenantId/members/:memberId — an admin removes ONE person from ONE gym.
 * The same erase/retain rules as account deletion (account.ts, erase.ts) scoped to this gym: the person's
 * rows here go, payments are anonymised, upcoming PT sessions are cancelled (a removed trainer's WITH the
 * lesson given back), seat tallies are freed, children lose the guardian link. Their account, their other
 * gyms and the shared `users` row are untouched (a managed, account-less member's `users` row goes too).
 * Answers `{ deleted: <rows removed from the gym's tables> }`.
 */
export const memberRemoval = new Hono<App>();

/** True when `?1`/`?2` (tenant, member) is an active admin with no OTHER active admin in that gym. */
const SOLE_ADMIN_HERE = `EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = ?1 AND m.member_id = ?2 AND m.status = 'active' AND ${ADMIN_ROLE('m')}
  AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.tenant_id = m.tenant_id AND o.member_id != m.member_id AND o.status = 'active' AND ${ADMIN_ROLE('o')}))`;

memberRemoval.delete('/tenants/:tenantId/members/:memberId', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const uid = c.get('userId');
  if (!uid || !(await rolesIn(c.env.DB, tenantId, uid)).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  // Leaving yourself is `leave` / `me/delete-account`; this route must never be a way to lock yourself out.
  if (memberId === uid) return c.json({ error: 'cannot remove yourself' }, 409);

  const db = c.env.DB;
  const m = await db.prepare(`SELECT managed FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, memberId).first<{ managed: number }>();
  if (!m) return c.json({ error: 'not found' }, 404);
  const soleAdmin = async () => !!(await db.prepare(`SELECT ${SOLE_ADMIN_HERE} AS x`).bind(tenantId, memberId).first<{ x: number }>())?.x;
  if (await soleAdmin()) return c.json({ error: 'last admin cannot be removed' }, 409);

  const now = Date.now();
  const { results: trainees } = await db.prepare(
    `SELECT DISTINCT member_id FROM pt_sessions WHERE tenant_id = ? AND trainer_id = ? AND status = 'scheduled' AND starts_at >= ?`,
  ).bind(tenantId, memberId, now).all<{ member_id: string }>();
  const { results: kids } = await db.prepare(
    `SELECT DISTINCT member_id FROM memberships WHERE tenant_id = ? AND guardian_id = ? AND managed = 0`,
  ).bind(tenantId, memberId).all<{ member_id: string }>();

  const head: D1PreparedStatement[] = [
    // Re-checked INSIDE the batch: the caller must still be an active admin and the target must not have become the last one.
    abortIf(db, SOLE_ADMIN_HERE, tenantId, memberId),
    abortIf(db, `NOT EXISTS (SELECT 1 FROM memberships c WHERE c.tenant_id = ? AND c.member_id = ? AND c.status = 'active' AND ${ADMIN_ROLE('c')})`, tenantId, uid),
  ];
  if (trainees.length) {
    head.push(outboxStatement(db, 'push', {
      userIds: trainees.map((t) => t.member_id), category: 'bookings', title: 'Randevun iptal edildi',
      body: 'Antrenör salondan ayrıldığı için yaklaşan randevun iptal edildi.', data: { screen: 'member/index' },
    }, `member-removed:${tenantId}:${memberId}:sessions`));
  }
  if (kids.length) {
    head.push(outboxStatement(db, 'push', {
      userIds: kids.map((k) => k.member_id), category: 'account', title: 'Ebeveyn bağlantın kaldırıldı',
      body: 'Ebeveynin bu salondan çıkarıldı. Başka bir ebeveyn seçebilirsin.', data: { screen: '/member/edit-profile' },
    }, `member-removed:${tenantId}:${memberId}:children`));
  }
  const { stmts: erase, deleteIdx } = eraseStatements(db, { uid: memberId, now, tenantId });
  const tail: D1PreparedStatement[] = m.managed
    // An account-less member has nobody to come back as: their `users` row (name, e-mail) goes once nothing points at it.
    ? [db.prepare(
      `DELETE FROM users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM identities WHERE user_id = users.id)
         AND NOT EXISTS (SELECT 1 FROM memberships WHERE member_id = users.id OR created_by = users.id)
         AND NOT EXISTS (SELECT 1 FROM tenants WHERE owner_user_id = users.id)`,
    ).bind(memberId)]
    : [];

  let results: D1Result[];
  try {
    results = await db.batch([...head, ...erase, ...tail]);
  } catch (e) {
    if (!(await rolesIn(db, tenantId, uid)).includes('admin')) return c.json({ error: 'forbidden' }, 403);
    if (await soleAdmin()) return c.json({ error: 'last admin cannot be removed' }, 409);
    throw e;
  }
  const deleted = deleteIdx.reduce((n, i) => n + (results[head.length + i]?.meta?.changes ?? 0), 0);
  return c.json({ deleted });
});
