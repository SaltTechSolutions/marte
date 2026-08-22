import { addDoc, collection, doc, getDoc, orderBy, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { app, db } from '@/services/firebase';

import { GymPackage, MemberPackage, PackageChangeKind, PackageChangeRequest, Promotion } from '../types';
import { applyPromotionEffect } from './memberPackageRepo';
import { packageChangeRequestFromDoc } from './convert';
import { WatchErrorHandler, watchDoc, watchQuery } from './watch';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Prorated refund on a downgrade: the unused portion of what's already been
 * paid for the current holding, as of when the swap takes effect. Extracted
 * as a named pure function so it can be unit-tested without pulling in
 * Firestore (see plan-eng-review Faz 3.1).
 */
export function computeProratedRefund(
  current: { finalPrice: number; startsAt: Date; endsAt: Date },
  newFinalPrice: number,
  effectiveAt: Date,
): { refundAmount: number; refundBasis: string } {
  const totalDays = Math.max(1, Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / 86400000));
  const remainingDays = Math.max(0, Math.round((current.endsAt.getTime() - effectiveAt.getTime()) / 86400000));
  const refundAmount = Math.round((current.finalPrice - newFinalPrice) * (remainingDays / totalDays));
  const refundBasis = `kalan ${remainingDays}/${totalDays} gün`;
  return { refundAmount, refundBasis };
}

/**
 * Prepares — but does not apply — a swap for an already-holding member.
 * `applyPackageChange` (Cloud Function) is the only thing that ever touches
 * `member_packages` for this; this function only ever writes the request
 * itself, `pending`. See `PackageChangeRequest`'s doc comment for why.
 */
export async function createPackageChangeRequest(params: {
  tenantId: string;
  memberId: string;
  memberName: string;
  kind: PackageChangeKind;
  current?: { assignmentId: string; pkg: MemberPackage };
  proposedPackage: GymPackage;
  proposedPromotion?: Promotion;
  note?: string;
  effectiveInDays?: number;
  /** How long the member has to respond before a scheduled job marks this `expired`. */
  expiresInDays?: number;
  createdBy: string;
}): Promise<void> {
  const {
    tenantId,
    memberId,
    memberName,
    kind,
    current,
    proposedPackage,
    proposedPromotion,
    note,
    effectiveInDays = 0,
    expiresInDays = 3,
    createdBy,
  } = params;

  const now = new Date();
  const effectiveAt = addDays(now, effectiveInDays);
  const effect = proposedPromotion
    ? applyPromotionEffect(proposedPackage.price, proposedPromotion)
    : { finalPrice: proposedPackage.price, bonusDays: 0, bonusLessons: 0 };
  const proposedEndsAt =
    proposedPackage.kind === 'membership'
      ? addDays(effectiveAt, (proposedPackage.durationDays ?? 0) + effect.bonusDays)
      : addDays(effectiveAt, proposedPackage.lessonValidityDays ?? 0);

  const priceDelta = effect.finalPrice - (current?.pkg.finalPrice ?? 0);

  // Prorated refund on a downgrade: the unused portion of what's already
  // been paid for the current holding, as of when the swap takes effect.
  let refundAmount: number | undefined;
  let refundBasis: string | undefined;
  if (current && priceDelta < 0) {
    ({ refundAmount, refundBasis } = computeProratedRefund(current.pkg, effect.finalPrice, effectiveAt));
  }

  await addDoc(collection(db, 'package_change_requests'), {
    tenantId,
    memberId,
    memberName,
    kind,
    ...(current ? { currentPackageAssignmentId: current.assignmentId } : {}),
    ...(current
      ? {
          currentSummary: {
            packageName: current.pkg.packageName,
            entitlements: current.pkg.entitlements,
            price: current.pkg.finalPrice,
            endsAt: Timestamp.fromDate(current.pkg.endsAt),
          },
        }
      : {}),
    proposedPackageId: proposedPackage.id,
    ...(proposedPromotion ? { proposedPromotionId: proposedPromotion.id } : {}),
    proposedSummary: {
      packageName: proposedPackage.name,
      entitlements: proposedPackage.entitlements,
      price: effect.finalPrice,
      endsAt: Timestamp.fromDate(proposedEndsAt),
    },
    priceDelta,
    ...(refundAmount ? { refundAmount, refundBasis } : {}),
    ...(note ? { note } : {}),
    effectiveAt: Timestamp.fromDate(effectiveAt),
    expiresAt: Timestamp.fromDate(addDays(now, expiresInDays)),
    status: 'pending',
    createdBy,
    createdAt: serverTimestamp(),
  });
}

/** A member's own pending proposals — the card that shows up on Bugün/Hesabım. */
export function watchPendingPackageChangeRequests(
  tenantId: string,
  memberId: string,
  onChange: (requests: PackageChangeRequest[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'package_change_requests'),
    where('tenantId', '==', tenantId),
    where('memberId', '==', memberId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
  );
  return watchQuery('Paket teklifleri', q, (snap) => snap.docs.map(packageChangeRequestFromDoc), onChange, onError);
}

export function watchPackageChangeRequest(
  requestId: string,
  onChange: (request: PackageChangeRequest | null) => void,
  onError?: WatchErrorHandler,
) {
  return watchDoc(
    'Paket teklifi',
    doc(db, 'package_change_requests', requestId),
    (snap) => (snap.exists() ? packageChangeRequestFromDoc(snap) : null),
    onChange,
    onError,
  );
}

export async function getPackageChangeRequest(requestId: string): Promise<PackageChangeRequest | null> {
  const snap = await getDoc(doc(db, 'package_change_requests', requestId));
  return snap.exists() ? packageChangeRequestFromDoc(snap) : null;
}

// Functions are deployed to europe-west1, same as the rest of the project.
const functions = getFunctions(app, 'europe-west1');

export type PackageChangeResponseOutcome = 'approved' | 'rejected' | 'promotion-expired';

/**
 * The member's yes/no. Used to be a plain field update the member made
 * directly (rules allowed moving their own request's `status` between
 * `pending` and `approved`/`rejected`) with a Cloud Function trigger
 * applying the swap afterwards. Moved to a callable (plan-eng-review Faz
 * 1.6): the rule now refuses ANY client write to `status` at all, because
 * the old two-step design let a member see "onaylandı" the instant their
 * own write landed — before the swap (or its failure, or a promotion
 * having expired since the offer was made) was actually known. Approving
 * and applying are now the same transaction; `member_packages` still has
 * no client write path at all, this account included.
 *
 * `'promotion-expired'` is a real, distinct outcome — not a success: the
 * promotion the member approved ran out between the offer and this tap,
 * so the server refused the whole swap rather than silently charging full
 * price for something approved at a discount. The caller must not show
 * this as "onaylandı".
 */
export async function respondToPackageChangeRequest(requestId: string, approve: boolean): Promise<PackageChangeResponseOutcome> {
  const call = httpsCallable<{ requestId: string; approve: boolean }, { status: PackageChangeResponseOutcome }>(
    functions,
    'approvePackageChange',
  );
  const { data } = await call({ requestId, approve });
  return data.status;
}

/** Admin withdraws an offer before the member has responded to it. */
export async function cancelPackageChangeRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'package_change_requests', requestId), { status: 'cancelled' });
}
