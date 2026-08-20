// Domain types for the mock UI milestone.
// Tenant/Branding/Membership are ported from marte06/src/types/tenant.ts
// (Firestore Timestamp swapped for plain Date so this layer has no Firebase dependency yet).

export interface TenantBranding {
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  appName: string;
  themeMode?: 'light' | 'dark' | 'system';
}

export interface Tenant {
  id: string;
  code: string;
  name: string;
  branding: TenantBranding;
  ownerUid?: string;
  /**
   * Shown in the join-by-code flow so a member can confirm they picked the
   * right gym, so it is readable by any signed-in user by design.
   *
   * Contact details (e-mail, phone) deliberately do NOT live here: the
   * tenant doc is world-readable to signed-in users and those fields would
   * leak every gym's contact info. They belong in the private subdocument
   * `tenants/{id}/private/contact`, which is gated to tenant members.
   */
  address?: string;
  /**
   * Denormalised seat tally, maintained by the syncActiveMemberCount Cloud
   * Function. Security rules read it to enforce the free tier — rules cannot
   * count documents themselves. **Server-owned: never written by the client.**
   */
  activeMemberCount?: number;
  /** Set from verified store receipts, server-side only. */
  subscription?: TenantSubscription;
  createdAt: Date;
  updatedAt?: Date;
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';

export interface TenantSubscription {
  status: SubscriptionStatus;
  plan: 'monthly' | 'yearly' | 'grandfathered';
  expiresAt?: Date;
  platform?: 'ios' | 'android';
}

export type MembershipRole = 'member' | 'trainer' | 'admin';
/**
 * `suspended` is an admin action (disciplinary / unpaid); `left` is the
 * member walking away themselves. Keeping them distinct matters — a gym
 * shouldn't read its own suspensions and voluntary departures as the same
 * thing.
 */
export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'suspended' | 'left';

/**
 * A narrow capability an admin delegates without handing over the whole
 * admin surface — e.g. "let Mert admit members while I'm away" shouldn't
 * also expose branding settings and the payment ledger.
 */
export type MembershipPermission = 'checkin';

export interface TenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  status: MembershipStatus;
  /**
   * A user can hold several roles in one gym — in a small studio the owner
   * is usually also a coach. Roles compose the app surfaces you see; they
   * are never implied (an admin who doesn't coach shouldn't carry a PT
   * calendar in their nav), so `['admin','trainer']` is set explicitly.
   *
   * Read through the helpers in `src/data/membership.ts`, never directly.
   */
  roles: MembershipRole[];
  /** Capabilities delegated by an admin. See MembershipPermission. */
  permissions: MembershipPermission[];
  requestedAt: Date;
  approvedAt?: Date;
  leftAt?: Date;
  // Denormalized at request time — the client has no way to reverse-look-up
  // another user's Auth profile, so the approvals screen needs this copy.
  userDisplayName?: string;
  userEmail?: string;
  // Short human-typeable front-desk check-in code (6 digits). Not present on
  // memberships created before this field existed until backfilled.
  shortCode?: string;
  /**
   * Contact info, present only for members carried over from the legacy
   * marte06 web app (backfilled from its `members` collection — see
   * `marte06/scripts/backfill_member_contact_info.cjs`). New sign-ups don't
   * collect these yet, so absence is normal, not a data gap.
   */
  phone?: string;
  birthDate?: Date;
}

export interface GymClass {
  id: string;
  time: string;
  lengthLabel: string;
  name: string;
  trainerName: string;
  meta: string;
  metaTone: 'sub' | 'warn' | 'ok' | 'danger';
  status: 'open' | 'almostFull' | 'booked' | 'full';
}

/** Real Firestore doc shape for a single class occurrence (not a recurring series). */
export interface ClassSession {
  id: string;
  tenantId: string;
  name: string;
  trainerName: string;
  date: Date;
  durationMinutes: number;
  capacity: number;
  bookedUserIds: string[];
  waitlistUserIds: string[];
}

/**
 * Why a check-in was let through (PKG-3). `'ok'` means an actual package
 * covered today; every other value means staff overrode a warning ("Yine de
 * kabul et") — kept so "kaç kişi paketsiz alındı" can be reported later.
 */
export type CheckInAccessReason = 'ok' | 'no-package' | 'no-session-today' | 'frozen';

/** A single front-desk QR scan. Written by staff (isTenantAdmin), not self-service. */
export interface CheckIn {
  id: string;
  tenantId: string;
  userId: string;
  membershipId: string;
  accessReason: CheckInAccessReason;
  checkedInAt: Date;
}

/** One exercise line inside a Program — embedded, not a subcollection: bounded
 * list size (a handful of exercises), always read/written together with the
 * program, same pattern as ClassSession's bookedUserIds array. */
export interface ProgramExercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  targetWeightKg: number;
}

export type ProgramStatus = 'draft' | 'active';

