import { Hono } from 'hono';

import { rolesIn } from './auth';
import { abortIf, EMAIL_RE, newId, readBody, type App, type Ctx } from './guarded';

/**
 * Tenant lifecycle (F3): creation with the owner's admin membership, settings/branding edits, and the
 * private contact row. Ports firestore.rules `tenants`, `tenants/{id}/private/contact` and
 * backend/functions/src/branding.ts (logo upload itself is media, see the report).
 */
export const tenants = new Hono<App>();

/** One person may found this many gyms: the rules had no cap, but creation is open to every signed-in user. */
export const MAX_OWNED_TENANTS = 5;
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,31}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BRANDING_KEYS = ['logoUrl', 'primaryColor', 'accentColor', 'appName', 'themeMode'];
/** Fields a client must never be able to write, however it asks (rules: owner/code immutable, counters and subscription server-owned). */
const PROTECTED = ['id', 'ownerUid', 'ownerUserId', 'owner', 'code', 'subscription', 'subscriptionStatus', 'subscription_status',
  'activeMemberCount', 'activeAdminCount', 'createdAt', 'settings'];

function validBranding(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const b = v as Record<string, unknown>;
  if (Object.keys(b).some((k) => !BRANDING_KEYS.includes(k))) return null;
  if (b.primaryColor !== undefined && !(typeof b.primaryColor === 'string' && COLOR_RE.test(b.primaryColor))) return null;
  if (b.accentColor !== undefined && !(typeof b.accentColor === 'string' && COLOR_RE.test(b.accentColor))) return null;
  if (b.appName !== undefined && !(typeof b.appName === 'string' && b.appName.trim() && b.appName.length <= 60)) return null;
  // https only: this string ends up in an <Image>/<a> on every member's phone.
  if (b.logoUrl !== undefined && !(typeof b.logoUrl === 'string' && /^https:\/\/\S+$/.test(b.logoUrl) && b.logoUrl.length <= 500)) return null;
  if (b.themeMode !== undefined && !['light', 'dark', 'system'].includes(b.themeMode as string)) return null;
  return b.appName ? { ...b, appName: (b.appName as string).trim() } : b;
}

function validOpeningHours(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.entries(v as Record<string, unknown>).every(([day, w]) => {
    if (!/^[0-6]$/.test(day)) return false;
    if (w === null) return true;   // "closed that day" is an answer, distinct from an absent key
    const h = w as { open?: unknown; close?: unknown };
    return typeof w === 'object' && typeof h.open === 'string' && TIME_RE.test(h.open) && typeof h.close === 'string' && TIME_RE.test(h.close)
      && Object.keys(h).length === 2;
  });
}

// ---------------------------------------------------------------------------------------------
// Creation. Rules: creator must be ownerUid, non-empty code and name; the owner may then self-grant
// an active admin membership. Here both are ONE batch: a gym without its admin cannot exist.
// ---------------------------------------------------------------------------------------------
tenants.post('/tenants', async (c) => {
  const uid = c.get('userId');
  if (!uid) return c.json({ error: 'bootstrap required' }, 409);
  const b = await readBody(c);
  // The owner is always the caller. A body that names someone else is the rule's "ownerUid != self" refusal.
  if (b.ownerUid !== undefined && b.ownerUid !== uid && b.ownerUid !== c.get('subject')) return c.json({ error: 'owner must be you' }, 403);
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const code = typeof b.code === 'string' ? b.code.trim().toUpperCase() : '';
  if (!name || name.length > 100) return c.json({ error: 'name 1-100' }, 400);
  if (!CODE_RE.test(code)) return c.json({ error: 'code 2-32 of A-Z 0-9 -' }, 400);
  const branding = b.branding === undefined ? { appName: name } : validBranding(b.branding);
  if (!branding) return c.json({ error: 'bad branding' }, 400);

  const u = await c.env.DB.prepare(`SELECT display_name, email FROM users WHERE id = ?`).bind(uid).first<{ display_name: string | null; email: string | null }>();
  const id = newId('t');
  const now = Date.now();
  try {
    await c.env.DB.batch([
      // The owner cap lives inside the INSERT: two parallel creations cannot both slip under it.
      c.env.DB.prepare(
        `INSERT INTO tenants (id, code, name, owner_user_id, branding, settings, active_admin_count, created_at)
         SELECT ?, ?, ?, ?, ?, '{}', 0, ? WHERE (SELECT COUNT(*) FROM tenants WHERE owner_user_id = ?) < ${MAX_OWNED_TENANTS}`,
      ).bind(id, code, name, uid, JSON.stringify(branding), now, uid),
      // Conditional on the tenant row: if the cap stopped the first statement this one inserts nothing.
      c.env.DB.prepare(
        `INSERT INTO memberships (tenant_id, member_id, status, roles, display_name, email, requested_at, approved_at)
         SELECT ?, ?, 'active', '["admin"]', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM tenants WHERE id = ?)`,
      ).bind(id, uid, u?.display_name ?? null, u?.email ?? null, now, now, id),
      c.env.DB.prepare(
        `UPDATE tenants SET active_admin_count = 1 WHERE id = ? AND EXISTS (SELECT 1 FROM memberships WHERE tenant_id = ? AND member_id = ?)`,
      ).bind(id, id, uid),
      // Both-or-neither: a tenant row without its admin membership rolls the whole batch back.
      abortIf(c.env.DB,
        `EXISTS (SELECT 1 FROM tenants t WHERE t.id = ? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = t.id AND m.member_id = ?))`, id, uid),
    ]);
  } catch (e) {
    // A UNIQUE violation on code rolls the batch back; anything else is a real failure.
    const taken = await c.env.DB.prepare(`SELECT 1 AS x FROM tenants WHERE code = ?`).bind(code).first();
    if (taken) return c.json({ error: 'code taken' }, 409);
    throw e;
  }
  const made = await c.env.DB.prepare(`SELECT 1 AS x FROM tenants WHERE id = ?`).bind(id).first();
  if (!made) return c.json({ error: 'owner limit' }, 429);
  return c.json({ id, code, name }, 201);
});

