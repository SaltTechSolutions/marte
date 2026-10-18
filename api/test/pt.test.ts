import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth } from '../src/auth';
import {
  computeCancellationDeadline, isWithinAvailability, tenantTimeFrom, zonedTimeToMs, localParts, type Availability,
} from '../src/cancellationDeadline';
import { pt } from '../src/pt';
import { sendPtReminders } from '../src/ptReminders';
import type { Env, Vars } from '../src/types';
import { harness, PROJECT } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

/**
 * PT sessions (F3): bookPtSessions, cancelPtSession, createPtSessionByStaff, complete, hand-over / take-over.
 * [L<n>] = backend/tests/firestore.rules.test.ts line of the rules test the case ports.
 * The pt router is mounted here the way index.ts mounts it (`/v1`, behind requireAuth).
 */
let h: Awaited<ReturnType<typeof harness>>;
const app = new Hono<{ Bindings: Env; Variables: Vars }>();
app.use('/v1/*', requireAuth);
app.route('/v1', pt);

const TZ = 'Europe/Istanbul';
const HOUR = 3_600_000;
const T = '/v1/tenants/t1/pt-sessions';
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Local (Istanbul) wall-clock instant `days` from today at hh:mm. */
function at(days: number, hh: number, mm = 0): number {
  const p = localParts(Date.now() + days * 86_400_000, TZ);
  return zonedTimeToMs(p.year, p.month, p.day, hh, mm, TZ);
}
const weekdayKey = (ms: number) => ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][(localParts(ms, TZ).weekday + 6) % 7];

type Db = D1Database;
async function send(method: string, path: string, sub: string | null, body?: object, db: Db = h.db) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (sub) headers.Authorization = `Bearer ${await h.sign(sub)}`;
  const res = await app.fetch(new Request(`http://x${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), { DB: db, FIREBASE_PROJECT_ID: PROJECT });
  return res;
}
/** The whole app (reads2 etc.), for checks that the existing read endpoints keep working. */
async function getFull(path: string, sub: string) {
  const { default: full } = await import('../src/index');
  return full.fetch(new Request(`http://x${path}`, { headers: { Authorization: `Bearer ${await h.sign(sub)}` } }), { DB: h.db, FIREBASE_PROJECT_ID: PROJECT });
}
/** A DB whose batch() first runs `hook`, to land a rival write between the pre-checks and the batch. */
/** A DB whose single-statement writes matching `match` first run `hook` (for routes without a batch). */
const racingStmt = (match: RegExp, hook: () => Promise<unknown>): Db => ({
  ...h.db,
  prepare: (q: string) => {
    const st = (h.db as any).prepare(q);
    if (!match.test(q)) return st;
    return { ...st, bind: (...a: unknown[]) => { const b = st.bind(...a); return { ...b, run: async () => { await hook(); return b.run(); } }; } };
  },
}) as unknown as Db;
const racing = (hook: () => Promise<unknown>): Db => ({ ...h.db, batch: async (l: unknown[]) => { await hook(); return (h.db as any).batch(l); } }) as unknown as Db;

const credit = (id: string, over: Partial<{ total: number; used: number; expires: number; status: string; member: string; kind: string }> = {}) =>
  h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
         VALUES (?, 't1', ?, ?, 'purchase', 'pkg', ?, ?, 1, ?, ?)`,
    id, over.member ?? 'u-mem', over.kind ?? 'ptLesson', over.total ?? 5, over.used ?? 0, over.expires ?? at(60, 12), over.status ?? 'active');
const cr = (id: string) => h.one(`SELECT used, status FROM member_credits WHERE id = ?`, id);
const sessions = async (where = '1=1') => (await h.db.prepare(`SELECT * FROM pt_sessions WHERE ${where} ORDER BY starts_at`).all<any>()).results;
const avail = (days: number, over: object = {}) => h.run(
  `INSERT OR REPLACE INTO trainer_availability (tenant_id, trainer_id, weekly, slot_minutes, exceptions, updated_at) VALUES ('t1','u-trn',?,60,'[]',1)`,
  JSON.stringify({ [weekdayKey(at(days, 12))]: [{ start: '09:00', end: '13:00' }], ...over }));
const seedSession = (id: string, over: Partial<{ trainer: string; member: string; start: number; dur: number; status: string; credit: string | null; deadline: number | null }> = {}) =>
  h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, cancellation_deadline_at, created_at, updated_at)
         VALUES (?, 't1', ?, ?, ?, ?, ?, ?, ?, 1, 1)`, id, over.trainer ?? 'u-trn', over.member ?? 'u-mem', over.start ?? at(3, 10), over.dur ?? 60,
    over.status ?? 'scheduled', over.credit === undefined ? null : over.credit, over.deadline === undefined ? null : over.deadline);

const D = 3;                                   // sessions live 3 days ahead
beforeEach(async () => {
  h = await harness();
  await h.addUser('u-trn', ['trainer']);
  await h.addUser('u-trn2', ['trainer']);
  await h.addUser('u-trn3', ['trainer']);
  await h.addUser('u-mem2', ['member']);
  await avail(D);
});

