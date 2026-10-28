import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth } from '../src/auth';
import { groupClasses, promoteWaitlist, runClassReminders } from '../src/groupClasses';
import type { Env, Vars } from '../src/types';
import { writes2 } from '../src/writes2';
import { harness, PROJECT } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

/**
 * Group classes beyond the unlimited entitlement (F3). The app is composed here (auth + writes2 + groupClasses)
 * so these tests do not depend on how index.ts mounts the router. Names carry [L<line>] of the rules-test line they port.
 */
const DAY = 86_400_000;
let h: Awaited<ReturnType<typeof harness>>;
let app: Hono<{ Bindings: Env; Variables: Vars }>;
const T = '/v1/tenants/t1';

beforeEach(async () => {
  h = await harness();
  app = new Hono<{ Bindings: Env; Variables: Vars }>();
  app.use('/v1/*', requireAuth);
  app.route('/v1', writes2);
  app.route('/v1', groupClasses);
});

const send = async (method: string, path: string, sub: string | null, body?: object) =>
  app.fetch(new Request(`http://x${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(sub ? { Authorization: `Bearer ${await h.sign(sub)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), { DB: h.db, API_OPEN: '1', FIREBASE_PROJECT_ID: PROJECT });
const json = async (r: Response) => (await r.json()) as any;

const klass = (id: string, o: { cap?: number; trainerId?: string; startsAt?: number; name?: string; tenant?: string } = {}) =>
  h.run(`INSERT INTO classes (id, tenant_id, data, starts_at) VALUES (?, ?, ?, ?)`, id, o.tenant ?? 't1',
    JSON.stringify({ name: o.name ?? 'Pilates', capacity: o.cap ?? 10, ...(o.trainerId ? { trainerId: o.trainerId } : {}) }), o.startsAt ?? Date.now() + 10 * DAY);
const activePackage = (member: string, o: { status?: string; unlimited?: boolean; endsAt?: number } = {}) =>
  h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
         VALUES (?, 't1', ?, 'g1', 0, 1, ?, ?, ?, 1)`, 'mp-' + member, member, o.endsAt ?? Date.now() + 60 * DAY, o.status ?? 'active',
    JSON.stringify({ entitlements: { groupClasses: o.unlimited ? { unlimited: true } : { count: 4, periodDays: 30 } } }));
const credit = (id: string, member: string, o: { total?: number; used?: number; expires?: number; kind?: string; status?: string; pkg?: string } = {}) =>
  h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
         VALUES (?, 't1', ?, ?, 'entitlement', ?, ?, ?, 1, ?, ?)`, id, member, o.kind ?? 'groupClass', o.pkg ?? 'mp-' + member,
    o.total ?? 4, o.used ?? 0, o.expires ?? Date.now() + 30 * DAY, o.status ?? 'active');
