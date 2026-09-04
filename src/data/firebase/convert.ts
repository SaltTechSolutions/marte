import { DocumentSnapshot, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';

import {
  CalendarShare,
  ClassSession,
  GymPackage,
  MeasurementEntry,
  MemberCredit,
  MemberEntitlementsCache,
  MemberPackage,
  PackageChangeRequest,
  TrainerAvailability,
  Payment,
  Program,
  Promotion,
  PtSession,
  Tenant,
  TenantMembership,
  Announcement,
  MemberNote,
  RenewalRequest,
  WorkoutLog,
} from '../types';

function toDate(v: Timestamp | Date | undefined): Date | undefined {
  if (!v) return undefined;
  return v instanceof Timestamp ? v.toDate() : v;
}

export function tenantFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): Tenant {
  const data = snap.data()!;
  return {
    id: snap.id,
    code: data.code,
    name: data.name,
    branding: data.branding,
    ownerUid: data.ownerUid,
    address: data.address,
    openingHours: data.openingHours,
    activeMemberCount: data.activeMemberCount,
    activeAdminCount: data.activeAdminCount,
    cancellationHours: data.cancellationHours,
    subscription: data.subscription
      ? { ...data.subscription, expiresAt: toDate(data.subscription.expiresAt) }
      : undefined,
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt),
  };
}

export function membershipFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): TenantMembership {
  const data = snap.data()!;
  return {
    id: snap.id,
    userId: data.userId,
    tenantId: data.tenantId,
    tenantCode: data.tenantCode,
    tenantName: data.tenantName,
    status: data.status,
    roles: data.roles ?? [],
    permissions: data.permissions ?? [],
    requestedAt: toDate(data.requestedAt) ?? new Date(),
    approvedAt: toDate(data.approvedAt),
    leftAt: toDate(data.leftAt),
    userDisplayName: data.userDisplayName,
    userEmail: data.userEmail,
    shortCode: data.shortCode,
    phone: data.phone,
    birthDate: toDate(data.birthDate),
    heightCm: data.heightCm,
    photoUrl: data.photoUrl,
    guardianId: data.guardianId,
    guardianName: data.guardianName,
    guardianStatus: data.guardianStatus,
    guardianConsentAt: toDate(data.guardianConsentAt),
    guardianConsentVersion: data.guardianConsentVersion,
  };
}

export function classSessionFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): ClassSession {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    name: data.name,
    ...(data.trainerId ? { trainerId: data.trainerId } : {}),
    trainerName: data.trainerName,
    ...(data.seriesId ? { seriesId: data.seriesId } : {}),
    date: toDate(data.date) ?? new Date(),
    durationMinutes: data.durationMinutes,
    capacity: data.capacity,
    bookedUserIds: data.bookedUserIds ?? [],
    waitlistUserIds: data.waitlistUserIds ?? [],
    ...(data.attendance ? { attendance: data.attendance } : {}),
  };
}

export function programFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): Program {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    memberId: data.memberId,
    memberName: data.memberName,
    trainerId: data.trainerId,
    name: data.name,
    status: data.status,
    exercises: data.exercises ?? [],
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
}

export function workoutLogFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): WorkoutLog {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    memberId: data.memberId,
    programId: data.programId,
    programName: data.programName,
    startedAt: toDate(data.startedAt) ?? new Date(),
    completedAt: toDate(data.completedAt),
    exerciseLogs: data.exerciseLogs ?? [],
  };
}

export function measurementFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): MeasurementEntry {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    memberId: data.memberId,
    recordedAt: toDate(data.recordedAt) ?? new Date(),
    weightKg: data.weightKg,
    chestCm: data.chestCm,
    waistCm: data.waistCm,
    armCm: data.armCm,
  };
}

export function ptSessionFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): PtSession {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    trainerId: data.trainerId,
    originalTrainerId: data.originalTrainerId,
    trainerName: data.trainerName,
    memberId: data.memberId,
    memberName: data.memberName,
    date: toDate(data.date) ?? new Date(),
    durationMinutes: data.durationMinutes,
    status: data.status,
    creditId: data.creditId,
    cancellationDeadlineAt: toDate(data.cancellationDeadlineAt),
    cancelledAt: toDate(data.cancelledAt),
    cancelledByRole: data.cancelledByRole,
    creditRefunded: data.creditRefunded,
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
}

export function trainerAvailabilityFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): TrainerAvailability {
  const data = snap.data()!;
  return {
    tenantId: data.tenantId,
    trainerId: data.trainerId,
    weekly: data.weekly ?? {},
    slotMinutes: data.slotMinutes ?? 60,
    exceptions: data.exceptions ?? [],
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
}

export function calendarShareFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): CalendarShare {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    ownerTrainerId: data.ownerTrainerId,
    ownerTrainerName: data.ownerTrainerName,
    viewerTrainerId: data.viewerTrainerId,
    createdAt: toDate(data.createdAt) ?? new Date(),
  };
}

export function paymentFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): Payment {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    memberId: data.memberId,
    memberName: data.memberName,
    amount: data.amount,
    method: data.method,
    status: data.status,
    kind: data.kind ?? 'charge',
    note: data.note,
    submittedBy: data.submittedBy,
    submittedByName: data.submittedByName,
    paymentGroupId: data.paymentGroupId,
    reversesPaymentId: data.reversesPaymentId,
    reversedAt: toDate(data.reversedAt),
    reversedByPaymentId: data.reversedByPaymentId,
    reversalReason: data.reversalReason,
    createdAt: toDate(data.createdAt) ?? new Date(),
    confirmedAt: toDate(data.confirmedAt),
  };
}

