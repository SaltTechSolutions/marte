import { Hono } from 'hono';

import { rolesIn } from './auth';
import { localParts, tenantTimeFrom, zonedTimeToMs } from './cancellationDeadline';
import { canSeeCheckins } from './reads5';
import type { Env, Vars } from './types';

/**
 * Front-desk door check. `resolve` answers "who is this and may they come in?" WITHOUT writing anything; recording
 * a visit stays `POST /checkins` (writes2.ts). The decision order is the one the Firebase client made
 * (apps/gymentra-mobile/src/data/firebase/checkinRepo.ts), with "today" read in the gym's own time zone.
 */
type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;
export const checkins = new Hono<App>();

/** A member re-scanned inside this window is the same visit. */
export const DUPLICATE_WINDOW_MINUTES = 60;

export type MemberRef = { memberId?: unknown; shortCode?: unknown; subject?: unknown };
export type MemberRow = { member_id: string; status: string; display_name: string | null; email: string | null; photo_url: string | null; short_code: string | null };

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Finds a member INSIDE this gym by internal id, short code, or Firebase uid (`subject`, what the member card QR
 * carries). The identity lookup is joined to this gym's memberships, so a uid that belongs to someone outside it
 * resolves to nothing: no existence leak. `undefined` = the request named none (or more than one) of them.
 */
export async function findMember(db: D1Database, tenantId: string, ref: MemberRef): Promise<MemberRow | null | undefined> {
  const named = [str(ref.memberId), str(ref.shortCode), str(ref.subject)].filter(Boolean);
  if (named.length !== 1) return undefined;
  const cols = `m.member_id, m.status, m.display_name, m.email, m.photo_url, m.short_code`;
  const memberId = str(ref.memberId), shortCode = str(ref.shortCode), subject = str(ref.subject);
  const row = memberId
    ? await db.prepare(`SELECT ${cols} FROM memberships m WHERE m.tenant_id = ? AND m.member_id = ?`).bind(tenantId, memberId).first<MemberRow>()
    : shortCode
      ? await db.prepare(`SELECT ${cols} FROM memberships m WHERE m.tenant_id = ? AND m.short_code = ?`).bind(tenantId, shortCode).first<MemberRow>()
      : await db.prepare(
        `SELECT ${cols} FROM identities i JOIN memberships m ON m.member_id = i.user_id AND m.tenant_id = ?
         WHERE i.provider = 'firebase' AND i.subject = ?`,
      ).bind(tenantId, subject).first<MemberRow>();
  return row ?? null;
}

type Pkg = { id: string; status: string; startsAt: number; endsAt: number; kind?: string; gymAccess: boolean; name: string };

const loadPackages = async (db: D1Database, tenantId: string, memberId: string): Promise<Pkg[]> => {
  const { results } = await db.prepare(
    `SELECT id, status, starts_at, ends_at, data FROM member_packages WHERE tenant_id = ? AND member_id = ? ORDER BY ends_at DESC LIMIT 200`,
  ).bind(tenantId, memberId).all<{ id: string; status: string; starts_at: number; ends_at: number; data: string }>();
  return results.map((r) => {
    const d = JSON.parse(r.data) as { kind?: string; packageName?: string; entitlements?: { gymAccess?: boolean } };
    return { id: r.id, status: r.status, startsAt: r.starts_at, endsAt: r.ends_at, kind: d.kind, gymAccess: d.entitlements?.gymAccess === true, name: d.packageName ?? '' };
  });
};
const covers = (p: Pkg, now: number) => p.kind === 'membership' && p.status === 'active' && p.gymAccess && p.startsAt <= now && p.endsAt >= now;

type Access =
  | { decision: 'ok' | 'guardian'; packageLabel: string | null }
  | { decision: 'no-package' | 'no-session-today' | 'frozen'; packageLabel: string | null };

