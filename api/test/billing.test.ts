import { describe, expect, it, vi } from 'vitest';

import { sliceHarness } from './sliceApp';

vi.setConfig({ testTimeout: 60_000 });

const SECRET = 'rc-secret-value';
const ev = (o: Record<string, unknown> = {}) => ({
  id: 'e1', type: 'INITIAL_PURCHASE', app_user_id: 't1', event_timestamp_ms: 1000, expiration_at_ms: 9_000_000,
  period_type: 'NORMAL', product_id: 'gym_monthly', store: 'APP_STORE', ...o,
});
const sub = async (h: Awaited<ReturnType<typeof sliceHarness>>) =>
  h.one(`SELECT subscription_status s, subscription_plan p, subscription_platform pf, subscription_expires_at x, subscription_event_at at, subscription_event_id eid FROM tenants WHERE id = 't1'`);

describe('billing webhook: authorisation (fail closed)', () => {
  it('with no secret configured NOTHING is accepted (503), whatever header is sent', async () => {
    for (const env of [undefined, '', '   ']) {
      const h = await sliceHarness(env);
      expect((await h.hook(ev(), `Bearer ${SECRET}`)).status).toBe(503);
      expect((await h.hook(ev(), '')).status).toBe(503);
      expect((await h.hook(ev())).status).toBe(503);
      expect((await sub(h)).s).toBeNull();
    }
  });

  it('a missing, wrong, truncated or longer token is 401 and changes nothing', async () => {
    const h = await sliceHarness(SECRET);
    for (const auth of [undefined, '', 'Bearer', 'Bearer ', 'Bearer wrong', SECRET.slice(0, -1), `${SECRET}x`, `Bearer ${SECRET}x`, 'Basic ' + SECRET]) {
      expect((await h.hook(ev(), auth)).status).toBe(401);
    }
    expect(await h.one(`SELECT count(*) c FROM billing_events`)).toEqual({ c: 0 });
    expect((await sub(h)).s).toBeNull();
  });

  it('the bare token and "Bearer <token>" (any case, stray whitespace/newline) are both accepted; the route needs no Firebase token', async () => {
    const h = await sliceHarness(`${SECRET}\n`);
    expect((await h.hook(ev({ id: 'a', event_timestamp_ms: 1 }), SECRET)).status).toBe(200);
    expect((await h.hook(ev({ id: 'b', event_timestamp_ms: 2 }), `Bearer ${SECRET}`)).status).toBe(200);
    expect((await h.hook(ev({ id: 'c', event_timestamp_ms: 3 }), `  bearer   ${SECRET}\n`)).status).toBe(200);
  });
});

