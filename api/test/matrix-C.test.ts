import { describe, expect, it, vi } from 'vitest';

// Each test builds a fresh harness (RSA keygen + schema); give it room on a loaded machine.
vi.setConfig({ testTimeout: 60_000 });

import { harness } from './helpers';

const DAY = 86_400_000;
const T1 = '/v1/tenants/t1';

describe('matrix C: role model', () => {
  it('[L2048] owner who also coaches holds both roles; admin surface (check-in) works, trainer surface readable', async () => {
    const h = await harness();
    await h.addUser('u-oc', ['admin', 'trainer']);
    const me = (await (await h.send('GET', '/v1/me', 'fb-oc')).json()) as any;
    expect(me.memberships[0].roles).toEqual(['admin', 'trainer']);
    expect((await h.send('POST', `${T1}/checkins`, 'fb-oc', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(201);
    expect((await h.send('GET', `${T1}/trainers/u-oc/pt-sessions`, 'fb-oc')).status).toBe(200);
  });

  it('[L2067] a plain trainer cannot check members in', async () => {
    const h = await harness();
    await h.addUser('u-t', ['trainer']);
    expect((await h.send('POST', `${T1}/checkins`, 'fb-t', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(403);
  });

  it('[L2075] a trainer with the checkin permission can check in, but is still no admin (payments closed)', async () => {
    const h = await harness();
    await h.addUser('u-fd', ['trainer'], { permissions: ['checkin'] });
    expect((await h.send('POST', `${T1}/checkins`, 'fb-fd', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(201);
    expect((await h.send('POST', `${T1}/payments`, 'fb-fd', { memberId: 'u-mem', amount: 100, method: 'cash' })).status).toBe(403);
    expect((await h.send('PUT', `${T1}/members/u-mem/roles`, 'fb-fd', { roles: ['admin'] })).status).toBe(403);
  });

  it('[L2095] a trainer cannot grant themselves the checkin permission', async () => {
    const h = await harness();
    await h.addUser('u-s', ['trainer']);
    expect((await h.send('PUT', `${T1}/members/u-s/roles`, 'fb-s', { roles: ['trainer'], permissions: ['checkin'] })).status).toBe(403);
    expect((await h.one(`SELECT permissions p FROM memberships WHERE member_id = 'u-s'`)).p).toBe('[]');
  });

  it('[L2103] an admin can assign roles and permissions to someone else', async () => {
    const h = await harness();
    await h.addUser('u-st', ['trainer']);
    expect((await h.send('PUT', `${T1}/members/u-st/roles`, 'fb-admin', { roles: ['trainer'], permissions: ['checkin'] })).status).toBe(200);
    expect((await h.send('PUT', `${T1}/members/u-st/roles`, 'fb-admin', { roles: ['trainer', 'admin'], permissions: ['checkin'] })).status).toBe(200);
    const row = await h.one(`SELECT roles r, permissions p FROM memberships WHERE member_id = 'u-st'`);
    expect(JSON.parse(row.r)).toEqual(['trainer', 'admin']);
    expect(JSON.parse(row.p)).toEqual(['checkin']);
  });

  it('[L2116] an admin cannot strip their own admin role; keeping admin is fine', async () => {
    const h = await harness();
    expect((await h.send('PUT', `${T1}/members/u-admin/roles`, 'fb-admin', { roles: ['trainer'] })).status).toBe(409);
    expect(JSON.parse((await h.one(`SELECT roles r FROM memberships WHERE member_id = 'u-admin'`)).r)).toEqual(['admin']);
    expect((await h.send('PUT', `${T1}/members/u-admin/roles`, 'fb-admin', { roles: ['admin'] })).status).toBe(200);
  });

  it('[L2127] permissions do not leak across gyms', async () => {
    const h = await harness();
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-v', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, permissions, requested_at) VALUES ('t2','u-v','active','["trainer"]','["checkin"]',1)`);
    expect((await h.send('POST', `${T1}/checkins`, 'fb-v', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(403);
    expect((await h.send('POST', `/v1/tenants/t2/checkins`, 'fb-v', { memberId: 'u-v', accessReason: 'ok' })).status).toBe(201);
  });

  it('[L2135] a suspended membership grants nothing, whatever its roles say', async () => {
    const h = await harness();
    await h.addUser('u-sa', ['admin'], { permissions: ['checkin'], status: 'suspended' });
    expect((await h.send('POST', `${T1}/checkins`, 'fb-sa', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(403);
    expect((await h.send('PUT', `${T1}/members/u-mem/roles`, 'fb-sa', { roles: ['trainer'] })).status).toBe(403);
    expect((await h.send('GET', `${T1}/classes`, 'fb-sa')).status).toBe(403);
  });
});

describe('matrix C: leaving a gym', () => {
  it('[L2157] a member can end their own membership', async () => {
    const h = await harness();
    expect((await h.send('POST', `${T1}/leave`, 'fb-mem')).status).toBe(200);
    const row = await h.one(`SELECT status s, left_at l FROM memberships WHERE member_id = 'u-mem'`);
    expect(row.s).toBe('left');
    expect(row.l).toBeGreaterThan(0);
  });

  it('[L2165] a trainer can too', async () => {
    const h = await harness();
    await h.addUser('u-c', ['trainer']);
    expect((await h.send('POST', `${T1}/leave`, 'fb-c')).status).toBe(200);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-c'`)).s).toBe('left');
  });

  it('[L2173] an admin cannot leave as the gym\'s last admin (a non-last admin may; rules denied all admins)', async () => {
    const h = await harness();
    await h.addUser('u-b', ['admin', 'trainer']);
    // two admins: the second may leave, leaving exactly one
    expect((await h.send('POST', `${T1}/leave`, 'fb-b')).status).toBe(200);
    // u-admin is now the sole admin
    expect((await h.send('POST', `${T1}/leave`, 'fb-admin')).status).toBe(409);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-admin'`)).s).toBe('active');
  });

  it('[L2181] leaving cannot be abused to grant yourself anything', async () => {
    const h = await harness();
    // extra body is ignored: no role change smuggled in
    expect((await h.send('POST', `${T1}/leave`, 'fb-mem', { roles: ['admin'], status: 'active' })).status).toBe(200);
    const row = await h.one(`SELECT status s, roles r FROM memberships WHERE member_id = 'u-mem'`);
    expect(row.s).toBe('left');
    expect(JSON.parse(row.r)).toEqual(['member']);
    // reactivating yourself: rejoin only yields pending; the status route is admin-only
    expect((await h.send('PUT', `${T1}/members/u-mem/status`, 'fb-mem', { status: 'active' })).status).toBe(403);
    expect((await h.send('POST', `${T1}/join`, 'fb-mem')).status).toBe(201);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-mem'`)).s).toBe('pending');
  });

  it('[L2193] you cannot make somebody else leave', async () => {
    const h = await harness();
    await h.addUser('u-att', ['member']);
    // /leave only ever acts on the caller
    expect((await h.send('POST', `${T1}/leave`, 'fb-att', { memberId: 'u-mem' })).status).toBe(200);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-mem'`)).s).toBe('active');
    await h.addUser('u-att2', ['member']);
    expect((await h.send('PUT', `${T1}/members/u-mem/status`, 'fb-att2', { status: 'rejected' })).status).toBe(403);
    expect((await h.send('PUT', `${T1}/members/u-mem/status`, 'fb-admin', { status: 'left' })).status).toBe(400);
  });

  it('[L2202] a left membership grants no access', async () => {
    const h = await harness();
    await h.addUser('u-g', ['member'], { status: 'left' });
    expect((await h.send('GET', `${T1}/classes`, 'fb-g')).status).toBe(403);
    expect((await h.send('GET', `${T1}/members/u-g/credits`, 'fb-g')).status).toBe(403);
    expect((await h.send('POST', `${T1}/leave`, 'fb-g')).status).toBe(404);
  });
});

describe('matrix C: tenant private data and push tokens', () => {
  it('[L2219] F3 (no contact endpoint yet); the public DTO already hides the private contact row', async () => {
    const h = await harness();
    await h.run(`INSERT INTO tenant_contacts (tenant_id, data) VALUES ('t1', '{"contactEmail":"gym@example.com","contactPhone":"+90"}')`);
    const res = await h.send('GET', '/v1/tenants/by-code/T1', 'fb-mem');
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toMatch(/gym@example|contact|\+90/);
  });

  it('[L2249] a push token must be well-formed, self-owned (always the caller) and inside a gym you belong to', async () => {
    const h = await harness();
    const put = (b: object) => h.send('PUT', '/v1/me/push-token', 'fb-mem', b);
    expect((await put({ token: 'ExponentPushToken[abc123]', platform: 'ios', tenantId: 't1' })).status).toBe(200);
    expect((await put({ token: 'garbage', platform: 'ios', tenantId: 't1' })).status).toBe(400);
    // a foreign userId in the body is ignored: the row belongs to the caller
    expect((await put({ token: 'ExponentPushToken[x]', platform: 'ios', tenantId: 't1', userId: 'u-admin' })).status).toBe(200);
    expect((await h.one(`SELECT user_id u FROM push_tokens WHERE token = 'ExponentPushToken[x]'`)).u).toBe('u-mem');
    expect((await put({ token: 'ExponentPushToken[y]', platform: 'ios', tenantId: 'other-gym' })).status).toBe(403);
    expect((await put({ token: 'ExponentPushToken[z]', platform: 'blackberry', tenantId: 't1' })).status).toBe(400);
    expect(await h.one(`SELECT 1 x FROM push_tokens WHERE token IN ('ExponentPushToken[y]','ExponentPushToken[z]','garbage')`)).toBeNull();
  });

  it('[L2269] push tokens are never readable from the client; deleting your own still works', async () => {
    const h = await harness();
    const tok = 'ExponentPushToken[mine]';
    await h.send('PUT', '/v1/me/push-token', 'fb-mem', { token: tok, platform: 'ios', tenantId: 't1' });
    const get = await h.send('GET', `/v1/me/push-token?token=${encodeURIComponent(tok)}`, 'fb-mem');
    expect(get.status).toBe(404);
    expect(await get.text()).not.toContain(tok);
    expect((await h.send('DELETE', `/v1/me/push-token?token=${encodeURIComponent(tok)}`, 'fb-mem')).status).toBe(200);
    expect(await h.one(`SELECT 1 x FROM push_tokens`)).toBeNull();
  });
});

describe('matrix C: no platform super-user (P1-6)', () => {
  // The API has no claim-based path at all: access derives only from an ACTIVE membership row.
  // A "platform root" is modelled as an authenticated user with no membership in the gym.
  it('[L2306] a user with no membership in the gym (e.g. a global admin claim) cannot read its data', async () => {
    const h = await harness();
    await h.addUser('u-root', null);
    for (const p of ['classes', 'members', 'members/u-mem/credits', 'members/u-mem/payments', 'members/u-mem/measurements',
      'members/u-mem/workout-logs', 'members/u-mem/programs', 'members/u-mem/admin-note']) {
      expect((await h.send('GET', `${T1}/${p}`, 'fb-root')).status, p).toBe(403);
    }
    expect((await h.send('GET', `${T1}/members/u-mem`, 'fb-root')).status).toBe(404);
  });

  it('[L2315] ... nor write tenant data or admit members', async () => {
    const h = await harness();
    await h.addUser('u-root', null);
    await h.addUser('u-pend', ['member'], { status: 'pending' });
    expect((await h.send('PUT', `${T1}/members/u-mem/roles`, 'fb-root', { roles: ['admin'] })).status).toBe(403);
    expect((await h.send('PUT', `${T1}/members/u-pend/status`, 'fb-root', { status: 'active' })).status).toBe(403);
    expect((await h.send('POST', `${T1}/checkins`, 'fb-root', { memberId: 'u-mem', accessReason: 'ok' })).status).toBe(403);
    expect((await h.send('POST', `${T1}/members/managed`, 'fb-root', { name: 'X' })).status).toBe(403);
    expect((await h.send('PATCH', `${T1}`, 'fb-root', { name: 'Hijacked' })).status).toBe(404); // no tenant-write route exists
    expect((await h.one(`SELECT name n FROM tenants WHERE id = 't1'`)).n).toBe('Gym');
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-pend'`)).s).toBe('pending');
  });
});

describe('matrix C: approving a legacy-role request', () => {
  it('[L2361] NA (legacy field); the plain admin approval path is covered', async () => {
    const h = await harness();
    await h.addUser('u-leg', ['member'], { status: 'pending' });
    expect((await h.send('PUT', `${T1}/members/u-leg/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
  });
});

describe('matrix C: admin edits a member\'s basic details', () => {
  async function world() {
    const h = await harness();
    await h.addUser('u-mm', ['member']);                        // account-less / managed
    await h.run(`UPDATE memberships SET managed = 1, created_by = 'u-admin', display_name = 'Elle Eklenen', short_code = '222222' WHERE member_id = 'u-mm'`);
    await h.addUser('u-m1', ['member']);                        // signed up themself
    await h.addUser('u-pending', ['member'], { status: 'pending' });
    const patch = (sub: string, id: string, b: object) => h.send('PATCH', `${T1}/members/${id}/details`, sub, b);
    return { h, patch };
  }

  it('[L2399] an admin can correct name, phone, e-mail and birth date of a member they created', async () => {
    const { h, patch } = await world();
    const res = await patch('fb-admin', 'u-mm', { displayName: 'Doğru İsim', phone: '05551112233', email: 'dogru@example.com', birthDate: Date.UTC(1990, 0, 1) });
    expect(res.status).toBe(200);
    const row = await h.one(`SELECT display_name n, phone p, email e, birth_date b FROM memberships WHERE member_id = 'u-mm'`);
    expect(row).toEqual({ n: 'Doğru İsim', p: '05551112233', e: 'dogru@example.com', b: Date.UTC(1990, 0, 1) });
  });

  it('[L2408] an admin cannot rewrite the details of a member who signed up themself', async () => {
    const { h, patch } = await world();
    expect((await patch('fb-admin', 'u-m1', { displayName: 'Doğru İsim' })).status).toBe(403);
    expect((await patch('fb-admin', 'u-m1', { phone: '05551112233' })).status).toBe(403);
    expect((await patch('fb-admin', 'u-m1', { email: 'x@example.com' })).status).toBe(403);
    expect((await h.one(`SELECT display_name n FROM memberships WHERE member_id = 'u-m1'`)).n).toBeNull();
  });

  it('[L2415] nor a still-pending request of someone with their own account', async () => {
    const { patch } = await world();
    expect((await patch('fb-admin', 'u-pending', { displayName: 'Düzeltilmiş' })).status).toBe(403);
  });

  it('[L2422] an admin of ANOTHER gym cannot edit a managed member', async () => {
    const { h, patch } = await world();
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-ob', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-ob','active','["admin"]',1)`);
    expect((await patch('fb-ob', 'u-mm', { displayName: 'Ele Geçirildi' })).status).toBe(403);
    expect((await h.send('PATCH', `/v1/tenants/t2/members/u-mm/details`, 'fb-ob', { displayName: 'Ele Geçirildi' })).status).toBe(404);
    expect((await h.one(`SELECT display_name n FROM memberships WHERE tenant_id='t1' AND member_id = 'u-mm'`)).n).toBe('Elle Eklenen');
  });

  it('[L2428] a trainer cannot edit a managed member', async () => {
    const { h, patch } = await world();
    await h.addUser('u-coach', ['trainer']);
    expect((await patch('fb-coach', 'u-mm', { displayName: 'X' })).status).toBe(403);
  });

  it('[L2434] the edit path cannot smuggle a role change', async () => {
    const { h, patch } = await world();
    expect((await patch('fb-admin', 'u-mm', { displayName: 'X', roles: ['admin'] })).status).toBe(400);
    const row = await h.one(`SELECT roles r, display_name n FROM memberships WHERE member_id = 'u-mm'`);
    expect(JSON.parse(row.r)).toEqual(['member']);
    expect(row.n).toBe('Elle Eklenen');
  });

  it('[L2441] the edit path cannot clear or flip `managed`, nor change who created the row', async () => {
    const { h, patch } = await world();
    expect((await patch('fb-admin', 'u-mm', { managed: false })).status).toBe(400);
    expect((await patch('fb-admin', 'u-m1', { managed: true })).status).toBe(403);
    expect((await patch('fb-admin', 'u-mm', { createdBy: 'someone-else' })).status).toBe(400);
    const row = await h.one(`SELECT managed m, created_by c FROM memberships WHERE member_id = 'u-mm'`);
    expect(row).toEqual({ m: 1, c: 'u-admin' });
  });

  it('[L2448] the edit path cannot activate someone', async () => {
    const { h, patch } = await world();
    expect((await patch('fb-admin', 'u-pending', { displayName: 'X', status: 'active' })).status).toBe(403);
    await h.run(`UPDATE memberships SET managed = 1 WHERE member_id = 'u-pending'`);
    expect((await patch('fb-admin', 'u-pending', { displayName: 'X', status: 'active' })).status).toBe(400);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-pending'`)).s).toBe('pending');
  });

  it('[L2455] an admin cannot edit a managed member into a minor; an adult birth date is fine', async () => {
    const { patch } = await world();
    expect((await patch('fb-admin', 'u-mm', { birthDate: Date.now() - 11 * 365 * DAY })).status).toBe(400);
    expect((await patch('fb-admin', 'u-mm', { birthDate: Date.UTC(1985, 5, 1) })).status).toBe(200);
  });

  it('[L2461] the edit path cannot rewrite the check-in shortCode', async () => {
    const { h, patch } = await world();
    expect((await patch('fb-admin', 'u-mm', { displayName: 'X', shortCode: '999999' })).status).toBe(400);
    expect((await h.one(`SELECT short_code s FROM memberships WHERE member_id = 'u-mm'`)).s).toBe('222222');
  });

  it('[L2468] an empty name or an oversized e-mail is rejected', async () => {
    const { patch } = await world();
    expect((await patch('fb-admin', 'u-mm', { displayName: '' })).status).toBe(400);
    expect((await patch('fb-admin', 'u-mm', { email: 'a'.repeat(250) + '@x.co' })).status).toBe(400);
  });

  it('[L2476] a plain member cannot edit someone else', async () => {
    const { h, patch } = await world();
    expect((await patch('fb-m1', 'u-pending', { displayName: 'Başkası' })).status).toBe(403);
    expect((await patch('fb-m1', 'u-mm', { displayName: 'Başkası' })).status).toBe(403);
    expect((await h.one(`SELECT display_name n FROM memberships WHERE member_id = 'u-mm'`)).n).toBe('Elle Eklenen');
  });

  it('[L2484] a member cannot stamp `managed` or `createdBy` on their own new row', async () => {
    const h = await harness();
    await h.addUser('u-new', null);
    expect((await h.send('POST', `${T1}/join`, 'fb-new', { managed: true, createdBy: 'u-admin', status: 'active', roles: ['admin'] })).status).toBe(201);
    const row = await h.one(`SELECT managed m, created_by c, status s, roles r FROM memberships WHERE member_id = 'u-new'`);
    expect(row.m).toBe(0);
    expect(row.c).toBeNull();
    expect(row.s).toBe('pending');
    expect(JSON.parse(row.r)).toEqual(['member']);
  });

  it('[L2492] removing a membership is an admin act through DELETE …/members/:id: admin removes, member/trainer 403, row gone', async () => {
    const { h } = await world();
    await h.addUser('u-coach', ['trainer']);
    expect((await h.send('DELETE', `${T1}/members/u-mm`, 'fb-mem')).status).toBe(403);
    expect((await h.send('DELETE', `${T1}/members/u-mm`, 'fb-coach')).status).toBe(403);
    expect(await h.one(`SELECT 1 x FROM memberships WHERE member_id = 'u-mm'`)).not.toBeNull();
    const r = await h.send('DELETE', `${T1}/members/u-mm`, 'fb-admin');
    expect(r.status).toBe(200);
    expect(((await r.json()) as { deleted: number }).deleted).toBeGreaterThanOrEqual(1);
    expect(await h.one(`SELECT 1 x FROM memberships WHERE member_id = 'u-mm'`)).toBeNull();
  });
});

describe('matrix C: a member edits their own details', () => {
  const mk = async () => {
    const h = await harness();
    await h.run(`UPDATE memberships SET short_code = '111111' WHERE member_id = 'u-mem'`);
    await h.addUser('u-wait', ['member'], { status: 'pending' });
    const patch = (sub: string, id: string, b: object) => h.send('PATCH', `${T1}/members/${id}/details`, sub, b);
    return { h, patch };
  };

  it('[L2519] name, phone and birth date', async () => {
    const { h, patch } = await mk();
    expect((await patch('fb-mem', 'u-mem', { displayName: 'Yeni Ad', phone: '05551112233', birthDate: Date.UTC(2010, 3, 2) })).status).toBe(200);
    expect(await h.one(`SELECT display_name n, phone p, birth_date b FROM memberships WHERE member_id = 'u-mem'`))
      .toEqual({ n: 'Yeni Ad', p: '05551112233', b: Date.UTC(2010, 3, 2) });
  });

  it('[L2530] works while still pending approval', async () => {
    const { h, patch } = await mk();
    expect((await patch('fb-wait', 'u-wait', { displayName: 'Kendi Adım' })).status).toBe(200);
    expect((await h.one(`SELECT display_name n FROM memberships WHERE member_id = 'u-wait'`)).n).toBe('Kendi Adım');
  });

  it('[L2537] cannot self-approve through the profile path', async () => {
    const { h, patch } = await mk();
    expect((await patch('fb-wait', 'u-wait', { displayName: 'X', status: 'active' })).status).toBe(400);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-wait'`)).s).toBe('pending');
  });

  it('[L2544] cannot self-grant a role', async () => {
    const { h, patch } = await mk();
    expect((await patch('fb-mem', 'u-mem', { displayName: 'X', roles: ['admin'] })).status).toBe(400);
    expect(JSON.parse((await h.one(`SELECT roles r FROM memberships WHERE member_id = 'u-mem'`)).r)).toEqual(['member']);
  });

  it('[L2553] cannot rewrite their own shortCode', async () => {
    const { h, patch } = await mk();
    expect((await patch('fb-mem', 'u-mem', { displayName: 'X', shortCode: '999999' })).status).toBe(400);
    expect((await h.one(`SELECT short_code s FROM memberships WHERE member_id = 'u-mem'`)).s).toBe('111111');
  });

  it('[L2560] an empty name is rejected', async () => {
    const { patch } = await mk();
    expect((await patch('fb-mem', 'u-mem', { displayName: '' })).status).toBe(400);
  });

  it('[L2565] a birth date has to be a timestamp', async () => {
    const { patch } = await mk();
    expect((await patch('fb-mem', 'u-mem', { birthDate: '2010-04-02' })).status).toBe(400);
  });

  it('[L2573] a write that changes nothing is refused', async () => {
    const { patch } = await mk();
    expect((await patch('fb-mem', 'u-mem', {})).status).toBe(400);
    expect((await patch('fb-mem', 'u-mem', { status: 'active' })).status).toBe(400);
  });

  it('[L2578] someone who left cannot reactivate themselves through this path', async () => {
    const { h, patch } = await mk();
    await h.addUser('u-gone', ['member'], { status: 'left' });
    expect((await patch('fb-gone', 'u-gone', { status: 'active' })).status).toBe(400);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-gone'`)).s).toBe('left');
  });
});

describe('matrix C: the join payload', () => {
  it('[L2618] a first-time applicant can create their request', async () => {
    const h = await harness();
    await h.addUser('u-nc', null);
    expect((await h.send('POST', `${T1}/join`, 'fb-nc', { displayName: 'Yeni Üye', email: 'yeni@example.com' })).status).toBe(201);
    expect(await h.one(`SELECT status s, roles r FROM memberships WHERE tenant_id='t1' AND member_id = 'u-nc'`))
      .toEqual({ s: 'pending', r: '["member"]' });
  });

  it('[L2628] the read that precedes the write works when there is no membership yet', async () => {
    const h = await harness();
    await h.addUser('u-nc', null);
    const res = await h.send('GET', '/v1/me', 'fb-nc');
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).memberships).toEqual([]);
    expect((await h.send('GET', '/v1/tenants/by-code/T1', 'fb-nc')).status).toBe(200);
    expect((await h.send('POST', `${T1}/join`, 'fb-nc')).status).toBe(201);
  });

  it('[L2634] that allowance does not let anyone probe someone else\'s membership', async () => {
    const h = await harness();
    await h.addUser('u-nosy', null);
    expect((await h.send('GET', `${T1}/members/u-mem`, 'fb-nosy')).status).toBe(404);
    expect((await h.send('GET', `${T1}/members/ghost`, 'fb-nosy')).status).toBe(404);
  });

  it('[L2639] an already-ACTIVE member re-applying is rejected', async () => {
    const h = await harness();
    expect((await h.send('POST', `${T1}/join`, 'fb-mem')).status).toBe(409);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-mem'`)).s).toBe('active');
  });
});

describe('matrix C: free-tier member limit (P0-1)', () => {
  const setup = async (count: number, sub?: string) => {
    const h = await harness();
    await h.run(`UPDATE tenants SET active_member_count = ?, subscription_status = ? WHERE id = 't1'`, count, sub ?? null);
    await h.addUser('u-p1', ['member'], { status: 'pending' });
    return h;
  };
  const approve = (h: Awaited<ReturnType<typeof harness>>, id = 'u-p1') =>
    h.send('PUT', `${T1}/members/${id}/status`, 'fb-admin', { status: 'active' });

  it('[L2671] an admin can approve a member while under the free limit', async () => {
    const h = await setup(9);
    expect((await approve(h)).status).toBe(200);
    expect((await h.one(`SELECT active_member_count c FROM tenants`)).c).toBe(10);
  });

  it('[L2677] approval is blocked at the limit', async () => {
    const h = await setup(10);
    expect((await approve(h)).status).toBe(409);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id = 'u-p1'`)).s).toBe('pending');
    expect((await h.one(`SELECT active_member_count c FROM tenants`)).c).toBe(10);
  });

  it('[L2683] an active subscription lifts the limit', async () => {
    const h = await setup(250, 'active');
    expect((await approve(h)).status).toBe(200);
  });

  it('[L2689] an expired subscription does not', async () => {
    const h = await setup(250, 'expired');
    expect((await approve(h)).status).toBe(409);
  });

  it('[L2695] rejecting and suspending stay free at the limit', async () => {
    const h = await setup(10);
    expect((await h.send('PUT', `${T1}/members/u-p1/status`, 'fb-admin', { status: 'rejected' })).status).toBe(200);
    expect((await h.send('PUT', `${T1}/members/u-mem/status`, 'fb-admin', { status: 'suspended' })).status).toBe(200);
  });

  it.todo('[L2701] FIXED in matrix-fixes.test.ts (was GAP): PUT /v1/tenants/:t/members/:id/status {status:"active"} on a pending row with roles ["trainer"] (no "member") at active_member_count=10 and no subscription: rules allow (limit only applies when "member" in roles), API returns 409 (gate in membership.ts applies to every role and also bumps active_member_count for staff)');

  it('[L2712] deny half: no route lets an admin set subscription or the seat tally (branding edit half is F3: no tenant-update endpoint)', async () => {
    const h = await setup(10);
    for (const m of ['PUT', 'PATCH', 'POST']) {
      expect((await h.send(m, `${T1}`, 'fb-admin', { subscription: { status: 'active' }, activeMemberCount: 0, subscriptionStatus: 'active' })).status).toBe(404);
    }
    const t = await h.one(`SELECT active_member_count c, subscription_status s FROM tenants WHERE id = 't1'`);
    expect(t).toEqual({ c: 10, s: null });
  });
});