async function resolveAccess(db: D1Database, tenantId: string, memberId: string, now: number): Promise<Access> {
  const packages = await loadPackages(db, tenantId, memberId);
  // 1. A membership package that actually covers today.
  const covering = packages.find((p) => covers(p, now));
  if (covering) return { decision: 'ok', packageLabel: covering.name };

  // 2. A booked session today is access on its own (its credit was already spent to book it).
  const t = await db.prepare(`SELECT settings FROM tenants WHERE id = ?`).bind(tenantId).first<{ settings: string }>();
  const p = localParts(now, tenantTimeFrom(t?.settings).timeZone);
  const dayStart = zonedTimeToMs(p.year, p.month, p.day, 0, 0, tenantTimeFrom(t?.settings).timeZone);
  const dayEnd = zonedTimeToMs(p.year, p.month, p.day + 1, 0, 0, tenantTimeFrom(t?.settings).timeZone);
  const session = await db.prepare(
    `SELECT 1 AS x FROM pt_sessions WHERE tenant_id = ? AND member_id = ? AND status != 'cancelled' AND starts_at >= ? AND starts_at < ? LIMIT 1`,
  ).bind(tenantId, memberId, dayStart, dayEnd).first();
  if (session) {
    const lessons = packages.find((x) => x.kind === 'lessons' && x.endsAt >= now);
    return { decision: 'ok', packageLabel: `${lessons?.name || 'Ders paketi'} · bugün randevulu` };
  }

  // 3. No session today, but a lesson credit that is still usable: the front desk decides.
  const credit = await db.prepare(
    `SELECT source_package_id FROM member_credits WHERE tenant_id = ? AND member_id = ? AND kind = 'ptLesson' AND status = 'active'
       AND total - used > 0 AND expires_at >= ? ORDER BY expires_at LIMIT 1`,
  ).bind(tenantId, memberId, now).first<{ source_package_id: string }>();
  if (credit) {
    const src = packages.find((x) => x.id === credit.source_package_id);
    return { decision: 'no-session-today', packageLabel: src?.name || 'Ders paketi' };
  }

  // 4. Frozen (any kind): a paused package still names itself in the warning.
  const frozen = packages.find((x) => x.status === 'frozen' && x.endsAt >= now);
  if (frozen) return { decision: 'frozen', packageLabel: frozen.name };

  // 5. A parent whose approved, active child holds a covering membership. Checked last on purpose: nothing is consumed.
  const { results: kids } = await db.prepare(
    `SELECT member_id, display_name, email FROM memberships WHERE tenant_id = ? AND guardian_id = ? AND guardian_status = 'approved' AND status = 'active'`,
  ).bind(tenantId, memberId).all<{ member_id: string; display_name: string | null; email: string | null }>();
  for (const kid of kids) {
    const hit = (await loadPackages(db, tenantId, kid.member_id)).find((x) => covers(x, now));
    if (hit) return { decision: 'guardian', packageLabel: `${kid.display_name || kid.email || 'Çocuğu'} velisi · ${hit.name}` };
  }

  // 6. Nothing at all.
  return { decision: 'no-package', packageLabel: null };
}

/**
 * Body: exactly one of { memberId } (internal id), { shortCode } or { subject } (Firebase uid from the card QR).
 * 200 { decision, member?, ... } — never writes:
 *   'ok' / 'guardian'                    let them in (record with accessReason = decision)
 *   'no-package' | 'no-session-today' | 'frozen'   warn: staff decides, `warnReason` repeats the decision
 *   'duplicate'                          scanned within 60 minutes: `lastCheckinAt`
 *   'inactive'                           membership is not active (pending / suspended / left / rejected)
 *   'not-found'                          nobody in THIS gym matches (a code from another gym looks exactly the same)
 * `access` is 'ok' | 'warn' (the screen's colour); `accessReason` is what POST /checkins should record.
 */
checkins.post('/tenants/:tenantId/checkins/resolve', async (c: Ctx) => {
  const tenantId = c.req.param('tenantId')!;
  const roles = await rolesIn(c.env.DB, tenantId, c.get('userId'));
  if (!roles.includes('admin') && !roles.includes('trainer') && !(await canSeeCheckins(c, tenantId)).ok) return c.json({ error: 'forbidden' }, 403);
  const body = ((await c.req.json().catch(() => null)) ?? {}) as MemberRef;
  const m = await findMember(c.env.DB, tenantId, body);
  if (m === undefined) return c.json({ error: 'memberId, shortCode or subject required' }, 400);
  if (m === null) return c.json({ decision: 'not-found' });
  const member = { id: m.member_id, name: m.display_name || m.email || m.member_id, photoUrl: m.photo_url, shortCode: m.short_code };
  if (m.status !== 'active') return c.json({ decision: 'inactive', member });

  const now = Date.now();
  const last = await c.env.DB.prepare(`SELECT max(created_at) AS at FROM checkins WHERE tenant_id = ? AND member_id = ? AND created_at >= ?`)
    .bind(tenantId, m.member_id, now - DUPLICATE_WINDOW_MINUTES * 60_000).first<{ at: number | null }>();
  if (last?.at) return c.json({ decision: 'duplicate', member, lastCheckinAt: last.at });

  const a = await resolveAccess(c.env.DB, tenantId, m.member_id, now);
  const warn = a.decision !== 'ok' && a.decision !== 'guardian';
  return c.json({
    decision: a.decision, access: warn ? 'warn' : 'ok', accessReason: a.decision, member, packageLabel: a.packageLabel,
    ...(warn ? { warnReason: a.decision } : {}),
  });
});
