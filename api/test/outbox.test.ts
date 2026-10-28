import { describe, expect, it, vi } from 'vitest';

import { deliverOutbox } from '../src/jobs/outboxDelivery';
import { outboxStatement } from '../src/outbox';
import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });
const ok = (data: unknown = { data: [{ status: 'ok' }] }) => vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }));

describe('outbox delivery', () => {
  it('pushes to every device of the recipient, honours muted categories, and marks sent', async () => {
    const h = await harness();
    await h.run(`INSERT INTO push_tokens (token, user_id, tenant_id, updated_at) VALUES ('ExponentPushToken[a]','u-mem','t1',1), ('ExponentPushToken[b]','u-mem','t1',1)`);
    await outboxStatement(h.db, 'push', { userIds: ['u-mem'], title: 'T', body: 'B', category: 'packages' }).run();
    const f = ok();
    const r = await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, Date.now(), 50, f as never);
    expect(r).toMatchObject({ claimed: 1, sent: 1 });
    expect(JSON.parse((f.mock.calls[0] as any)[1].body)).toHaveLength(2);
    // muted category: delivered as success without calling Expo
    await h.run(`INSERT INTO user_settings (user_id, notifications, updated_at) VALUES ('u-mem','{"payments":false}',1)`);
    await outboxStatement(h.db, 'push', { userIds: ['u-mem'], title: 'T', body: 'B', category: 'payments' }).run();
    const f2 = ok();
    await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, Date.now(), 50, f2 as never);
    expect(f2).not.toHaveBeenCalled();
    // the account category cannot be muted
    await h.run(`UPDATE user_settings SET notifications = '{"account":false}'`);
    await outboxStatement(h.db, 'push', { userIds: ['u-mem'], title: 'T', body: 'B', category: 'account' }).run();
    const f3 = ok();
    await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, Date.now(), 50, f3 as never);
    expect(f3).toHaveBeenCalledTimes(1);
  });

  it('dedupe key makes a retried request one delivery; dead tokens are removed', async () => {
    const h = await harness();
    await h.run(`INSERT INTO push_tokens (token, user_id, tenant_id, updated_at) VALUES ('ExponentPushToken[a]','u-mem','t1',1)`);
    for (let i = 0; i < 3; i++) await outboxStatement(h.db, 'push', { userIds: ['u-mem'], title: 'T', body: 'B', category: 'bookings' }, 'evt-1').run();
    expect((await h.one(`SELECT count(*) c FROM outbox`)).c).toBe(1);
    const f = ok({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] });
    await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, Date.now(), 50, f as never);
    expect(await h.one(`SELECT 1 x FROM push_tokens`)).toBeNull();
  });

  it('failures back off, then die after 8 attempts; a leased row is not claimed twice; missing e-mail key fails closed', async () => {
    const h = await harness();
    await h.run(`INSERT INTO push_tokens (token, user_id, tenant_id, updated_at) VALUES ('ExponentPushToken[a]','u-mem','t1',1)`);
    await outboxStatement(h.db, 'push', { userIds: ['u-mem'], title: 'T', body: 'B', category: 'bookings' }).run();
    const bad = vi.fn(async () => new Response('no', { status: 500 }));
    const env = { DB: h.db, FIREBASE_PROJECT_ID: 'x' };
    let now = Date.now();
    expect(await deliverOutbox(env, now, 50, bad as never)).toMatchObject({ failed: 1 });
    expect(await deliverOutbox(env, now, 50, bad as never)).toMatchObject({ claimed: 0 });   // backing off
    for (let i = 0; i < 7; i++) { now += 4_000_000; await deliverOutbox(env, now, 50, bad as never); }
    expect((await h.one(`SELECT status s, attempts a FROM outbox`))).toEqual({ s: 'dead', a: 8 });
    await outboxStatement(h.db, 'email', { to: 'a@b.co', subject: 's', text: 't' }).run();
    expect(await deliverOutbox(env, now + 1, 50, bad as never)).toMatchObject({ failed: 1 });
    expect((await h.one(`SELECT last_error e FROM outbox WHERE kind = 'email'`)).e).toMatch(/RESEND_API_KEY/);
  });
});

