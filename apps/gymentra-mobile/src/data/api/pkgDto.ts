import type {
  GymPackage,
  MemberCredit,
  MemberEntitlementsCache,
  MemberPackage,
  Payment,
  PackageChangeRequest,
  Promotion,
} from '../types';
import { toAppId } from './membershipIdentity';
import { fromApiMoney } from './pkgMoney';

/**
 * Worker DTO -> app type mappers for the package / promotion / payment repos.
 * The Worker speaks unix-ms numbers and its own flat DTOs (see `api/src/reads*.ts`, `packageLifecycle.ts`);
 * the app speaks Dates. Everything here is deterministic (no `new Date()` fallbacks): `pollWatch` compares
 * the JSON of consecutive results, so a mapper that invents "now" would make every poll look like a change.
 */
type Raw = Record<string, any>;

const date = (ms: unknown): Date => new Date(typeof ms === 'number' ? ms : 0);
const optDate = (ms: unknown): Date | undefined => (typeof ms === 'number' ? new Date(ms) : undefined);
/** The Worker sends SQL NULL as `null`; the app types say "absent". */
const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

export function gymPackageFromDto(d: Raw, tenantId: string): GymPackage {
  return {
    id: d.id,
    tenantId,
    name: d.name,
    kind: d.kind,
    price: fromApiMoney(d.price),
    durationDays: opt(d.durationDays),
    lessonCount: opt(d.lessonCount),
    lessonValidityDays: opt(d.lessonValidityDays),
    entitlements: d.entitlements,
    freezePolicy: opt(d.freezePolicy),
    activeAssignmentCount: d.activeAssignmentCount ?? 0,
    supersedesId: opt(d.supersedesId),
    isActive: d.isActive === true,
    sortOrder: d.sortOrder ?? 0,
    createdAt: date(d.createdAt),
    updatedAt: optDate(d.updatedAt),
  };
}

export function promotionFromDto(d: Raw, tenantId: string): Promotion {
  return {
    id: d.id,
    tenantId,
    name: d.name,
    kind: d.kind,
    // Only an amount discount is money; a percent or a day / lesson bonus is a plain number.
    value: d.kind === 'amountDiscount' ? fromApiMoney(d.value) : d.value,
    appliesTo: d.appliesTo ?? [],
    startsAt: date(d.startsAt),
    endsAt: date(d.endsAt),
    maxRedemptions: opt(d.maxRedemptions),
    redeemed: d.redeemed ?? 0,
    isActive: d.isActive === true,
    createdAt: date(d.createdAt),
  };
}

export function memberPackageFromDto(d: Raw, tenantId: string, memberId: string): MemberPackage {
  return {
    id: d.id,
    tenantId,
    memberId,
    memberName: d.memberName ?? '',
    packageId: d.packageId,
    packageName: d.packageName,
    kind: d.kind,
    entitlements: d.entitlements,
    freezePolicy: opt(d.freezePolicy),
    listPrice: fromApiMoney(d.listPrice),
    finalPrice: fromApiMoney(d.finalPrice),
    promotionId: opt(d.promotionId),
    promotionName: opt(d.promotionName),
    bonusDays: opt(d.bonusDays),
    bonusLessons: opt(d.bonusLessons),
    startsAt: date(d.startsAt),
    endsAt: date(d.endsAt),
    frozenDays: d.frozenDays ?? 0,
    freezes: (d.freezes ?? []).map((f: Raw) => ({
      startsAt: date(f.startsAt),
      endsAt: date(f.endsAt),
      days: f.days,
      createdBy: toAppId(f.createdBy) ?? '',
      createdAt: date(f.createdAt),
    })),
    status: d.status,
    paymentId: opt(d.paymentId),
    assignedAt: date(d.assignedAt),
    // GAP(api): the member_packages DTO does not carry `assigned_by`. Nothing in the screens reads it back.
    assignedBy: d.assignedBy ?? '',
    cancelledAt: optDate(d.cancelledAt),
    cancelledBy: toAppId(opt(d.cancelledBy)),
    cancellationReason: opt(d.cancellationReason),
    cancellationAccess: opt(d.cancellationAccess),
  };
}

