import { describe, expect, it, vi } from 'vitest';

import app from '../src/index';
import { harness, PROJECT } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

/** Talks to the FULL app with an explicit env, so each test chooses its own API_OPEN. */
async function world(extra: Record<string, unknown> = {}) {
  const h = await harness();
  const call = async (method: string, path: string, opts: { sub?: string; headers?: Record<string, string>; body?: string; env?: Record<string, unknown> } = {}) =>
    app.fetch(new Request(`http://x${path}`, {
      method,
      headers: { ...(opts.sub ? { Authorization: `Bearer ${await h.sign(opts.sub)}` } : {}), ...opts.headers },
      body: opts.body,
    }), { DB: h.db, MEDIA: h.media as never, FIREBASE_PROJECT_ID: PROJECT, ...extra, ...opts.env } as never);
  return { h, call };
}

describe('maintenance gate (API_OPEN)', () => {
  it('is closed when API_OPEN is unset or anything but exactly "1" (fail closed)', async () => {
    const { call } = await world();
    for (const open of [undefined, '', '0', 'true', 'yes', ' 1', '1 ', 'on']) {
      const res = await call('GET', '/v1/me', { sub: 'fb-mem', env: { API_OPEN: open } });
      expect(res.status, String(open)).toBe(503);
      expect(await res.json(), String(open)).toEqual({ error: 'maintenance' });
    }
  });

  it('is open when API_OPEN is "1"', async () => {
    const { call } = await world();
    const res = await call('GET', '/v1/me', { sub: 'fb-mem', env: { API_OPEN: '1' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ userId: 'u-mem' });
  });

  it('closes every /v1 method and path before auth, including unauthenticated, writes and unknown paths', async () => {
    const { call, h } = await world();
    const cases: [string, string, string | undefined][] = [
      ['GET', '/v1/me', undefined],                                   // no token: still 503, not 401
      ['POST', '/v1/me/bootstrap', 'fb-mem'],                         // the write that would create a random-id user
      ['GET', '/v1/tenants/t1/members', 'fb-admin'],
      ['POST', '/v1/tenants/t1/exercise-reports', 'fb-admin'],
      ['GET', '/v1/does-not-exist', 'fb-mem'],
    ];
    for (const [m, p, sub] of cases) {
      const res = await call(m, p, { sub, body: m === 'POST' ? '{}' : undefined });
      expect(res.status, `${m} ${p}`).toBe(503);
      expect(await res.json(), `${m} ${p}`).toEqual({ error: 'maintenance' });
    }
    // nothing was written while closed
    expect((await h.one(`SELECT count(*) c FROM users`)).c).toBe(2);
  });

  it('exempts the RevenueCat webhook: it keeps its own fail-closed behaviour', async () => {
    const { call } = await world();
    // no secret configured: the webhook's own 503, a different body than the gate's
    const unset = await call('POST', '/v1/webhooks/revenuecat', { body: '{}', headers: { 'content-type': 'application/json' } });
    expect(unset.status).toBe(503);
    expect(await unset.json()).toEqual({ error: 'webhook not configured' });
    // secret configured, wrong credentials: its own 401, not the gate
    const wrong = await call('POST', '/v1/webhooks/revenuecat', { body: '{}', headers: { Authorization: 'Bearer nope' }, env: { REVENUECAT_WEBHOOK_SECRET: 's3cret' } });
    expect(wrong.status).toBe(401);
    // secret configured, right credentials: processed (unknown gym is acknowledged), still while the API is closed
    const good = await call('POST', '/v1/webhooks/revenuecat', {
      body: JSON.stringify({ event: { type: 'TEST', app_user_id: 'nobody' } }),
      headers: { Authorization: 'Bearer s3cret', 'content-type': 'application/json' }, env: { REVENUECAT_WEBHOOK_SECRET: 's3cret' },
    });
    expect(good.status).toBe(200);
  });

  it('exempts /healthz and public /media GET', async () => {
    const { call } = await world();
    const hz = await call('GET', '/healthz');
    expect(hz.status).toBe(200);
    expect(await hz.json()).toEqual({ ok: true });
    const media = await call('GET', '/media/tenants/t1/' + '0'.repeat(32) + '.jpg');
    expect(media.status).toBe(404);                                     // the media route's own not-found, not 503
    expect(await media.json()).toMatchObject({ error: 'not found' });
  });
});
