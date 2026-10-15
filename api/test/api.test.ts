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

describe('F1 reads', () => {
  const get = async (path: string, sub: string) => call(path, { token: await sign(sub) });
  beforeEach(async () => {
    await db.prepare(`UPDATE tenants SET branding = '{"color":"#C8FF2E"}' WHERE id = 't1'`).run();
    await db.prepare(`INSERT INTO users (id, created_at) VALUES ('u-other', 1)`).run();
    await db.prepare(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t1','u-other','active','["member"]',1)`).run();
    await db.prepare(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
      VALUES ('c1','t1','u-mem','ptLesson','purchase','p1',10,2,1,9999999999999,'active')`).run();
    await db.prepare(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES ('k1','t1','{"name":"Pilates"}', 9999999999999)`).run();
  });
  it('tenant by code is a safe DTO', async () => {
    const res = await get('/v1/tenants/by-code/t1', 'fb-new');
    expect(await res.json()).toEqual({ id: 't1', code: 'T1', name: 'Gym', branding: { color: '#C8FF2E' } });
    expect((await get('/v1/tenants/by-code/nope', 'fb-new')).status).toBe(404);
  });
  it('classes need an active membership', async () => {
    expect((await get('/v1/tenants/t1/classes', 'fb-new')).status).toBe(403);
    const ok = (await (await get('/v1/tenants/t1/classes', 'fb-mem')).json()) as { name: string }[];
    expect(ok[0].name).toBe('Pilates');
  });
  it('credits: self and staff only, never another member', async () => {
    const own = (await (await get('/v1/tenants/t1/members/u-mem/credits', 'fb-mem')).json()) as { used: number }[];
    expect(own[0].used).toBe(2);
    expect((await get('/v1/tenants/t1/members/u-mem/credits', 'fb-admin')).status).toBe(200);
    await db.prepare(`INSERT INTO identities VALUES ('firebase','fb-other','u-other')`).run();
    expect((await get('/v1/tenants/t1/members/u-mem/credits', 'fb-other')).status).toBe(403);
  });
});

describe('F1 reads (member records)', () => {
  const get = async (path: string, sub: string) => call(path, { token: await sign(sub) });
  const run = (q: string, ...a: unknown[]) => db.prepare(q).bind(...a).run();
  beforeEach(async () => {
    await run(`INSERT INTO users (id, created_at) VALUES ('u-trn',1), ('u-par',1), ('u-oth',1)`);
    await run(`INSERT INTO identities VALUES ('firebase','fb-trn','u-trn'), ('firebase','fb-par','u-par'), ('firebase','fb-oth','u-oth')`);
    await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at, guardian_id, guardian_status) VALUES
      ('t1','u-trn','active','["trainer"]',1,NULL,NULL), ('t1','u-oth','active','["member"]',1,NULL,NULL)`);
    await run(`UPDATE memberships SET guardian_id='u-par', guardian_status='approved' WHERE member_id='u-mem'`);
    await run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES ('pay1','t1','u-mem',500,'approved','{}',1)`);
    await run(`INSERT INTO measurements (id, tenant_id, member_id, data, measured_at) VALUES ('m1','t1','u-mem','{"kg":80}',1)`);
    await run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at)
      VALUES ('s1','t1','u-trn','u-mem',9999999999999,60,'scheduled',1,1)`);
  });
  it('payments: self, admin and approved guardian; trainer and strangers denied', async () => {
    for (const [sub, code] of [['fb-mem',200],['fb-admin',200],['fb-par',200],['fb-trn',403],['fb-oth',403],['fb-new',403]] as const) {
      expect((await get('/v1/tenants/t1/members/u-mem/payments', sub)).status, sub).toBe(code);
    }
  });
  it('measurements: trainer allowed, other member denied; pending guardian denied', async () => {
    expect((await get('/v1/tenants/t1/members/u-mem/measurements', 'fb-trn')).status).toBe(200);
    expect((await get('/v1/tenants/t1/members/u-mem/measurements', 'fb-oth')).status).toBe(403);
    await db.prepare(`UPDATE memberships SET guardian_status='pending' WHERE member_id='u-mem'`).run();
    expect((await get('/v1/tenants/t1/members/u-mem/measurements', 'fb-par')).status).toBe(403);
  });
  it('trainer calendar: own, admin, share viewer; busy slots expose no identity', async () => {
    expect((await get('/v1/tenants/t1/trainers/u-trn/pt-sessions', 'fb-oth')).status).toBe(403);
    expect((await get('/v1/tenants/t1/trainers/u-trn/pt-sessions', 'fb-trn')).status).toBe(200);
    expect((await get('/v1/tenants/t1/trainers/u-trn/pt-sessions', 'fb-admin')).status).toBe(200);
    await db.prepare(`INSERT INTO calendar_shares VALUES ('t1','u-trn','u-oth',1)`).run();
    expect((await get('/v1/tenants/t1/trainers/u-trn/pt-sessions', 'fb-oth')).status).toBe(200);
    const busy = (await (await get('/v1/tenants/t1/trainers/u-trn/busy', 'fb-oth')).json()) as object[];
    expect(Object.keys(busy[0]).sort()).toEqual(['durationMinutes', 'startsAt']);
  });
  it('member list and notes are staff-only; address and admin note are admin-only', async () => {
    expect((await get('/v1/tenants/t1/members', 'fb-mem')).status).toBe(403);
    expect((await get('/v1/tenants/t1/members', 'fb-trn')).status).toBe(200);
    expect((await get('/v1/tenants/t1/members/u-mem/admin-note', 'fb-trn')).status).toBe(403);
    expect((await get('/v1/tenants/t1/members/u-mem/admin-note', 'fb-admin')).status).toBe(200);
    expect((await get('/v1/tenants/t1/members/u-mem/address', 'fb-mem')).status).toBe(200);
    expect((await get('/v1/tenants/t1/members/u-mem/address', 'fb-trn')).status).toBe(403);
  });
});
