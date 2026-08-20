import { DocumentSnapshot, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';

import {
  CalendarShare,
  ClassSession,
  GymPackage,
  MeasurementEntry,
  Payment,
  Program,
  PtSession,
  Tenant,
  TenantMembership,
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
    activeMemberCount: data.activeMemberCount,
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
    // Backward compatible while the `role` → `roles` migration rolls out:
    // documents written before it only carry the single `role` field.
    roles: data.roles ?? (data.role ? [data.role] : []),
    permissions: data.permissions ?? [],
    requestedAt: toDate(data.requestedAt) ?? new Date(),
    approvedAt: toDate(data.approvedAt),
    leftAt: toDate(data.leftAt),
    userDisplayName: data.userDisplayName,
    userEmail: data.userEmail,
    shortCode: data.shortCode,
  };
}

export function classSessionFromDoc(snap: QueryDocumentSnapshot | DocumentSnapshot): ClassSession {
  const data = snap.data()!;
  return {
    id: snap.id,
    tenantId: data.tenantId,
    name: data.name,
    trainerName: data.trainerName,
    date: toDate(data.date) ?? new Date(),
    durationMinutes: data.durationMinutes,
    capacity: data.capacity,
    bookedUserIds: data.bookedUserIds ?? [],
    waitlistUserIds: data.waitlistUserIds ?? [],
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
    createdAt: toDate(data.createdAt) ?? new Date(),
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
    note: data.note,
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
