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
    expect(Object.keys(busy[0]).sort()).toEqual(['durationMinutes', 'startsAt', 'status']);
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

describe('F1 reads (catalog, requests, membership rows)', () => {
  const get = async (path: string, sub: string) => call(path, { token: await sign(sub) });
  const run = (q: string, ...a: unknown[]) => db.prepare(q).bind(...a).run();
  beforeEach(async () => {
    await run(`INSERT INTO users (id, created_at) VALUES ('u-oth',1), ('u-par',1)`);
    await run(`INSERT INTO identities VALUES ('firebase','fb-oth','u-oth'), ('firebase','fb-par','u-par')`);
    await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t1','u-oth','active','["member"]',1)`);
    await run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('g1','t1','{"name":"Aylık"}')`);
    await run(`INSERT INTO promotions (id, tenant_id, data) VALUES ('pr1','t1','{"kind":"percentDiscount"}')`);
    await run(`INSERT INTO package_change_requests (id, tenant_id, member_id, data, effective_at, expires_at, status, created_at) VALUES
      ('r1','t1','u-mem','{}',1,2,'pending',1), ('r2','t1','u-oth','{}',1,2,'pending',2)`);
    await run(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES ('gl',NULL,'{"n":1}',1), ('mine','t1','{"n":2}',1)`);
    await run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await run(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES ('theirs','t2','{"n":3}',1)`);
  });
  it('packages: members; promotions: staff only', async () => {
    expect((await get('/v1/tenants/t1/packages', 'fb-mem')).status).toBe(200);
    expect((await get('/v1/tenants/t1/packages', 'fb-new')).status).toBe(403);
    expect((await get('/v1/tenants/t1/promotions', 'fb-mem')).status).toBe(403);
    expect((await get('/v1/tenants/t1/promotions', 'fb-admin')).status).toBe(200);
  });
  it('change requests: a member sees only their own, staff see all', async () => {
    const own = (await (await get('/v1/tenants/t1/package-change-requests', 'fb-mem')).json()) as { id: string }[];
    expect(own.map((x) => x.id)).toEqual(['r1']);
    const all = (await (await get('/v1/tenants/t1/package-change-requests', 'fb-admin')).json()) as unknown[];
    expect(all).toHaveLength(2);
  });
  it('program templates: global + own gyms only, never another gym', async () => {
    const ids = ((await (await get('/v1/program-templates', 'fb-mem')).json()) as { id: string }[]).map((x) => x.id).sort();
    expect(ids).toEqual(['gl', 'mine']);
  });
  it('membership row: self/staff/guardian ok; stranger gets 404', async () => {
    await run(`UPDATE memberships SET guardian_id='u-par', guardian_status='pending' WHERE member_id='u-mem'`);
    expect((await get('/v1/tenants/t1/members/u-mem', 'fb-mem')).status).toBe(200);
    expect((await get('/v1/tenants/t1/members/u-mem', 'fb-par')).status).toBe(200);
    expect((await get('/v1/tenants/t1/members/u-mem', 'fb-oth')).status).toBe(404);
    const kids = (await (await get('/v1/me/children', 'fb-par')).json()) as { guardianStatus: string }[];
    expect(kids[0].guardianStatus).toBe('pending');
  });
});

describe('F2 membership lifecycle', () => {
  const run = (q: string, ...a: unknown[]) => db.prepare(q).bind(...a).run();
  const send = async (method: string, path: string, sub: string, body?: object) =>
    call(path, { method, token: await sign(sub), body: body ? JSON.stringify(body) : undefined });
  const cnt = async () => (await db.prepare(`SELECT active_member_count m, active_admin_count a FROM tenants WHERE id='t1'`).first()) as { m: number; a: number };
  const status = async (id: string) => ((await db.prepare(`SELECT status s FROM memberships WHERE member_id = ?`).bind(id).first()) as { s: string } | null)?.s;

  it('bootstrap is idempotent and maps the subject once', async () => {
    const a = await send('POST', '/v1/me/bootstrap', 'fb-new', { displayName: 'Yeni' });
    const b = await send('POST', '/v1/me/bootstrap', 'fb-new');
    const ua = ((await a.json()) as { userId: string }).userId;
    expect(((await b.json()) as { userId: string }).userId).toBe(ua);
    expect(await db.prepare(`SELECT count(*) c FROM identities WHERE subject = 'fb-new'`).first()).toEqual({ c: 1 });
  });
  it('join → pending; approve counts a seat; duplicate join is 409', async () => {
    const { userId } = (await (await send('POST', '/v1/me/bootstrap', 'fb-new')).json()) as { userId: string };
    expect((await send('POST', '/v1/tenants/t1/join', 'fb-new')).status).toBe(201);
    expect((await send('POST', '/v1/tenants/t1/join', 'fb-new')).status).toBe(409);
    expect(await status(userId)).toBe('pending');
    expect((await send('PUT', `/v1/tenants/t1/members/${userId}/status`, 'fb-mem', { status: 'active' })).status).toBe(403);
    expect((await send('PUT', `/v1/tenants/t1/members/${userId}/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
    expect(await cnt()).toMatchObject({ m: 1 });
  });
  it('free-tier cap blocks approval and leaves no phantom seat', async () => {
    const { userId } = (await (await send('POST', '/v1/me/bootstrap', 'fb-new')).json()) as { userId: string };
    await send('POST', '/v1/tenants/t1/join', 'fb-new');
    await run(`UPDATE tenants SET active_member_count = 10`);
    expect((await send('PUT', `/v1/tenants/t1/members/${userId}/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
    expect(await status(userId)).toBe('pending');
    expect(await cnt()).toMatchObject({ m: 10 });
    await run(`UPDATE tenants SET subscription_status = 'active'`);
    expect((await send('PUT', `/v1/tenants/t1/members/${userId}/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
  });
  it('a minor needs an approved guardian before activation', async () => {
    const { userId } = (await (await send('POST', '/v1/me/bootstrap', 'fb-new')).json()) as { userId: string };
    await send('POST', '/v1/tenants/t1/join', 'fb-new');
    await run(`UPDATE memberships SET birth_date = ? WHERE member_id = ?`, Date.now() - 10 * 365 * 86_400_000, userId);
    expect((await send('PUT', `/v1/tenants/t1/members/${userId}/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
    await run(`UPDATE memberships SET guardian_status = 'approved' WHERE member_id = ?`, userId);
    expect((await send('PUT', `/v1/tenants/t1/members/${userId}/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
  });
  it('admin seat cap is 3', async () => {
    const { userId } = (await (await send('POST', '/v1/me/bootstrap', 'fb-new')).json()) as { userId: string };
    await send('POST', '/v1/tenants/t1/join', 'fb-new');
    await run(`UPDATE memberships SET roles = '["admin"]' WHERE member_id = ?`, userId);
    await run(`UPDATE tenants SET active_admin_count = 3`);
    expect((await send('PUT', `/v1/tenants/t1/members/${userId}/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
  });
  it('leave frees the seat; rejoin resets to pending member; last admin cannot leave', async () => {
    await run(`UPDATE tenants SET active_member_count = 2, active_admin_count = 1`);
    expect((await send('POST', '/v1/tenants/t1/leave', 'fb-admin')).status).toBe(409);
    expect((await send('POST', '/v1/tenants/t1/leave', 'fb-mem')).status).toBe(200);
    expect(await status('u-mem')).toBe('left');
    expect(await cnt()).toMatchObject({ m: 1 });
    expect((await send('POST', '/v1/tenants/t1/join', 'fb-mem')).status).toBe(201);
    expect(await status('u-mem')).toBe('pending');
  });
});

describe('F2 writes', () => {
  const run = (q: string, ...a: unknown[]) => db.prepare(q).bind(...a).run();
  const one = async (q: string, ...a: unknown[]) => await db.prepare(q).bind(...a).first<any>();
  const send = async (method: string, path: string, sub: string, body?: object) =>
    call(path, { method, token: await sign(sub), body: body ? JSON.stringify(body) : undefined });
  beforeEach(async () => {
    await run(`INSERT INTO users (id, created_at) VALUES ('u-trn',1)`);
    await run(`INSERT INTO identities VALUES ('firebase','fb-trn','u-trn')`);
    await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t1','u-trn','active','["trainer"]',1)`);
    await run(`UPDATE tenants SET active_member_count = 3, active_admin_count = 1`);
  });

  it('roles: admin only; no self-demotion; admin cap 3 on grant; counter follows', async () => {
    const path = '/v1/tenants/t1/members/u-trn/roles';
    expect((await send('PUT', path, 'fb-mem', { roles: ['admin'] })).status).toBe(403);
    expect((await send('PUT', path, 'fb-trn', { roles: ['admin'] })).status).toBe(403);
    expect((await send('PUT', path, 'fb-admin', { roles: ['superuser'] })).status).toBe(400);
    expect((await send('PUT', '/v1/tenants/t1/members/u-admin/roles', 'fb-admin', { roles: ['member'] })).status).toBe(409);
    await run(`UPDATE tenants SET active_admin_count = 3`);
    expect((await send('PUT', path, 'fb-admin', { roles: ['admin'] })).status).toBe(409);
    await run(`UPDATE tenants SET active_admin_count = 1`);
    expect((await send('PUT', path, 'fb-admin', { roles: ['trainer', 'admin'], permissions: ['checkin'] })).status).toBe(200);
    expect((await one(`SELECT active_admin_count c FROM tenants`)).c).toBe(2);
    expect((await send('PUT', path, 'fb-admin', { roles: ['trainer'] })).status).toBe(200);
    expect((await one(`SELECT active_admin_count c FROM tenants`)).c).toBe(1);
  });

  it('trainer note: staff write/delete, members denied, empty rejected', async () => {
    const path = '/v1/tenants/t1/members/u-mem/note';
    expect((await send('PUT', path, 'fb-mem', { text: 'x' })).status).toBe(403);
    expect((await send('PUT', path, 'fb-trn', { text: '  ' })).status).toBe(400);
    expect((await send('PUT', path, 'fb-trn', { text: 'diz' })).status).toBe(200);
    expect((await one(`SELECT text t FROM member_notes`)).t).toBe('diz');
    expect((await send('DELETE', path, 'fb-trn')).status).toBe(200);
    expect(await one(`SELECT 1 x FROM member_notes`)).toBeNull();
  });

  it('address: own, or admin for a MANAGED member only', async () => {
    const own = '/v1/tenants/t1/members/u-mem/address';
    expect((await send('PUT', own, 'fb-mem', { address: 'Ev 1' })).status).toBe(200);
    expect((await send('PUT', own, 'fb-admin', { address: 'x' })).status).toBe(403);   // real account: gym may not write it
    expect((await send('PUT', own, 'fb-trn', { address: 'x' })).status).toBe(403);
    await run(`UPDATE memberships SET managed = 1 WHERE member_id = 'u-mem'`);
    expect((await send('PUT', own, 'fb-admin', { address: 'Yeni' })).status).toBe(200);
    expect((await send('PUT', own, 'fb-admin', { address: 'a'.repeat(301) })).status).toBe(400);
    expect((await send('DELETE', own, 'fb-admin')).status).toBe(200);
  });

  it('details: member edits own, not e-mail; admin only for managed and never a minor', async () => {
    const path = '/v1/tenants/t1/members/u-mem/details';
    expect((await send('PATCH', path, 'fb-mem', { phone: '555', heightCm: 180 })).status).toBe(200);
    expect((await send('PATCH', path, 'fb-mem', { email: 'a@b.co' })).status).toBe(400);
    expect((await send('PATCH', path, 'fb-mem', { heightCm: 50 })).status).toBe(400);
    expect((await send('PATCH', path, 'fb-admin', { phone: '1' })).status).toBe(403);
    await run(`UPDATE memberships SET managed = 1 WHERE member_id = 'u-mem'`);
    expect((await send('PATCH', path, 'fb-admin', { email: 'a@b.co' })).status).toBe(200);
    expect((await send('PATCH', path, 'fb-admin', { birthDate: Date.now() - 10 * 365 * 86_400_000 })).status).toBe(400);
    expect((await send('PATCH', path, 'fb-trn', { phone: '1' })).status).toBe(403);
  });

  it('announcements: admin create/delete, scoped by gym', async () => {
    expect((await send('POST', '/v1/tenants/t1/announcements', 'fb-mem', { title: 'x', body: '' })).status).toBe(403);
    expect((await send('POST', '/v1/tenants/t1/announcements', 'fb-admin', { title: '', body: '' })).status).toBe(400);
    const res = await send('POST', '/v1/tenants/t1/announcements', 'fb-admin', { title: 'Tatil', body: 'Kapalı' });
    const { id } = (await res.json()) as { id: string };
    await run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','O',1)`);
    // an admin of ANOTHER gym cannot delete it through their own tenant path
    await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-admin','active','["admin"]',1)`);
    await send('DELETE', `/v1/tenants/t2/announcements/${id}`, 'fb-admin');
    expect(await one(`SELECT 1 x FROM announcements WHERE id = ?`, id)).not.toBeNull();
    await send('DELETE', `/v1/tenants/t1/announcements/${id}`, 'fb-admin');
    expect(await one(`SELECT 1 x FROM announcements WHERE id = ?`, id)).toBeNull();
  });

  it('renewal: one pending, withdraw, resubmit, admin handles', async () => {
    const p = '/v1/tenants/t1/renewal-request';
    expect((await send('POST', p, 'fb-mem', { note: 'yenilemek istiyorum' })).status).toBe(201);
    expect((await send('POST', p, 'fb-mem', {})).status).toBe(409);
    await send('POST', `${p}/withdraw`, 'fb-mem');
    expect((await one(`SELECT status s FROM renewal_requests`)).s).toBe('withdrawn');
    expect((await send('POST', p, 'fb-mem', {})).status).toBe(201);
    expect((await send('POST', `/v1/tenants/t1/renewal-requests/t1_u-mem/handle`, 'fb-trn')).status).toBe(403);
    await send('POST', `/v1/tenants/t1/renewal-requests/t1_u-mem/handle`, 'fb-admin');
    expect((await one(`SELECT status s FROM renewal_requests`)).s).toBe('handled');
    expect((await send('POST', p, 'fb-new', {})).status).toBe(403);
  });

  it('push token: member of the gym only, valid shape; moves to the latest signer', async () => {
    const tok = 'ExponentPushToken[abc]';
    expect((await send('PUT', '/v1/me/push-token', 'fb-mem', { token: 'nope', platform: 'ios', tenantId: 't1' })).status).toBe(400);
    expect((await send('PUT', '/v1/me/push-token', 'fb-mem', { token: tok, platform: 'web', tenantId: 't1' })).status).toBe(400);
    expect((await send('PUT', '/v1/me/push-token', 'fb-mem', { token: tok, platform: 'ios', tenantId: 'zzz' })).status).toBe(403);
    expect((await send('PUT', '/v1/me/push-token', 'fb-mem', { token: tok, platform: 'ios', tenantId: 't1' })).status).toBe(200);
    expect((await send('PUT', '/v1/me/push-token', 'fb-trn', { token: tok, platform: 'ios', tenantId: 't1' })).status).toBe(200);
    expect((await one(`SELECT user_id u FROM push_tokens`)).u).toBe('u-trn');
    await send('DELETE', `/v1/me/push-token?token=${encodeURIComponent(tok)}`, 'fb-mem');   // not the owner now
    expect(await one(`SELECT 1 x FROM push_tokens`)).not.toBeNull();
  });
});

describe('F2 writes (logs, classes, payments, calendar)', () => {
  const run = (q: string, ...a: unknown[]) => db.prepare(q).bind(...a).run();
  const one = async (q: string, ...a: unknown[]) => await db.prepare(q).bind(...a).first<any>();
  const send = async (method: string, path: string, sub: string, body?: object) =>
    call(path, { method, token: await sign(sub), body: body ? JSON.stringify(body) : undefined });
  beforeEach(async () => {
    await run(`INSERT INTO users (id, created_at) VALUES ('u-trn',1), ('u-trn2',1), ('u-par',1)`);
    await run(`INSERT INTO identities VALUES ('firebase','fb-trn','u-trn'), ('firebase','fb-trn2','u-trn2'), ('firebase','fb-par','u-par')`);
    await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, permissions, requested_at) VALUES
      ('t1','u-trn','active','["trainer"]','["checkin"]',1), ('t1','u-trn2','active','["trainer"]','[]',1)`);
  });

  it('check-in: admin or delegated permission only; reason validated; immutable', async () => {
    const p = '/v1/tenants/t1/checkins';
    expect((await send('POST', p, 'fb-mem', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(403);
    expect((await send('POST', p, 'fb-trn2', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(403);
    expect((await send('POST', p, 'fb-trn', { memberId: 'u-mem', accessReason: 'weird' })).status).toBe(400);
    expect((await send('POST', p, 'fb-trn', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(201);
    expect((await send('POST', p, 'fb-admin', { memberId: 'ghost', accessReason: 'ok' })).status).toBe(404);
  });

  it('classes: trainer owns only theirs; cannot reassign; admin any; delete scoped', async () => {
    const mk = (sub: string, o: object) => send('POST', '/v1/tenants/t1/classes', sub, { name: 'Pilates', capacity: 2, startsAt: 9e12, ...o });
    expect((await mk('fb-mem', { trainerId: 'u-mem' })).status).toBe(403);
    expect((await mk('fb-trn', { trainerId: 'u-trn2' })).status).toBe(403);       // not for someone else
    const { id } = (await (await mk('fb-trn', { trainerId: 'u-trn' })).json()) as { id: string };
    const put = (sub: string, o: object) => send('PUT', `/v1/tenants/t1/classes/${id}`, sub, { name: 'Y', capacity: 3, startsAt: 9e12, ...o });
    expect((await put('fb-trn2', { trainerId: 'u-trn' })).status).toBe(403);
    expect((await put('fb-trn', { trainerId: 'u-trn2' })).status).toBe(403);       // no hand-over
    expect((await put('fb-trn', { trainerId: 'u-trn' })).status).toBe(200);
    expect((await put('fb-admin', { trainerId: 'u-trn2' })).status).toBe(200);
    expect((await send('DELETE', `/v1/tenants/t1/classes/${id}`, 'fb-trn')).status).toBe(403); // now trn2's
    expect((await send('DELETE', `/v1/tenants/t1/classes/${id}`, 'fb-admin')).status).toBe(200);
  });

  it('booking: unlimited entitlement + capacity enforced in the insert; guardian can book a child', async () => {
    const { id } = (await (await send('POST', '/v1/tenants/t1/classes', 'fb-admin', { name: 'Y', capacity: 1, startsAt: 9e12 })).json()) as { id: string };
    const book = (sub: string, o?: object) => send('POST', `/v1/tenants/t1/classes/${id}/book`, sub, o);
    expect((await book('fb-mem')).status).toBe(409);                                   // no entitlement
    await run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
      VALUES ('mp1','t1','u-mem','g1',0,1,9999999999999,'active','{"entitlements":{"groupClasses":{"unlimited":true}}}',1),
             ('mp2','t1','u-oth','g1',0,1,9999999999999,'active','{"entitlements":{"groupClasses":{"unlimited":true}}}',1)`);
    await run(`INSERT INTO users (id, created_at) VALUES ('u-oth',1)`);
    await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t1','u-oth','active','["member"]',1)`);
    await run(`INSERT INTO identities VALUES ('firebase','fb-oth','u-oth')`);
    expect((await book('fb-mem')).status).toBe(201);
    expect((await book('fb-oth')).status).toBe(409);                                   // capacity 1
    expect((await book('fb-oth', { memberId: 'u-mem' })).status).toBe(403);            // not a guardian
    expect((await send('DELETE', `/v1/tenants/t1/classes/${id}/book`, 'fb-mem')).status).toBe(200);
    expect((await book('fb-oth')).status).toBe(201);
  });

  it('programs/templates: staff only, tenant pinned; logs and measurements: own only, validated', async () => {
    expect((await send('POST', '/v1/tenants/t1/programs', 'fb-mem', { memberId: 'u-mem' })).status).toBe(403);
    const { id } = (await (await send('POST', '/v1/tenants/t1/programs', 'fb-trn', { memberId: 'u-mem', name: 'A' })).json()) as { id: string };
    expect((await send('PUT', `/v1/tenants/t1/programs/${id}`, 'fb-trn', { name: 'B', memberId: 'u-oth' })).status).toBe(200);
    expect((await one(`SELECT member_id m FROM programs WHERE id = ?`, id)).m).toBe('u-mem');   // member pinned
    expect((await send('POST', '/v1/tenants/t1/program-templates', 'fb-mem', {})).status).toBe(403);
    expect((await send('POST', '/v1/tenants/t1/workout-logs', 'fb-mem', {})).status).toBe(400);
    const log = (await (await send('POST', '/v1/tenants/t1/workout-logs', 'fb-mem', { programId: id, exerciseLogs: [] })).json()) as { id: string };
    expect((await send('PUT', `/v1/tenants/t1/workout-logs/${log.id}`, 'fb-trn', { completedAt: 1 })).status).toBe(404);
    await send('PUT', `/v1/tenants/t1/workout-logs/${log.id}`, 'fb-mem', { completedAt: 5, programId: 'hack' });
    expect(JSON.parse((await one(`SELECT data d FROM workout_logs WHERE id = ?`, log.id)).d)).toMatchObject({ programId: id, completedAt: 5 });
    expect((await send('POST', '/v1/tenants/t1/measurements', 'fb-mem', { weightKg: 600 })).status).toBe(400);
    expect((await send('POST', '/v1/tenants/t1/measurements', 'fb-mem', { weightKg: 80 })).status).toBe(201);
  });

  it('payments: member/guardian → pending, admin → confirmed; decision once; reversal single winner', async () => {
    const pay = (sub: string, o: object) => send('POST', '/v1/tenants/t1/payments', sub, { memberId: 'u-mem', amount: 500, method: 'cash', ...o });
    expect((await pay('fb-trn', {})).status).toBe(403);
    expect((await pay('fb-mem', { amount: -1 })).status).toBe(400);
    expect((await pay('fb-mem', { kind: 'reversal', reversesPaymentId: 'x' })).status).toBe(403);
    const m = (await (await pay('fb-mem', {})).json()) as { id: string };
    expect((await one(`SELECT status s FROM payments WHERE id = ?`, m.id)).s).toBe('pending');
    expect((await send('PUT', `/v1/tenants/t1/payments/${m.id}/decision`, 'fb-mem', { status: 'confirmed' })).status).toBe(403);
    expect((await send('PUT', `/v1/tenants/t1/payments/${m.id}/decision`, 'fb-admin', { status: 'confirmed' })).status).toBe(200);
    expect((await send('PUT', `/v1/tenants/t1/payments/${m.id}/decision`, 'fb-admin', { status: 'rejected' })).status).toBe(409);
    const rev = () => pay('fb-admin', { kind: 'reversal', reversesPaymentId: m.id, reason: 'hata' });
    expect((await rev()).status).toBe(201);
    expect((await rev()).status).toBe(409);
    expect(await one(`SELECT count(*) c FROM payments`)).toEqual({ c: 2 });
    await run(`UPDATE memberships SET guardian_id='u-par', guardian_status='approved' WHERE member_id='u-mem'`);
    expect((await pay('fb-par', {})).status).toBe(201);
  });

  it('availability, calendar shares and reports', async () => {
    const av = '/v1/tenants/t1/trainers/u-trn/availability';
    expect((await send('PUT', av, 'fb-trn2', { weekly: {}, slotMinutes: 60 })).status).toBe(403);
    expect((await send('PUT', av, 'fb-trn', { weekly: { mon: [{ start: '09:00', end: '12:00' }] }, slotMinutes: 50 })).status).toBe(400);
    expect((await send('PUT', av, 'fb-trn', { weekly: { mon: [{ start: '09:00', end: '12:00' }] }, slotMinutes: 60 })).status).toBe(200);
    expect((await send('PUT', '/v1/tenants/t1/calendar-shares/u-trn2', 'fb-trn')).status).toBe(200);
    expect((await send('PUT', '/v1/tenants/t1/calendar-shares/u-mem', 'fb-trn')).status).toBe(400);   // viewer must be a trainer
    expect((await send('DELETE', '/v1/tenants/t1/calendar-shares/u-trn/u-trn2', 'fb-trn2')).status).toBe(403);
    expect((await send('DELETE', '/v1/tenants/t1/calendar-shares/u-trn/u-trn2', 'fb-admin')).status).toBe(200);
    expect((await send('POST', '/v1/tenants/t1/exercise-reports', 'fb-mem', { exerciseId: 'back-squat', reason: 'pose', note: 'x' })).status).toBe(403);
    expect((await send('POST', '/v1/tenants/t1/exercise-reports', 'fb-trn', { exerciseId: 'back-squat', reason: 'pose', note: 'x' })).status).toBe(201);
  });
});
