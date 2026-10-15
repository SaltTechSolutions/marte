import * as admin from 'firebase-admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { removeMemberFromTenant } from '../src/auth';
import {
  ageOn,
  createManagedMember,
  FREE_MEMBER_LIMIT,
  newManagedMemberId,
  parseManagedMemberInput,
} from '../src/managedMembers';
import { clearFirestore } from './helpers';

const TENANT = 't1';
const ADMIN = 'admin1';
const NOW = new Date('2026-10-14T09:00:00.000Z');

describe('ageOn', () => {
  it('counts completed years by calendar, not by 365 days', () => {
    expect(ageOn(new Date('2008-10-14T12:00:00.000Z'), NOW)).toBe(18);
    expect(ageOn(new Date('2008-10-15T12:00:00.000Z'), NOW)).toBe(17);
    expect(ageOn(new Date('1990-02-28T12:00:00.000Z'), NOW)).toBe(36);
  });
});

describe('parseManagedMemberInput', () => {
  const ok = { tenantId: TENANT, name: '  Ada Yılmaz ' };

  it('trims, and treats blank optional fields as absent', () => {
    const r = parseManagedMemberInput({ ...ok, phone: ' ', email: '', address: '  ', birthDate: '' }, NOW);
    expect(r).toEqual({ tenantId: TENANT, name: 'Ada Yılmaz', phone: undefined, email: undefined, birthDate: undefined, address: undefined });
  });

  it('keeps the birth date as the same calendar day', () => {
    const r = parseManagedMemberInput({ ...ok, birthDate: '1990-01-31' }, NOW);
    expect(r.birthDate?.toISOString().slice(0, 10)).toBe('1990-01-31');
  });

  it.each([
    ['no tenant', { name: 'A' }],
    ['no name', { tenantId: TENANT, name: '  ' }],
    ['name too long', { tenantId: TENANT, name: 'a'.repeat(101) }],
    ['phone too long', { ...ok, phone: '1'.repeat(31) }],
    ['bad e-mail', { ...ok, email: 'nope' }],
    ['address too long', { ...ok, address: 'x'.repeat(301) }],
    ['text field that is not text', { ...ok, phone: 5 }],
    ['birth date in the wrong format', { ...ok, birthDate: '14.10.1990' }],
    ['birth date that is not a day', { ...ok, birthDate: '1990-02-30' }],
    ['birth date in the future', { ...ok, birthDate: '2027-01-01' }],
    ['birth date that makes them 120', { ...ok, birthDate: '1900-01-01' }],
  ])('rejects %s', (_label, data) => {
    expect(() => parseManagedMemberInput(data, NOW)).toThrow();
  });

  it('rejects an under-18: a minor needs a parent\'s recorded consent, which a row written by the gym skips', () => {
    expect(() => parseManagedMemberInput({ ...ok, birthDate: '2010-04-02' }, NOW)).toThrow(/18/);
    expect(() => parseManagedMemberInput({ ...ok, birthDate: '2008-10-15' }, NOW)).toThrow(/18/);
    expect(() => parseManagedMemberInput({ ...ok, birthDate: '2008-10-14' }, NOW)).not.toThrow();
  });
});