// ---------------------------------------------------------------------------------------------
// Settings. Read: active members of the gym (any role) and applicants waiting on a decision.
// Write: an ACTIVE admin only (the rules also let the bare ownerUid in; that clause only existed so
// the creator could write before their membership did, which creation now does atomically).
// ---------------------------------------------------------------------------------------------
tenants.get('/tenants/:tenantId/settings', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  const m = uid ? await c.env.DB.prepare(
    `SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = ? AND status IN ('active','pending')`,
  ).bind(tenantId, uid).first<{ status: string; roles: string }>() : null;
  if (!m) return c.json({ error: 'forbidden' }, 403);
  const t = await c.env.DB.prepare(
    `SELECT id, code, name, owner_user_id, branding, settings, subscription_status, subscription_plan, subscription_platform,
            subscription_expires_at, active_member_count, active_admin_count FROM tenants WHERE id = ?`,
  ).bind(tenantId).first<any>();
  if (!t) return c.json({ error: 'not found' }, 404);
  const settings = JSON.parse(t.settings) as Record<string, unknown>;
  const isAdmin = m.status === 'active' && (JSON.parse(m.roles) as string[]).includes('admin');
  return c.json({
    id: t.id, code: t.code, name: t.name, branding: JSON.parse(t.branding),
    address: settings.address ?? null, openingHours: settings.openingHours ?? null, cancellationHours: settings.cancellationHours ?? null,
    subscription: t.subscription_status ? {
      status: t.subscription_status, plan: t.subscription_plan, platform: t.subscription_platform, expiresAt: t.subscription_expires_at,
    } : null,
    // Seat tallies and the owner are for the people who manage the gym.
    ...(isAdmin ? { ownerUserId: t.owner_user_id, activeMemberCount: t.active_member_count, activeAdminCount: t.active_admin_count } : {}),
  });
});

