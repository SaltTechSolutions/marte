import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

type H = Awaited<ReturnType<typeof harness>>;
const NOW = Date.now();
const DAY = 86_400_000;
const T1 = '/v1/tenants/t1';
const body = { name: 'Pilates', capacity: 10, trainerId: 'u-tr', startsAt: NOW + DAY, repeat: { everyDays: 7, count: 4 } };
const create = async (h: H, sub: string, b: object = body) => {
  const r = await h.send('POST', `${T1}/classes/series`, sub, b);
  return { status: r.status, body: (await r.json()) as any };
};
const rows = async (h: H) => (await h.db.prepare(`SELECT id, data, starts_at FROM classes ORDER BY starts_at`).all<any>()).results;

async function world() {
  const h = await harness();
  await h.addUser('u-tr', ['trainer']);
  await h.addUser('u-tr2', ['trainer']);
  return h;
}

describe('POST classes/series', () => {
  it('creates every occurrence at once: shared seriesId, same wall-clock time each week, ids in date order', async () => {
    const h = await world();
    const r = await create(h, 'fb-admin');
    expect(r.status).toBe(201);
    expect(r.body.ids).toHaveLength(4);
    expect(typeof r.body.seriesId).toBe('string');
    const list = await rows(h);
    expect(list.map((x) => x.id)).toEqual(r.body.ids);
    expect(list.map((x) => x.starts_at)).toEqual([0, 1, 2, 3].map((i) => body.startsAt + i * 7 * DAY));       // Istanbul has no daylight saving
    for (const x of list) expect(JSON.parse(x.data)).toEqual({ name: 'Pilates', capacity: 10, trainerId: 'u-tr', seriesId: r.body.seriesId });
    const api = (await (await h.send('GET', `${T1}/classes`, 'fb-mem')).json()) as any[];
    expect(api).toHaveLength(4);
    expect(api[0]).toMatchObject({ id: r.body.ids[0], seriesId: r.body.seriesId, name: 'Pilates' });
    // two series never share an id
    const again = await create(h, 'fb-admin');
    expect(again.body.seriesId).not.toBe(r.body.seriesId);
    expect(await h.one(`SELECT count(*) c FROM classes`)).toEqual({ c: 8 });
  });

  it("keeps the gym's local time across a daylight-saving change", async () => {
    const h = await world();
    await h.run(`UPDATE tenants SET settings = '{"timeZone":"Europe/Berlin"}' WHERE id = 't1'`);
    const first = Date.UTC(2026, 2, 22, 9, 0);                 // 10:00 in Berlin (CET)
    const r = await create(h, 'fb-admin', { ...body, startsAt: first, repeat: { everyDays: 7, count: 3 } });
    expect((await rows(h)).map((x) => x.starts_at)).toEqual([first, Date.UTC(2026, 2, 29, 8, 0), Date.UTC(2026, 3, 5, 8, 0)]);   // 10:00 CEST from 29 March
    expect(r.status).toBe(201);
  });

  it('admin for anyone, a trainer only for their own classes, a member never; invalid input writes nothing', async () => {
    const h = await world();
    expect((await create(h, 'fb-tr')).status).toBe(201);
    expect((await create(h, 'fb-tr', { ...body, trainerId: 'u-tr2' })).status).toBe(403);
    expect((await create(h, 'fb-tr', { ...body, trainerId: undefined })).status).toBe(403);
    expect((await create(h, 'fb-mem')).status).toBe(403);
    expect((await create(h, 'fb-admin', { ...body, trainerId: 'u-tr2' })).status).toBe(201);
    expect((await h.send('POST', `${T1}/classes/series`, null, body)).status).toBe(401);
    const n = (await rows(h)).length;
    expect(n).toBe(8);
    const bad: object[] = [
      { ...body, repeat: undefined }, { ...body, repeat: { everyDays: 7 } }, { ...body, repeat: { count: 3 } },
      { ...body, repeat: { everyDays: 7, count: 53 } }, { ...body, repeat: { everyDays: 7, count: 0 } }, { ...body, repeat: { everyDays: 0, count: 3 } },
      { ...body, repeat: { everyDays: 7.5, count: 3 } }, { ...body, repeat: { everyDays: '7', count: 3 } }, { ...body, repeat: 'weekly' },
      { ...body, capacity: 0 }, { ...body, name: '' }, { ...body, startsAt: 'tomorrow' },
    ];
    for (const b of bad) expect((await create(h, 'fb-admin', b)).status, JSON.stringify(b)).toBe(400);
    expect((await rows(h)).length).toBe(n);
    expect((await create(h, 'fb-admin', { ...body, repeat: { everyDays: 1, count: 52 } })).body.ids).toHaveLength(52);
  });
});

