import { describe, expect, it } from 'vitest';

import { canCheckIn, canCoach, canManageGym, canOverseeCalendars, isStaff, primaryRole, selectMembership } from './membership';
import { TenantMembership } from './types';

const make = (over: Partial<TenantMembership>): TenantMembership =>
  ({
    id: 't_u',
    userId: 'u',
    tenantId: 't',
    tenantCode: 'T-01',
    tenantName: 'Salon',
    status: 'active',
    roles: ['member'],
    permissions: [],
    requestedAt: new Date(),
    ...over,
  }) as TenantMembership;

const admin = make({ roles: ['admin'] });
const trainer = make({ roles: ['trainer'] });
const member = make({ roles: ['member'] });
const both = make({ roles: ['admin', 'trainer'] });

describe('capabilities', () => {
  it('an admin always coaches — in a small studio the owner is the coach', () => {
    // Guards the decision recorded on canCoach: the capability comes with the
    // admin role, so nobody has to remember to also grant 'trainer' before an
    // owner can write a member a programme.
    expect(canCoach(admin)).toBe(true);
    expect(canCoach(trainer)).toBe(true);
    expect(canCoach(both)).toBe(true);
    expect(canCoach(member)).toBe(false);
  });

  it('coaching capability does not make a member into staff', () => {
    expect(isStaff(member)).toBe(false);
    expect(isStaff(admin)).toBe(true);
    expect(isStaff(trainer)).toBe(true);
  });

  it('a trainer does not gain the owner surface', () => {
    expect(canManageGym(trainer)).toBe(false);
    expect(canOverseeCalendars(trainer)).toBe(false);
    expect(canManageGym(admin)).toBe(true);
  });

  it('capability is not the same as which home screen you land on', () => {
    // An admin coaches, but still lands on the owner surface — capability and
    // surface are deliberately different axes.
    expect(primaryRole(admin)).toBe('admin');
    expect(primaryRole(trainer)).toBe('trainer');
    expect(primaryRole(both)).toBe('admin');
  });

  it('an admin can always work the door; a trainer needs the delegation', () => {
    expect(canCheckIn(admin)).toBe(true);
    expect(canCheckIn(trainer)).toBe(false);
    expect(canCheckIn(make({ roles: ['trainer'], permissions: ['checkin'] }))).toBe(true);
  });

  it('nothing is granted to an inactive membership', () => {
    const suspended = make({ roles: ['admin'], status: 'suspended' });
    expect(canCoach(suspended)).toBe(false);
    expect(canManageGym(suspended)).toBe(false);
    expect(isStaff(suspended)).toBe(false);
    expect(primaryRole(suspended)).toBeNull();
  });
});

describe('selectMembership (P1-8)', () => {
  const m = (tenantId: string) => make({ id: `${tenantId}_u1`, tenantId, roles: ['member'], status: 'active' });

  it('hiç üyelik yoksa null', () => {
    expect(selectMembership([], 'a')).toBeNull();
    expect(selectMembership([], null)).toBeNull();
  });

  it('seçim yoksa listenin ilki — sıra belirli olduğu için her açılışta aynı salon', () => {
    expect(selectMembership([m('a'), m('b')], null)?.tenantId).toBe('a');
  });

  it('saklanan salon listedeyse o gelir', () => {
    expect(selectMembership([m('a'), m('b')], 'b')?.tenantId).toBe('b');
  });

  it('ayrılınan salonda takılı kalmaz', () => {
    // Salondan ayrılan biri, artık üye olmadığı bir salonun ekranını açamaz.
    expect(selectMembership([m('a')], 'silinmis')?.tenantId).toBe('a');
  });
});
