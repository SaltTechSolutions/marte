import {
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

import { MembershipPermission, MembershipRole, TenantMembership } from '../types';
import { membershipFromDoc } from './convert';
import { sharedWatch } from './sharedWatch';
import { WatchErrorHandler, watchDoc, watchQuery } from './watch';

/**
 * tenant_memberships doc ids are deterministic: `${tenantId}_${userId}`.
 * This makes "already requested?" a single get() instead of a query, keeps
 * a user from spamming duplicate join requests (re-creating the same doc is
 * just a no-op create-on-existing, which security rules reject), and lets
 * Firestore rules check tenant-admin status with a plain get() as well.
 */
export function membershipId(tenantId: string, userId: string) {
  return `${tenantId}_${userId}`;
}

export async function getMembership(tenantId: string, userId: string): Promise<TenantMembership | null> {
  const snap = await getDoc(doc(db, 'tenant_memberships', membershipId(tenantId, userId)));
  if (!snap.exists()) return null;
  return membershipFromDoc(snap);
}

export async function getMembershipById(id: string): Promise<TenantMembership | null> {
  const snap = await getDoc(doc(db, 'tenant_memberships', id));
  if (!snap.exists()) return null;
  return membershipFromDoc(snap);
}

/** Live updates for the onboarding "pending approval" screen. */
export function watchMembership(
  tenantId: string,
  userId: string,
  onChange: (membership: TenantMembership | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Üyelik',
    doc(db, 'tenant_memberships', membershipId(tenantId, userId)),
    (snap) => (snap.exists() ? membershipFromDoc(snap) : null),
    onChange,
    onError,
  );
}

export async function requestJoin(params: {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  userId: string;
  userDisplayName?: string | null;
  userEmail?: string | null;
}): Promise<void> {
  const id = membershipId(params.tenantId, params.userId);
  const ref = doc(db, 'tenant_memberships', id);

  // The doc id is `{tenantId}_{uid}`, so anyone who was ever in this gym
  // already owns it — a `create` would fail and lock a former member out of
  // rejoining forever. Re-applying updates the existing row back to
  // `pending` instead.
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // Reset to a plain member: a former trainer must not carry old roles or
    // delegated permissions through a rejoin. `shortCode` is left untouched —
    // assignMembershipShortCode only fires on create, so overwriting the doc
    // would cost them their check-in code permanently.
    await updateDoc(ref, {
      status: 'pending',
      roles: ['member'],
      permissions: [],
      requestedAt: serverTimestamp(),
      leftAt: deleteField(),
      approvedAt: deleteField(),
    });
    return;
  }

  // shortCode is assigned server-side by the assignMembershipShortCode
  // trigger: the collision check needs to read memberships this user cannot
  // see yet, which fails with permission-denied from the client.
  await setDoc(ref, {
    userId: params.userId,
    tenantId: params.tenantId,
    tenantCode: params.tenantCode,
    tenantName: params.tenantName,
    status: 'pending',
    roles: ['member'],
    permissions: [],
    requestedAt: serverTimestamp(),
    ...(params.userDisplayName ? { userDisplayName: params.userDisplayName } : {}),
    ...(params.userEmail ? { userEmail: params.userEmail } : {}),
  });
}

/** First active membership for a user — used for role-based routing after login. */
export async function getActiveMembership(userId: string): Promise<TenantMembership | null> {
  const snap = await getDocs(
    query(collection(db, 'tenant_memberships'), where('userId', '==', userId), where('status', '==', 'active')),
  );
  if (snap.empty) return null;
  return membershipFromDoc(snap.docs[0]);
}

/** Live active members of a tenant — trainer client list. */
export function watchActiveMembers(
  tenantId: string,
  onChange: (members: TenantMembership[]) => void,
  onError?: WatchErrorHandler,
) {
  return sharedWatch(
    `activeMembers:${tenantId}`,
    (change, err) => {
      const q = query(
        collection(db, 'tenant_memberships'),
        where('tenantId', '==', tenantId),
        where('status', '==', 'active'),
        where('roles', 'array-contains', 'member'),
      );
      return watchQuery('Üye listesi', q, (snap) => snap.docs.map(membershipFromDoc), change, err);
    },
    onChange,
    onError,
  );
}

/** Live active trainers of a tenant — calendar-sharing picker on the trainer Profil screen. */
export function watchActiveTrainers(
  tenantId: string,
  onChange: (trainers: TenantMembership[]) => void,
  onError?: WatchErrorHandler,
) {
  return sharedWatch(
    `activeTrainers:${tenantId}`,
    (change, err) => {
      const q = query(
        collection(db, 'tenant_memberships'),
        where('tenantId', '==', tenantId),
        where('status', '==', 'active'),
        where('roles', 'array-contains', 'trainer'),
      );
      return watchQuery('Antrenör listesi', q, (snap) => snap.docs.map(membershipFromDoc), change, err);
    },
    onChange,
    onError,
  );
}

/** Live pending join requests for a tenant — admin approvals screen. */
export function watchPendingRequests(
  tenantId: string,
  onChange: (requests: TenantMembership[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'tenant_memberships'),
    where('tenantId', '==', tenantId),
    where('status', '==', 'pending'),
  );
  return watchQuery('Onay bekleyenler', q, (snap) => snap.docs.map(membershipFromDoc), onChange, onError);
}

export async function approveMembership(id: string): Promise<void> {
  await updateDoc(doc(db, 'tenant_memberships', id), { status: 'active', approvedAt: serverTimestamp() });
}

export async function rejectMembership(id: string): Promise<void> {
  await updateDoc(doc(db, 'tenant_memberships', id), { status: 'rejected' });
}

/** Active member count for a tenant — freemium limit check on the approve path. */
export async function countActiveMembers(tenantId: string): Promise<number> {
  const q = query(
    collection(db, 'tenant_memberships'),
    where('tenantId', '==', tenantId),
    where('status', '==', 'active'),
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

/**
 * Grant or revoke a delegated capability (e.g. letting a trainer work the
 * front desk while the owner is out). Admin-only — enforced by rules, not
 * just here.
 */
export async function setMembershipPermissions(
  membershipDocId: string,
  permissions: MembershipPermission[],
): Promise<void> {
  await updateDoc(doc(db, 'tenant_memberships', membershipDocId), { permissions });
}

/**
 * Assign roles. `roles` is the only shape — the legacy single `role` field
 * was dropped once every document was backfilled.
 */
export async function setMembershipRoles(
  membershipDocId: string,
  roles: MembershipRole[],
): Promise<void> {
  await updateDoc(doc(db, 'tenant_memberships', membershipDocId), { roles });
}

/**
 * The member ends their own membership. Distinct from an admin suspension
 * and from deleting the account entirely — someone may leave one gym and
 * join another while keeping their history.
 *
 * Admins cannot use this path: they might be the gym's last one, and
 * security rules can't count the remaining admins. Transferring ownership is
 * a separate flow.
 */
export async function leaveTenant(membershipDocId: string): Promise<void> {
  await updateDoc(doc(db, 'tenant_memberships', membershipDocId), {
    status: 'left',
    leftAt: serverTimestamp(),
  });
}