describe('DELETE classes/series/:seriesId', () => {
  /** A 4-week series that began a week ago (so occurrence 0 is past), with bookings paid by credit on occurrences 1 and 2. */
  async function seeded() {
    const h = await world();
    const r = await create(h, 'fb-admin', { ...body, startsAt: NOW - 7 * DAY + 3_600_000 });
    const [past, k1, k2, k3] = r.body.ids as string[];
    await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('pk1','t1','{}')`);
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, assigned_at) VALUES ('mp1','t1','u-mem','pk1',1,1,${NOW + 60 * DAY},'active',1)`);
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES
      ('cr1','t1','u-mem','groupClass','entitlement','mp1',4,3,1,${NOW + 60 * DAY},'active')`);
    await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, credit_id, created_at) VALUES ('t1',?,'u-mem','cr1',1), ('t1',?,'u-mem','cr1',1), ('t1',?,'u-mem','cr1',1)`, past, k1, k2);
    await h.run(`INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at) VALUES ('t1',?,'u-tr2',1)`, k3);
    return { h, seriesId: r.body.seriesId as string, ids: r.body.ids as string[], past, k1, k2, k3 };
  }
  const del = (h: H, sub: string, seriesId: string, qs = '') => h.send('DELETE', `${T1}/classes/series/${seriesId}${qs}`, sub);

  it('deletes the occurrences that have not started, each refunded and announced exactly like a single delete; the past one stays', async () => {
    const { h, seriesId, past, k1, k2, k3 } = await seeded();
    const r = await del(h, 'fb-admin', seriesId);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, deleted: 3, refunds: { refunded: 2 } });
    expect((await rows(h)).map((x) => x.id)).toEqual([past]);
    expect(await h.one(`SELECT used u FROM member_credits WHERE id = 'cr1'`)).toEqual({ u: 1 });           // 3 used, two given back (the past booking stays spent)
    expect(await h.one(`SELECT count(*) c FROM class_bookings WHERE class_id IN (?, ?)`, k1, k2)).toEqual({ c: 0 });
    expect(await h.one(`SELECT count(*) c FROM class_waitlist WHERE class_id = ?`, k3)).toEqual({ c: 0 });
    const keys = (await h.db.prepare(`SELECT dedupe_key k, payload p FROM outbox ORDER BY dedupe_key`).all<any>()).results;
    expect(keys.map((x) => x.k).sort()).toEqual([`class-cancelled:${k1}`, `class-cancelled:${k2}`, `class-cancelled:${k3}`].sort());
    expect(keys.map((x) => JSON.parse(x.p).userIds)).toEqual(expect.arrayContaining([['u-mem'], ['u-tr2']]));
    // repeatable: nothing left is a successful no-op
    expect(await (await del(h, 'fb-admin', seriesId)).json()).toEqual({ ok: true, deleted: 0, refunds: {} });
  });

  it('?from= narrows it; it can never reach back into what already took place', async () => {
    const { h, seriesId, ids } = await seeded();
    const k2At = (await h.one(`SELECT starts_at s FROM classes WHERE id = ?`, ids[2])).s;
    expect((await (await del(h, 'fb-admin', seriesId, `?from=${k2At}`)).json()) as any).toMatchObject({ deleted: 2 });
    expect((await rows(h)).map((x) => x.id)).toEqual([ids[0], ids[1]]);
    expect(((await (await del(h, 'fb-admin', seriesId, `?from=1`)).json()) as any).deleted).toBe(1);      // from far in the past: still only the future ones
    expect((await rows(h)).map((x) => x.id)).toEqual([ids[0]]);
    expect((await del(h, 'fb-admin', seriesId, '?from=abc')).status).toBe(400);
  });

  it('admin or the owning trainer; another trainer or a member gets 403 and nothing is deleted; other series are untouched', async () => {
    const { h, seriesId } = await seeded();
    const other = await create(h, 'fb-admin', { ...body, trainerId: 'u-tr2', name: 'Yoga' });
    for (const sub of ['fb-tr2', 'fb-mem']) expect((await del(h, sub, seriesId)).status, sub).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM classes WHERE json_extract(data, '$.seriesId') = ?`, seriesId)).toEqual({ c: 4 });
    expect((await del(h, null as never, seriesId)).status).toBe(401);
    expect((await del(h, 'fb-tr', seriesId)).status).toBe(200);
    expect(await h.one(`SELECT count(*) c FROM classes WHERE json_extract(data, '$.seriesId') = ?`, other.body.seriesId)).toEqual({ c: 4 });
    // a gym cannot delete another gym's series by id
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-oa', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-oa','active','["admin"]',1)`);
    expect(await (await h.send('DELETE', `/v1/tenants/t2/classes/series/${other.body.seriesId}`, 'fb-oa')).json()).toMatchObject({ deleted: 0 });
    expect(await h.one(`SELECT count(*) c FROM classes WHERE json_extract(data, '$.seriesId') = ?`, other.body.seriesId)).toEqual({ c: 4 });
  });

  it('a series with a single class of someone else\'s in it is refused for a trainer as a whole', async () => {
    const { h, seriesId, k2 } = await seeded();
    await h.run(`UPDATE classes SET data = json_set(data, '$.trainerId', 'u-tr2') WHERE id = ?`, k2);
    expect((await del(h, 'fb-tr', seriesId)).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM classes`)).toEqual({ c: 4 });
  });
});
