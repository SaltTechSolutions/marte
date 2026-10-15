import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import app from '../src/index';
import { makeDb } from './d1shim';

const PROJECT = 'proj-test';
let db: D1Database;
let sign: (sub: string, over?: { aud?: string }) => Promise<string>;
let keys: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1' };
  keys = createLocalJWKSet({ keys: [jwk] });
  sign = (sub, over) =>
    new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(sub)
      .setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(over?.aud ?? PROJECT)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
});

async function seed() {
  const run = (q: string, ...a: unknown[]) => db.prepare(q).bind(...a).run();
  await run(`INSERT INTO users (id, display_name, created_at) VALUES ('u-admin','A',1), ('u-mem','M',1)`);
  await run(`INSERT INTO identities VALUES ('firebase','fb-admin','u-admin'), ('firebase','fb-mem','u-mem')`);
  await run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t1','T1','Gym',1)`);
  await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES
    ('t1','u-admin','active','["admin"]',1), ('t1','u-mem','active','["member"]',1)`);
}

const call = async (path: string, init: RequestInit & { token?: string } = {}) => {
  const { token, ...rest } = init;
  const req = new Request(`http://x${path}`, {
    ...rest,
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  // keyResolver is injected through app.fetch's env-less variable seam below.
  return app.fetch(req, { DB: db, FIREBASE_PROJECT_ID: PROJECT });
};

beforeEach(async () => { db = makeDb(); await seed(); });

// The real JWKS is remote; tests swap it via a header-free seam: a global override.
import { __setKeyResolver } from '../src/auth';
beforeAll(() => __setKeyResolver(() => keys));

describe('auth', () => {
  it('rejects missing, wrong-audience and garbage tokens', async () => {
    expect((await call('/v1/me')).status).toBe(401);
    expect((await call('/v1/me', { token: 'junk' })).status).toBe(401);
    expect((await call('/v1/me', { token: await sign('fb-admin', { aud: 'other' }) })).status).toBe(401);
  });
  it('/v1/me maps the provider subject to the internal user', async () => {
    const res = await call('/v1/me', { token: await sign('fb-mem') });
    expect(await res.json()).toEqual({ userId: 'u-mem', memberships: [{ tenantId: 't1', roles: ['member'], status: 'active' }] });
  });
  it('an unmapped subject is authenticated but has no memberships', async () => {
    const res = await call('/v1/me', { token: await sign('fb-new') });
    expect(await res.json()).toEqual({ userId: null, memberships: [] });
  });
});

describe('managed members', () => {
  const body = (o: object) => JSON.stringify({ name: 'Ayşe', ...o });
  const post = async (sub: string, o: object) =>
    call('/v1/tenants/t1/members/managed', { method: 'POST', body: body(o), token: await sign(sub) });

  it('is admin only', async () => {
    expect((await post('fb-mem', {})).status).toBe(403);
    expect((await post('fb-new', {})).status).toBe(403);
  });
  it('creates an account-less member, address and seat count in one go', async () => {
    const res = await post('fb-admin', { phone: '555', address: 'Cad. 1', birthDate: '1990-01-01' });
    expect(res.status).toBe(201);
    const { memberId } = (await res.json()) as { memberId: string };
    expect(memberId).toMatch(/^mm[0-9a-f]{20}$/);
    const m = await db.prepare(`SELECT managed, created_by, status FROM memberships WHERE member_id = ?`).bind(memberId).first();
    expect(m).toMatchObject({ managed: 1, created_by: 'u-admin', status: 'active' });
    expect(await db.prepare(`SELECT 1 x FROM identities WHERE user_id = ?`).bind(memberId).first()).toBeNull();
    expect(await db.prepare(`SELECT display_name n FROM users WHERE id = ?`).bind(memberId).first()).toEqual({ n: 'Ayşe' });
    expect(await db.prepare(`SELECT address FROM member_addresses WHERE member_id = ?`).bind(memberId).first()).toEqual({ address: 'Cad. 1' });
    expect(await db.prepare(`SELECT active_member_count c FROM tenants WHERE id='t1'`).first()).toEqual({ c: 1 });
  });
  it('rejects minors, bad input and the free-tier cap', async () => {
    expect((await post('fb-admin', { birthDate: '2015-01-01' })).status).toBe(412);
    expect((await post('fb-admin', { name: '' })).status).toBe(400);
    expect((await post('fb-admin', { email: 'nope' })).status).toBe(400);
    await db.prepare(`UPDATE tenants SET active_member_count = 10`).run();
    expect((await post('fb-admin', {})).status).toBe(429);
    expect(await db.prepare(`SELECT count(*) c FROM memberships WHERE managed = 1`).first()).toEqual({ c: 0 });
  });
  it('the cap holds under parallel requests (one seat left, two callers)', async () => {
    await db.prepare(`UPDATE tenants SET active_member_count = 9`).run();
    const [a, b] = await Promise.all([post('fb-admin', {}), post('fb-admin', {})]);
    expect([a.status, b.status].sort()).toEqual([201, 429]);
    expect(await db.prepare(`SELECT active_member_count c FROM tenants`).first()).toEqual({ c: 10 });
  });
});

describe('admin note', () => {
  const put = async (sub: string, text: string, member = 'u-mem') =>
    call(`/v1/tenants/t1/members/${member}/admin-note`, { method: 'PUT', body: JSON.stringify({ text }), token: await sign(sub) });

  it('is admin only, stored per gym, and an empty note deletes the row', async () => {
    expect((await put('fb-mem', 'x')).status).toBe(403);
    expect((await put('fb-admin', 'özel not')).status).toBe(200);
    expect(await db.prepare(`SELECT text FROM member_admin_notes`).first()).toEqual({ text: 'özel not' });
    expect((await put('fb-admin', '  ')).status).toBe(200);
    expect(await db.prepare(`SELECT 1 x FROM member_admin_notes`).first()).toBeNull();
    expect((await put('fb-admin', 'x', 'ghost')).status).toBe(404);
    const bad = await call('/v1/tenants/t1/members/u-mem/admin-note', { method: 'PUT', body: JSON.stringify({ text: 123 }), token: await sign('fb-admin') });
    expect(bad.status).toBe(400);
  });
});