describe('newManagedMemberId', () => {
  it('has no underscore (documents are keyed tenant_member) and is not reused', () => {
    const ids = new Set(Array.from({ length: 50 }, newManagedMemberId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^mm[0-9a-f]{20}$/);
  });
});

async function seedGym(tenant: Record<string, unknown> = {}) {
  const db = admin.firestore();
  await db.doc(`tenants/${TENANT}`).set({ code: 'T-1', name: 'Test Salon', activeMemberCount: 3, ...tenant });
  await db.doc(`tenant_memberships/${TENANT}_${ADMIN}`).set({
    tenantId: TENANT, userId: ADMIN, status: 'active', roles: ['admin'],
  });
}

function callAs(uid: string | null, data: Record<string, unknown>) {
  return createManagedMember.run({ auth: uid ? { uid } : undefined, data } as never);
}

describe('createManagedMember', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('an admin adds a member: an active, managed row on a synthetic id, with the address kept apart', async () => {
    await seedGym();
    const res = (await callAs(ADMIN, {
      tenantId: TENANT, name: 'Ada Yılmaz', phone: '0555 111 22 33', email: 'ada@example.com',
      birthDate: '1990-05-17', address: 'Bağdat Cad. 12/3, Kadıköy',
    })) as { memberId: string; membershipId: string };

    expect(res.memberId).toMatch(/^mm[0-9a-f]{20}$/);
    expect(res.membershipId).toBe(`${TENANT}_${res.memberId}`);

    const m = (await admin.firestore().doc(`tenant_memberships/${res.membershipId}`).get()).data()!;
    expect(m).toMatchObject({
      userId: res.memberId, tenantId: TENANT, tenantCode: 'T-1', tenantName: 'Test Salon',
      status: 'active', roles: ['member'], permissions: [], userDisplayName: 'Ada Yılmaz',
      userEmail: 'ada@example.com', phone: '0555 111 22 33', managed: true, createdBy: ADMIN,
    });
    expect(m.birthDate.toDate().toISOString().slice(0, 10)).toBe('1990-05-17');
    // The address is NOT on the membership row, which trainers can read.
    expect(m).not.toHaveProperty('address');

    const a = (await admin.firestore().doc(`member_addresses/${res.membershipId}`).get()).data()!;
    expect(a).toMatchObject({ tenantId: TENANT, memberId: res.memberId, address: 'Bağdat Cad. 12/3, Kadıköy', updatedBy: ADMIN });
  });

  it('needs only a name; no address document is written without an address', async () => {
    await seedGym();
    const res = (await callAs(ADMIN, { tenantId: TENANT, name: 'Sadece Ad' })) as { membershipId: string };
    expect((await admin.firestore().doc(`tenant_memberships/${res.membershipId}`).get()).exists).toBe(true);
    expect((await admin.firestore().doc(`member_addresses/${res.membershipId}`).get()).exists).toBe(false);
  });

  it('refuses a caller who is not signed in, not an admin, or an admin of another gym', async () => {
    await seedGym();
    await admin.firestore().doc(`tenant_memberships/${TENANT}_coach`).set({
      tenantId: TENANT, userId: 'coach', status: 'active', roles: ['trainer'],
    });
    await admin.firestore().doc(`tenant_memberships/other_rival`).set({
      tenantId: 'other', userId: 'rival', status: 'active', roles: ['admin'],
    });
    await expect(callAs(null, { tenantId: TENANT, name: 'X' })).rejects.toMatchObject({ code: 'unauthenticated' });
    await expect(callAs('coach', { tenantId: TENANT, name: 'X' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(callAs('rival', { tenantId: TENANT, name: 'X' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a suspended admin', async () => {
    await seedGym();
    await admin.firestore().doc(`tenant_memberships/${TENANT}_${ADMIN}`).update({ status: 'suspended' });
    await expect(callAs(ADMIN, { tenantId: TENANT, name: 'X' })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('enforces the free-tier seat limit like approvals do, and lets a subscribed gym through', async () => {
    await seedGym({ activeMemberCount: FREE_MEMBER_LIMIT });
    await expect(callAs(ADMIN, { tenantId: TENANT, name: 'Dokuz' })).rejects.toMatchObject({ code: 'resource-exhausted' });

    await admin.firestore().doc(`tenants/${TENANT}`).update({ subscription: { status: 'active' } });
    await expect(callAs(ADMIN, { tenantId: TENANT, name: 'Abone' })).resolves.toBeTruthy();
  });

  it('rejects an under-18 before writing anything', async () => {
    await seedGym();
    await expect(callAs(ADMIN, { tenantId: TENANT, name: 'Genç', birthDate: '2012-01-01' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    const rows = await admin.firestore().collection('tenant_memberships').where('managed', '==', true).get();
    expect(rows.size).toBe(0);
  });
});

describe('removeMemberFromTenant takes the owner note and the address with the member', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('removes a manually added member and every gym-scoped trace of them, leaving other gyms alone', async () => {
    await seedGym();
    const db = admin.firestore();
    const { memberId, membershipId } = (await callAs(ADMIN, {
      tenantId: TENANT, name: 'Silinecek', address: 'Bir adres',
    })) as { memberId: string; membershipId: string };
    await db.doc(`member_admin_notes/${membershipId}`).set({ tenantId: TENANT, memberId, text: 'özel not', updatedBy: ADMIN });
    await db.doc(`member_notes/${membershipId}`).set({ tenantId: TENANT, memberId, text: 'antrenör notu', updatedBy: ADMIN });
    // the same synthetic id appearing in another gym must survive
    await db.doc(`member_admin_notes/other_${memberId}`).set({ tenantId: 'other', memberId, text: 'başka salon', updatedBy: 'x' });

    await removeMemberFromTenant.run({ auth: { uid: ADMIN }, data: { tenantId: TENANT, memberId } } as never);

    expect((await db.doc(`tenant_memberships/${membershipId}`).get()).exists).toBe(false);
    expect((await db.doc(`member_addresses/${membershipId}`).get()).exists).toBe(false);
    expect((await db.doc(`member_admin_notes/${membershipId}`).get()).exists).toBe(false);
    expect((await db.doc(`member_notes/${membershipId}`).get()).exists).toBe(false);
    expect((await db.doc(`member_admin_notes/other_${memberId}`).get()).exists).toBe(true);
  });
});
