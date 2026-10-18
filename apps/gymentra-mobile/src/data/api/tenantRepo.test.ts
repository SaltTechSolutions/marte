import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
// The default-package seeding belongs to packageRepo (another area); the logo upload is the Firebase callable.
vi.mock('./packageRepo', () => ({ seedDefaultPackages: vi.fn(async () => {}) }));
vi.mock('../firebase/tenantRepo', () => ({ uploadTenantLogo: vi.fn(async () => 'https://logo.example/x.jpg') }));

import * as fbTenant from '../firebase/tenantRepo';
import { seedDefaultPackages } from './packageRepo';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './tenantRepo';
import type { Tenant } from '../types';

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
beforeEach(async () => { w = await world(); vi.mocked(seedDefaultPackages).mockClear(); });
afterEach(() => { stops.splice(0).forEach((s) => s()); });

describe('reading a gym', () => {
  it('findTenantByCode: case-insensitive, public fields only, null when unknown', async () => {
    const t = await repo.findTenantByCode('  t1 ');
    expect(t).toMatchObject({ id: 't1', code: 'T1', name: 'Gym', branding: {} });
    expect(t!.activeMemberCount).toBeUndefined();
    expect(await repo.findTenantByCode('NOPE')).toBeNull();
    expect(await repo.findTenantByCode('   ')).toBeNull();
  });

  it('getTenant: a member gets no counters; an admin gets them and the owner under the app id', async () => {
    await w.h.run(`UPDATE tenants SET owner_user_id = 'u-admin', active_member_count = 4, active_admin_count = 1,
      settings = '{"address":"Kadıköy","cancellationHours":12,"openingHours":{"1":{"open":"08:00","close":"22:00"},"0":null}}',
      subscription_status = 'active', subscription_plan = 'yearly', subscription_platform = 'ios', subscription_expires_at = 99999 WHERE id = 't1'`);
    const asMember = await repo.getTenant('t1');
    expect(asMember).toMatchObject({
      id: 't1', address: 'Kadıköy', cancellationHours: 12,
      openingHours: { '1': { open: '08:00', close: '22:00' }, '0': null },
      subscription: { status: 'active', plan: 'yearly', platform: 'ios', expiresAt: new Date(99999) },
    });
    expect(asMember!.activeMemberCount).toBeUndefined();
    expect(asMember!.ownerUid).toBeUndefined();
    w.as('admin');
    expect(await repo.getTenant('t1')).toMatchObject({ activeMemberCount: 4, activeAdminCount: 1, ownerUid: 'fb-admin' });
  });

  it('getTenant: a gym the caller does not belong to is a refusal (the same for a missing one: no existence leak)', async () => {
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t9','T9','Other',1)`);
    expect((await refusal(repo.getTenant('t9'))).code).toBe('functions/permission-denied');
    w.as('admin');
    expect((await refusal(repo.getTenant('t-missing'))).code).toBe('functions/permission-denied');   // not a member of it either: no existence leak
  });

  it('watchTenant delivers the gym, refreshes after an admin edit, and reports a revoked membership as an error', async () => {
    w.as('admin');
    const onChange = vi.fn();
    stops.push(repo.watchTenant('t1', onChange));
    await calls(onChange);
    expect(lastCall<Tenant>(onChange).name).toBe('Gym');
    await repo.updateTenantIdentity('t1', { name: 'Yeni Ad', address: ' Beşiktaş ' });
    await vi.waitFor(() => expect(lastCall<Tenant>(onChange)).toMatchObject({ name: 'Yeni Ad', address: 'Beşiktaş' }));

    w.as('ghost');
    await w.h.addUser('u-ghost', null);
    const onError = vi.fn(); const never = vi.fn();
    stops.push(repo.watchTenant('t1', never, onError));
    await calls(onError);
    expect(never).not.toHaveBeenCalled();
  });
});