/** Seeds `n` users, each with `perUser` push tokens, in t1. Token = `ExponentPushToken[u<i>-<j>]`. */
async function seedDevices(h: Awaited<ReturnType<typeof harness>>, n: number, perUser = 1) {
  const stmts: D1PreparedStatement[] = [];
  const userIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `u-bulk${i}`;
    userIds.push(id);
    stmts.push(h.db.prepare(`INSERT INTO users (id, display_name, created_at) VALUES (?, ?, 1)`).bind(id, id));
    for (let j = 0; j < perUser; j++) {
      stmts.push(h.db.prepare(`INSERT INTO push_tokens (token, user_id, tenant_id, updated_at) VALUES (?, ?, 't1', 1)`).bind(`ExponentPushToken[u${i}-${j}]`, id));
    }
  }
  for (let i = 0; i < stmts.length; i += 100) await h.db.batch(stmts.slice(i, i + 100));
  return userIds;
}
const sentTokens = (f: { mock: { calls: unknown[][] } }) =>
  f.mock.calls.flatMap((c) => (JSON.parse((c[1] as { body: string }).body) as { to: string }[]).map((m) => m.to));
const okFor = () => vi.fn(async (_u: string, init: { body: string }) =>
  new Response(JSON.stringify({ data: (JSON.parse(init.body) as unknown[]).map(() => ({ status: 'ok' })) }), { status: 200 }));