/** A member with an account, an active quota package and one groupClass credit `cr-<name>`. */
const withCredit = async (name: string, o: Parameters<typeof credit>[2] = {}) => {
  await h.addUser('u-' + name, ['member']);
  await activePackage('u-' + name);
  await credit('cr-' + name, 'u-' + name, o);
};
const withUnlimited = async (name: string) => { await h.addUser('u-' + name, ['member']); await activePackage('u-' + name, { unlimited: true }); };
const seat = (cls: string, member: string, creditId: string | null = null, at = 1) =>
  h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, credit_id, created_at) VALUES ('t1', ?, ?, ?, ?)`, cls, member, creditId, at);
const queue = (cls: string, member: string, at: number) =>
  h.run(`INSERT INTO class_waitlist (tenant_id, class_id, member_id, created_at) VALUES ('t1', ?, ?, ?)`, cls, member, at);
const used = async (id: string) => (await h.one(`SELECT used, status FROM member_credits WHERE id = ?`, id)) as { used: number; status: string };
const bookedIds = async (cls: string) => (await h.db.prepare(`SELECT member_id m FROM class_bookings WHERE class_id = ? ORDER BY created_at, rowid`).bind(cls).all<any>()).results.map((r: any) => r.m);
const waitIds = async (cls: string) => (await h.db.prepare(`SELECT member_id m FROM class_waitlist WHERE class_id = ? ORDER BY created_at, rowid`).bind(cls).all<any>()).results.map((r: any) => r.m);
const outbox = async () => (await h.db.prepare(`SELECT payload, dedupe_key FROM outbox ORDER BY created_at, rowid`).all<any>()).results.map((r: any) => ({ ...JSON.parse(r.payload), key: r.dedupe_key }));

describe('credit-paid booking (PER-9 / PKG-4)', () => {
  it('[L313] a quota member books with a credit: one credit spent, the booking remembers which', async () => {
    await withCredit('q');
    await klass('k1');
    const res = await send('POST', `${T}/classes/k1/book`, 'fb-q');
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ status: 'booked', creditId: 'cr-q' });
    expect(await used('cr-q')).toEqual({ used: 1, status: 'active' });
    expect(await h.one(`SELECT credit_id c FROM class_bookings WHERE class_id = 'k1'`)).toEqual({ c: 'cr-q' });
    // booking again is idempotent and spends nothing more
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-q')).status).toBe(201);
    expect((await used('cr-q')).used).toBe(1);
  });

  it('the last credit flips to exhausted; a member with no credit left cannot book', async () => {
    await withCredit('q', { total: 1 });
    await klass('k1'); await klass('k2');
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-q')).status).toBe(201);
    expect(await used('cr-q')).toEqual({ used: 1, status: 'exhausted' });
    expect((await send('POST', `${T}/classes/k2/book`, 'fb-q')).status).toBe(409);
    expect(await bookedIds('k2')).toEqual([]);
  });

  it('earliest-expiring credit first, and only one that is still good on the day of the class', async () => {
    await withCredit('q', { expires: Date.now() + 20 * DAY });
    await credit('cr-soon', 'u-q', { expires: Date.now() + 5 * DAY });     // expires before the class below: never usable for it
    await credit('cr-mid', 'u-q', { expires: Date.now() + 15 * DAY });
    await klass('far', { startsAt: Date.now() + 12 * DAY });
    await klass('near', { startsAt: Date.now() + 2 * DAY });
    await send('POST', `${T}/classes/far/book`, 'fb-q');
    expect((await h.one(`SELECT credit_id c FROM class_bookings WHERE class_id = 'far'`)).c).toBe('cr-mid');       // 'soon' skipped, 'mid' before 'cr-q'
    await send('POST', `${T}/classes/near/book`, 'fb-q');
    expect((await h.one(`SELECT credit_id c FROM class_bookings WHERE class_id = 'near'`)).c).toBe('cr-soon');     // earliest first when it still covers the class
  });

  it('refused: PT credit, expired credit, credit of a frozen package, credit of someone else, class already started, no membership', async () => {
    await withCredit('pt', { kind: 'ptLesson' });
    await withCredit('old', { expires: Date.now() - DAY });
    await withCredit('ice'); await h.run(`UPDATE member_packages SET status = 'frozen' WHERE id = 'mp-u-ice'`);
    await withCredit('ok');
    await h.addUser('u-thief', ['member']);
    await klass('k1'); await klass('past', { startsAt: Date.now() - 60_000 });
    for (const n of ['pt', 'old', 'ice']) expect((await send('POST', `${T}/classes/k1/book`, 'fb-' + n)).status, n).toBe(409);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-thief')).status).toBe(409);
    expect((await send('POST', `${T}/classes/past/book`, 'fb-ok')).status).toBe(409);
    await h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-ok'`);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-ok')).status).toBe(403);
    expect(await bookedIds('k1')).toEqual([]);
    expect((await used('cr-ok')).used).toBe(0);
  });

  it('[L336] a full class is a 409 on /book and spends nothing; the credit is not touched', async () => {
    await withCredit('a'); await withCredit('b');
    await klass('k1', { cap: 1 });
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-a')).status).toBe(201);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-b')).status).toBe(409);
    expect((await used('cr-b')).used).toBe(0);
  });

  it('two racing bookings for the last place: exactly one wins and the loser keeps their credit', async () => {
    await withCredit('a'); await withCredit('b');
    await klass('k1', { cap: 1 });
    const rs = await Promise.all([send('POST', `${T}/classes/k1/book`, 'fb-a'), send('POST', `${T}/classes/k1/book`, 'fb-b')]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await bookedIds('k1')).length).toBe(1);
    expect((await used('cr-a')).used + (await used('cr-b')).used).toBe(1);
  });

  it('unlimited keeps priority: no credit is spent when the member holds both', async () => {
    await withCredit('u'); await h.run(`UPDATE member_packages SET data = '{"entitlements":{"groupClasses":{"unlimited":true}}}' WHERE id = 'mp-u-u'`);
    await klass('k1');
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-u')).status).toBe(201);
    expect((await used('cr-u')).used).toBe(0);
    expect(await h.one(`SELECT credit_id c FROM class_bookings`)).toEqual({ c: null });
  });

  it('a class of another gym cannot be booked through this gym\'s path', async () => {
    await withCredit('q');
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await klass('k2', { tenant: 't2' });
    expect((await send('POST', `${T}/classes/k2/book`, 'fb-q')).status).toBe(404);
    expect((await used('cr-q')).used).toBe(0);
  });
});

