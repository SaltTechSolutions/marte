import { describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { harness, PROJECT } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

type H = Awaited<ReturnType<typeof harness>>;
const T1 = '/v1/tenants/t1';
const monthly = { name: 'Aylık', kind: 'membership', price: 100_000, durationDays: 30, isActive: true,
  entitlements: { gymAccess: true, groupClasses: { unlimited: false, count: 8, periodDays: 30 } }, freezePolicy: { maxCount: 1, minDays: 3 } };
const json = async (r: Response) => (await r.json()) as any;
/** The same app, but the database's batch() first runs `before` (a race that lands between the route's checks and its write). */
const racing = (h: H, before: () => Promise<unknown>) => {
  const db = { ...h.db, batch: async (l: any[]) => { await before(); return h.db.batch(l); }, prepare: h.db.prepare.bind(h.db) } as unknown as D1Database;
  return async (method: string, path: string, sub: string, body?: object) =>
    app.fetch(new Request(`http://x${path}`, { method, headers: { 'content-type': 'application/json', Authorization: `Bearer ${await h.sign(sub)}` }, body: body ? JSON.stringify(body) : undefined }),
      { DB: db, API_OPEN: '1', FIREBASE_PROJECT_ID: PROJECT });
};

describe('PATCH details: heightCm null clears', () => {
  it('a member clears their own height; an absurd number is still refused; nothing else changes', async () => {
    const h = await harness();
    await h.run(`UPDATE memberships SET height_cm = 180, phone = '555' WHERE member_id = 'u-mem'`);
    const patch = (b: object) => h.send('PATCH', `${T1}/members/u-mem/details`, 'fb-mem', b);
    expect((await patch({ heightCm: 50 })).status).toBe(400);
    expect((await patch({ heightCm: 'tall' })).status).toBe(400);
    expect((await h.one(`SELECT height_cm h FROM memberships WHERE member_id = 'u-mem'`)).h).toBe(180);
    expect((await patch({ heightCm: null })).status).toBe(200);
    expect(await h.one(`SELECT height_cm h, phone p FROM memberships WHERE member_id = 'u-mem'`)).toEqual({ h: null, p: '555' });
    expect((await patch({ phone: null })).status).toBe(400);          // null is only meaningful for the height
  });

  it("an admin clears a managed member's height", async () => {
    const h = await harness();
    const { memberId } = await json(await h.send('POST', `${T1}/members/managed`, 'fb-admin', { name: 'Elle' }));
    await h.run(`UPDATE memberships SET height_cm = 170 WHERE member_id = ?`, memberId);
    expect((await h.send('PATCH', `${T1}/members/${memberId}/details`, 'fb-admin', { heightCm: null })).status).toBe(200);
    expect((await h.one(`SELECT height_cm h FROM memberships WHERE member_id = ?`, memberId)).h).toBeNull();
  });
});

describe('PUT roles: roles alone or permissions alone', () => {
  const put = (h: H, id: string, b: object) => h.send('PUT', `${T1}/members/${id}/roles`, 'fb-admin', b);
  const row = async (h: H, id: string) => { const r = await h.one(`SELECT roles r, permissions p FROM memberships WHERE member_id = ?`, id); return { roles: JSON.parse(r.r), permissions: JSON.parse(r.p) }; };

  it('the missing half keeps its stored value, and the answer shows the merged result', async () => {
    const h = await harness();
    await h.addUser('u-st', ['trainer'], { permissions: ['checkin'] });
    const a = await put(h, 'u-st', { roles: ['trainer', 'member'] });
    expect(await json(a)).toEqual({ roles: ['trainer', 'member'], permissions: ['checkin'] });
    expect(await row(h, 'u-st')).toEqual({ roles: ['trainer', 'member'], permissions: ['checkin'] });
    const b = await put(h, 'u-st', { permissions: [] });
    expect(await json(b)).toEqual({ roles: ['trainer', 'member'], permissions: [] });
    expect(await row(h, 'u-st')).toEqual({ roles: ['trainer', 'member'], permissions: [] });
    await put(h, 'u-st', { permissions: ['checkin'] });
    expect(await row(h, 'u-st')).toEqual({ roles: ['trainer', 'member'], permissions: ['checkin'] });
  });

  it('same validations: neither half, junk, empty roles, duplicates, unknown permission are 400; unknown member 404', async () => {
    const h = await harness();
    for (const b of [{}, { roles: [] }, { roles: ['boss'] }, { roles: ['admin', 'admin'] }, { permissions: ['everything'] }, { permissions: 'checkin' }, { roles: 'admin' }]) {
      expect((await put(h, 'u-mem', b)).status, JSON.stringify(b)).toBe(400);
    }
    expect((await put(h, 'u-nobody', { permissions: [] })).status).toBe(404);
    expect(await row(h, 'u-mem')).toEqual({ roles: ['member'], permissions: [] });
  });

  it('cap logic: granting admin by roles alone still honours the limit of 3; permissions alone never touches counters; no self-demotion', async () => {
    const h = await harness();
    await h.run(`UPDATE tenants SET active_admin_count = 3, active_member_count = 2 WHERE id = 't1'`);
    expect((await put(h, 'u-mem', { roles: ['admin'] })).status).toBe(409);
    expect(await row(h, 'u-mem')).toEqual({ roles: ['member'], permissions: [] });
    expect((await put(h, 'u-mem', { permissions: ['checkin'] })).status).toBe(200);
    expect(await h.one(`SELECT active_admin_count a, active_member_count m FROM tenants WHERE id = 't1'`)).toEqual({ a: 3, m: 2 });
    expect((await put(h, 'u-admin', { roles: ['member'] })).status).toBe(409);                 // cannot demote yourself
    expect((await put(h, 'u-admin', { permissions: ['checkin'] })).status).toBe(200);           // but can edit their own permissions
    expect(await row(h, 'u-admin')).toEqual({ roles: ['admin'], permissions: ['checkin'] });
    // roles alone that move the seat: member -> trainer frees a seat
    await h.run(`UPDATE tenants SET active_admin_count = 1 WHERE id = 't1'`);
    expect((await put(h, 'u-mem', { roles: ['trainer'] })).status).toBe(200);
    expect(await h.one(`SELECT active_member_count m FROM tenants WHERE id = 't1'`)).toEqual({ m: 1 });
    expect(await row(h, 'u-mem')).toEqual({ roles: ['trainer'], permissions: ['checkin'] });   // permissions survived the roles-only change
  });

  it('a non-admin still cannot', async () => {
    const h = await harness();
    expect((await h.send('PUT', `${T1}/members/u-mem/roles`, 'fb-mem', { permissions: ['checkin'] })).status).toBe(403);
  });
});

describe('POST packages/:id/version: new version and retirement in one batch', () => {
  const create = async (h: H, b: object = monthly) => (await json(await h.send('POST', `${T1}/packages`, 'fb-admin', b))).id as string;
  const data = async (h: H, id: string) => JSON.parse((await h.one(`SELECT data d FROM gym_packages WHERE id = ?`, id)).d);

  it('creates the successor with supersedesId, switches the old one off, keeps its assignments', async () => {
    const h = await harness();
    const old = await create(h);
    await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: old });
    const r = await h.send('POST', `${T1}/packages/${old}/version`, 'fb-admin', { ...monthly, price: 120_000, supersedesId: 'liar' });
    expect(r.status).toBe(201);
    const { id } = await json(r);
    expect(id).not.toBe(old);
    expect(await data(h, id)).toMatchObject({ price: 120_000, isActive: true, supersedesId: old });
    expect(await data(h, old)).toMatchObject({ price: 100_000, isActive: false });
    expect((await h.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, old)).n).toBe(1);
    expect((await h.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = ?`, id)).n).toBe(0);
    // the retired version cannot be sold any more, the new one can
    expect((await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: old })).status).toBe(409);
    expect((await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id })).status).toBe(201);
  });

  it('validates like create and writes NOTHING when it fails; unknown (or another gym\'s) package is 404; admin only', async () => {
    const h = await harness();
    const old = await create(h);
    const before = await data(h, old);
    expect((await h.send('POST', `${T1}/packages/${old}/version`, 'fb-admin', { ...monthly, price: -5 })).status).toBe(400);
    expect((await h.send('POST', `${T1}/packages/${old}/version`, 'fb-admin', {})).status).toBe(400);
    expect(await data(h, old)).toEqual(before);
    expect(await h.one(`SELECT count(*) c FROM gym_packages`)).toEqual({ c: 1 });
    expect((await h.send('POST', `${T1}/packages/nope/version`, 'fb-admin', monthly)).status).toBe(404);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-oa', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-oa','active','["admin"]',1)`);
    expect((await h.send('POST', `/v1/tenants/t2/packages/${old}/version`, 'fb-oa', monthly)).status).toBe(404);
    expect((await h.send('POST', `${T1}/packages/${old}/version`, 'fb-mem', monthly)).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM gym_packages`)).toEqual({ c: 1 });
  });

  it('all or nothing: if the old package vanishes before the batch, no successor is created', async () => {
    const h = await harness();
    const old = await create(h);
    const send = racing(h, () => h.run(`DELETE FROM gym_packages WHERE id = ?`, old));
    const r = await send('POST', `${T1}/packages/${old}/version`, 'fb-admin', monthly);
    expect(r.status).toBe(404);
    expect(await h.one(`SELECT count(*) c FROM gym_packages`)).toEqual({ c: 0 });
  });
});

describe('PUT packages/:id: partial body when not in use, 409 when the write lost a race', () => {
  const create = async (h: H) => (await json(await h.send('POST', `${T1}/packages`, 'fb-admin', monthly))).id as string;
  const data = async (h: H, id: string) => JSON.parse((await h.one(`SELECT data d FROM gym_packages WHERE id = ?`, id)).d);

  it('merges over the stored data and validates the MERGED result; null removes an optional key', async () => {
    const h = await harness();
    const id = await create(h);
    const created = (await data(h, id)).createdAt;
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { price: 25_050 })).status).toBe(200);
    expect(await data(h, id)).toMatchObject({ name: 'Aylık', price: 25_050, durationDays: 30, isActive: true, createdAt: created, freezePolicy: { maxCount: 1, minDays: 3 } });
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { freezePolicy: null })).status).toBe(200);
    expect((await data(h, id)).freezePolicy).toBeUndefined();
    // invalid merged results: nothing is written
    for (const b of [{ price: -1 }, { price: 10.5 }, { durationDays: 0 }, { name: '' }, { kind: 'lessons' }, { isActive: 'yes' }, { durationDays: null }]) {
      expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', b)).status, JSON.stringify(b)).toBe(400);
    }
    expect(await data(h, id)).toMatchObject({ price: 25_050, durationDays: 30 });
    // switching kind needs the new kind's fields (merged result is validated like a create)
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { kind: 'lessons', lessonCount: 5, lessonValidityDays: 60 })).status).toBe(200);
    expect(await data(h, id)).toMatchObject({ kind: 'lessons', lessonCount: 5 });
    expect((await h.send('PUT', `${T1}/packages/nope`, 'fb-admin', { price: 1 })).status).toBe(404);
  });

  it('an assignment landing between the read and the write wins: the edit answers 409, not ok, and changes nothing', async () => {
    const h = await harness();
    const id = await create(h);
    // this route writes with a single statement (no batch), so the race is injected through prepare() instead of racing()
    const realPrepare = h.db.prepare.bind(h.db);
    let armed = true;
    const db = { ...h.db, prepare: (q: string) => {
      if (armed && /^UPDATE gym_packages SET data/.test(q)) { armed = false; return { bind: (...a: unknown[]) => ({ first: async () => {
        await h.run(`UPDATE gym_packages SET active_assignment_count = 1 WHERE id = ?`, id);
        return realPrepare(q).bind(...a).first();
      } }) }; }
      return realPrepare(q);
    }, batch: h.db.batch.bind(h.db) } as unknown as D1Database;
    const r = await app.fetch(new Request(`http://x${T1}/packages/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json', Authorization: `Bearer ${await h.sign('fb-admin')}` }, body: JSON.stringify({ price: 1 }) }),
      { DB: db, API_OPEN: '1', FIREBASE_PROJECT_ID: PROJECT });
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).error).toBe('package in use: only isActive/sortOrder can change');
    expect((await data(h, id)).price).toBe(100_000);
  });

  it('a package in use still takes isActive / sortOrder, nothing else', async () => {
    const h = await harness();
    const id = await create(h);
    await h.send('POST', `${T1}/members/u-mem/packages`, 'fb-admin', { packageId: id });
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { price: 1 })).status).toBe(409);
    expect((await h.send('PUT', `${T1}/packages/${id}`, 'fb-admin', { sortOrder: 3, isActive: false })).status).toBe(200);
    expect(await data(h, id)).toMatchObject({ price: 100_000, sortOrder: 3, isActive: false });
  });
});