describe('createTenantWithOwner', () => {
  it('founds a gym with its admin in one go, seeds packages, and the code is stored upper-case', async () => {
    w.as('founder', { displayName: 'Kurucu', email: 'k@example.com' });
    const t = await repo.createTenantWithOwner({ name: ' Yeni Salon ', code: 'yeni-01', branding: { appName: 'Yeni', primaryColor: '#112233', accentColor: '#445566' }, ownerUid: 'fb-founder' });
    expect(t).toMatchObject({ code: 'YENI-01', name: 'Yeni Salon', ownerUid: 'fb-founder' });
    expect(await w.h.one(`SELECT code, branding FROM tenants WHERE id = ?`, t.id)).toMatchObject({ code: 'YENI-01' });
    expect(await w.h.one(`SELECT status, roles FROM memberships WHERE tenant_id = ? AND member_id = (SELECT user_id FROM identities WHERE subject = 'fb-founder')`, t.id))
      .toEqual({ status: 'active', roles: '["admin"]' });
    expect(seedDefaultPackages).toHaveBeenCalledWith(t.id);
    // The founder can now read their gym (admin: counters included).
    expect(await repo.getTenant(t.id)).toMatchObject({ activeAdminCount: 1 });
  });

  it('a taken code is the same Error("CODE_TAKEN") the create-gym screen checks; a failed seeding does not fail the gym', async () => {
    w.as('founder');
    const e = await refusal(repo.createTenantWithOwner({ name: 'Başka', code: 't1', branding: { appName: 'B', primaryColor: '#112233', accentColor: '#445566' }, ownerUid: 'fb-founder' }));
    expect(e.message).toBe('CODE_TAKEN');
    vi.mocked(seedDefaultPackages).mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await repo.createTenantWithOwner({ name: 'Başka', code: 'B-1', branding: { appName: 'B', primaryColor: '#112233', accentColor: '#445566' }, ownerUid: 'fb-founder' });
    expect(t.code).toBe('B-1');
  });
});

describe('settings writes', () => {
  beforeEach(() => w.as('admin'));

  it('branding, identity (empty address clears), cancellation hours and opening hours land on the gym', async () => {
    await repo.updateTenantBranding('t1', { appName: 'Marka', primaryColor: '#abcdef', accentColor: '#123456', themeMode: 'dark' });
    await repo.updateTenantIdentity('t1', { name: 'Salon', address: 'Adres 1' });
    await repo.updateTenantCancellationHours('t1', 6);
    await repo.updateTenantOpeningHours('t1', { '1': { open: '09:00', close: '21:00' }, '0': null });
    expect(await repo.getTenant('t1')).toMatchObject({
      name: 'Salon', address: 'Adres 1', cancellationHours: 6,
      branding: { appName: 'Marka', primaryColor: '#abcdef', themeMode: 'dark' },
      openingHours: { '1': { open: '09:00', close: '21:00' }, '0': null },
    });
    await repo.updateTenantIdentity('t1', { name: 'Salon', address: '   ' });
    expect((await repo.getTenant('t1'))!.address).toBeUndefined();
  });

  it('a member may not change settings; bad values are refused with the Worker error', async () => {
    expect((await refusal(repo.updateTenantCancellationHours('t1', -1))).code).toBe('functions/invalid-argument');
    expect((await refusal(repo.updateTenantBranding('t1', { appName: 'x', primaryColor: 'red', accentColor: '#123456' }))).code).toBe('functions/invalid-argument');
    w.as('mem');
    expect((await refusal(repo.updateTenantOpeningHours('t1', {}))).code).toBe('functions/permission-denied');
  });

  it('contact: empty to begin with, replaced as a whole, readable by members, empty fields removed', async () => {
    expect(await repo.getTenantContact('t1')).toEqual({});
    await repo.updateTenantContact('t1', { phone: ' 0212 ', email: 'info@example.com' });
    w.as('mem');
    expect(await repo.getTenantContact('t1')).toEqual({ phone: '0212', email: 'info@example.com' });
    w.as('admin');
    await repo.updateTenantContact('t1', { phone: '', email: 'info@example.com' });
    expect(await repo.getTenantContact('t1')).toEqual({ email: 'info@example.com' });
    w.as('mem');
    expect((await refusal(repo.updateTenantContact('t1', { phone: '1' }))).code).toBe('functions/permission-denied');
  });
});

it('logo upload stays on the Firebase callable', () => {
  expect(repo.uploadTenantLogo).toBe(fbTenant.uploadTenantLogo);
});