// ---------------------------------------------------------------------------------------------------------
describe('PT: deadline + availability arithmetic (pure)', () => {
  const t = (over: object = {}) => ({ timeZone: TZ, ...over });
  it('default: 24h before, in gym local time', () => {
    const start = zonedTimeToMs(2026, 11, 10, 14, 0, TZ);
    expect(computeCancellationDeadline(start, t())).toBe(zonedTimeToMs(2026, 11, 9, 14, 0, TZ));
  });
  it('a morning session cannot be made to need a 05:00 cancellation: it moves back to the previous closing time', () => {
    const start = zonedTimeToMs(2026, 11, 10, 7, 0, TZ);
    expect(computeCancellationDeadline(start, t({ cancellationHours: 2, openingHours: { 2: { open: '07:00', close: '21:00' }, 1: { open: '07:00', close: '21:30' } } })))
      .toBe(zonedTimeToMs(2026, 11, 9, 21, 30, TZ));    // 10 Nov 2026 is a Tuesday, Monday closes 21:30
    expect(computeCancellationDeadline(start, t({ cancellationHours: 2 }))).toBe(zonedTimeToMs(2026, 11, 9, 22, 0, TZ));   // no hours set: assumed 22:00
  });
  it('a gym open until midnight never pushes the deadline LATER than the notice period', () => {
    const start = zonedTimeToMs(2026, 11, 10, 7, 0, TZ);
    expect(computeCancellationDeadline(start, t({ cancellationHours: 12, openingHours: { 1: { open: '06:00', close: '23:59' } } })))
      .toBe(start - 12 * HOUR);
  });
  it('settings are read defensively', () => {
    expect(tenantTimeFrom('not json')).toEqual({ timeZone: TZ });
    expect(tenantTimeFrom('{"cancellationHours":-1,"timeZone":"Mars/Base"}')).toEqual({ timeZone: TZ });
    expect(tenantTimeFrom('{"cancellationHours":48}')).toEqual({ cancellationHours: 48, timeZone: TZ });
  });
  const av: Availability = { weekly: { tue: [{ start: '09:00', end: '12:00' }] }, slotMinutes: 60, exceptions: [{ date: '2026-11-17', closed: true }, { date: '2026-11-24', windows: [{ start: '14:00', end: '16:00' }] }] };
  it('slot must sit on the grid, end inside the window, and use LOCAL time', () => {
    const tue = (h: number, m = 0, d = 10) => zonedTimeToMs(2026, 11, d, h, m, TZ);
    expect(isWithinAvailability(av, tue(9), TZ)).toBe(true);
    expect(isWithinAvailability(av, tue(11), TZ)).toBe(true);
    expect(isWithinAvailability(av, tue(11, 37), TZ)).toBe(false);   // off the grid
    expect(isWithinAvailability(av, tue(11, 30), TZ)).toBe(false);   // would run past 12:00
    expect(isWithinAvailability(av, tue(12), TZ)).toBe(false);
    expect(isWithinAvailability(av, tue(8), TZ)).toBe(false);
    expect(isWithinAvailability(av, tue(9, 0, 17), TZ)).toBe(false); // exception: closed
    expect(isWithinAvailability(av, tue(14, 0, 24), TZ)).toBe(true); // exception window replaces the weekly one
    expect(isWithinAvailability(av, tue(9, 0, 24), TZ)).toBe(false);
    expect(isWithinAvailability(av, tue(9) - 3 * HOUR, TZ)).toBe(false); // 09:00 UTC-read-as-local would have passed
    expect(isWithinAvailability({ ...av, weekly: { tue: [{ start: 'x', end: '12:00' }] } }, tue(9), TZ)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PT: bookPtSessions', () => {
  const book = (slots: number[], sub = 'fb-mem', extra: object = {}, db?: Db) =>
    send('POST', `${T}/book`, sub, { trainerId: 'u-trn', slots, ...extra }, db);

  it('a member books with a credit: credit spent, session frozen with its deadline, busy slot + trainer calendar still work', async () => {
    await credit('c1', { total: 2 });
    await h.run(`UPDATE tenants SET settings = '{"cancellationHours":48}' WHERE id = 't1'`);
    const slot = at(D, 10);
    const res = await book([slot]);
    expect(res.status).toBe(201);
    const out = (await res.json()) as any;
    expect(out.booked).toBe(1);
    const [s] = await sessions();
    expect(s).toMatchObject({ trainer_id: 'u-trn', member_id: 'u-mem', starts_at: slot, duration_minutes: 60, status: 'scheduled', credit_id: 'c1' });
    expect(s.cancellation_deadline_at).toBe(computeCancellationDeadline(slot, tenantTimeFrom('{"cancellationHours":48}')));
    expect(await cr('c1')).toEqual({ used: 1, status: 'active' });
    // the existing read endpoints (reads2.ts) see the new session and its frozen deadline
    const mine = (await (await getFull('/v1/tenants/t1/trainers/u-trn/pt-sessions', 'fb-trn')).json()) as any[];
    expect(mine.map((x) => [x.id, x.memberId, x.creditId, x.cancellationDeadlineAt])).toEqual([[s.id, 'u-mem', 'c1', s.cancellation_deadline_at]]);
    expect(await (await getFull('/v1/tenants/t1/trainers/u-trn/busy', 'fb-mem2')).json()).toEqual([{ startsAt: slot, durationMinutes: 60 }]);
  });

  it('the last lesson flips the credit to exhausted; the next booking has nothing to spend', async () => {
    await credit('c1', { total: 1 });
    expect((await book([at(D, 10)])).status).toBe(201);
    expect(await cr('c1')).toEqual({ used: 1, status: 'exhausted' });
    const again = await book([at(D, 11)]);
    expect(again.status).toBe(409);
    expect(((await again.json()) as any).error).toBe('no_credit');
  });

  it('spends the earliest-expiring credit first, but only one still valid ON the slot date', async () => {
    await credit('soon', { total: 1, expires: at(D, 9) });        // expires before the slot: unusable for it
    await credit('later', { total: 1, expires: at(40, 12) });
    await credit('latest', { total: 1, expires: at(90, 12) });
    expect((await book([at(D, 10), at(D, 11)])).status).toBe(201);
    expect((await sessions()).map((s) => s.credit_id)).toEqual(['later', 'latest']);
    expect(await cr('soon')).toEqual({ used: 0, status: 'active' });
  });

  it('an expired, exhausted, wrong-kind or another member\'s credit is not spendable', async () => {
    await credit('old', { expires: Date.now() - 1000 });
    await credit('gone', { total: 1, used: 1, status: 'exhausted' });
    await credit('grp', { kind: 'groupClass' });
    await credit('theirs', { member: 'u-mem2' });
    const res = await book([at(D, 10)]);
    expect(res.status).toBe(409);
    expect(await sessions()).toHaveLength(0);
    for (const id of ['old', 'gone', 'grp', 'theirs']) expect((await cr(id)).used).toBe(id === 'gone' ? 1 : 0);
  });

  it('all slots or none: not enough credit for the second slot books nothing and spends nothing', async () => {
    await credit('c1', { total: 1 });
    const res = await book([at(D, 10), at(D, 11)]);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any)).toMatchObject({ error: 'no_credit', slot: at(D, 11) });
    expect(await sessions()).toHaveLength(0);
    expect(await cr('c1')).toEqual({ used: 0, status: 'active' });
  });

  it('availability is the gate: outside hours, off the grid, past the window end, a closed exception, no availability row', async () => {
    await credit('c1');
    for (const slot of [at(D, 8), at(D, 10, 30), at(D, 12, 30), at(D, 13), at(D + 1, 10)]) {
      const res = await book([slot]);
      expect(res.status, String(slot)).toBe(409);
      expect(((await res.json()) as any).error).toBe('outside_availability');
    }
    await h.run(`UPDATE trainer_availability SET exceptions = ? WHERE trainer_id = 'u-trn'`, JSON.stringify([{ date: new Date(at(D, 12)).toLocaleDateString('sv', { timeZone: TZ }), closed: true }]));
    expect(((await (await book([at(D, 10)])).json()) as any).error).toBe('outside_availability');
    await h.run(`DELETE FROM trainer_availability`);
    expect(((await (await book([at(D, 10)])).json()) as any).error).toBe('no_availability');
    expect(await sessions()).toHaveLength(0);
    expect((await cr('c1')).used).toBe(0);
  });

  it('[L804]-style: the same start is taken once, and an overlapping session with a DIFFERENT start also blocks (PER-6)', async () => {
    await credit('c1', { total: 5 }); await credit('c2', { total: 5, member: 'u-mem2' });
    expect((await book([at(D, 10)])).status).toBe(201);
    const same = await book([at(D, 10)], 'fb-mem2');
    expect(same.status).toBe(409);
    expect(((await same.json()) as any).error).toBe('slot_taken');
    // a hand-added 10:30-11:30 session sits across the 11:00 slot and the 10:00 one is already taken
    await seedSession('hand', { start: at(D, 11, 30), dur: 60 });
    const clash = await book([at(D, 11)], 'fb-mem2');
    expect(clash.status).toBe(409);
    expect(((await clash.json()) as any).error).toBe('slot_overlap');
    expect((await cr('c2')).used).toBe(0);
    // back-to-back is fine: 09:00-10:00 ends exactly when the 10:00 session starts
    expect((await book([at(D, 9)], 'fb-mem2')).status).toBe(201);
  });

  it('a cancelled session frees its slot', async () => {
    await credit('c1');
    await seedSession('x', { start: at(D, 10), status: 'cancelled' });
    expect((await book([at(D, 10)])).status).toBe(201);
  });

  it('race: a rival overlapping session lands between the checks and the batch → 409, nothing half-committed', async () => {
    await credit('c1', { total: 3 });
    const rival = racing(() => seedSession('rival', { member: 'u-mem2', start: at(D, 10, 30), dur: 45 }));
    const res = await book([at(D, 9), at(D, 10)], 'fb-mem', {}, rival);       // slot 1 is free, slot 2 collides with the rival
    expect(res.status).toBe(409);
    expect((await sessions()).map((s) => s.id)).toEqual(['rival']);            // slot 1 rolled back with the rest
    expect(await cr('c1')).toEqual({ used: 0, status: 'active' });
    expect(((await res.json()) as any).error).toBe('slot_overlap');
  });

  it('race: the credit is spent elsewhere between the checks and the batch → 409, no session, no negative credit', async () => {
    await credit('c1', { total: 1 });
    const res = await book([at(D, 10)], 'fb-mem', {}, racing(() => h.run(`UPDATE member_credits SET used = 1, status = 'exhausted' WHERE id = 'c1'`)));
    expect(res.status).toBe(409);
    expect(await sessions()).toHaveLength(0);
    expect(await cr('c1')).toEqual({ used: 1, status: 'exhausted' });
  });

  it('race: the trainer is deactivated or availability edited between the checks and the batch → nothing booked', async () => {
    await credit('c1');
    expect((await book([at(D, 10)], 'fb-mem', {}, racing(() => h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-trn'`)))).status).toBe(409);
    await h.run(`UPDATE memberships SET status = 'active' WHERE member_id = 'u-trn'`);
    expect((await book([at(D, 10)], 'fb-mem', {}, racing(() => h.run(`UPDATE trainer_availability SET updated_at = 99`)))).status).toBe(409);
    expect(await sessions()).toHaveLength(0);
    expect((await cr('c1')).used).toBe(0);
  });

  it('two requests for the same slot at the same time: exactly one wins', async () => {
    await credit('c1'); await credit('c2', { member: 'u-mem2' });
    const slot = at(D, 10);
    const [a, b] = await Promise.all([book([slot]), book([slot], 'fb-mem2')]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await sessions()).toHaveLength(1);
    expect((await cr('c1')).used + (await cr('c2')).used).toBe(1);
  });

  it('guardian: an APPROVED parent books for the child with the child\'s credit; pending parent and strangers cannot', async () => {
    await h.addUser('u-kid', ['member']); await h.addUser('u-par', ['member']); await h.addUser('u-pend', null);
    await credit('kc', { member: 'u-kid' }); await credit('pc', { member: 'u-par' });
    await h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    expect((await book([at(D, 10)], 'fb-pend', { memberId: 'u-kid' })).status).toBe(403);
    expect((await book([at(D, 10)], 'fb-mem2', { memberId: 'u-kid' })).status).toBe(403);
    await h.run(`UPDATE memberships SET guardian_status = 'pending' WHERE member_id = 'u-kid'`);
    expect((await book([at(D, 10)], 'fb-par', { memberId: 'u-kid' })).status).toBe(403);
    await h.run(`UPDATE memberships SET guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    expect((await book([at(D, 10)], 'fb-par', { memberId: 'u-kid' })).status).toBe(201);
    const [s] = await sessions();
    expect(s).toMatchObject({ member_id: 'u-kid', credit_id: 'kc' });
    expect((await cr('pc')).used).toBe(0);
    expect((await cr('kc')).used).toBe(1);
  });

  it('only an active member books; a trainer who left cannot be booked; strangers are 403', async () => {
    await credit('c1');
    await h.addUser('u-out', null);
    expect((await book([at(D, 10)], 'fb-out')).status).toBe(403);
    await h.addUser('u-sus', ['member'], { status: 'suspended' });
    expect((await book([at(D, 10)], 'fb-sus')).status).toBe(403);
    expect((await send('POST', `${T}/book`, 'fb-mem', { trainerId: 'u-mem2', slots: [at(D, 10)] })).status).toBe(409);   // not a trainer
    await h.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-trn'`);
    const res = await book([at(D, 10)]);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe('trainer_unavailable');
    expect(await sessions()).toHaveLength(0);
  });

  it('bad input is 400, never 5xx', async () => {
    await credit('c1');
    const mk = (b: object) => send('POST', `${T}/book`, 'fb-mem', b);
    for (const b of [{}, { trainerId: 'u-trn' }, { trainerId: 'u-trn', slots: [] }, { trainerId: 'u-trn', slots: 'x' }, { trainerId: 'u-trn', slots: ['nope'] },
      { trainerId: 'u-trn', slots: [Date.now() - 1000] }, { trainerId: 'u-trn', slots: [at(D, 10), at(D, 10)] }, { trainerId: 5, slots: [at(D, 10)] },
      { trainerId: 'u-trn', slots: [at(D, 10)], memberId: 7 }, { trainerId: 'u-mem', slots: [at(D, 10)] },
      { trainerId: 'u-trn', slots: Array.from({ length: 21 }, (_, i) => at(D, 9) + i * 60_000) }]) {
      expect((await mk(b)).status, JSON.stringify(b).slice(0, 60)).toBe(400);
    }
    expect((await send('POST', `${T}/book`, 'fb-mem')).status).toBe(400);       // no body at all
    expect((await send('POST', `${T}/book`, null, { trainerId: 'u-trn', slots: [at(D, 10)] })).status).toBe(401);
    expect(await sessions()).toHaveLength(0);
    // ISO strings (what the app sends) work too
    expect((await mk({ trainerId: 'u-trn', slots: [new Date(at(D, 10)).toISOString()] })).status).toBe(201);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PT: createPtSessionByStaff', () => {
  const create = (sub: string, over: object = {}) =>
    send('POST', T, sub, { trainerId: 'u-trn', memberId: 'u-mem', startsAt: at(D, 10), durationMinutes: 60, ...over });

  it('[L804] a trainer writes onto their OWN calendar only; an admin onto anyone\'s; a member onto nobody\'s', async () => {
    expect((await create('fb-trn')).status).toBe(201);
    expect((await create('fb-trn2', { startsAt: at(D, 14) })).status).toBe(403);       // trainer-2 onto trainer-1's calendar
    expect((await create('fb-mem', { startsAt: at(D, 15) })).status).toBe(403);
    expect((await create('fb-admin', { startsAt: at(D, 16) })).status).toBe(201);
    expect((await sessions()).map((s) => [s.trainer_id, s.credit_id])).toEqual([['u-trn', null], ['u-trn', null]]);
    expect((await send('POST', T, null, {})).status).toBe(401);
  });

  it('stores the frozen deadline, no credit, status scheduled', async () => {
    await h.run(`UPDATE tenants SET settings = '{"cancellationHours":12}' WHERE id = 't1'`);
    const res = await create('fb-trn');
    const [s] = await sessions();
    expect(s).toMatchObject({ status: 'scheduled', credit_id: null, duration_minutes: 60 });
    expect(s.cancellation_deadline_at).toBe(computeCancellationDeadline(at(D, 10), tenantTimeFrom('{"cancellationHours":12}')));
    expect(((await res.json()) as any).id).toBe(s.id);
  });

  it('[L907] a session with a creditId can never be created through this door, by trainer or admin; credits stay untouched', async () => {
    await credit('c1');
    for (const sub of ['fb-trn', 'fb-admin']) {
      for (const creditId of ['c1', 'some-credit-id', null]) {
        expect((await create(sub, { creditId })).status, `${sub}/${creditId}`).toBe(400);
      }
    }
    expect(await sessions()).toHaveLength(0);
    expect((await cr('c1')).used).toBe(0);
  });

  it('refuses any overlap with the trainer\'s calendar, including a different start (PER-6); back-to-back is fine; cancelled never blocks', async () => {
    expect((await create('fb-trn')).status).toBe(201);                                       // 10:00-11:00
    for (const [start, dur] of [[at(D, 10, 30), 60], [at(D, 9, 30), 60], [at(D, 10), 60], [at(D, 9), 180], [at(D, 10, 15), 15]]) {
      const res = await create('fb-trn', { startsAt: start, durationMinutes: dur, memberId: 'u-mem2' });
      expect(res.status, `${start}/${dur}`).toBe(409);
    }
    expect((await create('fb-trn', { startsAt: at(D, 11), memberId: 'u-mem2' })).status).toBe(201);   // starts when the first ends
    expect((await create('fb-trn', { startsAt: at(D, 9), memberId: 'u-mem2' })).status).toBe(201);    // ends when the first starts
    await h.run(`UPDATE pt_sessions SET status = 'cancelled', cancelled_at = 1 WHERE starts_at = ?`, at(D, 10));
    expect((await create('fb-trn', { startsAt: at(D, 10, 20), memberId: 'u-mem2', durationMinutes: 30 })).status).toBe(201);
  });

  it('does NOT enforce availability windows (the trainer is the authority over their calendar)', async () => {
    expect((await create('fb-trn', { startsAt: at(D, 7) })).status).toBe(201);
    expect((await create('fb-trn', { startsAt: at(D + 1, 6, 17) })).status).toBe(201);
  });

  it('trainer and member must be active in the gym; an admin-only owner may hold sessions (DEN-6)', async () => {
    await h.addUser('u-ghost', null);
    expect((await create('fb-admin', { memberId: 'u-ghost' })).status).toBe(409);
    expect((await create('fb-admin', { trainerId: 'u-mem2' })).status).toBe(409);          // a plain member is not a coach
    await h.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-trn'`);
    expect((await create('fb-admin')).status).toBe(409);
    expect((await create('fb-admin', { trainerId: 'u-admin' })).status).toBe(201);
  });

  it('bad input is 400', async () => {
    for (const over of [{ durationMinutes: 0 }, { durationMinutes: 481 }, { durationMinutes: 1.5 }, { durationMinutes: '60' }, { startsAt: 'x' },
      { startsAt: Date.now() - 1000 }, { memberId: undefined }, { trainerId: undefined }, { memberId: 'u-trn' }]) {
      expect((await create('fb-trn', over)).status, JSON.stringify(over)).toBe(400);
    }
    expect(await sessions()).toHaveLength(0);
  });

  it('race: an overlapping session lands between the check and the insert → 409', async () => {
    const res = await send('POST', T, 'fb-trn', { trainerId: 'u-trn', memberId: 'u-mem', startsAt: at(D, 10), durationMinutes: 60 },
      racing(() => seedSession('rival', { member: 'u-mem2', start: at(D, 10, 30) })));
    expect(res.status).toBe(409);
    expect((await sessions()).map((s) => s.id)).toEqual(['rival']);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PT: cancelPtSession', () => {
  const cancel = (id: string, sub: string, db?: Db) => send('POST', `${T}/${id}/cancel`, sub, undefined, db);
  const future = Date.now() + 10 * HOUR;
  const outbox = async () => (await h.db.prepare(`SELECT kind, payload, dedupe_key FROM outbox`).all<any>()).results;
  const credited = async (over: Parameters<typeof seedSession>[1] = {}, c: object = { total: 2, used: 1 }) => {
    await credit('c1', c); await seedSession('s1', { credit: 'c1', start: at(D, 10), ...over });
  };

  it('member inside the frozen deadline: lesson comes back, marker says refunded, trainer is told once via the outbox', async () => {
    await credited({ deadline: future });
    const res = await cancel('s1', 'fb-mem');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refunded: true, outcome: 'refunded' });
    expect(await cr('c1')).toEqual({ used: 0, status: 'active' });
    expect(await h.one(`SELECT status, cancelled_by, cancelled_by_role, refund_outcome, cancelled_at FROM pt_sessions`)).toMatchObject(
      { status: 'cancelled', cancelled_by: 'u-mem', cancelled_by_role: 'member', refund_outcome: 'refunded' });
    const [ob] = await outbox();
    expect(ob.dedupe_key).toBe('pt-cancel:s1');
    expect(JSON.parse(ob.payload)).toMatchObject({ userIds: ['u-trn'], title: 'Randevu iptal edildi', category: 'bookings', data: { screen: 'trainer/calendar' } });
    expect(JSON.parse(ob.payload).body).toContain('randevusunu iptal etti');
  });

  it('a refund reactivates an exhausted credit', async () => {
    await credited({ deadline: future }, { total: 1, used: 1, status: 'exhausted' });
    expect((await cancel('s1', 'fb-mem')).status).toBe(200);
    expect(await cr('c1')).toEqual({ used: 0, status: 'active' });
  });

  it('member after the deadline: the lesson burns (credit untouched, outcome late)', async () => {
    await credited({ deadline: Date.now() - 1000 });
    expect(await (await cancel('s1', 'fb-mem')).json()).toEqual({ refunded: false, outcome: 'late' });
    expect(await cr('c1')).toEqual({ used: 1, status: 'active' });
    expect((await h.one(`SELECT status FROM pt_sessions`)).status).toBe('cancelled');
  });

  it('the deadline is the one frozen at booking, not today\'s gym setting', async () => {
    await credit('c1', { total: 3 });
    await h.run(`UPDATE tenants SET settings = '{"cancellationHours":1}' WHERE id = 't1'`);
    const slot = at(D, 10);
    expect((await send('POST', `${T}/book`, 'fb-mem', { trainerId: 'u-trn', slots: [slot] })).status).toBe(201);
    await h.run(`UPDATE tenants SET settings = '{"cancellationHours":9999}' WHERE id = 't1'`);   // gym tightens the rule afterwards
    const id = (await sessions())[0].id;
    expect(await (await cancel(id, 'fb-mem')).json()).toEqual({ refunded: true, outcome: 'refunded' });
  });

  it('a session booked before deadlines were stored recomputes from the current setting', async () => {
    await credited({ deadline: null, start: Date.now() + 30 * HOUR }, { total: 2, used: 1 });
    await h.run(`UPDATE tenants SET settings = '{"cancellationHours":48}' WHERE id = 't1'`);
    expect((await (await cancel('s1', 'fb-mem')).json() as any).outcome).toBe('late');
  });

  it('trainer and admin always refund, even after the deadline; a trainer cancelling is not told about it', async () => {
    await credited({ deadline: Date.now() - 1000 });
    expect(await (await cancel('s1', 'fb-trn')).json()).toEqual({ refunded: true, outcome: 'refunded' });
    expect(await outbox()).toHaveLength(0);
    expect((await h.one(`SELECT cancelled_by_role r FROM pt_sessions`)).r).toBe('trainer');
    await seedSession('s2', { credit: 'c1', start: at(D, 11), deadline: Date.now() - 1000 });
    await h.run(`UPDATE member_credits SET used = 1`);
    expect((await cancel('s2', 'fb-admin')).status).toBe(200);
    expect(await cr('c1')).toEqual({ used: 0, status: 'active' });
    expect((await h.one(`SELECT cancelled_by_role r FROM pt_sessions WHERE id = 's2'`)).r).toBe('admin');
    const ob = (await outbox())[0];
    expect(JSON.parse(ob.payload).body).toContain('yönetici tarafından iptal edildi');
  });

  it('an approved parent is the member cancelling: same window, same refund, role guardian', async () => {
    await h.addUser('u-kid', ['member']); await h.addUser('u-par', null);
    await h.run(`UPDATE memberships SET guardian_id = 'u-par', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    await credit('c1', { member: 'u-kid', total: 3, used: 2 });
    await seedSession('in', { member: 'u-kid', credit: 'c1', start: at(D, 10), deadline: future });
    await seedSession('late', { member: 'u-kid', credit: 'c1', start: at(D, 11), deadline: Date.now() - 1000 });
    expect((await (await cancel('in', 'fb-par')).json() as any).outcome).toBe('refunded');
    expect((await (await cancel('late', 'fb-par')).json() as any).outcome).toBe('late');
    expect((await cr('c1')).used).toBe(1);
    expect((await h.one(`SELECT cancelled_by_role r FROM pt_sessions WHERE id = 'in'`)).r).toBe('guardian');
    await seedSession('p', { member: 'u-kid', credit: 'c1', start: at(D, 12) });
    await h.run(`UPDATE memberships SET guardian_status = 'pending' WHERE member_id = 'u-kid'`);
    expect((await cancel('p', 'fb-par')).status).toBe(403);
  });

  it('a session without a credit has no refund decision: outcome no-credit, no credit touched', async () => {
    await credit('c1', { total: 2, used: 1 });
    await seedSession('s1', { deadline: Date.now() - 1000 });
    expect(await (await cancel('s1', 'fb-mem')).json()).toEqual({ refunded: false, outcome: 'no-credit' });
    expect((await cr('c1')).used).toBe(1);
  });

  it('refund due but the credit has no used lesson left → nothing-to-refund, never a negative balance', async () => {
    await credited({ deadline: future }, { total: 2, used: 0 });
    expect(await (await cancel('s1', 'fb-mem')).json()).toEqual({ refunded: false, outcome: 'nothing-to-refund' });
    expect((await cr('c1')).used).toBe(0);
  });

  it('[L921] a credit-linked session is cancellable only through this route, and only by its parties', async () => {
    await credited({ deadline: future });
    await h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-trn','u-trn2',1)`);
    for (const sub of ['fb-mem2', 'fb-trn2', 'fb-trn3']) expect((await cancel('s1', sub)).status, sub).toBe(403);   // a share viewer included
    for (const m of ['PUT', 'PATCH', 'DELETE']) for (const p of [`${T}/s1`, `${T}/s1/status`]) {
      expect([404, 405], `${m} ${p}`).toContain((await send(m, p, 'fb-admin', { status: 'cancelled' })).status);
    }
    expect((await h.one(`SELECT status FROM pt_sessions`)).status).toBe('scheduled');
    expect(await cr('c1')).toEqual({ used: 1, status: 'active' });
    expect((await cancel('s1', null as any)).status).toBe(401);
    expect((await cancel('s1', 'fb-admin')).status).toBe(200);
  });

  it('unknown / other-tenant ids are 404; cancelled and completed sessions answer 409 and refund nothing twice', async () => {
    await credited({ deadline: future });
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    expect((await send('POST', '/v1/tenants/t2/pt-sessions/s1/cancel', 'fb-mem')).status).toBe(404);
    expect((await cancel('nope', 'fb-mem')).status).toBe(404);
    expect((await cancel('s1', 'fb-mem')).status).toBe(200);
    const again = await cancel('s1', 'fb-mem');
    expect(again.status).toBe(409);
    expect(((await again.json()) as any).error).toBe('already_cancelled');
    expect(await cr('c1')).toEqual({ used: 0, status: 'active' });          // refunded once, not twice
    expect(await outbox()).toHaveLength(1);
    await seedSession('s2', { credit: 'c1', start: at(D, 11), status: 'completed' });
    expect(((await (await cancel('s2', 'fb-mem')).json()) as any).error).toBe('already_completed');
  });

  it('race: the same session is cancelled elsewhere between the checks and the batch → the loser refunds nothing and notifies nobody', async () => {
    await credited({ deadline: future });
    const res = await cancel('s1', 'fb-mem', racing(() => h.run(`UPDATE pt_sessions SET status = 'cancelled', cancelled_by = 'u-admin', cancelled_by_role = 'admin', refund_outcome = 'refunded', updated_at = 5`)));
    expect(res.status).toBe(409);
    expect(await cr('c1')).toEqual({ used: 1, status: 'active' });
    expect(await outbox()).toHaveLength(0);
  });

  it('race: the session is completed or handed to another trainer between the checks and the batch → 409, credit untouched', async () => {
    await credited({ deadline: future });
    expect((await cancel('s1', 'fb-mem', racing(() => h.run(`UPDATE pt_sessions SET status = 'completed'`)))).status).toBe(409);
    await h.run(`UPDATE pt_sessions SET status = 'scheduled'`);
    expect((await cancel('s1', 'fb-mem', racing(() => h.run(`UPDATE pt_sessions SET trainer_id = 'u-trn2'`)))).status).toBe(409);
    expect(await cr('c1')).toEqual({ used: 1, status: 'active' });
    expect(await outbox()).toHaveLength(0);
  });

  it('race: an admin loses the admin role between the checks and the batch → refused, nothing changes', async () => {
    await credited({ deadline: future });
    const res = await cancel('s1', 'fb-admin', racing(() => h.run(`UPDATE memberships SET roles = '["member"]' WHERE member_id = 'u-admin'`)));
    expect(res.status).toBe(409);
    expect((await h.one(`SELECT status FROM pt_sessions`)).status).toBe('scheduled');
    expect(await cr('c1')).toEqual({ used: 1, status: 'active' });
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PT: complete', () => {
  it('[L827] the assigned trainer (or an admin) completes; nobody can move it to another gym or swap the member', async () => {
    await credit('c1', { used: 1 });
    await seedSession('s1', { credit: 'c1' });
    await h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-trn','u-trn2',1)`);
    for (const sub of ['fb-mem', 'fb-trn2', 'fb-mem2']) expect((await send('POST', `${T}/s1/complete`, sub)).status, sub).toBe(403);
    expect((await send('POST', `${T}/s1/complete`, 'fb-trn')).status).toBe(200);
    expect((await h.one(`SELECT status, tenant_id, member_id, credit_id FROM pt_sessions`))).toEqual({ status: 'completed', tenant_id: 't1', member_id: 'u-mem', credit_id: 'c1' });
    // there is no route that edits tenant/member, and the PUT/PATCH doors are shut
    for (const m of ['PUT', 'PATCH']) expect([404, 405]).toContain((await send(m, `${T}/s1`, 'fb-trn', { tenantId: 't2', memberId: 'u-mem2' })).status);
    expect((await h.one(`SELECT tenant_id, member_id FROM pt_sessions`))).toEqual({ tenant_id: 't1', member_id: 'u-mem' });
    // completed is final: no second completion, no cancellation afterwards
    expect((await send('POST', `${T}/s1/complete`, 'fb-trn')).status).toBe(409);
    expect((await send('POST', `${T}/s1/cancel`, 'fb-admin')).status).toBe(409);
    expect((await cr('c1')).used).toBe(1);
    await seedSession('s2', { start: at(D, 12) });
    expect((await send('POST', `${T}/s2/complete`, 'fb-admin')).status).toBe(200);
    expect((await send('POST', `${T}/nope/complete`, 'fb-admin')).status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PT: hand-over and take-over', () => {
  const reassign = (id: string, sub: string, trainerId: string, db?: Db) => send('POST', `${T}/${id}/reassign`, sub, { trainerId }, db);
  const share = (owner: string, viewer: string) =>
    h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1', ?, ?, 1)`, owner, viewer);
  const row = async () => await h.one(`SELECT trainer_id, original_trainer_id, status FROM pt_sessions WHERE id = 's1'`);

  it('[L846] a colleague may take over only WITH a calendar share, and only to themselves', async () => {
    await seedSession('s1');
    expect((await reassign('s1', 'fb-trn2', 'u-trn2')).status).toBe(403);               // no share yet
    expect((await row()).trainer_id).toBe('u-trn');
    await share('u-trn', 'u-trn2');
    expect((await reassign('s1', 'fb-trn2', 'u-trn2')).status).toBe(200);
    expect(await row()).toEqual({ trainer_id: 'u-trn2', original_trainer_id: 'u-trn', status: 'scheduled' });
  });

  it('[L882] a shared-with colleague cannot hand the session to a THIRD trainer', async () => {
    await seedSession('s1');
    await share('u-trn', 'u-trn2');
    expect((await reassign('s1', 'fb-trn2', 'u-trn3')).status).toBe(403);
    expect((await reassign('s1', 'fb-trn3', 'u-trn3')).status).toBe(403);                // an unshared third trainer takes over: no
    expect((await row()).trainer_id).toBe('u-trn');
    // and a share is directional: the VIEWER may take over, the owner's colleague does not get the viewer's sessions
    await seedSession('s9', { trainer: 'u-trn2', start: at(D, 12) });
    expect((await reassign('s9', 'fb-trn', 'u-trn')).status).toBe(403);
  });

  it('the assigned trainer may hand over to any active coach; the first original trainer survives several hops', async () => {
    await seedSession('s1');
    expect((await reassign('s1', 'fb-trn', 'u-trn2')).status).toBe(200);
    expect((await reassign('s1', 'fb-trn2', 'u-trn3')).status).toBe(200);
    expect(await row()).toEqual({ trainer_id: 'u-trn3', original_trainer_id: 'u-trn', status: 'scheduled' });
  });

  it('an admin reassigns unconditionally; a member or stranger cannot; the target must be an active coach', async () => {
    await seedSession('s1');
    expect((await reassign('s1', 'fb-mem', 'u-mem')).status).toBe(403);
    expect((await reassign('s1', 'fb-mem2', 'u-trn2')).status).toBe(403);
    expect((await reassign('s1', 'fb-admin', 'u-mem2')).status).toBe(409);
    await h.run(`UPDATE memberships SET status = 'left' WHERE member_id = 'u-trn3'`);
    expect((await reassign('s1', 'fb-admin', 'u-trn3')).status).toBe(409);
    expect((await reassign('s1', 'fb-admin', 'u-trn')).status).toBe(409);                  // already theirs
    expect((await reassign('s1', 'fb-admin', 'u-trn2')).status).toBe(200);
    expect((await row()).trainer_id).toBe('u-trn2');
    expect((await send('POST', `${T}/s1/reassign`, 'fb-admin', {})).status).toBe(400);
    expect((await reassign('nope', 'fb-admin', 'u-trn2')).status).toBe(404);
    expect((await reassign('nope', 'fb-mem', 'u-trn2')).status).toBe(403);
  });

  it('the new trainer\'s calendar must be free (overlap with a different start also blocks); cancelled/completed sessions cannot move', async () => {
    await seedSession('s1', { start: at(D, 10) });
    await seedSession('other', { trainer: 'u-trn2', member: 'u-mem2', start: at(D, 10, 30) });
    const res = await reassign('s1', 'fb-admin', 'u-trn2');
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe('slot_overlap');
    await h.run(`UPDATE pt_sessions SET status = 'cancelled' WHERE id = 'other'`);
    expect((await reassign('s1', 'fb-admin', 'u-trn2')).status).toBe(200);
    expect((await reassign('s1', 'fb-admin', 'u-trn3')).status).toBe(200);
    await h.run(`UPDATE pt_sessions SET status = 'completed' WHERE id = 's1'`);
    expect((await reassign('s1', 'fb-admin', 'u-trn')).status).toBe(409);
  });

  it('race: the share is revoked between the checks and the write → refused, session stays put', async () => {
    await seedSession('s1');
    await share('u-trn', 'u-trn2');
    const res = await reassign('s1', 'fb-trn2', 'u-trn2', racingStmt(/UPDATE pt_sessions SET trainer_id/, () => h.run(`DELETE FROM calendar_shares`)));
    expect(res.status).toBe(409);
    expect(await row()).toEqual({ trainer_id: 'u-trn', original_trainer_id: null, status: 'scheduled' });
    // and a rival session on the target's calendar landing in the same gap blocks the move too
    await share('u-trn', 'u-trn2');
    const res2 = await reassign('s1', 'fb-trn2', 'u-trn2', racingStmt(/UPDATE pt_sessions SET trainer_id/, () => seedSession('rival', { trainer: 'u-trn2', member: 'u-mem2', start: at(D, 10, 30) })));
    expect(res2.status).toBe(409);
    expect((await row()).trainer_id).toBe('u-trn');
  });

  it('after a take-over the new trainer sees it on their calendar (reads2) and the busy slot moves with it', async () => {
    await seedSession('s1', { start: at(D, 10) });
    await share('u-trn', 'u-trn2');
    await reassign('s1', 'fb-trn2', 'u-trn2');
    const get = getFull;
    const mine = await get('/v1/tenants/t1/trainers/u-trn2/pt-sessions', 'fb-trn2');
    expect(mine.status).toBe(200);
    expect(((await mine.json()) as any[]).map((s) => [s.id, s.trainerId, s.originalTrainerId])).toEqual([['s1', 'u-trn2', 'u-trn']]);
    expect(((await (await get('/v1/tenants/t1/trainers/u-trn/busy', 'fb-mem')).json()) as any[])).toEqual([]);
    expect(((await (await get('/v1/tenants/t1/trainers/u-trn2/busy', 'fb-mem')).json()) as any[])).toEqual([{ startsAt: at(D, 10), durationMinutes: 60 }]);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('PT: reminders (sendClassReminders, PT half)', () => {
  it('queues one push for a session starting in about an hour, once, for scheduled sessions only', async () => {
    const now = Date.now();
    await seedSession('soon', { start: now + 70 * 60_000 });
    await seedSession('later', { start: now + 3 * HOUR, member: 'u-mem2' });
    await seedSession('gone', { start: now + 65 * 60_000, status: 'cancelled', member: 'u-mem2', trainer: 'u-trn2' });
    expect(await sendPtReminders(h.db, now)).toBe(1);
    expect(await sendPtReminders(h.db, now)).toBe(0);
    expect(await sendPtReminders(h.db, now + 10 * 60_000)).toBe(0);
    const rows = (await h.db.prepare(`SELECT payload, dedupe_key FROM outbox`).all<any>()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0].dedupe_key).toBe('pt-reminder:soon');
    expect(JSON.parse(rows[0].payload)).toMatchObject({ userIds: ['u-mem'], title: 'Randevun yaklaşıyor', category: 'bookings' });
    expect((await h.one(`SELECT reminder_sent_at r FROM pt_sessions WHERE id = 'later'`)).r).toBeNull();
  });
});