describe('billing webhook: state', () => {
  it('a granting event activates the gym with plan, platform and expiry; a REFUND/EXPIRATION ends it', async () => {
    const h = await sliceHarness(SECRET);
    const ok = await h.hook(ev(), SECRET);
    expect(ok.status).toBe(200);
    expect(await h.json(ok)).toEqual({ applied: true });
    expect(await sub(h)).toEqual({ s: 'active', p: 'monthly', pf: 'ios', x: 9_000_000, at: 1000, eid: 'e1' });
    await h.hook(ev({ id: 'e2', type: 'RENEWAL', event_timestamp_ms: 2000, period_type: 'ANNUAL', store: 'PLAY_STORE', expiration_at_ms: 0 }), SECRET);
    expect(await sub(h)).toEqual({ s: 'active', p: 'yearly', pf: 'android', x: null, at: 2000, eid: 'e2' });
    await h.hook(ev({ id: 'e3', type: 'RENEWAL', event_timestamp_ms: 3000, product_id: 'gym_annual' }), SECRET);
    expect((await sub(h)).p).toBe('yearly');
    await h.hook(ev({ id: 'e4', type: 'EXPIRATION', event_timestamp_ms: 4000 }), SECRET);
    expect(await sub(h)).toMatchObject({ s: 'expired', p: 'yearly', at: 4000 });   // plan/expiry stay as history
    await h.hook(ev({ id: 'e5', type: 'REFUND', event_timestamp_ms: 5000 }), SECRET);
    expect((await sub(h)).s).toBe('cancelled');
    await h.hook(ev({ id: 'e6', type: 'UNCANCELLATION', event_timestamp_ms: 6000 }), SECRET);
    expect((await sub(h)).s).toBe('active');
  });

  it('every other type (CANCELLATION, BILLING_ISSUE, TRANSFER, TEST ...) is recorded but never acts or moves the watermark', async () => {
    const h = await sliceHarness(SECRET);
    await h.hook(ev(), SECRET);
    for (const [i, type] of ['CANCELLATION', 'BILLING_ISSUE', 'TRANSFER', 'TEST', 'NON_RENEWING_PURCHASE'].entries()) {
      const r = await h.hook(ev({ id: `x${i}`, type, event_timestamp_ms: 5000 + i }), SECRET);
      expect(r.status).toBe(200);
      expect(await h.json(r)).toEqual({ applied: false });
    }
    expect(await sub(h)).toMatchObject({ s: 'active', at: 1000, eid: 'e1' });
    expect(await h.one(`SELECT count(*) c, sum(applied) a FROM billing_events`)).toEqual({ c: 6, a: 1 });
    // a CANCELLATION without a timestamp is still just noted
    expect((await h.hook({ id: 'nots', type: 'CANCELLATION', app_user_id: 't1' }, SECRET)).status).toBe(200);
  });

  it('ordering: an old event arriving late never overwrites a newer state', async () => {
    const h = await sliceHarness(SECRET);
    await h.hook(ev({ id: 'new', type: 'EXPIRATION', event_timestamp_ms: 5000 }), SECRET);
    const late = await h.hook(ev({ id: 'old', type: 'RENEWAL', event_timestamp_ms: 4000 }), SECRET);
    expect(late.status).toBe(200);
    expect(await h.json(late)).toEqual({ applied: false });
    expect(await sub(h)).toMatchObject({ s: 'expired', at: 5000, eid: 'new' });
    // same instant, different id: the first writer stays (strictly newer wins)
    await h.hook(ev({ id: 'tie', type: 'RENEWAL', event_timestamp_ms: 5000 }), SECRET);
    expect((await sub(h)).s).toBe('expired');
  });

  it('idempotency: a redelivered event is a harmless no-op, also after later events', async () => {
    const h = await sliceHarness(SECRET);
    await h.hook(ev(), SECRET);
    await h.hook(ev(), SECRET);
    expect(await h.one(`SELECT count(*) c FROM billing_events`)).toEqual({ c: 1 });
    await h.hook(ev({ id: 'e2', type: 'EXPIRATION', event_timestamp_ms: 2000 }), SECRET);
    await h.hook(ev(), SECRET);   // the old purchase is replayed after the expiry
    expect(await sub(h)).toMatchObject({ s: 'expired', eid: 'e2' });
    // an event with no id falls back to type:timestamp:gym and dedupes the same way
    await h.hook(ev({ id: undefined, type: 'RENEWAL', event_timestamp_ms: 3000 }), SECRET);
    await h.hook(ev({ id: undefined, type: 'RENEWAL', event_timestamp_ms: 3000 }), SECRET);
    expect(await h.one(`SELECT count(*) c FROM billing_events WHERE event_id = 'RENEWAL:3000:t1'`)).toEqual({ c: 1 });
  });

  it('parallel redelivery of the same event applies it once', async () => {
    const h = await sliceHarness(SECRET);
    const res = await Promise.all([h.hook(ev(), SECRET), h.hook(ev(), SECRET), h.hook(ev(), SECRET)]);
    expect(res.every((r) => r.status === 200)).toBe(true);
    expect(await h.one(`SELECT count(*) c, sum(applied) a FROM billing_events`)).toEqual({ c: 1, a: 1 });
  });

  it('unroutable events are 200 "ignored" (RevenueCat would retry a non-2xx forever); malformed ones are 400', async () => {
    const h = await sliceHarness(SECRET);
    expect(await h.json(await h.hook(ev({ app_user_id: 'no-such-gym' }), SECRET))).toEqual({ ignored: 'unknown gym' });
    expect(await h.json(await h.hook(ev({ app_user_id: '$RCAnonymousID:abc' }), SECRET))).toEqual({ ignored: 'unknown gym' });
    expect(await h.json(await h.hook(ev({ app_user_id: undefined }), SECRET))).toEqual({ ignored: 'no app_user_id' });
    expect((await h.hook(null, SECRET, 'not json')).status).toBe(400);
    expect((await h.hook(null, SECRET)).status).toBe(400);
    expect((await h.hook(ev({ type: 5 }), SECRET)).status).toBe(400);
    // an acting event we cannot order is refused, not guessed
    expect((await h.hook(ev({ event_timestamp_ms: undefined }), SECRET)).status).toBe(400);
    expect((await h.hook(ev({ event_timestamp_ms: 'soon' }), SECRET)).status).toBe(400);
    expect((await sub(h)).s).toBeNull();
    expect(await h.one(`SELECT count(*) c FROM billing_events`)).toEqual({ c: 0 });
  });

  it('a webhook-activated gym passes the seat gate (the status column is what approval reads)', async () => {
    const h = await sliceHarness(SECRET);
    await h.run(`UPDATE tenants SET active_member_count = 10 WHERE id = 't1'`);
    await h.addUser('u-p1', ['member'], { status: 'pending' });
    expect((await h.send('PUT', '/v1/tenants/t1/members/u-p1/status', 'fb-admin', { status: 'active' })).status).toBe(409);
    await h.hook(ev(), SECRET);
    expect((await h.send('PUT', '/v1/tenants/t1/members/u-p1/status', 'fb-admin', { status: 'active' })).status).toBe(200);
  });
});

describe('billing: subscription is server-owned', () => {
  it('only an admin reads the subscription view; no route lets anyone write it', async () => {
    const h = await sliceHarness(SECRET);
    await h.hook(ev(), SECRET);
    const r = await h.send('GET', '/v1/tenants/t1/subscription', 'fb-admin');
    expect(r.status).toBe(200);
    expect(await h.json(r)).toMatchObject({ status: 'active', plan: 'monthly', platform: 'ios', expiresAt: 9_000_000, lastEventId: 'e1' });
    expect((await h.send('GET', '/v1/tenants/t1/subscription', 'fb-mem')).status).toBe(403);
    expect((await h.send('GET', '/v1/tenants/t1/subscription', null)).status).toBe(401);
    for (const m of ['PUT', 'PATCH', 'POST', 'DELETE']) {
      expect((await h.send(m, '/v1/tenants/t1/subscription', 'fb-admin', { status: 'active' })).status).toBe(404);
    }
    expect((await h.send('POST', '/v1/webhooks/revenuecat', 'fb-admin', ev())).status).toBe(401);   // a Firebase token is not the shared secret
  });
});
