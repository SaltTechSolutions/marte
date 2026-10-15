import { randomBytes } from 'node:crypto';

import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * Manual, account-less members (14 Oct 2026).
 *
 * A gym owner sometimes has a member who will never install the app — someone
 * who pays at the desk and trains. Every other member is a Firebase account
 * that joined by code; this one is a membership row the owner wrote.
 *
 * The row gets a SYNTHETIC member id (`mm` + 20 hex), not a Firebase Auth user.
 * Creating an Auth user with no sign-in method would work too, but it leaves a
 * credential-less account behind forever and a person nobody can ever sign in
 * as is not something to put in the user table. The synthetic id never equals
 * any `request.auth.uid`, so every "is this me?" rule is false for it and only
 * staff rules (which key off the gym, not the person) ever match. The id has no
 * underscore on purpose: documents are keyed `{tenantId}_{memberId}` and
 * `tenantOfId` splits on the first one.
 *
 * `managed: true` marks the row as the gym's own record. It is what lets an
 * admin edit that person's details (see `firestore.rules`); a member who signed
 * up themself keeps ownership of their own details.
 *
 * Never for under-18s: a minor's membership needs a parent's recorded consent
 * (MEMBER-5b) and a row written by the gym would skip it.
 */

const NAME_MAX = 100;
const PHONE_MAX = 30;
const EMAIL_MAX = 254;
const ADDRESS_MAX = 300;

/** Mirrors `withinMemberLimit` in firestore.rules — keep the two in step. */
export const FREE_MEMBER_LIMIT = 10;

export type ManagedMemberInput = {
  tenantId: string;
  name: string;
  phone?: string;
  email?: string;
  birthDate?: Date;
  address?: string;
};

function optionalText(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', `${label} metin olmalı.`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new HttpsError('invalid-argument', `${label} en fazla ${max} karakter olabilir.`);
  return trimmed;
}

/**
 * Completed years between `birth` and `now`, by calendar. Exported for tests.
 * Computed on UTC parts: the date travels as a plain `YYYY-MM-DD`, so a
 * timezone shift would move someone across their birthday.
 */
export function ageOn(birth: Date, now: Date): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Validates the callable payload. Exported for tests. */
export function parseManagedMemberInput(data: unknown, now: Date = new Date()): ManagedMemberInput {
  const d = (data ?? {}) as Record<string, unknown>;

  const tenantId = typeof d.tenantId === 'string' ? d.tenantId.trim() : '';
  if (!tenantId) throw new HttpsError('invalid-argument', 'Salon bilgisi gerekiyor.');

  const name = optionalText(d.name, NAME_MAX, 'Ad soyad');
  if (!name) throw new HttpsError('invalid-argument', 'Ad soyad gerekiyor.');

  const phone = optionalText(d.phone, PHONE_MAX, 'Telefon');
  const email = optionalText(d.email, EMAIL_MAX, 'E-posta');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'E-posta adresi geçersiz görünüyor.');
  }
  const address = optionalText(d.address, ADDRESS_MAX, 'Adres');

  let birthDate: Date | undefined;
  if (d.birthDate !== undefined && d.birthDate !== null && d.birthDate !== '') {
    const raw = typeof d.birthDate === 'string' ? d.birthDate.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new HttpsError('invalid-argument', 'Doğum tarihi GG.AA.YYYY biçiminde olmalı.');
    }
    const parsed = new Date(`${raw}T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
      throw new HttpsError('invalid-argument', 'Doğum tarihi geçerli bir gün değil.');
    }
    if (parsed.getTime() > now.getTime()) {
      throw new HttpsError('invalid-argument', 'Doğum tarihi gelecekte olamaz.');
    }
    if (ageOn(parsed, now) >= 120) {
      throw new HttpsError('invalid-argument', 'Doğum tarihi geçerli görünmüyor.');
    }
    if (ageOn(parsed, now) < 18) {
      throw new HttpsError(
        'failed-precondition',
        '18 yaşından küçük üyeler elle eklenemez: veli onayı için uygulamadan katılmaları gerekiyor.',
      );
    }
    birthDate = parsed;
  }

  return { tenantId, name, phone, email, birthDate, address };
}

/** `mm` + 20 hex: no underscore, so `{tenantId}_{memberId}` splits cleanly. */
export function newManagedMemberId(): string {
  return `mm${randomBytes(10).toString('hex')}`;
}

/**
 * An admin adds a member by hand.
 *
 * Server-side because the row carries fields no client may write (`managed`,
 * `createdBy`, a synthetic `userId`), and because the free-tier seat limit is
 * enforced here the way `withinMemberLimit` enforces it for approvals — a
 * manual add must not be a way round the cap.
 */
export const createManagedMember = onCall({ region: 'europe-west1' }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Giriş yapmış olmanız gerekiyor.');

  const input = parseManagedMemberInput(request.data);
  const db = admin.firestore();

  const callerSnap = await db.doc(`tenant_memberships/${input.tenantId}_${uid}`).get();
  const caller = callerSnap.data();
  const callerIsAdmin =
    callerSnap.exists && caller?.status === 'active' && (caller?.roles ?? []).includes('admin');
  if (!callerIsAdmin) {
    throw new HttpsError('permission-denied', 'Bu işlem için salon yöneticisi olmanız gerekiyor.');
  }

  const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
  if (!tenantSnap.exists) throw new HttpsError('not-found', 'Salon bulunamadı.');
  const tenant = tenantSnap.data()!;

  const subscribed = tenant.subscription?.status === 'active';
  if (!subscribed && (tenant.activeMemberCount ?? 0) >= FREE_MEMBER_LIMIT) {
    throw new HttpsError(
      'resource-exhausted',
      `Ücretsiz planda en fazla ${FREE_MEMBER_LIMIT} aktif üye olabilir. Üye eklemek için aboneliği yükselt.`,
    );
  }

  const memberId = newManagedMemberId();
  const membershipId = `${input.tenantId}_${memberId}`;
  const now = admin.firestore.FieldValue.serverTimestamp();

  // `shortCode` is added by assignMembershipShortCode on create, like any row.
  await db.doc(`tenant_memberships/${membershipId}`).create({
    userId: memberId,
    tenantId: input.tenantId,
    tenantCode: tenant.code ?? '',
    tenantName: tenant.name ?? '',
    status: 'active',
    roles: ['member'],
    permissions: [],
    requestedAt: now,
    approvedAt: now,
    userDisplayName: input.name,
    managed: true,
    createdBy: uid,
    ...(input.email ? { userEmail: input.email } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.birthDate ? { birthDate: admin.firestore.Timestamp.fromDate(input.birthDate) } : {}),
  });

  if (input.address) {
    await db.doc(`member_addresses/${membershipId}`).create({
      tenantId: input.tenantId,
      memberId,
      address: input.address,
      updatedBy: uid,
      updatedAt: now,
    });
  }

  return { memberId, membershipId };
});
