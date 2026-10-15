import { Hono } from 'hono';

import { rolesIn } from './auth';
import { ADMIN_LIMIT } from './membership';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const writes = new Hono<App>();

const isStaff = (r: string[]) => r.includes('admin') || r.includes('trainer');
const rolesOf = (c: Ctx) => rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
const body = async (c: Ctx) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
const bad = (c: Ctx, m: string) => c.json({ error: m }, 400);
const forbidden = (c: Ctx) => c.json({ error: 'forbidden' }, 403);

const ROLES = ['member', 'trainer', 'admin'];
const PERMISSIONS = ['checkin'];

/** Admin assigns roles / delegated permissions (rules: only roles+permissions change; cap on GRANTING admin). */
writes.put('/tenants/:tenantId/members/:memberId/roles', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  if (!(await rolesOf(c)).includes('admin')) return forbidden(c);
  const b = await body(c);
  const roles = b.roles, perms = b.permissions ?? [];
  const okList = (v: unknown, allowed: string[]) => Array.isArray(v) && v.every((x) => allowed.includes(x as string)) && new Set(v).size === v.length;
  if (!okList(roles, ROLES) || (roles as string[]).length === 0 || !okList(perms, PERMISSIONS)) return bad(c, 'bad roles');
  const next = roles as string[];
  const m = await c.env.DB.prepare(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = ?`)
    .bind(tenantId, memberId).first<{ status: string; roles: string }>();
  if (!m || m.status === 'left') return c.json({ error: 'not found' }, 404);
  const had = (JSON.parse(m.roles) as string[]).includes('admin');
  const will = next.includes('admin');
  // Never strip your own admin seat: the last-admin count cannot be arbitrated mid-edit.
  if (memberId === c.get('userId') && !will) return c.json({ error: 'cannot demote yourself' }, 409);
  const counts = m.status === 'active';
  const grant = !had && will, revoke = had && !will;
  const stmts = [
    c.env.DB.prepare(
      `UPDATE memberships SET roles = ?, permissions = ? WHERE tenant_id = ? AND member_id = ? AND status != 'left'
         ${grant && counts ? `AND (SELECT active_admin_count FROM tenants WHERE id = ?) < ${ADMIN_LIMIT}` : ''}`,
    ).bind(JSON.stringify(next), JSON.stringify(perms), tenantId, memberId, ...(grant && counts ? [tenantId] : [])),
  ];
  if (counts && (grant || revoke)) {
    stmts.push(c.env.DB.prepare(
      `UPDATE tenants SET active_admin_count = MAX(active_admin_count + ?, 0) WHERE id = ? AND changes() = 1`,
    ).bind(grant ? 1 : -1, tenantId));
  }
  await c.env.DB.batch(stmts);
  const after = await c.env.DB.prepare(`SELECT roles FROM memberships WHERE tenant_id = ? AND member_id = ?`)
    .bind(tenantId, memberId).first<{ roles: string }>();
  if (after?.roles !== JSON.stringify(next)) return c.json({ error: 'admin limit' }, 409);
  return c.json({ roles: next, permissions: perms });
});

// ---- trainer note: staff write, empty is a DELETE ----
writes.put('/tenants/:tenantId/members/:memberId/note', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  const text = (await body(c)).text;
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) return bad(c, 'text 1-2000');
  const m = await c.env.DB.prepare(`SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, memberId).first();
  if (!m) return c.json({ error: 'not found' }, 404);
  const u = await c.env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`).bind(c.get('userId')).first<any>();
  await c.env.DB.prepare(
    `INSERT INTO member_notes (tenant_id, member_id, text, updated_by, updated_by_name, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, member_id) DO UPDATE SET text = excluded.text, updated_by = excluded.updated_by,
       updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at`,
  ).bind(tenantId, memberId, text.trim(), c.get('userId'), u?.display_name ?? null, Date.now()).run();
  return c.json({ ok: true });
});
writes.delete('/tenants/:tenantId/members/:memberId/note', async (c) => {
  if (!isStaff(await rolesOf(c))) return forbidden(c);
  await c.env.DB.prepare(`DELETE FROM member_notes WHERE tenant_id = ? AND member_id = ?`).bind(c.req.param('tenantId'), c.req.param('memberId')).run();
  return c.json({ ok: true });
});

// ---- address: the member (while in the gym) or an admin FOR A MANAGED member ----
async function addressAllowed(c: Ctx): Promise<boolean> {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const r = await rolesOf(c);
  if (c.get('userId') === memberId && r.length > 0) return true;
  if (!r.includes('admin')) return false;
  const m = await c.env.DB.prepare(`SELECT managed FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, memberId).first<any>();
  return m?.managed === 1;
}
writes.put('/tenants/:tenantId/members/:memberId/address', async (c) => {
  if (!(await addressAllowed(c))) return forbidden(c);
  const address = (await body(c)).address;
  if (typeof address !== 'string' || !address.trim() || address.trim().length > 300) return bad(c, 'address 1-300');
  await c.env.DB.prepare(
    `INSERT INTO member_addresses (tenant_id, member_id, address, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, member_id) DO UPDATE SET address = excluded.address, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).bind(c.req.param('tenantId'), c.req.param('memberId'), address.trim(), c.get('userId'), Date.now()).run();
  return c.json({ ok: true });
});
writes.delete('/tenants/:tenantId/members/:memberId/address', async (c) => {
  if (!(await addressAllowed(c))) return forbidden(c);
  await c.env.DB.prepare(`DELETE FROM member_addresses WHERE tenant_id = ? AND member_id = ?`).bind(c.req.param('tenantId'), c.req.param('memberId')).run();
  return c.json({ ok: true });
});

// ---- own / managed details ----
const DETAIL_FIELDS: Record<string, string> = { displayName: 'display_name', phone: 'phone', birthDate: 'birth_date', heightCm: 'height_cm', photoUrl: 'photo_url', email: 'email' };
/**
 * A member edits their own name/phone/birth date/height/photo; an admin edits a
 * MANAGED member's (plus e-mail) and never makes them a minor. Email on a real
 * account belongs to the provider, so the member path does not accept it.
 */
writes.patch('/tenants/:tenantId/members/:memberId/details', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const memberId = c.req.param('memberId')!;
  const self = c.get('userId') === memberId;
  const r = await rolesOf(c);
  const m = await c.env.DB.prepare(`SELECT managed FROM memberships WHERE tenant_id = ? AND member_id = ?`).bind(tenantId, memberId).first<any>();
  if (!m) return c.json({ error: 'not found' }, 404);
  const asAdmin = !self && r.includes('admin') && m.managed === 1;
  if (!self && !asAdmin) return forbidden(c);
  const b = await body(c);
  const keys = Object.keys(b);
  if (!keys.length || keys.some((k) => !(k in DETAIL_FIELDS) || (k === 'email' && !asAdmin))) return bad(c, 'bad fields');

  const sets: string[] = [], vals: unknown[] = [];
  for (const k of keys) {
    const v = b[k];
    if (k === 'displayName' && !(typeof v === 'string' && v.trim() && v.trim().length <= 100)) return bad(c, 'displayName');
    if (k === 'phone' && !(typeof v === 'string' && v.length <= 30)) return bad(c, 'phone');
    if (k === 'email' && !(typeof v === 'string' && v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) return bad(c, 'email');
    if (k === 'heightCm' && !(typeof v === 'number' && v >= 100 && v <= 250)) return bad(c, 'heightCm');
    if (k === 'birthDate') {
      if (typeof v !== 'number' || v > Date.now()) return bad(c, 'birthDate');
      if (asAdmin && v + 6575 * 86_400_000 > Date.now()) return bad(c, 'minor');
    }
    sets.push(`${DETAIL_FIELDS[k]} = ?`);
    vals.push(typeof v === 'string' ? v.trim() : v);
  }
  await c.env.DB.prepare(`UPDATE memberships SET ${sets.join(', ')} WHERE tenant_id = ? AND member_id = ?`).bind(...vals, tenantId, memberId).run();
  return c.json({ ok: true });
});

// ---- announcements ----
writes.post('/tenants/:tenantId/announcements', async (c) => {
  if (!(await rolesOf(c)).includes('admin')) return forbidden(c);
  const b = await body(c);
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const text = typeof b.body === 'string' ? b.body : '';
  if (!title || title.length > 80 || text.length > 600) return bad(c, 'title 1-80, body <= 600');
  const now = Date.now();
  const expires = typeof b.expiresAt === 'number' ? b.expiresAt : now + 14 * 86_400_000;
  const id = 'a' + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const u = await c.env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`).bind(c.get('userId')).first<any>();
  await c.env.DB.prepare(
    `INSERT INTO announcements (id, tenant_id, title, body, created_by, created_by_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, c.req.param('tenantId'), title, text, c.get('userId'), u?.display_name ?? null, now, expires).run();
  return c.json({ id }, 201);
});
writes.delete('/tenants/:tenantId/announcements/:id', async (c) => {
  if (!(await rolesOf(c)).includes('admin')) return forbidden(c);
  // Scoped by tenant: an admin of gym A cannot delete gym B's announcement by id.
  await c.env.DB.prepare(`DELETE FROM announcements WHERE id = ? AND tenant_id = ?`).bind(c.req.param('id'), c.req.param('tenantId')).run();
  return c.json({ ok: true });
});

// ---- renewal requests: deterministic id (tenant_member), one pending per member ----
writes.post('/tenants/:tenantId/renewal-request', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  if (!uid || !(await rolesOf(c)).length) return forbidden(c);
  const note = (await body(c)).note;
  if (note !== undefined && (typeof note !== 'string' || note.length > 300)) return bad(c, 'note <= 300');
  const u = await c.env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`).bind(uid).first<any>();
  const id = `${tenantId}_${uid}`;
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO renewal_requests (id, tenant_id, member_id, member_name, status, note, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)
     ON CONFLICT (id) DO UPDATE SET status = 'pending', note = excluded.note, created_at = excluded.created_at, handled_at = NULL, handled_by = NULL
     WHERE renewal_requests.status != 'pending'`,
  ).bind(id, tenantId, uid, u?.display_name ?? null, typeof note === 'string' ? note : null, now).run();
  const row = await c.env.DB.prepare(`SELECT created_at FROM renewal_requests WHERE id = ?`).bind(id).first<any>();
  return row?.created_at === now ? c.json({ id }, 201) : c.json({ error: 'already pending' }, 409);
});
writes.post('/tenants/:tenantId/renewal-request/withdraw', async (c) => {
  const uid = c.get('userId');
  if (!uid) return forbidden(c);
  const res = await c.env.DB.prepare(`UPDATE renewal_requests SET status = 'withdrawn' WHERE id = ? AND status = 'pending'`)
    .bind(`${c.req.param('tenantId')}_${uid}`).run() as unknown as { meta?: { changes: number } };
  return c.json({ ok: true });
});
writes.post('/tenants/:tenantId/renewal-requests/:id/handle', async (c) => {
  if (!(await rolesOf(c)).includes('admin')) return forbidden(c);
  await c.env.DB.prepare(
    `UPDATE renewal_requests SET status = 'handled', handled_at = ?, handled_by = ? WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
  ).bind(Date.now(), c.get('userId'), c.req.param('id'), c.req.param('tenantId')).run();
  return c.json({ ok: true });
});