/** A workout program a trainer builds and assigns to one member. */
export interface Program {
  id: string;
  tenantId: string;
  memberId: string;
  memberName: string;
  trainerId: string;
  name: string;
  status: ProgramStatus;
  exercises: ProgramExercise[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExerciseLog {
  exerciseId: string;
  name: string;
  setsTarget: number;
  setsCompleted: number;
  weightKg: number;
  /** Active seconds spent on this exercise (excludes time the workout was paused). */
  durationSeconds?: number;
}

/** One instance of a member actually doing a program — completedAt unset
 * while the session is in progress. Powers the "3/4 antrenman this week"
 * streak and week-over-week weight comparisons. */
export interface WorkoutLog {
  id: string;
  tenantId: string;
  memberId: string;
  programId: string;
  programName: string;
  startedAt: Date;
  completedAt?: Date;
  exerciseLogs: ExerciseLog[];
}

/** Append-only body measurement snapshot — members log new entries, never edit old ones. */
export interface MeasurementEntry {
  id: string;
  tenantId: string;
  memberId: string;
  recordedAt: Date;
  weightKg: number;
  chestCm?: number;
  waistCm?: number;
  armCm?: number;
}

export type PaymentMethod = 'cash' | 'bank_transfer';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';

/**
 * A manual payment record — no in-app purchase/subscription processing.
 * Cash and bank-transfer payments are the norm for this business, so the
 * "payment" is really just a ledger entry: admin enters what they received,
 * or a member flags "I sent this" for the admin to confirm against their
 * bank statement.
 */
export interface Payment {
  id: string;
  tenantId: string;
  memberId: string;
  memberName: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  note?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

export type PtSessionStatus = 'scheduled' | 'completed' | 'cancelled';

/**
 * A trainer's 1:1 appointment with a member — distinct from group `classes`.
 * `trainerId` is the CURRENT owner; when covered or reassigned it changes
 * and `originalTrainerId` keeps a record of who it was booked with.
 */
export interface PtSession {
  id: string;
  tenantId: string;
  trainerId: string;
  originalTrainerId?: string;
  trainerName: string;
  memberId: string;
  memberName: string;
  date: Date;
  durationMinutes: number;
  status: PtSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A trainer granting a colleague permission to see (and take over) their PT
 * calendar — e.g. so someone can cover when they're out sick. Doc id is
 * deterministic `${tenantId}_${ownerTrainerId}_${viewerTrainerId}`: a trainer
 * can only ever grant access to their OWN calendar, one grant per viewer.
 */
export interface CalendarShare {
  id: string;
  tenantId: string;
  ownerTrainerId: string;
  ownerTrainerName: string;
  viewerTrainerId: string;
  createdAt: Date;
}

// ============================================================================
// PACKAGES — what a membership actually grants (PKG-1)
// ============================================================================

export type PackageKind = 'membership' | 'lessons';

/** A quota-shaped right — unlimited, or a count that refills every `periodDays`. */
export interface QuotaEntitlement {
  unlimited?: boolean;
  /** Required unless `unlimited`. */
  count?: number;
  /** Required unless `unlimited`. */
  periodDays?: number;
}

/**
 * What a package's holder can do. Deliberately a bag of named rights rather
 * than a "tier" enum — a gym owner edits these per package, so a new right
 * only ever means adding a key here, never a new package type or a `switch`
 * somewhere in the app. Screens must ask `entitlements.ptLessons != null`,
 * never compare a package's `name` against "Gold" or "Platinium".
 */
export interface PackageEntitlements {
  gymAccess: boolean;
  /** Absent = no group-class right at all (must book a session instead). */
  groupClasses?: QuotaEntitlement;
  /** Absent = no complimentary/bundled PT lessons from this package. */
  ptLessons?: QuotaEntitlement;
}

export interface FreezePolicy {
  minDays: number;
  maxCount: number;
}

export type PackageStatus = 'active' | 'frozen' | 'expired' | 'cancelled';

/**
 * A gym's sellable package. Once any `member_packages` document is assigned
 * from it (`activeAssignmentCount > 0`), its price/duration/entitlements are
 * locked — see `canEditPackage`. An admin who wants to change a locked
 * package's content creates a new version instead (`supersedesId`).
 */
export interface GymPackage {
  id: string;
  tenantId: string;
  name: string;
  kind: PackageKind;
  price: number;
  /** `membership` packages only. */
  durationDays?: number;
  /** `lessons` packages only. */
  lessonCount?: number;
  /** `lessons` packages only — how long the credit stays usable. */
  lessonValidityDays?: number;
  entitlements: PackageEntitlements;
  /** `membership` packages only. */
  freezePolicy?: FreezePolicy;
  /**
   * Server-owned tally maintained by a Cloud Function, same pattern as
   * `Tenant.activeMemberCount` — rules cannot count documents themselves.
   * Never written by the client.
   */
  activeAssignmentCount: number;
  /** Set when this package replaces a locked one that needed a content change. */
  supersedesId?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt?: Date;
}

// ============================================================================
// PACKAGE ASSIGNMENT — who holds what, and their quota balances (PKG-2)
// ============================================================================

export type MemberPackageStatus = 'active' | 'frozen' | 'expired' | 'cancelled';

export interface PackageFreeze {
  startsAt: Date;
  endsAt: Date;
  days: number;
  createdBy: string;
  createdAt: Date;
}

/**
 * One assignment of a `GymPackage` to a member. Everything sellable
 * (`entitlements`, `freezePolicy`, price) is **copied** at assignment time,
 * not referenced — the catalog can move on (new versions, retired
 * packages) without rewriting what this member already holds.
 */
export interface MemberPackage {
  id: string;
  tenantId: string;
  memberId: string;
  memberName: string;
  packageId: string;
  packageName: string;
  kind: PackageKind;
  entitlements: PackageEntitlements;
  freezePolicy?: FreezePolicy;
  listPrice: number;
  /** Equal to `listPrice` until PKG-5 promotions exist. */
  finalPrice: number;
  promotionId?: string;
  promotionName?: string;
  bonusDays?: number;
  bonusLessons?: number;
  startsAt: Date;
  /** `membership`: `startsAt + durationDays (+ bonusDays)`. `lessons`: `startsAt + lessonValidityDays`. */
  endsAt: Date;
  frozenDays: number;
  freezes: PackageFreeze[];
  status: MemberPackageStatus;
  paymentId?: string;
  assignedAt: Date;
  assignedBy: string;
}

export type CreditKind = 'ptLesson' | 'groupClass';
export type CreditSource = 'purchase' | 'entitlement';
export type CreditStatus = 'active' | 'exhausted' | 'expired';

/**
 * One quota balance — a purchased lesson bundle, or one period's worth of a
 * package's recurring entitlement (Platinium's quarterly 12 lessons, a
 * quota'd group-class allowance). Both live here rather than in separate
 * tables so consumption (PKG-8), cancellation refunds (PKG-11) and the
 * quota'd-group-class path (PKG-4) share one mechanism instead of three.
 */
export interface MemberCredit {
  id: string;
  tenantId: string;
  memberId: string;
  kind: CreditKind;
  source: CreditSource;
  /** The `member_packages` assignment this credit came from — not the
   *  `gym_packages` catalog entry, so a renewal or refund can tell which
   *  specific holding is still active without guessing across re-purchases. */
  sourcePackageId: string;
  total: number;
  /** Server-owned — only a Cloud Function moves this. Never written by the client. */
  used: number;
  startsAt: Date;
  expiresAt: Date;
  status: CreditStatus;
}

/**
 * Denormalized snapshot of a member's *current* membership package's
 * entitlements, at the deterministic id `{tenantId}_{memberId}` — kept in
 * sync by the `syncMemberEntitlements` Cloud Function on every
 * `member_packages` write.
 *
 * Exists purely so security rules can gate a self-service write (booking a
 * group class) with a single `get()` — rules cannot run the query
 * `watchMemberPackages` uses to find "the current one." `endsAt` is copied
 * in for the same reason a `Timestamp` is copied everywhere else the rule
 * needs to reason about "is this still current": the cache is only
 * refreshed by a *write* to the source package, not by time passing, so a
 * rule comparing `endsAt` against `request.time` is what keeps a lapsed
 * membership from silently granting access forever.
 */
export interface MemberEntitlementsCache {
  tenantId: string;
  memberId: string;
  packageId: string;
  entitlements: PackageEntitlements;
  endsAt: Date;
  updatedAt: Date;
}

// ============================================================================
// PROMOTIONS — time-boxed campaigns layered on top of the catalog (PKG-5)
// ============================================================================

export type PromotionKind = 'percentDiscount' | 'amountDiscount' | 'bonusDays' | 'bonusLessons';

/**
 * A promotion never touches `GymPackage` — the catalog's content is locked
 * the moment anything is sold from it (PKG-1's "satılan donar" rule), so a
 * seasonal campaign has to be a separate thing layered on top at assignment
 * time, not a catalog edit. Its effect is **copied** onto the resulting
 * `MemberPackage` the same way the package's own price and entitlements
 * are — this doc can end, change, or be deleted afterward without touching
 * what anyone already got.
 */
export interface Promotion {
  id: string;
  tenantId: string;
  name: string;
  kind: PromotionKind;
  /** Percent (0–100), currency amount, days, or lesson count, matching `kind`. */
  value: number;
  /** `gym_packages` ids this applies to. Empty = every package. */
  appliesTo: string[];
  startsAt: Date;
  endsAt: Date;
  /** Absent = unlimited. */
  maxRedemptions?: number;
  /** Server-guarded counter — a client write may only ever move it by
   *  exactly +1, and only while under `maxRedemptions`. Never set it directly. */
  redeemed: number;
  isActive: boolean;
  createdAt: Date;
}

export type NotificationKind = 'class' | 'package' | 'approval' | 'waitlist';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  icon: string;
  title: string;
  body: string;
  time: string;
}
