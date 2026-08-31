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
  /** See `OpeningHours`. */
  openingHours?: OpeningHours;
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

/** A single open window, "HH:MM"–"HH:MM". */
export interface DayHours {
  open: string;
  close: string;
}

/**
 * When the gym is open, keyed by JS `Date.getDay()` — '0' Sunday … '6'
 * Saturday. A missing key or `null` means closed that day, which is why the
 * value is nullable rather than the key simply being absent: "we set Sunday
 * to closed" and "we never filled Sunday in" have to stay tellable apart.
 *
 * Trainer availability is clamped to this window: a trainer may work at any
 * hour the gym is open, but cannot open a bookable slot while it is shut.
 * A gym that has never set its hours is unconstrained — the field is optional
 * and every existing gym starts without it.
 */
export type OpeningHours = Record<string, DayHours | null>;

/**
 * How members reach the gym. Lives at `tenants/{id}/private/contact`, not on
 * the tenant doc: that doc is readable by every signed-in user so join-by-code
 * works, and putting a phone number there would publish every gym's number to
 * everyone with an account. Gated to tenant members by the rules.
 */
export interface TenantContact {
  phone?: string;
  email?: string;
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';

export interface TenantSubscription {
  status: SubscriptionStatus;
  plan: 'monthly' | 'yearly' | 'grandfathered';
  expiresAt?: Date;
  platform?: 'ios' | 'android';
}

/** The parent's own answer, separate from the gym's `MembershipStatus`. */
export type GuardianStatus = 'pending' | 'approved' | 'rejected';

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
  /**
   * Under-18 members are linked to a parent who is themselves a real member of
   * the gym (decision 1) — the parent pays, books and cancels on the child's
   * behalf, so free-text parent details would not have been enough.
   *
   * Two-sided: `guardianStatus` is the PARENT's answer and is a different axis
   * from `status`, which is the GYM's. Collapsing them into one field leaves
   * "which approval is missing?" unanswerable, and both are genuinely pending
   * at the same time while a child signs up.
   *
   * Written only by the `requestGuardian` / `respondToGuardian` callables —
   * rules forbid clients from touching these fields directly, because a child
   * who could write `guardianStatus` would be approving their own consent.
   */
  guardianId?: string;
  /** Denormalised for the child's screen; kept in step by the callable and by
   *  `syncGuardianName`, the same problem `tenantName` has. */
  guardianName?: string;
  guardianStatus?: GuardianStatus;
  /** KVKK: processing a minor's data needs the parent's consent, and the
   *  consent has to be recorded — when, by whom, against which text. */
  guardianConsentAt?: Date;
  guardianConsentVersion?: string;
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
 * covered today; a warn reason means staff overrode a warning ("Yine de
 * kabul et") — kept so "kaç kişi paketsiz alındı" can be reported later.
 *
 * `'guardian'` is neither: the person was let in on a CHILD's package
 * (MEMBER-5b decision 3, a parent who does not train themselves). It is its
 * own value so the ledger can tell those entries apart — they are legitimate
 * entries, not overrides, and they must not be counted as the child using
 * anything.
 */
export type CheckInWarnReason = 'no-package' | 'no-session-today' | 'frozen';
export type CheckInAccessReason = 'ok' | 'guardian' | CheckInWarnReason;

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

/**
 * How the gym took the money. This is a manual ledger — the app processes
 * nothing itself, so `card` means "charged on the gym's own POS terminal and
 * recorded here", not an in-app payment.
 */
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';
/** Absent/`'charge'` on every pre-PKG-6 record — added so a downgrade's
 *  prorated refund (PKG-6) can share this ledger instead of a second one.
 *  Amount is always positive; `kind` carries the direction. */
export type PaymentKind = 'charge' | 'refund';

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
  kind?: PaymentKind;
  note?: string;
  /**
   * Who actually handed over the money, when that is not the member the entry
   * belongs to (MEMBER-5e). A parent pays for a child: `memberId` stays the
   * child — the ledger has to stay right per child — and this records the
   * parent. Absent means the member paid for themselves.
   */
  submittedBy?: string;
  submittedByName?: string;
  /**
   * Shared by the entries that came from ONE act of paying. A parent pays 900₺
   * for three children and the ledger holds three 300₺ rows; without this the
   * gym cannot tell that from three separate payments.
   */
  paymentGroupId?: string;
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
  /** Which `member_credits` doc paid for this — absent for a trainer's own
   *  package-independent booking (PKG-8's addition; existing behavior for
   *  a trainer-created session is unchanged, `creditId` just never applies). */
  creditId?: string;
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

// ============================================================================
// PACKAGE CHANGE REQUESTS — member consent for a non-first-time swap (PKG-6)
// ============================================================================

export type PackageChangeKind = 'upgrade' | 'downgrade' | 'promotion' | 'addon';
export type PackageChangeStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

/** Display-only snapshot for the side-by-side comparison — never the source
 *  of truth for what gets applied, that's `proposedPackageId`/`proposedPromotionId`. */
export interface PackageChangeSummary {
  packageName: string;
  entitlements: PackageEntitlements;
  price: number;
  endsAt: Date;
}

/**
 * A proposed swap awaiting the member's yes/no. `assignPackageToMember` is
 * only correct for a first-time or additive grant ("İlk atama onay
 * istemez"); *changing* what an already-holding member gets goes through
 * this instead, and only `applyPackageChange` (Cloud Function, triggered on
 * `pending` → `approved`) is trusted to actually touch `member_packages` —
 * that collection has no client update path at all, admin included.
 */
export interface PackageChangeRequest {
  id: string;
  tenantId: string;
  memberId: string;
  memberName: string;
  /** Labels the request for display/reporting — the apply logic derives
   *  what actually happens (replace vs. add) by comparing kinds, not this. */
  kind: PackageChangeKind;
  /** The `member_packages` row this replaces. Absent for a pure addition —
   *  e.g. a lessons package proposed alongside an untouched membership,
   *  where the member holds none of that kind yet. */
  currentPackageAssignmentId?: string;
  currentSummary?: PackageChangeSummary;
  proposedPackageId: string;
  proposedPromotionId?: string;
  proposedSummary: PackageChangeSummary;
  /** + ek ücret · − iade · 0 değişmiyor. */
  priceDelta: number;
  refundAmount?: number;
  /** Human-readable "kalan 92/180 gün" — the number alone doesn't explain itself. */
  refundBasis?: string;
  note?: string;
  effectiveAt: Date;
  expiresAt: Date;
  status: PackageChangeStatus;
  createdBy: string;
  createdAt: Date;
  respondedAt?: Date;
}

// ============================================================================
// TRAINER AVAILABILITY — the precondition for a member booking a PT slot (PKG-7)
// ============================================================================

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** `'08:00'`-style, always 24h HH:mm. */
export interface TimeWindow {
  start: string;
  end: string;
}

/** A specific date overriding the weekly pattern — a holiday, a one-off
 *  half-day. `windows` absent + `closed` true = fully closed that day;
 *  `windows` present = replaces (not adds to) that day's weekly pattern. */
export interface AvailabilityException {
  /** `'YYYY-MM-DD'`. */
  date: string;
  closed?: boolean;
  windows?: TimeWindow[];
}

/**
 * One trainer's recurring working hours, doc id `{tenantId}_{trainerId}`.
 * An **absent or empty `weekly`** means "never configured" — deliberately
 * distinct from "configured with zero hours." A member must never see a
 * silent "no slots" for a trainer who simply hasn't set this up yet; that
 * reads as the trainer being fully booked forever. See `hasAnyAvailability`.
 */
export interface TrainerAvailability {
  tenantId: string;
  trainerId: string;
  weekly: Partial<Record<Weekday, TimeWindow[]>>;
  slotMinutes: number;
  exceptions: AvailabilityException[];
  updatedAt: Date;
}

/**
 * A privacy-preserving mirror of one `pt_sessions` doc — same id, but only
 * `date`/`durationMinutes`/`status`, no `memberId`/`memberName`. Exists so a
 * member browsing a trainer's free slots (PKG-8) can see *that* a time is
 * taken without seeing *whose* session it is; `pt_sessions` itself is only
 * readable by its own member, its trainer, or staff. Kept in sync by
 * `syncTrainerBusySlots` (Cloud Function, triggered on `pt_sessions` writes).
 */
export interface TrainerBusySlot {
  date: Date;
  durationMinutes: number;
  status: PtSessionStatus;
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
