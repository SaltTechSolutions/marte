import type { Context } from 'hono';

import type { Env, Vars } from './types';

type C = Context<{ Bindings: Env; Variables: Vars }>;

/** Mirrors backend/functions/src/managedMembers.ts; keep the two in step until cutover. */
export const FREE_MEMBER_LIMIT = 10;
const NAME_MAX = 100, PHONE_MAX = 30, EMAIL_MAX = 254, ADDRESS_MAX = 300;

export function ageOn(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())
  ) age -= 1;
  return age;
}

/** `mm` + 20 hex: no underscore, so legacy `{tenantId}_{memberId}` keys still split. */
export function newManagedMemberId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return 'mm' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function text(v: unknown, max: number): string | undefined | Error {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return new Error('invalid');
  const t = v.trim();
  if (!t) return undefined;
  return t.length > max ? new Error('too long') : t;
}

export async function createManagedMember(c: C) {
  const tenantId = c.req.param('tenantId')!;
  const d = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const name = text(d.name, NAME_MAX), phone = text(d.phone, PHONE_MAX);
  const email = text(d.email, EMAIL_MAX), address = text(d.address, ADDRESS_MAX);
  for (const v of [name, phone, email, address]) if (v instanceof Error) return c.json({ error: v.message }, 400);
  if (!name) return c.json({ error: 'name required' }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email as string)) return c.json({ error: 'bad email' }, 400);

  let birth: Date | undefined;
  if (typeof d.birthDate === 'string' && d.birthDate) {
    const parsed = new Date(`${d.birthDate}T12:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.birthDate) || Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== d.birthDate || parsed > new Date()) {
      return c.json({ error: 'bad birthDate' }, 400);
    }
    const age = ageOn(parsed, new Date());
    if (age >= 120) return c.json({ error: 'bad birthDate' }, 400);
    if (age < 18) return c.json({ error: 'minor' }, 412);
    birth = parsed;
  }

  const exists = await c.env.DB.prepare(`SELECT 1 AS x FROM tenants WHERE id = ?`).bind(tenantId).first();
  if (!exists) return c.json({ error: 'not found' }, 404);

  const memberId = newManagedMemberId();
  const now = Date.now();
  // The seat cap is enforced inside the write itself: the counter bump only
  // matches while there is room, and the membership insert only happens if that
  // bump changed a row (guard via the user row's own subselect). Two parallel
  // requests cannot both pass a stale read.
  const stmts = [
    c.env.DB.prepare(
      `UPDATE tenants SET active_member_count = active_member_count + 1
       WHERE id = ? AND (subscription_status = 'active' OR active_member_count < ?)`,
    ).bind(tenantId, FREE_MEMBER_LIMIT),
    c.env.DB.prepare(
      `INSERT INTO users (id, display_name, email, created_at)
       SELECT ?, ?, ?, ? WHERE changes() = 1`,
    ).bind(memberId, name, email ?? null, now),
    c.env.DB.prepare(
      `INSERT INTO memberships (tenant_id, member_id, status, roles, display_name, email, phone,
         birth_date, managed, created_by, requested_at, approved_at)
       SELECT ?, ?, 'active', '["member"]', ?, ?, ?, ?, 1, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)`,
    ).bind(tenantId, memberId, name, email ?? null, phone ?? null, birth?.getTime() ?? null,
      c.get('userId'), now, now, memberId),
  ];
  if (address) {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO member_addresses (tenant_id, member_id, address, updated_by, updated_at)
       SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM memberships WHERE tenant_id = ? AND member_id = ?)`,
    ).bind(tenantId, memberId, address, c.get('userId'), now, tenantId, memberId));
  }
  await c.env.DB.batch(stmts);
  const created = await c.env.DB.prepare(
    `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ?`,
  ).bind(tenantId, memberId).first();
  if (!created) return c.json({ error: 'member limit' }, 429);
  return c.json({ memberId }, 201);
}
