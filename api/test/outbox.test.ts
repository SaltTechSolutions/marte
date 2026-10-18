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
