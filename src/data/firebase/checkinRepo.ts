import { addDoc, collection, getDocs, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';

import { db } from '@/services/firebase';

import { CheckInAccessReason, TenantMembership } from '../types';
import { membershipFromDoc } from './convert';
import { getMembershipById } from './membershipRepo';
import { getActiveMemberCredits, getMemberPackage, getMemberPackages } from './memberPackageRepo';
import { hasSessionToday } from './ptSessionRepo';
import { WatchErrorHandler, watchQuery } from './watch';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Live count of today's check-ins for a tenant — powers the admin dashboard's "live" stat. */
export function watchTodayCheckinCount(
  tenantId: string,
  onChange: (count: number) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'checkins'),
    where('tenantId', '==', tenantId),
    where('checkedInAt', '>=', Timestamp.fromDate(startOfToday())),
  );
  return watchQuery('Bugünkü giriş sayısı', q, (snap) => snap.size, onChange, onError);
}

/**
 * A member re-scanned inside this window is treated as the same visit.
 * Long enough to swallow an accidental double-scan or a quick step outside,
 * short enough that a genuine second visit (morning and evening) still
 * counts.
 */
const DUPLICATE_WINDOW_MINUTES = 60;

async function alreadyCheckedInRecently(tenantId: string, userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000);
  const recent = await getDocs(
    query(
      collection(db, 'checkins'),
      where('tenantId', '==', tenantId),
      where('userId', '==', userId),
      where('checkedInAt', '>=', Timestamp.fromDate(cutoff)),
    ),
  );
  return !recent.empty;
}

/**
 * PKG-3: does this member's package actually grant today's entry, and what
 * should the screen say about it?
 *
 * Read directly against `member_packages`/`member_credits` every time —
 * deliberately **not** denormalized onto `tenant_memberships`. A cached copy
 * goes stale the moment a package expires and needs its own upkeep job to
 * stay correct; front-desk check-in already budgets a few reads (this adds
 * at most three: packages, credits, today's sessions), well inside the
 * ≤5s friction budget.
 */
export type CheckInWarnReason = Exclude<CheckInAccessReason, 'ok'>;

interface AccessResolution {
  access: 'ok' | 'warn';
  packageLabel: string | null;
  warnReason: CheckInWarnReason | null;
}

async function resolveAccess(tenantId: string, userId: string): Promise<AccessResolution> {
  const now = new Date();
  const packages = await getMemberPackages(tenantId, userId);

  // 1. A membership package that actually covers today.
  const covering = packages.find(
    (p) => p.kind === 'membership' && p.status === 'active' && p.entitlements.gymAccess && p.startsAt <= now && p.endsAt >= now,
  );
  if (covering) return { access: 'ok', packageLabel: covering.packageName, warnReason: null };

  // 2/3. A usable lesson credit — access depends on whether today is a
  // scheduled day, not on holding the credit alone.
  const credits = await getActiveMemberCredits(tenantId, userId, 'ptLesson');
  const usable = credits.find((c) => c.total - c.used > 0 && c.expiresAt >= now);
  if (usable) {
    const sourcePackage = packages.find((p) => p.id === usable.sourcePackageId) ?? (await getMemberPackage(usable.sourcePackageId));
    const label = sourcePackage?.packageName ?? 'Ders paketi';
    if (await hasSessionToday(tenantId, userId, now)) {
      return { access: 'ok', packageLabel: `${label} · bugün randevulu`, warnReason: null };
    }
    return { access: 'warn', packageLabel: label, warnReason: 'no-session-today' };
  }

  // 4. Frozen (any kind) — a paused package still names itself in the warning.
  const frozen = packages.find((p) => p.status === 'frozen' && p.endsAt >= now);
  if (frozen) return { access: 'warn', packageLabel: frozen.packageName, warnReason: 'frozen' };

  // 5. Nothing at all.
  return { access: 'warn', packageLabel: null, warnReason: 'no-package' };
}

export const WARN_MESSAGE: Record<CheckInWarnReason, string> = {
  'no-package': 'Üyelik paketi yok.',
  'no-session-today': 'Bugün için randevusu yok.',
  frozen: 'Üyeliği dondurulmuş.',
};

async function writeCheckIn(
  tenantId: string,
  membership: TenantMembership,
  membershipDocId: string,
  accessReason: CheckInAccessReason,
): Promise<void> {
  await addDoc(collection(db, 'checkins'), {
    tenantId,
    userId: membership.userId,
    membershipId: membershipDocId,
    accessReason,
    checkedInAt: serverTimestamp(),
  });
}

type CheckInOutcome =
  | { ok: true; name: string; access: 'ok'; packageLabel: string | null }
  | { ok: true; name: string; access: 'warn'; packageLabel: string | null; warnReason: CheckInWarnReason; membershipDocId: string }
  | { ok: false; reason: 'not-found' | 'wrong-tenant' | 'inactive' | 'already-checked-in' };

/**
 * Shared resolve-and-maybe-write path for both check-in routes. An `ok`
 * access writes immediately — no reason to slow down the common case. A
 * `warn` access does **not** write; the screen shows staff the reason and,
 * if they tap through, calls `confirmCheckInDespiteWarning` to actually
 * record it. Denying is never silent and never automatic — a human decides.
 */
