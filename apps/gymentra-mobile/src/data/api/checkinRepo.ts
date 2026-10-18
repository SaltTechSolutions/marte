import type { WatchErrorHandler } from '../firebase/watch';
import { CheckInAccessReason, CheckInWarnReason } from '../types';
import { ApiError, apiGet, apiPost } from './client';
import { getRoster, live, localized, mapLimit, pid, refresh, unavailableWatch } from './classSupport';
import { selfInternalId, toAppId, toInternalId } from './membershipIdentity';
import { hasSessionToday } from './ptSessionRepo';

// The screens' wording: identical to Firestore's by construction (same constant).
export { WARN_MESSAGE } from '../firebase/checkinRepo';

/**
 * Check-in on the Worker. The access DECISION stays on the client, exactly as with Firestore: it reads the
 * member's packages, credits and today's sessions (staff may read all of them) and applies the same rules in the
 * same order; only the record of the visit is a Worker write (`POST /tenants/:t/checkins`).
 *
 * The scanned QR payload is the old membership document id `${tenantId}_${personId}` (the member card builds it from
 * the member's FIREBASE uid); the person id is the part after the gym prefix. A payload with another gym's prefix
 * reads as "wrong-tenant". Person ids are translated at this boundary (membershipIdentity.ts): my own Firebase uid
 * becomes my internal id, any other id is sent as it is.
 *
 * GAP(api): another member's QR carries THEIR Firebase uid and the Worker has no way to resolve a Firebase uid it
 * is not signed in as (D1 holds `identities(firebase, subject)`, no route exposes it to staff). Until
 * `POST /tenants/:t/checkins/resolve` (or a lookup by Firebase uid) exists, a scan only resolves when the payload
 * already holds an internal id (hand-added members) or the scanner's own uid; short codes work for everybody.
 */

// ---- Worker shapes ------------------------------------------------------------------------------------------

interface MemberDto {
  memberId: string;
  status: string;
  displayName: string | null;
  email: string | null;
  guardianId: string | null;
  guardianStatus: string | null;
}
interface PackageDto {
  id: string;
  packageName?: string;
  kind: 'membership' | 'lessons';
  status: string;
  startsAt: number;
  endsAt: number;
  entitlements?: { gymAccess?: boolean };
}
interface CreditDto { id: string; kind: string; sourcePackageId: string; total: number; used: number; expiresAt: number; status: string }
interface CheckinDto { id: string; accessReason: CheckInAccessReason; createdAt: number }

const docId = (tenantId: string, memberId: string) => `${tenantId}_${memberId}`;

/** member id out of a scanned payload, or a verdict when the payload cannot belong to this gym. */
function memberIdOf(tenantId: string, payload: string): string | 'wrong-tenant' {
  const prefix = `${tenantId}_`;
  if (payload.startsWith(prefix)) return payload.slice(prefix.length);
  return payload.includes('_') ? 'wrong-tenant' : payload;
}

const nameOf = (m: MemberDto) => m.displayName || m.email || m.memberId;

