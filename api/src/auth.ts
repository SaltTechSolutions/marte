import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import type { Env, Role, Vars } from './types';

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let remote: ReturnType<typeof createRemoteJWKSet> | undefined;
let override: (() => JWTVerifyGetKey) | undefined;

/** Test seam only: swaps the remote JWKS for a local key set. */
export const __setKeyResolver = (f: () => JWTVerifyGetKey) => { override = f; };

type App = { Bindings: Env; Variables: Vars };

/**
 * Verifies a Firebase ID token (RS256, JWKS) and resolves the internal user.
 * Fail-closed: any problem is a 401, never an anonymous pass-through.
 */
export const requireAuth = createMiddleware<App>(async (c, next) => {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'unauthenticated' }, 401);

  const project = c.env.FIREBASE_PROJECT_ID;
  try {
    const keys = override?.() ?? (remote ??= createRemoteJWKSet(new URL(JWKS_URL)));
    const { payload } = await jwtVerify(token, keys, {
      issuer: `https://securetoken.google.com/${project}`,
      audience: project,
      algorithms: ['RS256'],
    });
    if (!payload.sub) throw new Error('no subject');
    c.set('subject', payload.sub);
  } catch {
    return c.json({ error: 'unauthenticated' }, 401);
  }

  const row = await c.env.DB.prepare(
    `SELECT user_id FROM identities WHERE provider = 'firebase' AND subject = ?`,
  ).bind(c.get('subject')).first<{ user_id: string }>();
  c.set('userId', row?.user_id ?? null);
  await next();
});

/** Roles the caller holds in a gym; empty unless the membership is active. */
export async function rolesIn(db: D1Database, tenantId: string, userId: string | null): Promise<Role[]> {
  if (!userId) return [];
  const row = await db.prepare(
    `SELECT roles FROM memberships WHERE tenant_id = ? AND member_id = ? AND status = 'active'`,
  ).bind(tenantId, userId).first<{ roles: string }>();
  return row ? (JSON.parse(row.roles) as Role[]) : [];
}

/** Router-level role gate: the tenant comes from the :tenantId path param. */
export const requireRole = (role: Role) =>
  createMiddleware<App>(async (c, next) => {
    const roles = await rolesIn(c.env.DB, c.req.param('tenantId') ?? '', c.get('userId'));
    if (!roles.includes(role)) return c.json({ error: 'forbidden' }, 403);
    await next();
  });