export function gymPackageFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): GymPackage {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    name: data.name,
    kind: data.kind,
    price: data.price,
    durationDays: data.durationDays,
    lessonCount: data.lessonCount,
    lessonValidityDays: data.lessonValidityDays,
    entitlements: data.entitlements,
    freezePolicy: data.freezePolicy,
    activeAssignmentCount: data.activeAssignmentCount ?? 0,
    supersedesId: data.supersedesId,
    isActive: data.isActive,
    sortOrder: data.sortOrder ?? 0,
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt),
  };
}

export function memberPackageFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): MemberPackage {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    memberId: data.memberId,
    memberName: data.memberName,
    packageId: data.packageId,
    packageName: data.packageName,
    kind: data.kind,
    entitlements: data.entitlements,
    freezePolicy: data.freezePolicy,
    listPrice: data.listPrice,
    finalPrice: data.finalPrice,
    promotionId: data.promotionId,
    promotionName: data.promotionName,
    bonusDays: data.bonusDays,
    bonusLessons: data.bonusLessons,
    startsAt: toDate(data.startsAt) ?? new Date(),
    endsAt: toDate(data.endsAt) ?? new Date(),
    frozenDays: data.frozenDays ?? 0,
    freezes: (data.freezes ?? []).map(
      (f: { startsAt: Timestamp; endsAt: Timestamp; days: number; createdBy: string; createdAt: Timestamp }) => ({
        startsAt: toDate(f.startsAt) ?? new Date(),
        endsAt: toDate(f.endsAt) ?? new Date(),
        days: f.days,
        createdBy: f.createdBy,
        createdAt: toDate(f.createdAt) ?? new Date(),
      }),
    ),
    status: data.status,
    paymentId: data.paymentId,
    assignedAt: toDate(data.assignedAt) ?? new Date(),
    assignedBy: data.assignedBy,
    cancelledAt: toDate(data.cancelledAt),
    cancelledBy: data.cancelledBy,
    cancellationReason: data.cancellationReason,
    cancellationAccess: data.cancellationAccess,
  };
}

export function promotionFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): Promotion {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    name: data.name,
    kind: data.kind,
    value: data.value,
    appliesTo: data.appliesTo ?? [],
    startsAt: toDate(data.startsAt) ?? new Date(),
    endsAt: toDate(data.endsAt) ?? new Date(),
    maxRedemptions: data.maxRedemptions,
    redeemed: data.redeemed ?? 0,
    isActive: data.isActive,
    createdAt: toDate(data.createdAt) ?? new Date(),
  };
}

function packageChangeSummaryFromField(field: Record<string, unknown> | undefined) {
  if (!field) return undefined;
  return {
    packageName: field.packageName as string,
    entitlements: field.entitlements as PackageChangeRequest['proposedSummary']['entitlements'],
    price: field.price as number,
    endsAt: toDate(field.endsAt as Timestamp) ?? new Date(),
  };
}

export function packageChangeRequestFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): PackageChangeRequest {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    memberId: data.memberId,
    memberName: data.memberName,
    kind: data.kind,
    currentPackageAssignmentId: data.currentPackageAssignmentId,
    currentSummary: packageChangeSummaryFromField(data.currentSummary),
    proposedPackageId: data.proposedPackageId,
    proposedPromotionId: data.proposedPromotionId,
    proposedSummary: packageChangeSummaryFromField(data.proposedSummary)!,
    priceDelta: data.priceDelta,
    refundAmount: data.refundAmount,
    refundBasis: data.refundBasis,
    note: data.note,
    effectiveAt: toDate(data.effectiveAt) ?? new Date(),
    expiresAt: toDate(data.expiresAt) ?? new Date(),
    status: data.status,
    createdBy: data.createdBy,
    createdAt: toDate(data.createdAt) ?? new Date(),
    respondedAt: toDate(data.respondedAt),
  };
}

export function memberEntitlementsFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): MemberEntitlementsCache {
  const data = snap.data()!;
  return {
    tenantId: data.tenantId,
    memberId: data.memberId,
    packageId: data.packageId,
    entitlements: data.entitlements,
    endsAt: toDate(data.endsAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
}

export function memberCreditFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): MemberCredit {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    memberId: data.memberId,
    kind: data.kind,
    source: data.source,
    sourcePackageId: data.sourcePackageId,
    total: data.total,
    used: data.used ?? 0,
    startsAt: toDate(data.startsAt) ?? new Date(),
    expiresAt: toDate(data.expiresAt) ?? new Date(),
    status: data.status,
  };
}

export function memberNoteFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): MemberNote | null {
  const data = snap.data();
  if (!data) return null;
  return {
    tenantId: data.tenantId,
    memberId: data.memberId,
    text: data.text ?? '',
    updatedBy: data.updatedBy,
    updatedByName: data.updatedByName,
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
}

export function renewalRequestFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): RenewalRequest | null {
  const data = snap.data();
  if (!data) return null;
  return {
    tenantId: data.tenantId,
    memberId: data.memberId,
    memberName: data.memberName,
    status: data.status,
    note: data.note,
    createdAt: toDate(data.createdAt) ?? new Date(),
    handledAt: toDate(data.handledAt),
    handledBy: data.handledBy,
  };
}

export function announcementFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): Announcement {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    title: data.title,
    body: data.body ?? '',
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: toDate(data.createdAt) ?? new Date(),
    expiresAt: toDate(data.expiresAt),
  };
}
