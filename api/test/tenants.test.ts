import { describe, expect, it, vi } from 'vitest';

import { sliceHarness } from './sliceApp';

vi.setConfig({ testTimeout: 60_000 });

const T1 = '/v1/tenants/t1';
type H = Awaited<ReturnType<typeof sliceHarness>>;
const create = (h: H, sub: string, body: object) => h.send('POST', '/v1/tenants', sub, body);

describe('tenants: creation (rules rows 195, 207)', () => {
  it('[L195] creating a tenant requires self as owner, a non-empty code and name', async () => {
    const h = await sliceHarness();
    await h.addUser('u-owner', null);
    // someone else as owner: refused, nothing written
    expect((await create(h, 'fb-owner', { code: 'NEWGYM-01', name: 'New Gym', ownerUid: 'u-admin' })).status).toBe(403);
    expect((await create(h, 'fb-owner', { code: '', name: 'New Gym' })).status).toBe(400);
    expect((await create(h, 'fb-owner', { code: 'NEWGYM-01', name: '   ' })).status).toBe(400);
    expect((await create(h, 'fb-owner', { code: 'has space', name: 'New Gym' })).status).toBe(400);
    expect((await create(h, 'fb-owner', { code: 'NEWGYM-01', name: 'New Gym', branding: { primaryColor: 'red' } })).status).toBe(400);
    expect(await h.one(`SELECT count(*) c FROM tenants WHERE code = 'NEWGYM-01'`)).toEqual({ c: 0 });
    // self as owner (by internal id or by Firebase subject): created
    const ok = await create(h, 'fb-owner', { code: 'newgym-01', name: ' New Gym ', ownerUid: 'u-owner' });
    expect(ok.status).toBe(201);
    const made = await h.json(ok);
    expect(made).toMatchObject({ code: 'NEWGYM-01', name: 'New Gym' });
    expect(await h.one(`SELECT owner_user_id o, code, name FROM tenants WHERE id = ?`, made.id)).toEqual({ o: 'u-owner', code: 'NEWGYM-01', name: 'New Gym' });
    expect((await create(h, 'fb-owner', { code: 'OTHER-01', name: 'Other', ownerUid: 'fb-owner' })).status).toBe(201);
  });

  it('[L195] unauthenticated callers and users without a user row cannot create; a taken code is 409 and leaves nothing behind', async () => {
    const h = await sliceHarness();
    expect((await create(h, null as never, { code: 'X1', name: 'X' })).status).toBe(401);
    expect((await create(h, 'fb-never-bootstrapped', { code: 'X1', name: 'X' })).status).toBe(409);
    const before = await h.one(`SELECT (SELECT count(*) FROM tenants) t, (SELECT count(*) FROM memberships) m`);
    expect((await create(h, 'fb-mem', { code: 't1', name: 'Copycat' })).status).toBe(409);   // codes are case-insensitive
    expect(await h.one(`SELECT (SELECT count(*) FROM tenants) t, (SELECT count(*) FROM memberships) m`)).toEqual(before);
  });

  it('[L207] the owner gets an ACTIVE ADMIN membership in the same batch, counters included; a stranger cannot self-grant one', async () => {
    const h = await sliceHarness();
    await h.addUser('u-owner', null);
    const { id } = await h.json(await create(h, 'fb-owner', { code: 'OWN-1', name: 'Own' }));
    expect(await h.one(`SELECT status, roles, approved_at IS NOT NULL a FROM memberships WHERE tenant_id = ? AND member_id = 'u-owner'`, id))
      .toEqual({ status: 'active', roles: '["admin"]', a: 1 });
    expect(await h.one(`SELECT active_admin_count a, active_member_count m FROM tenants WHERE id = ?`, id)).toEqual({ a: 1, m: 0 });
    // and it is real: the owner now passes the admin gate on their gym
    expect((await h.send('PUT', `/v1/tenants/${id}/contact`, 'fb-owner', { phone: '+90 555' })).status).toBe(200);
    // a stranger: joining someone else's gym only ever yields a pending member, and the roles route stays admin-only
    await h.addUser('u-str', null);
    expect((await h.send('POST', `/v1/tenants/${id}/join`, 'fb-str')).status).toBe(201);
    expect(await h.one(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = 'u-str'`, id)).toEqual({ status: 'pending', roles: '["member"]' });
    expect((await h.send('PUT', `/v1/tenants/${id}/members/u-str/roles`, 'fb-str', { roles: ['admin'] })).status).toBe(403);
    expect((await create(h, 'fb-str', { code: 'STEAL-1', name: 'Steal', ownerUid: 'u-owner' })).status).toBe(403);
  });

  it('an owner cannot found more than the cap, and the refused attempt writes nothing', async () => {
    const h = await sliceHarness();
    await h.addUser('u-owner', null);
    for (let i = 0; i < 5; i++) expect((await create(h, 'fb-owner', { code: `G-${i}`, name: `G${i}` })).status).toBe(201);
    const before = await h.one(`SELECT (SELECT count(*) FROM tenants) t, (SELECT count(*) FROM memberships) m`);
    expect((await create(h, 'fb-owner', { code: 'G-5', name: 'G5' })).status).toBe(429);
    expect(await h.one(`SELECT (SELECT count(*) FROM tenants) t, (SELECT count(*) FROM memberships) m`)).toEqual(before);
  });

  it('two parallel creations with the same code: exactly one wins', async () => {
    const h = await sliceHarness();
    await h.addUser('u-a', null);
    await h.addUser('u-b', null);
    const res = await Promise.all([create(h, 'fb-a', { code: 'RACE-1', name: 'A' }), create(h, 'fb-b', { code: 'RACE-1', name: 'B' })]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await h.one(`SELECT count(*) c FROM tenants WHERE code = 'RACE-1'`)).toEqual({ c: 1 });
    expect(await h.one(`SELECT count(*) c FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE t.code = 'RACE-1'`)).toEqual({ c: 1 });
  });
});

describe('tenants: settings and branding (rows 102, 127, 2712)', () => {
  const branding = { appName: 'Olympus', primaryColor: '#10B981', accentColor: '#F59E0B', themeMode: 'dark', logoUrl: 'https://cdn.example/logo.jpg' };

  it('[L102] an admin can save settings in a gym that has no owner at all', async () => {
    const h = await sliceHarness();
    expect((await h.one(`SELECT owner_user_id o FROM tenants WHERE id = 't1'`)).o).toBeNull();   // legacy/backfilled gym
    const res = await h.send('PATCH', `${T1}/settings`, 'fb-admin', { branding: { primaryColor: '#10B981' } });
    expect(res.status).toBe(200);
    expect(JSON.parse((await h.one(`SELECT branding b FROM tenants WHERE id = 't1'`)).b)).toEqual({ primaryColor: '#10B981' });
    // name, address, hours and the refund window in one go
    const hours = { '1': { open: '06:00', close: '23:00' }, '0': null };
    expect((await h.send('PATCH', `${T1}/settings`, 'fb-admin', { name: ' Olympus Gym ', branding, address: ' Bagdat Cd. 1 ', openingHours: hours, cancellationHours: 12 })).status).toBe(200);
    const got = await h.json(await h.send('GET', `${T1}/settings`, 'fb-mem'));
    expect(got).toMatchObject({ id: 't1', code: 'T1', name: 'Olympus Gym', branding, address: 'Bagdat Cd. 1', openingHours: hours, cancellationHours: 12, subscription: null });
    // clearing the address is a real intent
    expect((await h.send('PATCH', `${T1}/settings`, 'fb-admin', { address: '' })).status).toBe(200);
    expect((await h.json(await h.send('GET', `${T1}/settings`, 'fb-mem'))).address).toBeNull();
    // other settings survive that
    expect((await h.json(await h.send('GET', `${T1}/settings`, 'fb-mem'))).cancellationHours).toBe(12);
  });

  it('only an ACTIVE admin of THAT gym may edit; everyone else is 403 and the gym is untouched', async () => {
    const h = await sliceHarness();
    await h.addUser('u-tr', ['trainer']);
    await h.addUser('u-sus', ['admin'], { status: 'suspended' });
    await h.addUser('u-str', null);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-str','active','["admin"]',1)`);
    for (const sub of ['fb-mem', 'fb-tr', 'fb-sus', 'fb-str', null]) {
      const r = await h.send('PATCH', `${T1}/settings`, sub, { name: 'Hijacked' });
      expect(r.status).toBe(sub ? 403 : 401);
    }
    expect((await h.one(`SELECT name n FROM tenants WHERE id = 't1'`)).n).toBe('Gym');
  });

  it('[L127] ownerUid and code stay immutable — an admin cannot introduce an owner or rename the join code', async () => {
    const h = await sliceHarness();
    for (const body of [{ ownerUid: 'u-admin' }, { ownerUserId: 'u-admin' }, { owner_user_id: 'u-admin' }, { code: 'HACK' }, { name: 'Ok', ownerUid: 'u-admin' }]) {
      const r = await h.send('PATCH', `${T1}/settings`, 'fb-admin', body);
      expect([400, 403]).toContain(r.status);
    }
    expect(await h.one(`SELECT owner_user_id o, code c, name n FROM tenants WHERE id = 't1'`)).toEqual({ o: null, c: 'T1', n: 'Gym' });   // not even the valid 'name' half applied
  });

  it('[L127] ... and an existing owner cannot be replaced either', async () => {
    const h = await sliceHarness();
    await h.addUser('u-owner', null);
    const { id } = await h.json(await create(h, 'fb-owner', { code: 'OWN-2', name: 'Own' }));
    expect((await h.send('PATCH', `/v1/tenants/${id}/settings`, 'fb-owner', { ownerUid: 'u-admin' })).status).toBe(403);
    expect((await h.one(`SELECT owner_user_id o FROM tenants WHERE id = ?`, id)).o).toBe('u-owner');
  });

  it('[L2712] an admin cannot grant themselves a subscription or edit the seat tally, but can edit branding', async () => {
    const h = await sliceHarness();
    await h.run(`UPDATE tenants SET active_member_count = 10 WHERE id = 't1'`);
    for (const body of [
      { subscription: { status: 'active' } }, { subscriptionStatus: 'active' }, { subscription_status: 'active' },
      { activeMemberCount: 0 }, { activeAdminCount: 0 }, { name: 'Ok', activeMemberCount: 0 },
    ]) expect((await h.send('PATCH', `${T1}/settings`, 'fb-admin', body)).status).toBe(403);
    expect(await h.one(`SELECT active_member_count c, subscription_status s, name n FROM tenants WHERE id = 't1'`)).toEqual({ c: 10, s: null, n: 'Gym' });
    expect((await h.send('PATCH', `${T1}/settings`, 'fb-admin', { branding: { primaryColor: '#112233', appName: 'Gym' } })).status).toBe(200);
  });

  it('bad input is a 400, never a 500, and changes nothing', async () => {
    const h = await sliceHarness();
    const bad: object[] = [
      {}, { nope: 1 }, { name: '' }, { name: 5 }, { name: 'x'.repeat(101) },
      { branding: 'blue' }, { branding: [] }, { branding: { primaryColor: '#12345' } }, { branding: { logoUrl: 'javascript:alert(1)' } },
      { branding: { themeMode: 'neon' } }, { branding: { surprise: 1 } },
      { address: 5 }, { address: 'x'.repeat(301) },
      { openingHours: 'always' }, { openingHours: { '7': null } }, { openingHours: { '1': { open: '25:00', close: '23:00' } } },
      { openingHours: { '1': { open: '06:00' } } }, { cancellationHours: 1.5 }, { cancellationHours: -1 }, { cancellationHours: '24' },
    ];
    for (const body of bad) expect((await h.send('PATCH', `${T1}/settings`, 'fb-admin', body)).status).toBe(400);
    expect(await h.one(`SELECT name n, branding b, settings s FROM tenants WHERE id = 't1'`)).toEqual({ n: 'Gym', b: '{}', s: '{}' });
  });

  it('GET settings: members and waiting applicants read it, only admins see seat tallies and owner, strangers and ex-members cannot', async () => {
    const h = await sliceHarness();
    await h.addUser('u-pend', ['member'], { status: 'pending' });
    await h.addUser('u-rej', ['member'], { status: 'rejected' });
    await h.addUser('u-str', null);
    await h.run(`UPDATE tenants SET subscription_status = 'active', subscription_plan = 'yearly', subscription_expires_at = 99 WHERE id = 't1'`);
    const asAdmin = await h.json(await h.send('GET', `${T1}/settings`, 'fb-admin'));
    expect(asAdmin).toMatchObject({ activeMemberCount: 0, activeAdminCount: 0, subscription: { status: 'active', plan: 'yearly', expiresAt: 99 } });
    expect('ownerUserId' in asAdmin).toBe(true);
    for (const sub of ['fb-mem', 'fb-pend']) {
      const body = await h.json(await h.send('GET', `${T1}/settings`, sub));
      expect(body).toMatchObject({ id: 't1', name: 'Gym' });
      expect('activeMemberCount' in body || 'ownerUserId' in body).toBe(false);
    }
    for (const sub of ['fb-rej', 'fb-str']) expect((await h.send('GET', `${T1}/settings`, sub)).status).toBe(403);
    expect((await h.send('GET', `${T1}/settings`, null)).status).toBe(401);
  });
});

describe('tenants: private contact (rows 1158-1189, 2219)', () => {
  const seed = async (h: H) => {
    await h.run(`INSERT INTO tenant_contacts (tenant_id, data) VALUES ('t1', '{"phone":"+90 212 000","email":"gym@example.com"}')`);
    await h.addUser('u-pend', ['member'], { status: 'pending' });
    await h.addUser('u-str', null);
  };

  it('[L1158] someone waiting on a decision can read the contact details', async () => {
    const h = await sliceHarness();
    await seed(h);
    const r = await h.send('GET', `${T1}/contact`, 'fb-pend');
    expect(r.status).toBe(200);
    expect(await h.json(r)).toMatchObject({ phone: '+90 212 000', email: 'gym@example.com' });
  });

  it('[L1167] an active member still can, as before (and so can staff)', async () => {
    const h = await sliceHarness();
    await seed(h);
    expect(await h.json(await h.send('GET', `${T1}/contact`, 'fb-mem'))).toMatchObject({ phone: '+90 212 000' });
    expect((await h.send('GET', `${T1}/contact`, 'fb-admin')).status).toBe(200);
  });

  it('[L1174] a stranger cannot — applying is what grants it, not signing up; rejected and left applicants lose it', async () => {
    const h = await sliceHarness();
    await seed(h);
    await h.addUser('u-rej', ['member'], { status: 'rejected' });
    await h.addUser('u-left', ['member'], { status: 'left' });
    for (const sub of ['fb-str', 'fb-rej', 'fb-left']) expect((await h.send('GET', `${T1}/contact`, sub)).status).toBe(403);
    expect((await h.send('GET', `${T1}/contact`, null)).status).toBe(401);
    // a user with no bootstrap/user row at all
    expect((await h.send('GET', `${T1}/contact`, 'fb-nobody')).status).toBe(403);
    // applying is what grants it
    expect((await h.send('POST', `${T1}/join`, 'fb-str')).status).toBe(201);
    expect((await h.send('GET', `${T1}/contact`, 'fb-str')).status).toBe(200);
  });

  it("[L1180] applying to one gym does not open another gym's contact details", async () => {
    const h = await sliceHarness();
    await seed(h);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.run(`INSERT INTO tenant_contacts (tenant_id, data) VALUES ('t2', '{"phone":"+90 999"}')`);
    expect((await h.send('GET', `/v1/tenants/t2/contact`, 'fb-pend')).status).toBe(403);
    expect((await h.send('GET', `/v1/tenants/t2/contact`, 'fb-mem')).status).toBe(403);
  });

  it('[L1189] an applicant (or any non-admin) cannot write the gym contact details; an admin can, and it round-trips', async () => {
    const h = await sliceHarness();
    await seed(h);
    await h.addUser('u-tr', ['trainer']);
    for (const sub of ['fb-pend', 'fb-mem', 'fb-tr', 'fb-str']) expect((await h.send('PUT', `${T1}/contact`, sub, { phone: '0' })).status).toBe(403);
    expect(JSON.parse((await h.one(`SELECT data d FROM tenant_contacts WHERE tenant_id = 't1'`)).d).phone).toBe('+90 212 000');
    expect((await h.send('PUT', `${T1}/contact`, 'fb-admin', { phone: ' 0212 111 ', email: ' Front@Desk.com ' })).status).toBe(200);
    expect(await h.json(await h.send('GET', `${T1}/contact`, 'fb-pend'))).toMatchObject({ phone: '0212 111', email: 'Front@Desk.com' });
    // empty fields are removed (the app's deleteField()), not stored as ''
    expect((await h.send('PUT', `${T1}/contact`, 'fb-admin', { phone: '', email: null })).status).toBe(200);
    expect(await h.json(await h.send('GET', `${T1}/contact`, 'fb-mem'))).toMatchObject({ phone: null, email: null });
  });

  it('[L2219] contact details live in the private row: absent row reads as empty, the public by-code DTO never carries them, bad input is 400', async () => {
    const h = await sliceHarness();
    expect(await h.json(await h.send('GET', `${T1}/contact`, 'fb-mem'))).toMatchObject({ phone: null, email: null });
    expect((await h.send('PUT', `${T1}/contact`, 'fb-admin', { email: 'not-an-email' })).status).toBe(400);
    expect((await h.send('PUT', `${T1}/contact`, 'fb-admin', { phone: 5 })).status).toBe(400);
    expect((await h.send('PUT', `${T1}/contact`, 'fb-admin', { phone: 'x'.repeat(31) })).status).toBe(400);
    expect((await h.send('PUT', `${T1}/contact`, 'fb-admin', { fax: '1' })).status).toBe(400);
    expect((await h.send('PUT', `/v1/tenants/nope/contact`, 'fb-admin', { phone: '1' })).status).toBe(403);
    await h.send('PUT', `${T1}/contact`, 'fb-admin', { phone: '+90 1', email: 'gym@example.com' });
    // by-code lives on index.ts/reads.ts; the data it reads must not contain contact fields
    expect(JSON.stringify(await h.one(`SELECT code, name, branding FROM tenants WHERE id = 't1'`))).not.toMatch(/gym@example|\+90/);
  });
});
