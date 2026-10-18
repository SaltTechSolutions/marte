import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './userSettingsRepo';
import type { UserSettings } from '../types';

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
beforeEach(async () => { w = await world(); });
afterEach(() => { stops.splice(0).forEach((s) => s()); });

describe('user settings', () => {
  it('no row means everything on; switching one category keeps the others and refreshes the watcher at once', async () => {
    const onChange = vi.fn();
    stops.push(repo.watchUserSettings('fb-mem', onChange));
    await calls(onChange);
    expect(lastCall<UserSettings>(onChange)).toEqual({ push: {} });

    await repo.setNotificationPreference('fb-mem', 'payments', false);
    await vi.waitFor(() => expect(lastCall<UserSettings>(onChange)).toEqual({ push: { payments: false } }));
    await repo.setNotificationPreference('fb-mem', 'bookings', false);
    await repo.setNotificationPreference('fb-mem', 'payments', true);
    await vi.waitFor(() => expect(lastCall<UserSettings>(onChange)).toEqual({ push: { payments: true, bookings: false } }));
    expect((await w.h.one(`SELECT notifications FROM user_settings WHERE user_id = 'u-mem'`)).notifications).toBe('{"payments":true,"bookings":false}');
  });

  it('settings are per person: another account sees its own, and an unknown category is refused', async () => {
    await repo.setNotificationPreference('fb-mem', 'programs', false);
    w.as('admin');
    const onChange = vi.fn();
    stops.push(repo.watchUserSettings('fb-admin', onChange));
    await calls(onChange);
    expect(lastCall<UserSettings>(onChange)).toEqual({ push: {} });
    const e = await refusal(repo.setNotificationPreference('fb-admin', 'account' as never, false));
    expect(e.code).toBe('functions/invalid-argument');
  });
});
