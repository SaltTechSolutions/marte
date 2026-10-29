import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refusal, world } from './membershipTestKit';
import * as repo from './pushTokenRepo';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

type W = Awaited<ReturnType<typeof world>>;
let w: W;
beforeEach(async () => { w = await world(); });

const TOKEN = 'ExponentPushToken[abc123]';

describe('push tokens', () => {
  it('registers a device token, moves it to whoever signs in on that device, and unregisters only my own', async () => {
    await repo.registerPushToken({ userId: 'fb-mem', tenantId: 't1', token: TOKEN, platform: 'ios' });
    expect(await w.h.one(`SELECT user_id, tenant_id, platform FROM push_tokens WHERE token = ?`, TOKEN)).toEqual({ user_id: 'u-mem', tenant_id: 't1', platform: 'ios' });

    w.as('admin');
    await repo.registerPushToken({ userId: 'fb-admin', tenantId: 't1', token: TOKEN, platform: 'android' });
    expect(await w.h.one(`SELECT user_id, platform FROM push_tokens WHERE token = ?`, TOKEN)).toEqual({ user_id: 'u-admin', platform: 'android' });

    w.as('mem');
    await repo.unregisterPushToken(TOKEN);                       // not mine any more: nothing is deleted
    expect(await w.h.one(`SELECT 1 AS x FROM push_tokens WHERE token = ?`, TOKEN)).toBeTruthy();
    w.as('admin');
    await repo.unregisterPushToken(TOKEN);
    expect(await w.h.one(`SELECT 1 AS x FROM push_tokens WHERE token = ?`, TOKEN)).toBeFalsy();
  });

  it('refuses a malformed token and a gym the person is not in', async () => {
    expect((await refusal(repo.registerPushToken({ userId: 'fb-mem', tenantId: 't1', token: 'not-a-token', platform: 'ios' }))).code).toBe('functions/invalid-argument');
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    expect((await refusal(repo.registerPushToken({ userId: 'fb-mem', tenantId: 't2', token: TOKEN, platform: 'ios' }))).code).toBe('functions/permission-denied');
  });

  it('a token with characters that need escaping survives the round trip', async () => {
    const odd = 'ExponentPushToken[a/b+c=]';
    await repo.registerPushToken({ userId: 'fb-mem', tenantId: 't1', token: odd, platform: 'ios' });
    await repo.unregisterPushToken(odd);
    expect(await w.h.one(`SELECT 1 AS x FROM push_tokens WHERE token = ?`, odd)).toBeFalsy();
  });
});