describe('promotions: update is a validated, 404-aware merge', () => {
  const promo = { name: '%20', kind: 'percentDiscount', value: 20, appliesTo: [], isActive: true, maxRedemptions: 5 };
  const make = async (h: H, b: object = promo) => (await json(await h.send('POST', `${T1}/promotions`, 'fb-admin', b))).id as string;
  const data = async (h: H, id: string) => JSON.parse((await h.one(`SELECT data d FROM promotions WHERE id = ?`, id)).d);
  const put = (h: H, id: string, b: object) => h.send('PUT', `${T1}/promotions/${id}`, 'fb-admin', b);

  it('unknown id (or another gym\'s) is 404, not ok', async () => {
    const h = await harness();
    expect((await put(h, 'nope', { isActive: false })).status).toBe(404);
    const id = await make(h);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-oa', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-oa','active','["admin"]',1)`);
    expect((await h.send('PUT', `/v1/tenants/t2/promotions/${id}`, 'fb-oa', { isActive: false })).status).toBe(404);
    expect((await data(h, id)).isActive).toBe(true);
  });

  it('the merged result must be a valid promotion; nothing is written otherwise', async () => {
    const h = await harness();
    const id = await make(h);
    for (const b of [{ kind: 'free' }, { value: 0 }, { value: -3 }, { value: 'x' }, { value: 150 }, { appliesTo: 'all' }, { isActive: 'yes' }, { name: '  ' },
      { maxRedemptions: 0 }, { maxRedemptions: 1.5 }, { kind: 'amountDiscount' /* 20 % -> 20 kuruş is fine */, value: 20.5 }]) {
      expect((await put(h, id, b)).status, JSON.stringify(b)).toBe(400);
    }
    expect(await data(h, id)).toMatchObject({ kind: 'percentDiscount', value: 20, maxRedemptions: 5, isActive: true });
    // a kind change re-validates the stored value: 150 is fine as an amount, not as a percent
    expect((await put(h, id, { kind: 'amountDiscount', value: 15_000 })).status).toBe(200);
    expect((await put(h, id, { kind: 'percentDiscount' })).status).toBe(400);
  });

  it('maxRedemptions: null lifts the cap; a partial edit keeps redeemed (also a redemption that lands meanwhile); redeemed itself stays server-owned', async () => {
    const h = await harness();
    const id = await make(h);
    await h.run(`UPDATE promotions SET data = json_set(data, '$.redeemed', 3) WHERE id = ?`, id);
    expect((await put(h, id, { maxRedemptions: null })).status).toBe(200);
    const d = await data(h, id);
    expect(d.maxRedemptions).toBeUndefined();
    expect(d).toMatchObject({ redeemed: 3, name: '%20', value: 20 });
    expect((await put(h, id, { maxRedemptions: 9, isActive: false })).status).toBe(200);
    expect(await data(h, id)).toMatchObject({ maxRedemptions: 9, isActive: false, redeemed: 3 });
    expect((await put(h, id, { redeemed: 0 })).status).toBe(400);
  });

  it('create validates the same way (amount discounts are whole kuruş, caps are positive integers)', async () => {
    const h = await harness();
    for (const b of [{ ...promo, kind: 'amountDiscount', value: 10.5 }, { ...promo, maxRedemptions: 0 }, { ...promo, name: '' }, { ...promo, value: 101 }]) {
      expect((await h.send('POST', `${T1}/promotions`, 'fb-admin', b)).status, JSON.stringify(b)).toBe(400);
    }
    expect((await h.send('POST', `${T1}/promotions`, 'fb-admin', { ...promo, maxRedemptions: null })).status).toBe(201);
    expect((await h.send('POST', `${T1}/promotions`, 'fb-admin', { ...promo, kind: 'amountDiscount', value: 5_050 })).status).toBe(201);
  });
});

describe('program activation queues a push (Firebase notifyOnProgramAssigned)', () => {
  const outbox = async (h: H) => (await h.db.prepare(`SELECT payload, dedupe_key FROM outbox`).all<any>()).results;

  it('only the draft-to-active transition notifies the member, once per transition', async () => {
    const h = await harness();
    await h.addUser('u-trn', ['trainer']);
    const { id } = await json(await h.send('POST', `${T1}/programs`, 'fb-trn', { memberId: 'u-mem', name: 'Güç', status: 'draft' }));
    expect(await outbox(h)).toHaveLength(0);
    // an edit that leaves it a draft, and a repeat save of an active one, say nothing
    expect((await h.send('PUT', `${T1}/programs/${id}`, 'fb-trn', { name: 'Güç 2', status: 'draft' })).status).toBe(200);
    expect(await outbox(h)).toHaveLength(0);
    expect((await h.send('PUT', `${T1}/programs/${id}`, 'fb-trn', { name: 'Güç 2', status: 'active' })).status).toBe(200);
    const rows = await outbox(h);
    expect(rows).toHaveLength(1);
    const p = JSON.parse(rows[0].payload);
    expect(p).toMatchObject({ userIds: ['u-mem'], category: 'programs', title: 'Yeni programın hazır 💪', data: { screen: 'member/workout' } });
    expect(p.body).toBe('Antrenörün senin için "Güç 2" programını hazırladı.');
    expect((await h.send('PUT', `${T1}/programs/${id}`, 'fb-trn', { name: 'Güç 2', status: 'active', warmup: 'w1' })).status).toBe(200);
    expect(await outbox(h)).toHaveLength(1);
    // archived and activated again is a new assignment
    await h.send('PUT', `${T1}/programs/${id}`, 'fb-trn', { name: 'Güç 2', status: 'archived' });
    await new Promise((r) => setTimeout(r, 5));
    await h.send('PUT', `${T1}/programs/${id}`, 'fb-trn', { name: 'Güç 2', status: 'active' });
    expect(await outbox(h)).toHaveLength(2);
  });

  it('creating a program says nothing (the Firebase trigger fired on updates only); an account-less member has no device to tell', async () => {
    const h = await harness();
    await h.addUser('u-trn', ['trainer']);
    await h.send('POST', `${T1}/programs`, 'fb-trn', { memberId: 'u-mem', name: 'Direkt', status: 'active' });
    expect(await outbox(h)).toHaveLength(0);
    await h.run(`INSERT INTO users (id, display_name, created_at) VALUES ('mm1','Elle',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, managed, created_by, requested_at) VALUES ('t1','mm1','active','["member"]',1,'u-admin',1)`);
    const { id } = await json(await h.send('POST', `${T1}/programs`, 'fb-trn', { memberId: 'mm1', name: 'Elle için', status: 'draft' }));
    await h.send('PUT', `${T1}/programs/${id}`, 'fb-trn', { name: 'Elle için', status: 'active' });
    expect(await outbox(h)).toHaveLength(0);
  });
});