export function memberCreditFromDto(d: Raw, tenantId: string, memberId: string): MemberCredit {
  return {
    id: d.id,
    tenantId,
    memberId,
    kind: d.kind,
    source: d.source,
    sourcePackageId: d.sourcePackageId,
    total: d.total,
    used: d.used ?? 0,
    startsAt: date(d.startsAt),
    expiresAt: date(d.expiresAt),
    status: d.status,
  };
}

/** `updatedAt` is dropped on purpose: the Worker stamps it with "now" on every read, which would defeat change detection. */
export type EntitlementsDto = Omit<Raw, 'updatedAt'>;

export function entitlementsFromDto(d: Raw): EntitlementsDto {
  return { tenantId: d.tenantId, packageId: d.packageId, entitlements: d.entitlements, endsAt: d.endsAt };
}

/** `memberId` is the id the screen asked with (its own Firebase uid for "me"), not the Worker's internal one. */
export function entitlementsToCache(d: EntitlementsDto, memberId: string, seenAt: Date): MemberEntitlementsCache {
  return {
    tenantId: d.tenantId,
    memberId,
    packageId: d.packageId,
    entitlements: d.entitlements,
    endsAt: date(d.endsAt),
    updatedAt: seenAt,
  };
}

function summary(s: Raw | undefined) {
  if (!s) return undefined;
  return { packageName: s.packageName as string, entitlements: s.entitlements, price: fromApiMoney(s.price as number), endsAt: date(s.endsAt) };
}

export function packageChangeRequestFromDto(d: Raw, tenantId: string): PackageChangeRequest {
  return {
    id: d.id,
    tenantId,
    memberId: toAppId(d.memberId) ?? '',
    memberName: d.memberName ?? '',
    kind: d.kind,
    currentPackageAssignmentId: opt(d.currentPackageAssignmentId),
    currentSummary: summary(d.currentSummary),
    proposedPackageId: d.proposedPackageId,
    proposedPromotionId: opt(d.proposedPromotionId),
    proposedSummary: summary(d.proposedSummary)!,
    priceDelta: fromApiMoney(d.priceDelta),
    refundAmount: d.refundAmount == null ? undefined : fromApiMoney(d.refundAmount),
    refundBasis: opt(d.refundBasis),
    note: opt(d.note),
    effectiveAt: date(d.effectiveAt),
    expiresAt: date(d.expiresAt),
    status: d.status,
    createdBy: toAppId(d.createdBy) ?? '',
    createdAt: date(d.createdAt),
    respondedAt: optDate(d.respondedAt),
  };
}

/**
 * `memberId` is passed in: the per-member payments list does not echo it (GAP(api), harmless there because
 * the caller asked for exactly that member, and it is the id the screen used). `memberName` is only on the DTO for refund rows.
 */
export function paymentFromDto(d: Raw, tenantId: string, memberId: string): Payment {
  return {
    id: d.id,
    tenantId,
    memberId: d.memberId ? (toAppId(d.memberId) ?? memberId) : memberId,
    memberName: d.memberName ?? '',
    amount: fromApiMoney(d.amount),
    method: d.method,
    status: d.status,
    kind: d.kind ?? 'charge',
    note: opt(d.note),
    submittedBy: toAppId(opt(d.submittedBy)),
    submittedByName: opt(d.submittedByName),
    paymentGroupId: opt(d.paymentGroupId),
    reversesPaymentId: opt(d.reversesPaymentId),
    reversedAt: optDate(d.reversedAt),
    reversedByPaymentId: opt(d.reversedByPaymentId),
    reversalReason: opt(d.reversalReason),
    createdAt: date(d.createdAt),
    confirmedAt: optDate(d.confirmedAt),
  };
}