// Both engines: the default run uses the node:sqlite shim (which rejects > 100 bound parameters like D1 does),
// `REAL_D1=1 npx vitest run` uses workerd's D1.
describe('outbox push chunking (> 100 devices / users)', () => {
  it('one user with 250 devices: Expo gets batches of at most 100, every device exactly once', async () => {
    const h = await harness();
    await seedDevices(h, 1, 250);
    await outboxStatement(h.db, 'push', { userIds: ['u-bulk0'], title: 'T', body: 'B', category: 'packages' }).run();
    const f = okFor();
    expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, Date.now(), 50, f as never)).toMatchObject({ claimed: 1, sent: 1 });
    expect(f.mock.calls.map((c) => (JSON.parse((c[1] as { body: string }).body) as unknown[]).length)).toEqual([100, 100, 50]);
    const all = sentTokens(f);
    expect(new Set(all).size).toBe(250);
    expect(all).toHaveLength(250);
  });

  it('250 users in one announcement: preference and token lookups stay under 100 parameters; muted users are skipped', async () => {
    const h = await harness();
    const userIds = await seedDevices(h, 250);
    // 120 of them muted the announcements category (spread over several lookup chunks), one muted another category
    const muted = userIds.filter((_, i) => i % 2 === 0).slice(0, 120);
    for (let i = 0; i < muted.length; i += 100) {
      await h.db.batch(muted.slice(i, i + 100).map((u) => h.db.prepare(`INSERT INTO user_settings (user_id, notifications, updated_at) VALUES (?, '{"announcements":false}', 1)`).bind(u)));
    }
    await h.run(`INSERT INTO user_settings (user_id, notifications, updated_at) VALUES ('u-bulk1', '{"payments":false}', 1)`);
    await outboxStatement(h.db, 'push', { userIds, title: 'T', body: 'B', category: 'announcements' }).run();
    const f = okFor();
    expect(await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, Date.now(), 50, f as never)).toMatchObject({ sent: 1 });
    const all = sentTokens(f);
    expect(all).toHaveLength(250 - 120);
    for (const u of muted) expect(all).not.toContain(`ExponentPushToken[u${u.replace('u-bulk', '')}-0]`);
    expect(all).toContain('ExponentPushToken[u1-0]');           // muted a different category: still delivered
    expect(f.mock.calls.every((c) => (JSON.parse((c[1] as { body: string }).body) as unknown[]).length <= 100)).toBe(true);
    // the 'account' category ignores mutes: everybody
    await outboxStatement(h.db, 'push', { userIds, title: 'T', body: 'B', category: 'account' }).run();
    const f2 = okFor();
    await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, Date.now(), 50, f2 as never);
    expect(sentTokens(f2)).toHaveLength(250);
  });

  it('a failing batch fails the row but keeps the other batches: dead tokens are pruned, the retry sends only the failed batch', async () => {
    const h = await harness();
    await seedDevices(h, 1, 250);
    await outboxStatement(h.db, 'push', { userIds: ['u-bulk0'], title: 'T', body: 'B', category: 'bookings' }).run();
    const env = { DB: h.db, FIREBASE_PROJECT_ID: 'x' };
    let call = 0;
    const flaky = vi.fn(async (_u: string, init: { body: string }) => {
      call++;
      const n = (JSON.parse(init.body) as unknown[]).length;
      if (call === 2) throw new Error('network down');                    // the middle batch fails
      // first batch reports its first device as unregistered; third batch is fine
      return new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => (call === 1 && i === 0 ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) }), { status: 200 });
    });
    const now = Date.now();
    expect(await deliverOutbox(env, now, 50, flaky as never)).toMatchObject({ claimed: 1, sent: 0, failed: 1, dead: 0 });
    expect(flaky).toHaveBeenCalledTimes(3);                                 // the third batch was still attempted
    const row = await h.one(`SELECT status s, last_error e, payload p FROM outbox`);
    expect(row.s).toBe('pending');
    expect(row.e).toMatch(/network down.*1\/3 batches failed/);
    const failed = JSON.parse(row.p).retryTokens as string[];
    expect(failed).toHaveLength(100);
    const batch1 = JSON.parse((flaky.mock.calls[0] as any)[1].body).map((m: { to: string }) => m.to) as string[];
    const batch2 = JSON.parse((flaky.mock.calls[1] as any)[1].body).map((m: { to: string }) => m.to) as string[];
    expect(failed).toEqual(batch2);
    // dead-token pruning worked for the batch that succeeded
    expect(await h.one(`SELECT 1 x FROM push_tokens WHERE token = ?`, batch1[0])).toBeNull();
    expect((await h.one(`SELECT count(*) c FROM push_tokens`)).c).toBe(249);
    // retry: only the failed batch goes out, nothing is duplicated
    const f2 = okFor();
    expect(await deliverOutbox(env, now + 120_000, 50, f2 as never)).toMatchObject({ claimed: 1, sent: 1 });
    expect(f2).toHaveBeenCalledTimes(1);
    expect(sentTokens(f2)).toEqual(batch2);
    expect((await h.one(`SELECT status s FROM outbox`)).s).toBe('sent');
  });

  it('when every batch keeps failing the row ends dead after 8 attempts, never silently dropped', async () => {
    const h = await harness();
    await seedDevices(h, 1, 150);
    await outboxStatement(h.db, 'push', { userIds: ['u-bulk0'], title: 'T', body: 'B', category: 'bookings' }).run();
    const bad = vi.fn(async () => new Response('no', { status: 500 }));
    let now = Date.now();
    for (let i = 0; i < 8; i++) { await deliverOutbox({ DB: h.db, FIREBASE_PROJECT_ID: 'x' }, now, 50, bad as never); now += 4_000_000; }
    const row = await h.one(`SELECT status s, attempts a, last_error e, payload p FROM outbox`);
    expect(row).toMatchObject({ s: 'dead', a: 8 });
    expect(row.e).toMatch(/expo 500.*2\/2 batches failed/);
    expect(JSON.parse(row.p).retryTokens).toHaveLength(150);                // all undelivered tokens kept for inspection
  });
});