tenants.patch('/tenants/:tenantId/settings', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!(await rolesIn(c.env.DB, tenantId, c.get('userId'))).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const b = await readBody(c);
  const keys = Object.keys(b);
  if (!keys.length) return c.json({ error: 'nothing to change' }, 400);
  // ownerUid/code stay immutable and the subscription / seat tallies server-owned, even for an admin.
  if (keys.some((k) => PROTECTED.includes(k))) return c.json({ error: 'read-only field' }, 403);
  if (keys.some((k) => !['name', 'address', 'branding', 'openingHours', 'cancellationHours'].includes(k))) return c.json({ error: 'unknown field' }, 400);

  const sets: string[] = [], vals: unknown[] = [];
  let settingsExpr = 'settings';
  const settingsVals: unknown[] = [];
  if ('name' in b) {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.trim().length > 100) return c.json({ error: 'name 1-100' }, 400);
    sets.push('name = ?'); vals.push(b.name.trim());
  }
  if ('branding' in b) {
    const br = validBranding(b.branding);
    if (!br) return c.json({ error: 'bad branding' }, 400);
    sets.push('branding = ?'); vals.push(JSON.stringify(br));
  }
  if ('address' in b) {
    // Clearing is a real intent: empty/null removes the key instead of being skipped.
    if (b.address !== null && typeof b.address !== 'string') return c.json({ error: 'address' }, 400);
    const a = typeof b.address === 'string' ? b.address.trim() : '';
    if (a.length > 300) return c.json({ error: 'address <= 300' }, 400);
    if (a) { settingsExpr = `json_set(${settingsExpr}, '$.address', ?)`; settingsVals.push(a); }
    else settingsExpr = `json_remove(${settingsExpr}, '$.address')`;
  }
  if ('openingHours' in b) {
    if (b.openingHours === null) settingsExpr = `json_remove(${settingsExpr}, '$.openingHours')`;
    else if (!validOpeningHours(b.openingHours)) return c.json({ error: 'bad openingHours' }, 400);
    else { settingsExpr = `json_set(${settingsExpr}, '$.openingHours', json(?))`; settingsVals.push(JSON.stringify(b.openingHours)); }
  }
  if ('cancellationHours' in b) {
    if (!Number.isInteger(b.cancellationHours) || (b.cancellationHours as number) < 0 || (b.cancellationHours as number) > 720) return c.json({ error: 'cancellationHours 0-720' }, 400);
    settingsExpr = `json_set(${settingsExpr}, '$.cancellationHours', ?)`; settingsVals.push(b.cancellationHours);
  }
  if (settingsExpr !== 'settings') { sets.push(`settings = ${settingsExpr}`); vals.push(...settingsVals); }
  // The name lives only here: memberships carry no denormalised gym name in D1, so there is no fan-out
  // to do (Firebase needed syncTenantNameToMemberships for that).
  const res = await c.env.DB.prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ? RETURNING id`).bind(...vals, tenantId).first();
  return res ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});

// ---------------------------------------------------------------------------------------------
// Private contact (tenants/{id}/private/contact). Readable by active members and by an applicant
// waiting on a decision IN THAT GYM (PER-1: applying is what grants it, signing up is not). Admin writes.
// ---------------------------------------------------------------------------------------------
async function canReadContact(c: Ctx): Promise<boolean> {
  const uid = c.get('userId');
  if (!uid) return false;
  return !!(await c.env.DB.prepare(
    `SELECT 1 AS x FROM memberships WHERE tenant_id = ? AND member_id = ? AND status IN ('active','pending')`,
  ).bind(c.req.param('tenantId'), uid).first());
}

tenants.get('/tenants/:tenantId/contact', async (c) => {
  if (!(await canReadContact(c))) return c.json({ error: 'forbidden' }, 403);
  const row = await c.env.DB.prepare(`SELECT data FROM tenant_contacts WHERE tenant_id = ?`).bind(c.req.param('tenantId')).first<{ data: string }>();
  // No row is "no contact details yet", not an error: the settings screen starts empty.
  const d = (row ? JSON.parse(row.data) : {}) as Record<string, unknown>;
  return c.json({ phone: d.phone ?? null, email: d.email ?? null, updatedAt: d.updatedAt ?? null });
});

tenants.put('/tenants/:tenantId/contact', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!(await rolesIn(c.env.DB, tenantId, c.get('userId'))).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const b = await readBody(c);
  if (Object.keys(b).some((k) => k !== 'phone' && k !== 'email')) return c.json({ error: 'unknown field' }, 400);
  const clean = (v: unknown): string | null | Error => {
    if (v === undefined || v === null) return null;
    return typeof v === 'string' ? v.trim() || null : new Error('type');
  };
  const phone = clean(b.phone), email = clean(b.email);
  if (phone instanceof Error || email instanceof Error) return c.json({ error: 'phone/email must be strings' }, 400);
  if (phone && phone.length > 30) return c.json({ error: 'phone <= 30' }, 400);
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) return c.json({ error: 'bad email' }, 400);
  // Full replacement: an empty field removes the stored value (as the app's deleteField() did).
  const data = { ...(phone ? { phone } : {}), ...(email ? { email } : {}), updatedAt: Date.now() };
  const res = await c.env.DB.prepare(
    `INSERT INTO tenant_contacts (tenant_id, data) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM tenants WHERE id = ?)
     ON CONFLICT (tenant_id) DO UPDATE SET data = excluded.data RETURNING tenant_id`,
  ).bind(tenantId, JSON.stringify(data), tenantId).first();
  return res ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});