// ---- push token: a token belongs to a DEVICE, so it moves to whoever signs in on it ----
writes.put('/me/push-token', async (c) => {
  const uid = c.get('userId');
  if (!uid) return c.json({ error: 'bootstrap required' }, 409);
  const b = await body(c);
  const token = b.token, platform = b.platform, tenantId = b.tenantId;
  if (typeof token !== 'string' || !/^Expo(nent)?PushToken\[.*\]$/.test(token) || token.length > 200) return bad(c, 'token');
  if (platform !== 'ios' && platform !== 'android') return bad(c, 'platform');
  if (typeof tenantId !== 'string' || !(await rolesIn(c.env.DB, tenantId, uid)).length) return forbidden(c);
  await c.env.DB.prepare(
    `INSERT INTO push_tokens (token, user_id, tenant_id, platform, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, tenant_id = excluded.tenant_id, platform = excluded.platform, updated_at = excluded.updated_at`,
  ).bind(token, uid, tenantId, platform, Date.now()).run();
  return c.json({ ok: true });
});
writes.delete('/me/push-token', async (c) => {
  const token = c.req.query('token');
  if (c.get('userId') && token) {
    await c.env.DB.prepare(`DELETE FROM push_tokens WHERE token = ? AND user_id = ?`).bind(token, c.get('userId')).run();
  }
  return c.json({ ok: true });
});