describe('waitlist', () => {
  it('[L336] a full class: an eligible member joins the waitlist (201) and nothing is spent', async () => {
    await withUnlimited('first'); await withCredit('q');
    await klass('k1', { cap: 1 });
    await seat('k1', 'u-first');
    const res = await send('POST', `${T}/classes/k1/waitlist`, 'fb-q');
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({ status: 'waitlisted' });
    expect(await waitIds('k1')).toEqual(['u-q']);
    expect((await used('cr-q')).used).toBe(0);
    expect((await send('POST', `${T}/classes/k1/waitlist`, 'fb-q')).status).toBe(200);       // joining twice is a no-op
    expect(await waitIds('k1')).toEqual(['u-q']);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-q')).status).toBe(409);            // waiting is not booked
  });

  it('[L306] without an entitlement there is no waitlist either; neither for a class with free places, a started class, or a booked member', async () => {
    await h.addUser('u-bare', ['member']); await withCredit('q'); await withUnlimited('first');
    await klass('full', { cap: 1 }); await seat('full', 'u-first');
    await klass('open', { cap: 5 });
    await klass('past', { cap: 1, startsAt: Date.now() - 60_000 });
    expect((await send('POST', `${T}/classes/full/waitlist`, 'fb-bare')).status).toBe(409);
    expect((await send('POST', `${T}/classes/open/waitlist`, 'fb-q')).status).toBe(409);
    expect((await send('POST', `${T}/classes/past/waitlist`, 'fb-q')).status).toBe(409);
    expect((await send('POST', `${T}/classes/full/waitlist`, 'fb-first')).status).toBe(409);
    expect(await waitIds('full')).toEqual([]);
    await h.addUser('u-out', null);
    expect((await send('POST', `${T}/classes/full/waitlist`, 'fb-out')).status).toBe(403);
  });

  it('leaving the waitlist costs and refunds nothing, and a stranger cannot remove someone else', async () => {
    await withCredit('q'); await h.addUser('u-str', ['member']); await withUnlimited('first');
    await klass('k1', { cap: 1 }); await seat('k1', 'u-first'); await queue('k1', 'u-q', 5);
    expect((await send('DELETE', `${T}/classes/k1/waitlist`, 'fb-str', { memberId: 'u-q' })).status).toBe(403);
    expect(await waitIds('k1')).toEqual(['u-q']);
    expect((await send('DELETE', `${T}/classes/k1/waitlist`, 'fb-q')).status).toBe(200);
    expect(await waitIds('k1')).toEqual([]);
    await queue('k1', 'u-q', 6);
    const res = await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-q'));      // DELETE /book also leaves the waitlist
    expect(res).toMatchObject({ wasBooked: false, refunded: false });
    expect(await waitIds('k1')).toEqual([]);
    expect((await used('cr-q')).used).toBe(0);
  });

  it('a cancellation promotes the head of the waitlist: seat + credit spent + off the list + one push, in one go', async () => {
    await withCredit('a'); await withCredit('b'); await withCredit('c');
    await klass('k1', { cap: 1, name: 'Yoga' });
    await send('POST', `${T}/classes/k1/book`, 'fb-a');
    await send('POST', `${T}/classes/k1/waitlist`, 'fb-b');
    await send('POST', `${T}/classes/k1/waitlist`, 'fb-c');
    const res = await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-a'));
    expect(res).toMatchObject({ wasBooked: true, refunded: true, promoted: 1 });
    expect(await bookedIds('k1')).toEqual(['u-b']);
    expect(await waitIds('k1')).toEqual(['u-c']);
    expect(await used('cr-a')).toMatchObject({ used: 0 });
    expect(await used('cr-b')).toMatchObject({ used: 1 });
    expect((await used('cr-c')).used).toBe(0);
    expect(await h.one(`SELECT credit_id c FROM class_bookings WHERE member_id = 'u-b'`)).toEqual({ c: 'cr-b' });
    const pushes = await outbox();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ userIds: ['u-b'], title: 'Yerin açıldı 🎉', category: 'bookings', data: { screen: 'member/classes' } });
    expect(pushes[0].body).toContain('Yoga');
  });

  it('a head who can no longer pay is skipped (and stays listed); an unlimited head is promoted without a credit', async () => {
    await withCredit('a'); await withCredit('broke'); await withUnlimited('big'); await withCredit('late');
    await klass('k1', { cap: 1 });
    await send('POST', `${T}/classes/k1/book`, 'fb-a');
    await send('POST', `${T}/classes/k1/waitlist`, 'fb-broke');
    await send('POST', `${T}/classes/k1/waitlist`, 'fb-big');
    await h.run(`UPDATE member_credits SET used = total, status = 'exhausted' WHERE id = 'cr-broke'`);      // spent it elsewhere meanwhile
    await send('DELETE', `${T}/classes/k1/book`, 'fb-a');
    expect(await bookedIds('k1')).toEqual(['u-big']);
    expect(await waitIds('k1')).toEqual(['u-broke']);
    expect(await h.one(`SELECT credit_id c FROM class_bookings WHERE member_id = 'u-big'`)).toEqual({ c: null });
  });

  it('a cancelled place with nobody waiting just opens up; a started class promotes nobody', async () => {
    await withUnlimited('a'); await withCredit('w');
    await klass('k1', { cap: 1 }); await seat('k1', 'u-a');
    await send('DELETE', `${T}/classes/k1/book`, 'fb-a');
    expect(await bookedIds('k1')).toEqual([]);
    expect(await outbox()).toEqual([]);
    await klass('k2', { cap: 1, startsAt: Date.now() + 3600_000 }); await seat('k2', 'u-a'); await queue('k2', 'u-w', 3);
    await h.run(`UPDATE classes SET starts_at = ? WHERE id = 'k2'`, Date.now() - 1000);
    await send('DELETE', `${T}/classes/k2/book`, 'fb-a');
    expect(await bookedIds('k2')).toEqual([]);
    expect(await waitIds('k2')).toEqual(['u-w']);
  });

  it('staff can re-run the promotion after capacity is raised; a member cannot', async () => {
    await withUnlimited('a'); await withUnlimited('w'); await h.addUser('u-trn', ['trainer']);
    await klass('k1', { cap: 1, trainerId: 'u-trn' }); await seat('k1', 'u-a'); await queue('k1', 'u-w', 3);
    await h.run(`UPDATE classes SET data = json_set(data, '$.capacity', 2) WHERE id = 'k1'`);
    expect((await send('POST', `${T}/classes/k1/waitlist/promote`, 'fb-a')).status).toBe(403);
    expect(await json(await send('POST', `${T}/classes/k1/waitlist/promote`, 'fb-trn'))).toEqual({ promoted: 1 });
    expect(await bookedIds('k1')).toEqual(['u-a', 'u-w']);
    expect(await promoteWaitlist(h.db, 't1', 'k1')).toBe(0);
  });
});

