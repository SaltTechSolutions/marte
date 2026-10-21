import type { Context } from 'hono';

import type { Env, Vars } from './types';

export type App = { Bindings: Env; Variables: Vars };
export type Ctx = Context<App>;

export const newId = (p: string) =>
  p + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Parsed JSON object body; anything else (array, null, bad JSON) is an empty object. */
export async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => null);
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/**
 * Aborts the WHOLE `db.batch()` when `violation` (a SQL boolean expression) is true.
 * A conditional statement that matches 0 rows is not an error, so an invariant that must stop every
 * other statement of the batch (last admin, all-or-nothing payments) cannot rely on one. This inserts
 * a 0 into `txn_abort_guard` (CHECK ok = 1): the batch throws and D1 rolls it back.
 */
export function abortIf(db: D1Database, violation: string, ...binds: unknown[]): D1PreparedStatement {
  return db.prepare(`INSERT INTO txn_abort_guard (ok) SELECT 0 WHERE ${violation}`).bind(...binds);
}

/**
 * Outbox row that is only written when the statement right before it changed a row. Put it directly
 * after the conditional UPDATE/INSERT it announces: a lost race (0 rows) then sends nothing.
 * Same columns and payload shape as `outboxStatement` in outbox.ts.
 */
export function outboxIfChanged(
  db: D1Database,
  kind: 'push' | 'email',
  payload: Record<string, unknown>,
  dedupeKey?: string,
): D1PreparedStatement {
  const now = Date.now();
  return db.prepare(
    `INSERT OR IGNORE INTO outbox (id, kind, payload, dedupe_key, next_attempt_at, created_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
  ).bind(newId('ob'), kind, JSON.stringify(payload), dedupeKey ?? null, now, now);
}

/**
 * Outbox row written only while `condition` (a SQL boolean over the state this batch just wrote) holds.
 * Unlike `outboxIfChanged` it does not depend on what statement ran before it, so it can close a batch
 * whose earlier statements (seat counters) already use `changes()`.
 */
export function outboxWhere(
  db: D1Database,
  kind: 'push' | 'email',
  payload: Record<string, unknown>,
  dedupeKey: string,
  condition: string,
  ...binds: unknown[]
): D1PreparedStatement {
  const now = Date.now();
  return db.prepare(
    `INSERT OR IGNORE INTO outbox (id, kind, payload, dedupe_key, next_attempt_at, created_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE ${condition}`,
  ).bind(newId('ob'), kind, JSON.stringify(payload), dedupeKey, now, now, ...binds);
}

/** Active admins of a gym, optionally without one person (the author of the change already knows). */
export async function activeAdminIds(db: D1Database, tenantId: string, exceptUserId?: string | null): Promise<string[]> {
  const { results } = await db.prepare(
    `SELECT member_id FROM memberships WHERE tenant_id = ? AND status = 'active' AND member_id != ?
       AND EXISTS (SELECT 1 FROM json_each(memberships.roles) WHERE value = 'admin')`,
  ).bind(tenantId, exceptUserId ?? '').all<{ member_id: string }>();
  return results.map((r) => r.member_id);
}

/** Display name for a user, falling back to e-mail (as the Firebase pushes did). */
export async function nameOf(db: D1Database, userId: string): Promise<string | null> {
  const u = await db.prepare(`SELECT display_name, email FROM users WHERE id = ?`).bind(userId).first<{ display_name: string | null; email: string | null }>();
  return u?.display_name || u?.email || null;
}
