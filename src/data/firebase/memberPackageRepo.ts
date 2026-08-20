import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

import { GymPackage, MemberCredit, MemberEntitlementsCache, MemberPackage, Promotion } from '../types';
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
 * What a promotion does to a price/term, in isolation from any particular
 * assignment. `bonusDays` only means something for a `membership` package
 * (extends `endsAt`); `bonusLessons` only for a `lessons` package (adds to
 * the purchased credit). Picking a mismatched promotion kind for a package
 * is a no-op, not an error — the value still gets copied for the record,
 * it just doesn't change anything. The assign screen filters the picker so
 * this shouldn't come up in practice.
 */
export function applyPromotionEffect(price: number, promotion: Pick<Promotion, 'kind' | 'value'>): { finalPrice: number; bonusDays: number; bonusLessons: number } {
  switch (promotion.kind) {
    case 'percentDiscount':
      return { finalPrice: Math.max(0, Math.round(price * (1 - promotion.value / 100))), bonusDays: 0, bonusLessons: 0 };
    case 'amountDiscount':
      return { finalPrice: Math.max(0, price - promotion.value), bonusDays: 0, bonusLessons: 0 };
    case 'bonusDays':
      return { finalPrice: price, bonusDays: promotion.value, bonusLessons: 0 };
    case 'bonusLessons':
      return { finalPrice: price, bonusDays: 0, bonusLessons: promotion.value };
  }
}

/**
 * Assigns a package to a member: one `member_packages` row plus whatever
 * `member_credits` rows its entitlements imply, written together so a
 * member never has a package with no matching credit (or the reverse).
 *
 * This is the *direct* assignment path — no member approval. That is only
 * correct for a first-time or additive assignment ("İlk atama onay
 * istemez" — PKG-6). Changing what an already-holding member gets goes
 * through `package_change_requests` instead (PKG-6, not built yet); this
 * function must not be called for that case once PKG-6 lands.
 *
 * Without a promotion this is a plain batch — nothing to arbitrate.
 * *With* one, it runs as a transaction: `promotions.redeemed` has to move by
 * exactly +1 and stay under `maxRedemptions` even if two admins apply the
 * same campaign at once, and rules alone can't stop a second concurrent
 * assignment from reading the same stale count. Firestore transactions give
 * that atomicity the same way `bookClass`'s capacity check does.
 */
export async function assignPackageToMember(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  pkg: GymPackage;
  startsAt: Date;
  assignedBy: string;
  paymentId?: string;
  promotion?: Promotion;
}): Promise<void> {
  const { tenantId, memberId, memberName, pkg, startsAt, assignedBy, paymentId, promotion } = params;

  const effect = promotion ? applyPromotionEffect(pkg.price, promotion) : { finalPrice: pkg.price, bonusDays: 0, bonusLessons: 0 };
  const endsAt =
    pkg.kind === 'membership'
      ? addDays(startsAt, (pkg.durationDays ?? 0) + effect.bonusDays)
      : addDays(startsAt, pkg.lessonValidityDays ?? 0);
  const lessonCount = pkg.kind === 'lessons' ? (pkg.lessonCount ?? 0) + effect.bonusLessons : 0;

  const packageRef = doc(collection(db, 'member_packages'));
  const creditRefs = {
    lessons: pkg.kind === 'lessons' && lessonCount > 0 ? doc(collection(db, 'member_credits')) : null,
    groupClass: null as ReturnType<typeof doc> | null,
    ptLessons: null as ReturnType<typeof doc> | null,
  };
  if (pkg.kind === 'membership') {
    const gc = pkg.entitlements.groupClasses;
    if (gc && !gc.unlimited && gc.count && gc.periodDays) creditRefs.groupClass = doc(collection(db, 'member_credits'));
    const pt = pkg.entitlements.ptLessons;
    if (pt?.count && pt.periodDays) creditRefs.ptLessons = doc(collection(db, 'member_credits'));
  }

  const packageData = {
    tenantId,
    memberId,
    memberName,
    packageId: pkg.id,
    packageName: pkg.name,
    kind: pkg.kind,
    entitlements: pkg.entitlements,
    ...(pkg.freezePolicy ? { freezePolicy: pkg.freezePolicy } : {}),
    listPrice: pkg.price,
    finalPrice: effect.finalPrice,
    ...(promotion
      ? { promotionId: promotion.id, promotionName: promotion.name, bonusDays: effect.bonusDays, bonusLessons: effect.bonusLessons }
      : {}),
    startsAt: Timestamp.fromDate(startsAt),
    endsAt: Timestamp.fromDate(endsAt),
    frozenDays: 0,
    freezes: [],
    status: 'active',
    ...(paymentId ? { paymentId } : {}),
    assignedAt: serverTimestamp(),
    assignedBy,
  };

  const creditData = (kind: 'ptLesson' | 'groupClass', source: 'purchase' | 'entitlement', total: number, expiresAt: Date) => ({
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

  if (promotion) {
    const promotionRef = doc(db, 'promotions', promotion.id);
    await runTransaction(db, async (tx) => {
      const promoSnap = await tx.get(promotionRef);
      const redeemed = (promoSnap.data()?.redeemed as number | undefined) ?? 0;
      const maxRedemptions = promoSnap.data()?.maxRedemptions as number | undefined;
      if (maxRedemptions != null && redeemed >= maxRedemptions) {
        throw new Error('PROMOTION_EXHAUSTED');
      }
      tx.update(promotionRef, { redeemed: redeemed + 1 });
      tx.set(packageRef, packageData);
      if (creditRefs.lessons) tx.set(creditRefs.lessons, creditData('ptLesson', 'purchase', lessonCount, endsAt));
      if (creditRefs.groupClass) {
        const gc = pkg.entitlements.groupClasses!;
        tx.set(creditRefs.groupClass, creditData('groupClass', 'entitlement', gc.count!, addDays(startsAt, gc.periodDays!)));
      }
      if (creditRefs.ptLessons) {
        const pt = pkg.entitlements.ptLessons!;
        tx.set(creditRefs.ptLessons, creditData('ptLesson', 'entitlement', pt.count!, addDays(startsAt, pt.periodDays!)));
      }
    });
    return;
  }

  const batch = writeBatch(db);
  batch.set(packageRef, packageData);
  if (creditRefs.lessons) batch.set(creditRefs.lessons, creditData('ptLesson', 'purchase', lessonCount, endsAt));
  if (creditRefs.groupClass) {
    const gc = pkg.entitlements.groupClasses!;
    batch.set(creditRefs.groupClass, creditData('groupClass', 'entitlement', gc.count!, addDays(startsAt, gc.periodDays!)));
  }
  if (creditRefs.ptLessons) {
    const pt = pkg.entitlements.ptLessons!;
    batch.set(creditRefs.ptLessons, creditData('ptLesson', 'entitlement', pt.count!, addDays(startsAt, pt.periodDays!)));
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