describe('cancelling a booking (PER-9 + PKG-11)', () => {
  it('in time: the credit comes back; exhausted becomes active again; a second cancel refunds nothing more', async () => {
    await withCredit('q', { total: 1 });
    await klass('k1', { startsAt: Date.now() + 3 * DAY });
    await send('POST', `${T}/classes/k1/book`, 'fb-q');
    expect((await used('cr-q'))).toEqual({ used: 1, status: 'exhausted' });
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-q'))).toMatchObject({ wasBooked: true, refunded: true });
    expect(await used('cr-q')).toEqual({ used: 0, status: 'active' });
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-q'))).toMatchObject({ wasBooked: false, refunded: false });
    expect((await used('cr-q')).used).toBe(0);
  });

  it('late (inside the gym\'s cancellationHours): the credit stays spent, the place is released', async () => {
    await withCredit('q');
    await klass('k1', { startsAt: Date.now() + 3 * 3600_000 });                        // 3h ahead, default policy 24h
    await seat('k1', 'u-q', 'cr-q'); await h.run(`UPDATE member_credits SET used = 1 WHERE id = 'cr-q'`);
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-q'))).toMatchObject({ wasBooked: true, refunded: false });
    expect((await used('cr-q')).used).toBe(1);
    expect(await bookedIds('k1')).toEqual([]);
  });

  it('the gym\'s own cancellationHours decides', async () => {
    await withCredit('q');
    await h.run(`UPDATE tenants SET settings = '{"cancellationHours":2}' WHERE id = 't1'`);
    await klass('k1', { startsAt: Date.now() + 3 * 3600_000 });
    await seat('k1', 'u-q', 'cr-q'); await h.run(`UPDATE member_credits SET used = 1 WHERE id = 'cr-q'`);
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-q'))).toMatchObject({ refunded: true });
    expect((await used('cr-q')).used).toBe(0);
  });

  it('[L348] only your own booking: a stranger cannot cancel it; a trainer who does not own the class cannot either', async () => {
    await withCredit('q'); await h.addUser('u-str', ['member']); await h.addUser('u-trn2', ['trainer']);
    await klass('k1', { trainerId: 'u-other' });
    await seat('k1', 'u-q', 'cr-q'); await h.run(`UPDATE member_credits SET used = 1 WHERE id = 'cr-q'`);
    expect((await send('DELETE', `${T}/classes/k1/book`, 'fb-str', { memberId: 'u-q' })).status).toBe(403);
    expect((await send('DELETE', `${T}/classes/k1/book`, 'fb-trn2', { memberId: 'u-q' })).status).toBe(403);
    expect(await bookedIds('k1')).toEqual(['u-q']);
    expect((await used('cr-q')).used).toBe(1);
  });

  it('staff cancelling for a member always refunds, even inside the notice period; admin and owning trainer both may', async () => {
    await withCredit('q'); await withCredit('r'); await h.addUser('u-trn', ['trainer']);
    await klass('k1', { startsAt: Date.now() + 2 * 3600_000, trainerId: 'u-trn' });
    for (const m of ['q', 'r']) { await seat('k1', 'u-' + m, 'cr-' + m); await h.run(`UPDATE member_credits SET used = 1 WHERE id = ?`, 'cr-' + m); }
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-trn', { memberId: 'u-q' }))).toMatchObject({ refunded: true });
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-admin', { memberId: 'u-r' }))).toMatchObject({ refunded: true });
    expect([(await used('cr-q')).used, (await used('cr-r')).used]).toEqual([0, 0]);
  });

  it('an unlimited booking has no credit to return; cancelling needs no entitlement at all', async () => {
    await withUnlimited('u'); await klass('k1');
    await seat('k1', 'u-u');
    await h.run(`UPDATE member_packages SET status = 'expired'`);
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-u'))).toMatchObject({ wasBooked: true, refunded: false });
    expect(await bookedIds('k1')).toEqual([]);
  });

  it('the refund is conditional on the booking row: a cancel of a booking that is already gone changes no credit', async () => {
    await withCredit('q'); await klass('k1');
    await seat('k1', 'u-q', 'cr-q'); await h.run(`UPDATE member_credits SET used = 1 WHERE id = 'cr-q'`);
    const rs = await Promise.all([send('DELETE', `${T}/classes/k1/book`, 'fb-q'), send('DELETE', `${T}/classes/k1/book`, 'fb-q')]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect((await used('cr-q')).used).toBe(0);                                          // never -1, never twice
  });
});

describe('guardian acts for a child (MEMBER-5c)', () => {
  const kid = async () => {
    await withCredit('par');
    await h.addUser('u-kid', ['member']); await activePackage('u-kid'); await credit('cr-kid', 'u-kid');
    await h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
  };

  it('[L2927] an approved parent books with the CHILD\'s credit, never the parent\'s; and cancels for the child', async () => {
    await kid(); await klass('k1');
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(201);
    expect(await bookedIds('k1')).toEqual(['u-kid']);
    expect((await used('cr-kid')).used).toBe(1);
    expect((await used('cr-par')).used).toBe(0);
    expect(await json(await send('DELETE', `${T}/classes/k1/book`, 'fb-par', { memberId: 'u-kid' }))).toMatchObject({ wasBooked: true, refunded: true });
    expect((await used('cr-kid')).used).toBe(0);
  });

  it('the parent needs no entitlement of their own, but the child must have one', async () => {
    await kid(); await klass('k1');
    await h.run(`DELETE FROM member_credits WHERE id = 'cr-par'`);
    await h.run(`UPDATE member_credits SET used = total, status = 'exhausted' WHERE id = 'cr-kid'`);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(409);
    await h.run(`UPDATE member_credits SET used = 0, status = 'active' WHERE id = 'cr-kid'`);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(201);
  });

  it('a pending link, someone else\'s child and a stranger are all refused; a parent can waitlist the child', async () => {
    await kid(); await h.addUser('u-oth', ['member']); await klass('k1'); await klass('full', { cap: 1 });
    await seat('full', 'u-par', 'cr-par');
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-par', { memberId: 'u-oth' })).status).toBe(403);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-oth', { memberId: 'u-kid' })).status).toBe(403);
    expect((await send('POST', `${T}/classes/full/waitlist`, 'fb-par', { memberId: 'u-kid' })).status).toBe(201);
    expect(await waitIds('full')).toEqual(['u-kid']);
    await h.run(`UPDATE memberships SET guardian_status = 'pending' WHERE member_id = 'u-kid'`);
    expect((await send('POST', `${T}/classes/k1/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(403);
    expect((await send('POST', `${T}/classes/full/waitlist`, 'fb-par', { memberId: 'u-kid' })).status).toBe(403);
    expect((await send('DELETE', `${T}/classes/full/waitlist`, 'fb-par', { memberId: 'u-kid' })).status).toBe(403);
  });
});

describe('cancelling a class refunds credit-paid bookings (DEN-8 / CX-03)', () => {
  const refunds = async () => (await h.db.prepare(`SELECT member_id m, outcome o, credit_id c, class_name n FROM class_cancellation_refunds ORDER BY member_id`).all<any>()).results as any[];

  it('[L366] refunds every credit-backed booking in one go, writes the history, pushes everyone booked or waitlisted, leaves unlimited alone', async () => {
    await withCredit('a', { used: 3 }); await withCredit('b', { total: 2, used: 2, status: 'exhausted' }); await withUnlimited('u'); await withCredit('w');
    await klass('k1', { name: 'Yoga' });
    await seat('k1', 'u-a', 'cr-a'); await seat('k1', 'u-b', 'cr-b'); await seat('k1', 'u-u', null); await queue('k1', 'u-w', 9);
    const res = await send('DELETE', `${T}/classes/k1`, 'fb-admin');
    expect(res.status).toBe(200);
    expect((await json(res)).refunds).toEqual({ refunded: 2 });
    expect(await used('cr-a')).toEqual({ used: 2, status: 'active' });
    expect(await used('cr-b')).toEqual({ used: 1, status: 'active' });                 // exhausted -> active
    expect((await used('cr-w')).used).toBe(0);
    expect(await refunds()).toEqual([
      { m: 'u-a', o: 'refunded', c: 'cr-a', n: 'Yoga' }, { m: 'u-b', o: 'refunded', c: 'cr-b', n: 'Yoga' },
    ]);
    expect(await h.one(`SELECT count(*) c FROM classes`)).toEqual({ c: 0 });
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
    expect(await h.one(`SELECT count(*) c FROM class_waitlist`)).toEqual({ c: 0 });
    const pushes = await outbox();
    expect(pushes).toHaveLength(1);
    expect(pushes[0].userIds.sort()).toEqual(['u-a', 'u-b', 'u-u', 'u-w']);
    expect(pushes[0]).toMatchObject({ title: 'Ders iptal edildi', category: 'bookings', key: 'class-cancelled:k1' });
    expect(pushes[0].body).toContain('Yoga');
    // deleting again is a no-op: no second refund
    expect((await send('DELETE', `${T}/classes/k1`, 'fb-admin')).status).toBe(200);
    expect((await used('cr-a')).used).toBe(2);
  });

  it('the owning trainer can cancel (and refund); another trainer cannot, and nothing is refunded for them', async () => {
    await withCredit('a', { used: 1 }); await h.addUser('u-trn', ['trainer']); await h.addUser('u-trn2', ['trainer']);
    await klass('k1', { trainerId: 'u-trn' }); await seat('k1', 'u-a', 'cr-a');
    expect((await send('DELETE', `${T}/classes/k1`, 'fb-trn2')).status).toBe(403);
    expect((await used('cr-a')).used).toBe(1);
    expect((await send('DELETE', `${T}/classes/k1`, 'fb-trn')).status).toBe(200);
    expect((await used('cr-a')).used).toBe(0);
  });

  it('a class that already started refunds and notifies nobody: it was attended', async () => {
    await withCredit('a', { used: 1 });
    await klass('k1', { startsAt: Date.now() - 60_000 }); await seat('k1', 'u-a', 'cr-a');
    expect((await send('DELETE', `${T}/classes/k1`, 'fb-admin')).status).toBe(200);
    expect((await used('cr-a')).used).toBe(1);
    expect(await refunds()).toEqual([]);
    expect(await outbox()).toEqual([]);
    expect(await h.one(`SELECT count(*) c FROM classes`)).toEqual({ c: 0 });
  });

  it('a nobody-booked class is deleted without an outbox row; the credit is never driven below zero', async () => {
    await withCredit('a', { used: 0 });
    await klass('empty'); await klass('k1'); await seat('k1', 'u-a', 'cr-a');
    await send('DELETE', `${T}/classes/empty`, 'fb-admin');
    expect(await outbox()).toEqual([]);
    await send('DELETE', `${T}/classes/k1`, 'fb-admin');
    expect((await used('cr-a')).used).toBe(0);
    expect(await refunds()).toEqual([{ m: 'u-a', o: 'nothing-to-refund', c: 'cr-a', n: 'Pilates' }]);
  });

  it('credit-mismatch: a booking pointing at someone else\'s credit, or a PT credit, is recorded and never refunded', async () => {
    await withCredit('a', { used: 2 }); await withCredit('b', { used: 2 }); await withCredit('pt', { used: 2, kind: 'ptLesson' });
    await klass('k1');
    await seat('k1', 'u-a', 'cr-b');                       // member a, credit of b
    await seat('k1', 'u-b', 'cr-pt');                      // member b, credit of pt member (also mismatch)
    await h.addUser('u-pt2', ['member']); await credit('cr-pt2', 'u-pt2', { kind: 'ptLesson', used: 2 }); await seat('k1', 'u-pt2', 'cr-pt2');   // right owner, wrong kind
    await send('DELETE', `${T}/classes/k1`, 'fb-admin');
    expect((await refunds()).map((r) => r.o)).toEqual(['credit-mismatch', 'credit-mismatch', 'credit-mismatch']);
    expect([(await used('cr-b')).used, (await used('cr-pt')).used, (await used('cr-pt2')).used]).toEqual([2, 2, 2]);
  });

  // D1 always enforces foreign keys, so a dangling credit cannot exist there: shim-only scenario.
  it.skipIf(process.env.REAL_D1)('credit-missing: a booking whose credit row is gone is recorded, the delete still goes through', async () => {
    await h.addUser('u-a', ['member']); await klass('k1');
    await h.run('PRAGMA foreign_keys = OFF');
    await seat('k1', 'u-a', 'cr-gone');
    await h.run('PRAGMA foreign_keys = ON');
    expect((await send('DELETE', `${T}/classes/k1`, 'fb-admin')).status).toBe(200);
    expect(await refunds()).toEqual([{ m: 'u-a', o: 'credit-missing', c: 'cr-gone', n: 'Pilates' }]);
    expect(await h.one(`SELECT count(*) c FROM classes`)).toEqual({ c: 0 });
  });

  it('idempotent history: an existing (class, member) marker blocks a second refund of the same pair', async () => {
    await withCredit('a', { used: 3 }); await klass('k1'); await seat('k1', 'u-a', 'cr-a');
    await h.run(`INSERT INTO class_cancellation_refunds (id, tenant_id, class_id, class_name, class_date, member_id, credit_id, outcome, created_at)
                 VALUES ('old','t1','k1','Pilates',1,'u-a','cr-a','refunded',1)`);
    await send('DELETE', `${T}/classes/k1`, 'fb-admin');
    expect((await used('cr-a')).used).toBe(3);                                         // marker was there: nothing decremented
    expect((await refunds()).length).toBe(1);
  });

  it('a member cannot delete a class and the class survives with its bookings and credits untouched', async () => {
    await withCredit('a', { used: 1 }); await klass('k1'); await seat('k1', 'u-a', 'cr-a');
    expect((await send('DELETE', `${T}/classes/k1`, 'fb-a')).status).toBe(403);
    expect((await used('cr-a')).used).toBe(1);
    expect(await bookedIds('k1')).toEqual(['u-a']);
    expect(await outbox()).toEqual([]);
  });
});

describe('the register (PER-8)', () => {
  const mark = (sub: string, body: object, cls = 'k1') => send('PUT', `${T}/classes/${cls}/attendance`, sub, body);
  beforeEach(async () => {
    await h.addUser('u-trn', ['trainer']); await h.addUser('u-trn2', ['trainer']); await withUnlimited('m');
    await klass('k1', { trainerId: 'u-trn' }); await seat('k1', 'u-m', null);
  });
  const markOf = async () => (await h.one(`SELECT mark FROM class_attendance WHERE class_id = 'k1' AND member_id = 'u-m'`))?.mark ?? null;

  it('[L1096] the owning trainer can take the register: present, absent, changed, cleared', async () => {
    expect((await mark('fb-trn', { memberId: 'u-m', value: 'present' })).status).toBe(200);
    expect(await markOf()).toBe('present');
    expect((await mark('fb-trn', { memberId: 'u-m', value: 'absent' })).status).toBe(200);
    expect(await markOf()).toBe('absent');
    expect((await mark('fb-trn', { memberId: 'u-m', value: null })).status).toBe(200);
    expect(await markOf()).toBeNull();
  });

  it('an admin can take the register of any class', async () => {
    expect((await mark('fb-admin', { memberId: 'u-m', value: 'present' })).status).toBe(200);
    expect(await markOf()).toBe('present');
  });

  it('[L1103] another trainer cannot; [L1140] a member cannot; a class with no trainerId stays admin-only [L1127]', async () => {
    expect((await mark('fb-trn2', { memberId: 'u-m', value: 'present' })).status).toBe(403);
    expect((await mark('fb-m', { memberId: 'u-m', value: 'present' })).status).toBe(403);
    await klass('legacy'); await seat('legacy', 'u-m', null);
    expect((await mark('fb-trn', { memberId: 'u-m', value: 'present' }, 'legacy')).status).toBe(403);
    expect((await mark('fb-admin', { memberId: 'u-m', value: 'present' }, 'legacy')).status).toBe(200);
    expect(await markOf()).toBeNull();
  });

  it('only booked members can be marked, only known values, and a cancelled booking takes its mark with it', async () => {
    await h.addUser('u-x', ['member']);
    expect((await mark('fb-trn', { memberId: 'u-x', value: 'present' })).status).toBe(409);
    expect((await mark('fb-trn', { memberId: 'u-m', value: 'late' })).status).toBe(400);
    expect((await mark('fb-trn', { value: 'present' })).status).toBe(400);
    expect((await mark('fb-trn', { memberId: 'u-m', value: 'present' }, 'nope')).status).toBe(404);
    await mark('fb-trn', { memberId: 'u-m', value: 'present' });
    await send('DELETE', `${T}/classes/k1/book`, 'fb-m');
    expect(await markOf()).toBeNull();
  });

  it('roster: staff see bookings (how paid), waitlist and register; a member does not', async () => {
    await withCredit('c'); await seat('k1', 'u-c', 'cr-c', 5); await queue('k1', 'u-trn2', 7);
    await mark('fb-trn', { memberId: 'u-c', value: 'absent' });
    expect((await send('GET', `${T}/classes/k1/roster`, 'fb-m')).status).toBe(403);
    const r = await json(await send('GET', `${T}/classes/k1/roster`, 'fb-trn2'));
    expect(r.booked).toEqual([
      { memberId: 'u-m', name: 'u-m', paidWithCredit: false, bookedAt: 1, attendance: null },
      { memberId: 'u-c', name: 'u-c', paidWithCredit: true, bookedAt: 5, attendance: 'absent' },
    ]);
    expect(r.waitlist).toEqual([{ memberId: 'u-trn2', name: 'u-trn2', joinedAt: 7 }]);
  });
});

describe('reads the class list cannot carry', () => {
  it('occupancy counts for any member; "my bookings" for self, guardian and staff, nobody else', async () => {
    await withUnlimited('m'); await withUnlimited('w'); await h.addUser('u-str', ['member']);
    await klass('k1', { cap: 1 }); await seat('k1', 'u-m'); await queue('k1', 'u-w', 3);
    expect(await json(await send('GET', `${T}/class-occupancy`, 'fb-str'))).toEqual([{ classId: 'k1', booked: 1, waitlisted: 1 }]);
    await h.addUser('u-out', null);
    expect((await send('GET', `${T}/class-occupancy`, 'fb-out')).status).toBe(403);
    const mine = await json(await send('GET', `${T}/class-bookings`, 'fb-w'));
    expect(mine).toMatchObject([{ classId: 'k1', status: 'waitlisted' }]);
    expect((await send('GET', `${T}/class-bookings?memberId=u-m`, 'fb-w')).status).toBe(403);
    expect((await send('GET', `${T}/class-bookings?memberId=u-m`, 'fb-admin')).status).toBe(200);
    await h.run(`UPDATE memberships SET guardian_id = 'u-str', guardian_status = 'approved' WHERE member_id = 'u-m'`);
    expect(await json(await send('GET', `${T}/class-bookings?memberId=u-m`, 'fb-str'))).toMatchObject([{ classId: 'k1', status: 'booked', paidWithCredit: false }]);
  });
});

describe('class reminders', () => {
  it('queues one push per class starting in the window to the booked members only, and only once', async () => {
    await withUnlimited('m'); await withUnlimited('w');
    const now = Date.now();
    await klass('soon', { startsAt: now + 70 * 60_000, name: 'Spinning' }); await seat('soon', 'u-m'); await queue('soon', 'u-w', 2);
    await klass('later', { startsAt: now + 5 * 3600_000 }); await seat('later', 'u-m');
    await klass('nobody', { startsAt: now + 65 * 60_000 });
    expect(await runClassReminders(h.db, now)).toBe(2);
    const pushes = await outbox();
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ userIds: ['u-m'], title: 'Dersin yaklaşıyor', category: 'bookings', key: 'class-reminder:soon' });
    expect(pushes[0].body).toContain('Spinning');
    expect(await runClassReminders(h.db, now + 1000)).toBe(0);
    expect(await outbox()).toHaveLength(1);
  });
});