/** `memberId`: as the screen / the QR holds it (my Firebase uid, or an internal id). */
async function getMember(tenantId: string, memberId: string): Promise<MemberDto | null> {
  try {
    return await apiGet<MemberDto>(`/tenants/${tenantId}/members/${await pid(memberId)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const checkinsOf = async (tenantId: string, memberId: string) =>
  apiGet<CheckinDto[]>(`/tenants/${tenantId}/members/${await pid(memberId)}/checkins?limit=200`);

/**
 * A member re-scanned inside this window is treated as the same visit. Long enough to swallow an accidental
 * double-scan or a quick step outside, short enough that a genuine second visit still counts.
 */
const DUPLICATE_WINDOW_MINUTES = 60;

async function alreadyCheckedInRecently(tenantId: string, memberId: string): Promise<boolean> {
  const cutoff = Date.now() - DUPLICATE_WINDOW_MINUTES * 60 * 1000;
  return (await checkinsOf(tenantId, memberId)).some((c) => c.createdAt >= cutoff);
}

// ---- the access decision (same rules, same order as the Firestore repo) -----------------------------------------------

interface AccessResolution {
  access: 'ok' | 'warn';
  packageLabel: string | null;
  warnReason: CheckInWarnReason | null;
  /** Set when the entry rests on a child's package rather than this person's own. */
  reason?: CheckInAccessReason;
}

const packagesOf = async (tenantId: string, memberId: string) =>
  apiGet<PackageDto[]>(`/tenants/${tenantId}/members/${await pid(memberId)}/packages?limit=10`);

const coversToday = (p: PackageDto, now: number) =>
  p.kind === 'membership' && p.status === 'active' && p.entitlements?.gymAccess === true && p.startsAt <= now && p.endsAt >= now;

const MINOR_YEARS = 18;

/**
 * Any child of this member who currently holds an active membership package. Stops at the first match.
 *
 * GAP(api): the Worker has no "children of this guardian" read for staff (`/me/children` is the caller's own).
 * Composed instead: the roster's minors (birth date under 18, active) are each read once and kept when their guardian
 * link is this member's and approved. Only reached by a person with nothing of their own, so the cost is paid rarely.
 * Needed to drop the loop: `guardianId` + `guardianStatus` on the roster rows, or `GET …/members/:id/children`.
 */
async function findChildWithActiveMembership(
  tenantId: string,
  guardianId: string,
  now: number,
): Promise<{ childName: string; packageName: string } | null> {
  const adulthood = new Date(now);
  adulthood.setFullYear(adulthood.getFullYear() - MINOR_YEARS);
  const minors = (await getRoster(tenantId, 15_000)).filter(
    (r) => r.status === 'active' && r.birthDate != null && r.birthDate > adulthood.getTime(),
  );
  const rows = await mapLimit(minors, 4, (r) => getMember(tenantId, r.memberId));
  const children = rows.filter(
    (m): m is MemberDto => m !== null && m.guardianId === guardianId && m.guardianStatus === 'approved' && m.status === 'active',
  );
  for (const child of children) {
    const covering = (await packagesOf(tenantId, child.memberId)).find((p) => coversToday(p, now));
    if (covering) return { childName: child.displayName || child.email || 'Çocuğu', packageName: covering.packageName ?? '' };
  }
  return null;
}

/**
 * PKG-3: does this member's package actually grant today's entry, and what should the screen say about it?
 * Read against the packages/credits every time; nothing is cached (a cache goes stale the moment a package expires).
 */
export async function resolveAccess(tenantId: string, userId: string): Promise<AccessResolution> {
  const nowDate = new Date();
  const now = nowDate.getTime();
  userId = await toInternalId(userId);
  const packages = await packagesOf(tenantId, userId);

  // 1. A membership package that actually covers today.
  const covering = packages.find((p) => coversToday(p, now));
  if (covering) return { access: 'ok', packageLabel: covering.packageName ?? '', warnReason: null };

  // 2. A booked session today is access on its own, independent of the credit's current status.
  if (await hasSessionToday(tenantId, userId, nowDate)) {
    const sourcePackage = packages.find((p) => p.kind === 'lessons' && p.endsAt >= now);
    const label = sourcePackage?.packageName ?? 'Ders paketi';
    return { access: 'ok', packageLabel: `${label} · bugün randevulu`, warnReason: null };
  }

  // 3. No booked session — a credit that's still usable but unspent today.
  const credits = (await apiGet<CreditDto[]>(`/tenants/${tenantId}/members/${await pid(userId)}/credits`)).filter(
    (c) => c.kind === 'ptLesson' && c.status === 'active',
  );
  const usable = credits.find((c) => c.total - c.used > 0 && c.expiresAt >= now);
  if (usable) {
    // The Worker has no single-package read; a package outside the newest ten falls back to the generic label.
    const sourcePackage = packages.find((p) => p.id === usable.sourcePackageId);
    return { access: 'warn', packageLabel: sourcePackage?.packageName ?? 'Ders paketi', warnReason: 'no-session-today' };
  }

  // 4. Frozen (any kind) — a paused package still names itself in the warning.
  const frozen = packages.find((p) => p.status === 'frozen' && p.endsAt >= now);
  if (frozen) return { access: 'warn', packageLabel: frozen.packageName ?? '', warnReason: 'frozen' };

  // 5. A parent whose child holds an active membership (MEMBER-5b decision 3). Checked last on purpose.
  const child = await findChildWithActiveMembership(tenantId, userId, now);
  if (child) {
    return {
      access: 'ok',
      packageLabel: `${child.childName} velisi · ${child.packageName}`,
      warnReason: null,
      reason: 'guardian',
    };
  }

  // 6. Nothing at all.
  return { access: 'warn', packageLabel: null, warnReason: 'no-package' };
}

// ---- recording a visit ---------------------------------------------------------------------------------------------------

async function writeCheckIn(tenantId: string, memberId: string, accessReason: CheckInAccessReason): Promise<void> {
  await localized(apiPost(`/tenants/${tenantId}/checkins`, { memberId, accessReason }));
  refresh(tenantId, 'checkins');
}

type CheckInOutcome =
  | { ok: true; name: string; access: 'ok'; packageLabel: string | null }
  | { ok: true; name: string; access: 'warn'; packageLabel: string | null; warnReason: CheckInWarnReason; membershipDocId: string }
  | { ok: false; reason: 'not-found' | 'wrong-tenant' | 'inactive' | 'already-checked-in' };

/**
 * Shared resolve-and-maybe-write path for both check-in routes. An `ok` access writes immediately; a `warn`
 * access does not — the screen shows staff the reason and, if they tap through, calls
 * `confirmCheckInDespiteWarning`. Denying is never silent and never automatic — a human decides.
 */
async function resolveAndCheckIn(tenantId: string, member: MemberDto): Promise<CheckInOutcome> {
  await selfInternalId();   // primes toAppId for the doc id handed back
  const name = nameOf(member);

  if (await alreadyCheckedInRecently(tenantId, member.memberId)) {
    return { ok: false, reason: 'already-checked-in' };
  }

  const resolution = await resolveAccess(tenantId, member.memberId);
  if (resolution.access === 'ok') {
    // `reason` carries 'guardian' when the entry rests on a child's package.
    await writeCheckIn(tenantId, member.memberId, resolution.reason ?? 'ok');
    return { ok: true, name, access: 'ok', packageLabel: resolution.packageLabel };
  }
  return {
    ok: true,
    name,
    access: 'warn',
    packageLabel: resolution.packageLabel,
    warnReason: resolution.warnReason!,
    membershipDocId: docId(tenantId, toAppId(member.memberId)),
  };
}

/**
 * Records a front-desk scan of the member's QR (payload `${tenantId}_${memberId}`). Rejects a code from the wrong
 * gym or an inactive member before anything is written.
 *
 * GAP(api): the member lookup and the package reads are staff routes (admin / trainer). A front-desk helper who
 * only holds the delegated 'checkin' permission can WRITE a check-in but cannot read the member or the packages,
 * so for them this answers "not-found". Needed: one server-side route doing lookup + decision + the 60-minute
 * duplicate rule for `canCheckIn` callers.
 */
export async function checkInByMembershipId(tenantId: string, membershipId: string): Promise<CheckInOutcome> {
  const memberId = memberIdOf(tenantId, membershipId);
  if (memberId === 'wrong-tenant') return { ok: false, reason: 'wrong-tenant' };
  const member = await getMember(tenantId, memberId);
  if (!member) return { ok: false, reason: 'not-found' };
  if (member.status !== 'active') return { ok: false, reason: 'inactive' };

  return resolveAndCheckIn(tenantId, member);
}

/**
 * Manual-entry check-in: staff types the member's short 6-digit code. Scoped to the gym, so another gym's code
 * is "not-found".
 *
 * GAP(api): looked up in the roster (`GET /tenants/:t/members`, newest-first by name, capped at 500 rows, staff
 * only). Needed: `GET /tenants/:t/members?shortCode=` (any `canCheckIn` caller, exact match).
 */
export async function checkInByShortCode(tenantId: string, shortCode: string): Promise<CheckInOutcome> {
  const find = async (maxAgeMs: number) => (await getRoster(tenantId, maxAgeMs)).find((r) => r.shortCode === shortCode);
  // A member created a minute ago is not in a roster cached 15 s ago: look once more, fresh, before giving up.
  const row = (await find(15_000)) ?? (await find(0));
  if (!row) return { ok: false, reason: 'not-found' };
  if (row.status !== 'active') return { ok: false, reason: 'inactive' };
  const member = await getMember(tenantId, row.memberId);
  if (!member) return { ok: false, reason: 'not-found' };

  return resolveAndCheckIn(tenantId, member);
}

/**
 * Staff overrides a `warn` outcome — "kapıda ödeme yapıyor olabilir; kararı personel verir." Re-checks the
 * duplicate window but does not re-resolve access: the reason shown is the reason recorded.
 */
export async function confirmCheckInDespiteWarning(
  tenantId: string,
  membershipDocId: string,
  warnReason: CheckInWarnReason,
): Promise<{ ok: true; name: string } | { ok: false; reason: 'already-checked-in' | 'not-found' }> {
  const memberId = memberIdOf(tenantId, membershipDocId);
  if (memberId === 'wrong-tenant') return { ok: false, reason: 'not-found' };
  const member = await getMember(tenantId, memberId);
  if (!member) return { ok: false, reason: 'not-found' };
  if (await alreadyCheckedInRecently(tenantId, member.memberId)) {
    return { ok: false, reason: 'already-checked-in' };
  }
  await writeCheckIn(tenantId, member.memberId, warnReason);
  return { ok: true, name: nameOf(member) };
}

// ---- live ------------------------------------------------------------------------------------------------------------------

/**
 * A member's own visit history, newest first, bounded to `since`. (The Worker returns the newest 200 visits; a
 * longer window than that would be cut.)
 */
export function watchMyCheckins(
  tenantId: string,
  userId: string,
  since: Date,
  onChange: (dates: Date[]) => void,
  onError?: WatchErrorHandler,
) {
  return live(
    `t:${tenantId}:checkins:mine:${userId}:${since.getTime()}`,
    async () =>
      (await checkinsOf(tenantId, userId))
        .filter((c) => c.createdAt >= since.getTime())
        .map((c) => new Date(c.createdAt))
        .sort((a, b) => b.getTime() - a.getTime()),
    onChange,
    onError,
    { intervalMs: 30_000 },
  );
}

/**
 * Live count of today's check-ins for a tenant — powers the admin dashboard's "live" stat.
 *
 * GAP(api): the Worker only lists check-ins PER MEMBER (`GET …/members/:id/checkins`); there is no gym-wide read.
 * Needed: `GET /tenants/:t/checkins?from=<ms>` (admin / delegated 'checkin') -> `[{ id, memberId, accessReason,
 * createdAt }]`. Until then the screen gets its error callback, never a made-up 0.
 */
export function watchTodayCheckinCount(
  _tenantId: string,
  _onChange: (count: number) => void,
  onError?: WatchErrorHandler,
) {
  return unavailableWatch('GET /tenants/:t/checkins?from= does not exist (gym-wide check-ins, today\'s count)', onError);
}

/**
 * Today's check-ins for the whole gym — powers the admin's "who's in right now" list.
 *
 * GAP(api): same missing gym-wide check-in read as `watchTodayCheckinCount`.
 */
export function watchTodayCheckins(
  _tenantId: string,
  _onChange: (entries: { id: string; userId: string; checkedInAt: Date }[]) => void,
  onError?: WatchErrorHandler,
) {
  return unavailableWatch('GET /tenants/:t/checkins?from= does not exist (gym-wide check-ins, today\'s list)', onError);
}
