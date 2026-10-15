import type { Context } from 'hono';

import type { Env, Vars } from './types';

type C = Context<{ Bindings: Env; Variables: Vars }>;

/** Admin-only private note, keyed to (gym, member) so it never follows a member elsewhere. */
export async function setAdminNote(c: C) {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const body = await c.req.json().catch(() => null) as { text?: unknown } | null;
  // Only an explicit string deletes; malformed input is a 400, never a silent delete.
  if (typeof body?.text !== 'string') return c.json({ error: 'text required' }, 400);
  const text = body.text.trim();
  if (text.length > 2000) return c.json({ error: 'text too long' }, 400);

  const exists = await c.env.DB.prepare(
    `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ?`,
  ).bind(tenantId, memberId).first();
  if (!exists) return c.json({ error: 'not found' }, 404);

  // An empty note is not stored: the row is deleted.
  if (!text) {
    await c.env.DB.prepare(`DELETE FROM member_admin_notes WHERE tenant_id = ? AND member_id = ?`)
      .bind(tenantId, memberId).run();
    return c.json({ ok: true });
  }
  await c.env.DB.prepare(
    `INSERT INTO member_admin_notes (tenant_id, member_id, text, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, member_id) DO UPDATE SET text = excluded.text,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).bind(tenantId, memberId, text, c.get('userId'), Date.now()).run();
  return c.json({ ok: true });
}
