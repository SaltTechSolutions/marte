import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

import { resetSharedWatches } from '../firebase/sharedWatch';
import * as fb from '../firebase/membershipRepo';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import { invalidate } from './poll';
import * as repo from './membershipRepo';
import type { TenantMembership } from '../types';

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
const keep = (stop: () => void) => { stops.push(stop); return stop; };

beforeEach(async () => { w = await world(); });
afterEach(() => { stops.splice(0).forEach((s) => s()); resetSharedWatches(); });

describe('ids', () => {
  it('membershipId is the deterministic Firestore id', () => {
    expect(repo.membershipId('t1', 'abc')).toBe('t1_abc');
    expect(repo.membershipId('t1', 'abc')).toBe(fb.membershipId('t1', 'abc'));
  });
});

describe('getMembership / getMembershipById / getActiveMemberships', () => {
  it('maps the row; the signed-in person is shown under their Firebase uid, others under the internal id', async () => {
    const mine = await repo.getMembership('t1', 'fb-mem');
    expect(mine).toMatchObject({
      id: 't1_fb-mem', userId: 'fb-mem', tenantId: 't1', tenantCode: 'T1', tenantName: 'Gym',
      status: 'active', roles: ['member'], permissions: [], requestedAt: new Date(1),
    });
    expect(mine!.approvedAt).toBeUndefined();

    w.as('admin');
    const theirs = await repo.getMembership('t1', 'u-mem');
    expect(theirs).toMatchObject({ id: 't1_u-mem', userId: 'u-mem', roles: ['member'] });
    expect((await repo.getMembershipById('t1_fb-admin'))?.userId).toBe('fb-admin');
  });

  it('is null for a person with no membership and for a gym that does not exist', async () => {
    await w.h.addUser('u-ghost', null);
    w.as('ghost');
    expect(await repo.getMembership('t1', 'fb-ghost')).toBeNull();
    expect(await repo.getMembershipById('nope_fb-ghost')).toBeNull();
  });

  it('lists only ACTIVE gyms, earliest join first, and refuses another person', async () => {
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Studio',1), ('t3','T3','Third',1)`);
    await w.h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at, approved_at) VALUES
      ('t2','u-mem','active','["member"]',1,5), ('t3','u-mem','pending','["member"]',1,NULL)`);
    const all = await repo.getActiveMemberships('fb-mem');
    expect(all.map((m) => m.tenantId)).toEqual(['t1', 't2']);          // t1 joined at 1 (requestedAt), t2 approved at 5
    expect(all[1]).toMatchObject({ tenantName: 'Studio', tenantCode: 'T2', approvedAt: new Date(5) });
    expect((await refusal(repo.getActiveMemberships('u-admin'))).message).toMatch(/oturumdaki kişi/);
  });

  it('is empty for an account that has no internal user yet (and rejects, not empties, when unreachable)', async () => {
    w.as('brandnew');
    expect(await repo.getActiveMemberships('fb-brandnew')).toEqual([]);
  });
});

describe('requestJoin', () => {
  it('bootstraps a brand-new account, creates a pending member, and a second request is refused', async () => {
    w.as('newbie', { displayName: 'Yeni Üye', email: 'yeni@example.com' });
    await repo.requestJoin({ tenantId: 't1', tenantCode: 'T1', tenantName: 'Gym', userId: 'fb-newbie', userDisplayName: 'Yeni Üye', userEmail: 'yeni@example.com' });
    const row = await w.h.one(`SELECT m.status, m.roles, m.display_name, m.email FROM memberships m JOIN identities i ON i.user_id = m.member_id WHERE i.subject = 'fb-newbie'`);
    expect(row).toMatchObject({ status: 'pending', roles: '["member"]', display_name: 'Yeni Üye', email: 'yeni@example.com' });
    // The Worker decides "was my row written?" by comparing requested_at with its own Date.now(); a second join
    // inside the same millisecond as the first reads as the first one's write. Real requests are never that close.
    await new Promise((r) => setTimeout(r, 5));
    const second = await refusal(repo.requestJoin({ tenantId: 't1', tenantCode: 'T1', tenantName: 'Gym', userId: 'fb-newbie' }));
    expect(second.code).toBe('functions/failed-precondition');
    expect(second.message).toMatch(/zaten/);
  });

  it('lets a former member (left) apply again: back to a plain pending member', async () => {
    await w.h.addUser('u-old', ['trainer'], { status: 'active' });
    await w.h.run(`UPDATE memberships SET status = 'left', permissions = '["checkin"]' WHERE member_id = 'u-old'`);
    w.as('old');
    await repo.requestJoin({ tenantId: 't1', tenantCode: 'T1', tenantName: 'Gym', userId: 'fb-old' });
    expect(await w.h.one(`SELECT status, roles, permissions FROM memberships WHERE member_id = 'u-old'`)).toMatchObject({ status: 'pending', roles: '["member"]', permissions: '[]' });
  });
});

describe('approve / reject / pending list', () => {
  beforeEach(async () => {
    await w.h.addUser('u-p1', ['member'], { status: 'pending' });
    await w.h.addUser('u-p2', ['member'], { status: 'pending' });
    await w.h.run(`UPDATE memberships SET requested_at = 1700000000000, display_name = 'Pending One' WHERE member_id = 'u-p1'`);
  });

  it('watchPendingRequests delivers completed rows (requestedAt, permissions) and refreshes after approve', async () => {
    w.as('admin');
    const onChange = vi.fn();
    keep(repo.watchPendingRequests('t1', onChange));
    await calls(onChange);
    const first = lastCall<TenantMembership[]>(onChange);
    expect(first.map((m) => m.userId).sort()).toEqual(['u-p1', 'u-p2']);
    expect(first.find((m) => m.userId === 'u-p1')).toMatchObject({ userDisplayName: 'Pending One', requestedAt: new Date(1700000000000), permissions: [], status: 'pending' });

    await repo.approveMembership('t1_u-p1');                       // invalidates: no waiting for the 30 s poll
    await vi.waitFor(() => expect(lastCall<TenantMembership[]>(onChange).map((m) => m.userId)).toEqual(['u-p2']));
    expect((await w.h.one(`SELECT status, approved_at FROM memberships WHERE member_id = 'u-p1'`)).status).toBe('active');
  });

  it('rejects a request, and a plain member may not decide', async () => {
    w.as('admin');
    await repo.rejectMembership('t1_u-p2');
    expect((await w.h.one(`SELECT status FROM memberships WHERE member_id = 'u-p2'`)).status).toBe('rejected');
    w.as('mem');
    const e = await refusal(repo.approveMembership('t1_u-p1'));
    expect(e.code).toBe('functions/permission-denied');
  });

  it('approval stops at the free-tier seat limit with the Worker message', async () => {
    await w.h.run(`UPDATE tenants SET active_member_count = 10 WHERE id = 't1'`);
    w.as('admin');
    const e = await refusal(repo.approveMembership('t1_u-p1'));
    expect(e.code).toBe('functions/failed-precondition');
    expect(e.message).toMatch(/üye/);
  });
});

describe('rosters', () => {
  beforeEach(async () => {
    await w.h.addUser('u-coach', ['trainer'], { permissions: ['checkin'] });
    await w.h.addUser('u-boss', ['admin', 'trainer']);
    await w.h.addUser('u-gone', ['member'], { status: 'suspended' });
    await w.h.run(`UPDATE memberships SET approved_at = 2000, display_name = 'Koç' WHERE member_id = 'u-coach'`);
    w.as('admin');
  });

  it('active members: only active holders of the member role, with permissions/requestedAt filled in', async () => {
    const onChange = vi.fn();
    keep(repo.watchActiveMembers('t1', onChange));
    await calls(onChange);
    expect(lastCall<TenantMembership[]>(onChange).map((m) => m.userId)).toEqual(['u-mem']);
    expect(lastCall<TenantMembership[]>(onChange)[0]).toMatchObject({ id: 't1_u-mem', tenantName: 'Gym', requestedAt: new Date(1) });
  });

  it('trainers carry their delegated permissions; admins include a hybrid admin+trainer', async () => {
    const trainers = vi.fn(); const admins = vi.fn();
    keep(repo.watchActiveTrainers('t1', trainers));
    keep(repo.watchActiveAdmins('t1', admins));
    await calls(trainers); await calls(admins);
    const t = lastCall<TenantMembership[]>(trainers);
    expect(t.map((m) => m.userId).sort()).toEqual(['u-boss', 'u-coach']);
    expect(t.find((m) => m.userId === 'u-coach')).toMatchObject({ permissions: ['checkin'], approvedAt: new Date(2000), userDisplayName: 'Koç' });
    expect(lastCall<TenantMembership[]>(admins).map((m) => m.userId).sort()).toEqual(['fb-admin', 'u-boss']);   // me, shown under my Firebase uid
  });

  it('two screens watching the same list share one poller; each gets the value', async () => {
    const a = vi.fn(); const b = vi.fn();
    keep(repo.watchActiveMembers('t1', a));
    await calls(a);
    keep(repo.watchActiveMembers('t1', b));                         // late joiner is replayed the last value at once
    expect(b).toHaveBeenCalledTimes(1);
    expect(lastCall<TenantMembership[]>(b)).toEqual(lastCall<TenantMembership[]>(a));
  });

  it('a plain member is refused the roster: the error reaches the screen, never an empty list', async () => {
    w.as('mem');
    const onChange = vi.fn(); const onError = vi.fn();
    keep(repo.watchActiveMembers('t1', onChange, onError));
    await calls(onError);
    expect(onChange).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'functions/permission-denied' });
  });
});

describe('watchMembership', () => {
  it('delivers the row, follows a role change after invalidate, and says null for a person with no membership', async () => {
    const onChange = vi.fn();
    keep(repo.watchMembership('t1', 'fb-mem', onChange));
    await calls(onChange);
    expect(lastCall<TenantMembership>(onChange)).toMatchObject({ userId: 'fb-mem', roles: ['member'] });

    await w.h.run(`UPDATE memberships SET roles = '["member","trainer"]', permissions = '["checkin"]' WHERE member_id = 'u-mem'`);
    invalidate('t:t1');
    await vi.waitFor(() => expect(lastCall<TenantMembership>(onChange).roles).toEqual(['member', 'trainer']));

    await w.h.addUser('u-ghost', null);
    w.as('ghost');
    const ghost = vi.fn();
    keep(repo.watchMembership('t1', 'fb-ghost', ghost));
    await calls(ghost);
    expect(ghost).toHaveBeenCalledWith(null);
  });
});

describe('countActiveMembers', () => {
  it('admin: the Worker tally; trainer: counted from the roster with the same filter', async () => {
    await w.h.addUser('u-coach', ['trainer']);
    await w.h.run(`UPDATE tenants SET active_member_count = 7 WHERE id = 't1'`);
    w.as('admin');
    expect(await repo.countActiveMembers('t1')).toBe(7);
    w.as('coach');
    expect(await repo.countActiveMembers('t1')).toBe(1);            // u-mem only: staff-only rows do not take a seat
  });
});

describe('roles and permissions', () => {
  it('setMembershipRoles keeps permissions; setMembershipPermissions keeps roles', async () => {
    await w.h.addUser('u-coach', ['trainer'], { permissions: ['checkin'] });
    w.as('admin');
    await repo.setMembershipRoles('t1_u-coach', ['trainer', 'member']);
    expect(await w.h.one(`SELECT roles, permissions FROM memberships WHERE member_id = 'u-coach'`)).toMatchObject({ roles: '["trainer","member"]', permissions: '["checkin"]' });
    await repo.setMembershipPermissions('t1_u-coach', []);
    expect(await w.h.one(`SELECT roles, permissions FROM memberships WHERE member_id = 'u-coach'`)).toMatchObject({ roles: '["trainer","member"]', permissions: '[]' });
  });

  it('refuses an admin demoting themselves, a non-admin, and an unknown member', async () => {
    w.as('admin');
    const self = await refusal(repo.setMembershipRoles('t1_fb-admin', ['member']));      // own id given as Firebase uid
    expect(self.message).toMatch(/yönetici yetkini/);
    expect((await refusal(repo.setMembershipRoles('t1_u-nobody', ['member']))).code).toBe('functions/not-found');
    w.as('mem');
    expect((await refusal(repo.setMembershipPermissions('t1_u-mem', ['checkin']))).code).toBe('functions/permission-denied');
  });

  it('the admin cap of three stops a fourth admin', async () => {
    for (const n of ['a1', 'a2']) await w.h.addUser(`u-${n}`, ['admin']);
    await w.h.addUser('u-a3', ['trainer']);
    await w.h.run(`UPDATE tenants SET active_admin_count = 3 WHERE id = 't1'`);
    w.as('admin');
    expect((await refusal(repo.setMembershipRoles('t1_u-a3', ['admin']))).message).toMatch(/en fazla 3 yönetici/);
  });
});

describe('updateMemberDetails', () => {
  it('a member edits their own row; the birth date round-trips as the same calendar day', async () => {
    const membershipId = repo.membershipId('t1', 'fb-mem');
    await repo.updateMemberDetails(membershipId, {
      userDisplayName: '  Ayşe Yılmaz ', phone: ' 0555 ', birthDate: new Date(1990, 4, 21), heightCm: 170,
    });
    const m = await repo.getMembership('t1', 'fb-mem');
    expect(m).toMatchObject({ userDisplayName: 'Ayşe Yılmaz', phone: '0555', heightCm: 170 });
    expect([m!.birthDate!.getFullYear(), m!.birthDate!.getMonth(), m!.birthDate!.getDate()]).toEqual([1990, 4, 21]);
  });

  it('reads a migrated local-midnight Istanbul birth date as the intended day', async () => {
    await w.h.run(`UPDATE memberships SET birth_date = ? WHERE member_id = 'u-mem'`, Date.UTC(1990, 4, 20, 21));   // 21 May 00:00 +03
    const m = await repo.getMembership('t1', 'fb-mem');
    expect([m!.birthDate!.getMonth(), m!.birthDate!.getDate()]).toEqual([4, 21]);
  });

  it('clearing a height that is not set is a no-op; clearing one that is set fails loudly', async () => {
    const id = 't1_fb-mem';
    await repo.updateMemberDetails(id, { heightCm: null });                          // nothing to clear: no error, no request
    await repo.updateMemberDetails(id, { heightCm: 180 });
    expect((await refusal(repo.updateMemberDetails(id, { heightCm: null }))).message).toMatch(/GAP\(api\)/);
    expect((await repo.getMembership('t1', 'fb-mem'))!.heightCm).toBe(180);
  });

  it('an admin may edit a hand-added member (with e-mail) but not a real account; nothing to change sends nothing', async () => {
    w.as('admin');
    const { memberId, membershipId } = await repo.createManagedMember({ tenantId: 't1', name: 'Elle Eklenen' });
    await repo.updateMemberDetails(membershipId, { userEmail: ' elle@example.com ' });
    expect((await repo.getMembership('t1', memberId))!.userEmail).toBe('elle@example.com');
    expect((await refusal(repo.updateMemberDetails('t1_u-mem', { phone: '1' }))).code).toBe('functions/permission-denied');
    await repo.updateMemberDetails('t1_u-mem', {});
  });
});

describe('createManagedMember / removeMemberFromTenant / leaveTenant', () => {
  it('creates a hand-added adult with address; the id is a plain mm… id and the id pair is returned', async () => {
    w.as('admin');
    const res = await repo.createManagedMember({ tenantId: 't1', name: 'Mehmet', phone: ' 0532 ', birthDate: new Date(1985, 2, 9), address: ' Kadıköy ' });
    expect(res.memberId).toMatch(/^mm[0-9a-f]{20}$/);
    expect(res.membershipId).toBe(`t1_${res.memberId}`);
    expect(await w.h.one(`SELECT managed, phone, status FROM memberships WHERE member_id = ?`, res.memberId)).toMatchObject({ managed: 1, phone: '0532', status: 'active' });
    expect((await w.h.one(`SELECT address FROM member_addresses WHERE member_id = ?`, res.memberId)).address).toBe('Kadıköy');
  });

  it('refuses a minor (Turkish message) and a non-admin', async () => {
    w.as('admin');
    const young = new Date(); young.setFullYear(young.getFullYear() - 10);
    const e = await refusal(repo.createManagedMember({ tenantId: 't1', name: 'Çocuk', birthDate: young }));
    expect(e.code).toBe('functions/failed-precondition');
    expect(e.message).toMatch(/18 yaşından küçük/);
    w.as('mem');
    expect((await refusal(repo.createManagedMember({ tenantId: 't1', name: 'X' }))).code).toBe('functions/permission-denied');
  });

  it('removeMemberFromTenant fails loudly: the Worker has no such route', async () => {
    w.as('admin');
    expect((await refusal(repo.removeMemberFromTenant('t1', 'u-mem'))).message).toMatch(/GAP\(api\)/);
  });

  it('a member leaves (history stays), the last admin may not', async () => {
    await repo.leaveTenant('t1_fb-mem');
    expect((await w.h.one(`SELECT status FROM memberships WHERE member_id = 'u-mem'`)).status).toBe('left');
    w.as('admin');
    const e = await refusal(repo.leaveTenant('t1_fb-admin'));
    expect(e.code).toBe('functions/failed-precondition');
    expect(e.message).toMatch(/son yöneticisisin/);
  });
});

describe('guardian link', () => {
  beforeEach(async () => {
    await w.h.addUser('u-kid', ['member']);
    await w.h.addUser('u-par', ['member']);
    await w.h.run(`UPDATE memberships SET email = 'veli@example.com', display_name = 'Veli Kişi' WHERE member_id = 'u-par'`);
    await w.h.run(`UPDATE memberships SET email = 'cocuk@example.com' WHERE member_id = 'u-kid'`);
  });

  it('child nominates a parent by e-mail; the parent sees the child and approves; consent is recorded', async () => {
    w.as('kid');
    expect(await repo.requestGuardian('t1', ' Veli@Example.com ')).toBe('Veli Kişi');

    w.as('par');
    const onChange = vi.fn();
    keep(repo.watchMyChildren('t1', 'fb-par', onChange));
    await calls(onChange);
    expect(lastCall<TenantMembership[]>(onChange)).toHaveLength(1);
    expect(lastCall<TenantMembership[]>(onChange)[0]).toMatchObject({ userId: 'u-kid', guardianStatus: 'pending', guardianId: 'fb-par', guardianName: 'Veli Kişi' });

    await repo.respondToGuardian('t1', 'u-kid', true);
    await vi.waitFor(() => expect(lastCall<TenantMembership[]>(onChange)[0].guardianStatus).toBe('approved'));
    expect((await w.h.one(`SELECT guardian_consent_version FROM memberships WHERE member_id = 'u-kid'`)).guardian_consent_version).toBeTruthy();
    expect((await refusal(repo.respondToGuardian('t1', 'u-kid', true))).message).toMatch(/zaten yanıtlandı/);
  });

  it('refuses an unknown parent e-mail with the Worker message, and watchMyChildren is empty for a parent with no child', async () => {
    w.as('kid');
    const e = await refusal(repo.requestGuardian('t1', 'kimse@example.com'));
    expect(e.message).toMatch(/e-postayla aktif bir üye bulunamadı/);
    w.as('par');
    const none = vi.fn();
    keep(repo.watchMyChildren('t1', 'fb-par', none));
    await calls(none);
    expect(lastCall<TenantMembership[]>(none)).toEqual([]);
  });
});