async function resolveAndCheckIn(
  tenantId: string,
  membership: TenantMembership,
  membershipDocId: string,
): Promise<CheckInOutcome> {
  const name = membership.userDisplayName || membership.userEmail || membership.userId;

  if (await alreadyCheckedInRecently(tenantId, membership.userId)) {
    return { ok: false, reason: 'already-checked-in' };
  }

  const resolution = await resolveAccess(tenantId, membership.userId);
  if (resolution.access === 'ok') {
    await writeCheckIn(tenantId, membership, membershipDocId, 'ok');
    return { ok: true, name, access: 'ok', packageLabel: resolution.packageLabel };
  }
  return {
    ok: true,
    name,
    access: 'warn',
    packageLabel: resolution.packageLabel,
    warnReason: resolution.warnReason!,
    membershipDocId,
  };
}

/**
 * Records a front-desk scan. The scanned QR payload is the member's
 * tenant_membership doc id (`${tenantId}_${uid}`) — we look it up first so
 * the scanner can reject a code from the wrong gym or an inactive member
 * before writing anything.
 */
export async function checkInByMembershipId(tenantId: string, membershipId: string): Promise<CheckInOutcome> {
  const membership = await getMembershipById(membershipId);
  if (!membership) return { ok: false, reason: 'not-found' };
  if (membership.tenantId !== tenantId) return { ok: false, reason: 'wrong-tenant' };
  if (membership.status !== 'active') return { ok: false, reason: 'inactive' };

  return resolveAndCheckIn(tenantId, membership, membershipId);
}

/**
 * Manual-entry check-in path: staff types the member's short 6-digit code
 * instead of the full membership id (which is a `${tenantId}_${uid}` string
 * — fine for a QR payload, unusable for a human to type). The query is
 * scoped to the current tenant, so a code from another gym naturally comes
 * back as "not-found" rather than leaking that it belongs elsewhere.
 */
export async function checkInByShortCode(tenantId: string, shortCode: string): Promise<CheckInOutcome> {
  const snap = await getDocs(
    query(collection(db, 'tenant_memberships'), where('tenantId', '==', tenantId), where('shortCode', '==', shortCode)),
  );
  if (snap.empty) return { ok: false, reason: 'not-found' };
  const membership = membershipFromDoc(snap.docs[0]);
  if (membership.status !== 'active') return { ok: false, reason: 'inactive' };

  return resolveAndCheckIn(tenantId, membership, membership.id);
}

/**
 * Staff overrides a `warn` outcome — "kapıda ödeme yapıyor olabilir; kararı
 * personel verir." Re-checks the duplicate window (the pause between the
 * warning and this tap is real time; someone else could have scanned the
 * same member in the meantime) but does not re-resolve access — the reason
 * shown is the reason recorded, even if it would compute differently a
 * second later.
 */
export async function confirmCheckInDespiteWarning(
  tenantId: string,
  membershipDocId: string,
  warnReason: CheckInWarnReason,
): Promise<{ ok: true; name: string } | { ok: false; reason: 'already-checked-in' | 'not-found' }> {
  const membership = await getMembershipById(membershipDocId);
  if (!membership) return { ok: false, reason: 'not-found' };
  if (await alreadyCheckedInRecently(tenantId, membership.userId)) {
    return { ok: false, reason: 'already-checked-in' };
  }
  await writeCheckIn(tenantId, membership, membershipDocId, warnReason);
  return { ok: true, name: membership.userDisplayName || membership.userEmail || membership.userId };
}

/**
 * A member's own visit history. The rules already allow this read
 * (`resource.data.userId == request.auth.uid`) but nothing surfaced it, so
 * "how often did I actually come this month?" had no answer in the app.
 *
 * Bounded to `since` so the listener doesn't grow with every visit ever.
 */
export function watchMyCheckins(
  tenantId: string,
  userId: string,
  since: Date,
  onChange: (dates: Date[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'checkins'),
    where('tenantId', '==', tenantId),
    where('userId', '==', userId),
    where('checkedInAt', '>=', Timestamp.fromDate(since)),
  );
  return watchQuery(
    'Giriş geçmişim',
    q,
    (snap) =>
      snap.docs
        .map((d) => (d.data().checkedInAt as Timestamp | null)?.toDate())
        .filter((d): d is Date => d != null)
        .sort((a, b) => b.getTime() - a.getTime()),
    onChange,
    onError,
  );
}

/** Today's check-ins for the whole gym — powers the admin's "who's in right
 * now" list. Same index as the counter above. */
export function watchTodayCheckins(
  tenantId: string,
  onChange: (entries: { id: string; userId: string; checkedInAt: Date }[]) => void,
  onError?: WatchErrorHandler,
) {
  const q = query(
    collection(db, 'checkins'),
    where('tenantId', '==', tenantId),
    where('checkedInAt', '>=', Timestamp.fromDate(startOfToday())),
  );
  return watchQuery(
    'Bugün girenler',
    q,
    (snap) =>
      snap.docs
        .map((d) => ({
          id: d.id,
          userId: d.data().userId as string,
          checkedInAt: (d.data().checkedInAt as Timestamp | null)?.toDate() ?? new Date(),
        }))
        .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime()),
    onChange,
    onError,
  );
}
