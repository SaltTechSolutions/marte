import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, where, writeBatch } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { GymPackage, MemberCredit, MemberEntitlementsCache, MemberPackage } from '../types';
import { memberCreditFromDoc, memberEntitlementsFromDoc, memberPackageFromDoc } from './convert';
import { WatchErrorHandler, watchDoc, watchQuery } from './watch';

/** Deterministic id security rules rely on to `get()` this cache in one read. */
export function memberEntitlementsId(tenantId: string, memberId: string): string {
  return `${tenantId}_${memberId}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Assigns a package to a member: one `member_packages` row plus whatever
 * `member_credits` rows its entitlements imply, written as a single batch so
 * a member never has a package with no matching credit (or the reverse).
 *
 * This is the *direct* assignment path — no member approval. That is only
 * correct for a first-time or additive assignment ("İlk atama onay
 * istemez" — PKG-6). Changing what an already-holding member gets goes
 * through `package_change_requests` instead (PKG-6, not built yet); this
 * function must not be called for that case once PKG-6 lands.
 */
export async function assignPackageToMember(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  pkg: GymPackage;
  startsAt: Date;
  assignedBy: string;
  paymentId?: string;
}): Promise<void> {
  const { tenantId, memberId, memberName, pkg, startsAt, assignedBy, paymentId } = params;

  const endsAt =
    pkg.kind === 'membership'
      ? addDays(startsAt, (pkg.durationDays ?? 0) /* + bonusDays once PKG-5 exists */)
      : addDays(startsAt, pkg.lessonValidityDays ?? 0);

  const batch = writeBatch(db);
  const packageRef = doc(collection(db, 'member_packages'));
  batch.set(packageRef, {
    tenantId,
    memberId,
    memberName,
    packageId: pkg.id,
    packageName: pkg.name,
    kind: pkg.kind,
    entitlements: pkg.entitlements,
    ...(pkg.freezePolicy ? { freezePolicy: pkg.freezePolicy } : {}),
    listPrice: pkg.price,
    finalPrice: pkg.price,
    startsAt: Timestamp.fromDate(startsAt),
    endsAt: Timestamp.fromDate(endsAt),
    frozenDays: 0,
    freezes: [],
    status: 'active',
    ...(paymentId ? { paymentId } : {}),
    assignedAt: serverTimestamp(),
    assignedBy,
  });

  const addCredit = (kind: 'ptLesson' | 'groupClass', source: 'purchase' | 'entitlement', total: number, expiresAt: Date) => {
    batch.set(doc(collection(db, 'member_credits')), {
      tenantId,
      memberId,
      kind,
      source,
      // The member_packages assignment, not the gym_packages catalog entry —
      // renewal (Cloud Function) needs to check THIS holding's status/endsAt.
      sourcePackageId: packageRef.id,
      total,
      used: 0,
      startsAt: Timestamp.fromDate(startsAt),
      expiresAt: Timestamp.fromDate(expiresAt),
      status: 'active',
    });
  };

  if (pkg.kind === 'lessons' && pkg.lessonCount) {
    addCredit('ptLesson', 'purchase', pkg.lessonCount, endsAt);
  }
  if (pkg.kind === 'membership') {
    const gc = pkg.entitlements.groupClasses;
    if (gc && !gc.unlimited && gc.count && gc.periodDays) {
      addCredit('groupClass', 'entitlement', gc.count, addDays(startsAt, gc.periodDays));
    }
    const pt = pkg.entitlements.ptLessons;
    if (pt?.count && pt.periodDays) {
      addCredit('ptLesson', 'entitlement', pt.count, addDays(startsAt, pt.periodDays));
    }
  }

  await batch.commit();
}

/**
 * One-shot version of `watchMemberPackages` — check-in is a single decision
 * point, not a subscribed screen, so a live listener would outlive its use.
 * `limit(10)`: a member realistically holds a handful of packages over
 * time; the decision only ever needs the most recent ones.
 */
export async function getMemberPackages(tenantId: string, memberId: string): Promise<MemberPackage[]> {
  const q = query(
    collection(db, 'member_packages'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    orderBy('endsAt', 'desc'),
    limit(10),
  );
  const snap = await getDocs(q);
  return snap.docs.map(memberPackageFromDoc);
}

export async function getMemberPackage(memberPackageId: string): Promise<MemberPackage | null> {
  const snap = await getDoc(doc(db, 'member_packages', memberPackageId));
  return snap.exists() ? memberPackageFromDoc(snap) : null;
}

/** One-shot version of `watchMemberCredits`, for the same reason as `getMemberPackages`. */
export async function getActiveMemberCredits(
  tenantId: string,
  memberId: string,
  kind: 'ptLesson' | 'groupClass',
): Promise<MemberCredit[]> {
  const q = query(
    collection(db, 'member_credits'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('kind', '==', kind),
    where('status', '==', 'active'),
    orderBy('expiresAt', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(memberCreditFromDoc);
}

/**
 * The same cache `classes` booking rules check, read here so the client can
 * gate the UI *before* a write is attempted — a disabled button, not a
 * failed request. Server-owned; see `MemberEntitlementsCache`'s doc comment
 * for why `endsAt` has to be compared against "now" on read, not trusted.
 */
export function watchMemberEntitlements(
  tenantId: string,
  memberId: string,
  onChange: (cache: MemberEntitlementsCache | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Üye hakları',
    doc(db, 'member_entitlements', memberEntitlementsId(tenantId, memberId)),
    (snap) => (snap.exists() ? memberEntitlementsFromDoc(snap) : null),
    onChange,
    onError,
  );
}

/** One member's package history — newest-ending first. Used by both the
 *  member's own view and the admin's per-member detail screen. */
export function watchMemberPackages(
  tenantId: string,
  memberId: string,
  onChange: (packages: MemberPackage[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'member_packages'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    orderBy('endsAt', 'desc'),
  );
  return watchQuery('Üyenin paketleri', q, (snap) => snap.docs.map(memberPackageFromDoc), onChange, onError);
}

/** One member's quota balances of a given kind, soonest-expiring first —
 *  the order PKG-8 will spend them in. */
export function watchMemberCredits(
  tenantId: string,
  memberId: string,
  kind: 'ptLesson' | 'groupClass',
  onChange: (credits: MemberCredit[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'member_credits'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('kind', '==', kind),
    where('status', '==', 'active'),
    orderBy('expiresAt', 'asc'),
  );
  return watchQuery('Üyenin kredileri', q, (snap) => snap.docs.map(memberCreditFromDoc), onChange, onError);
}
