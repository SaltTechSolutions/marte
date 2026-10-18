import type { WatchErrorHandler } from '../firebase/watch';
import { CheckInAccessReason, CheckInWarnReason } from '../types';
import { apiGet, apiPost } from './client';
import { live, localized, pid, refresh } from './classSupport';
import { firebaseUid, selfInternalId, toAppId, toInternalId } from './membershipIdentity';

// The screens' wording: identical to Firestore's by construction (same constant).
export { WARN_MESSAGE } from '../firebase/checkinRepo';

/**
 * Check-in on the Worker. The access DECISION is the Worker's (`POST /tenants/:t/checkins/resolve`, the Firestore
 * client's rules in the same order, "today" read in the gym's time zone), so it works for every staff member AND for
 * the delegated 'checkin' holders who may not read member records. Resolving never records; the visit is a second
 * call (`POST /tenants/:t/checkins`), made here exactly where the Firestore repo wrote: at once for an `ok` entry, only
 * after staff confirm for a warning.
 *
 * The scanned QR payload is the old membership document id `${tenantId}_${personId}`. The member card builds it from
 * the member's FIREBASE uid (real accounts) or the internal id (hand-added members). A payload with another gym's
 * prefix reads as "wrong-tenant". Person ids are translated at this boundary (membershipIdentity.ts).
 */

// ---- Worker shapes ------------------------------------------------------------------------------------------

type Decision = 'ok' | 'guardian' | 'no-package' | 'no-session-today' | 'frozen' | 'duplicate' | 'inactive' | 'not-found';
interface Resolution {
  decision: Decision;
  access?: 'ok' | 'warn';
  accessReason?: CheckInAccessReason;
  member?: { id: string; name: string; avatarId: string | null; shortCode: string | null };
  packageLabel?: string | null;
  warnReason?: CheckInWarnReason;
  lastCheckinAt?: number;
}
interface CheckinDto { id: string; memberId: string; memberName: string | null; accessReason: CheckInAccessReason | null; createdAt: number }
type MemberRef = { memberId: string } | { shortCode: string } | { subject: string };

const resolveRef = (tenantId: string, ref: MemberRef) => apiPost<Resolution>(`/tenants/${tenantId}/checkins/resolve`, ref);

const docId = (tenantId: string, personId: string) => `${tenantId}_${personId}`;

/** person id out of a scanned payload, or a verdict when the payload cannot belong to this gym. */
function personIdOf(tenantId: string, payload: string): string | 'wrong-tenant' {
  const prefix = `${tenantId}_`;
  if (payload.startsWith(prefix)) return payload.slice(prefix.length);
  return payload.includes('_') ? 'wrong-tenant' : payload;
}

/**
 * Resolves what a card / doc id names. My own Firebase uid is my internal id; any other person is first tried as a
 * Firebase uid (`subject`, what a member card carries), then as an internal id (hand-added members).
 */
async function resolvePerson(tenantId: string, personId: string): Promise<Resolution> {
  const internal = await toInternalId(personId);
  if (internal !== personId || personId === firebaseUid()) return resolveRef(tenantId, { memberId: internal });
  const bySubject = await resolveRef(tenantId, { subject: personId });
  return bySubject.decision === 'not-found' ? resolveRef(tenantId, { memberId: personId }) : bySubject;
}

// ---- the access decision ------------------------------------------------------------------------------------------

interface AccessResolution {
  access: 'ok' | 'warn';
  packageLabel: string | null;
  warnReason: CheckInWarnReason | null;
  /** Set when the entry rests on a child's package rather than this person's own. */
  reason?: CheckInAccessReason;
}

const toAccess = (r: Resolution): AccessResolution => {
  if (r.access === 'ok') return { access: 'ok', packageLabel: r.packageLabel ?? null, warnReason: null, ...(r.decision === 'guardian' ? { reason: 'guardian' as const } : {}) };
  return { access: 'warn', packageLabel: r.packageLabel ?? null, warnReason: r.warnReason ?? 'no-package' };
};

/**
 * PKG-3: does this member's package actually grant today's entry, and what should the screen say about it?
 * (The Worker's answer for `userId`; a person who was scanned within the last hour has no access decision to give,
 * and neither has a missing / inactive one: those throw instead of inventing an answer.)
 */
export async function resolveAccess(tenantId: string, userId: string): Promise<AccessResolution> {
  const r = await resolvePerson(tenantId, userId);
  if (!r.access) throw new Error(`Giriş kararı alınamadı (${r.decision}).`);
  return toAccess(r);
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
 * Shared resolve-and-maybe-write path for both check-in routes. An `ok` access writes immediately; a `warn` access
 * does not — the screen shows staff the reason and, if they tap through, calls `confirmCheckInDespiteWarning`.
 * Denying is never silent and never automatic — a human decides.
 */
async function decide(tenantId: string, r: Resolution, docIdOf: () => string): Promise<CheckInOutcome> {
  if (r.decision === 'not-found' || !r.member) return { ok: false, reason: 'not-found' };
  if (r.decision === 'inactive') return { ok: false, reason: 'inactive' };
  if (r.decision === 'duplicate') return { ok: false, reason: 'already-checked-in' };
  const a = toAccess(r);
  if (a.access === 'ok') {
    // `reason` carries 'guardian' when the entry rests on a child's package.
    await writeCheckIn(tenantId, r.member.id, a.reason ?? 'ok');
    return { ok: true, name: r.member.name, access: 'ok', packageLabel: a.packageLabel };
  }
  return { ok: true, name: r.member.name, access: 'warn', packageLabel: a.packageLabel, warnReason: a.warnReason!, membershipDocId: docIdOf() };
}

/**
 * Records a front-desk scan of the member's QR (payload `${tenantId}_${personId}`). Rejects a code from the wrong
 * gym or an inactive member before anything is written.
 */
export async function checkInByMembershipId(tenantId: string, membershipId: string): Promise<CheckInOutcome> {
  const personId = personIdOf(tenantId, membershipId);
  if (personId === 'wrong-tenant') return { ok: false, reason: 'wrong-tenant' };
  return decide(tenantId, await resolvePerson(tenantId, personId), () => docId(tenantId, personId));
}

/**
 * Manual-entry check-in: staff types the member's short 6-digit code. Scoped to the gym on the server, so another
 * gym's code is "not-found" and nothing leaks.
 */
export async function checkInByShortCode(tenantId: string, shortCode: string): Promise<CheckInOutcome> {
  const r = await resolveRef(tenantId, { shortCode });
  await selfInternalId();   // primes toAppId for the doc id handed back
  return decide(tenantId, r, () => docId(tenantId, toAppId(r.member!.id)));
}

/**
 * Staff overrides a `warn` outcome — "kapıda ödeme yapıyor olabilir; kararı personel verir." Re-checks the duplicate
 * window (the pause between warning and tap is real time) but does not re-apply the access rules: the reason shown is
 * the reason recorded.
 */
export async function confirmCheckInDespiteWarning(
  tenantId: string,
  membershipDocId: string,
  warnReason: CheckInWarnReason,
): Promise<{ ok: true; name: string } | { ok: false; reason: 'already-checked-in' | 'not-found' }> {
  const personId = personIdOf(tenantId, membershipDocId);
  if (personId === 'wrong-tenant') return { ok: false, reason: 'not-found' };
  const r = await resolvePerson(tenantId, personId);
  if (!r.member || r.decision === 'not-found' || r.decision === 'inactive') return { ok: false, reason: 'not-found' };
  if (r.decision === 'duplicate') return { ok: false, reason: 'already-checked-in' };
  await writeCheckIn(tenantId, r.member.id, warnReason);
  return { ok: true, name: r.member.name };
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
      (await apiGet<CheckinDto[]>(`/tenants/${tenantId}/members/${await pid(userId)}/checkins?limit=200`))
        .filter((c) => c.createdAt >= since.getTime())
        .map((c) => new Date(c.createdAt))
        .sort((a, b) => b.getTime() - a.getTime()),
    onChange,
    onError,
    { intervalMs: 30_000 },
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const todaysVisits = (tenantId: string) =>
  apiGet<CheckinDto[]>(`/tenants/${tenantId}/checkins?from=${startOfToday().getTime()}&limit=1000`);

/** Live count of today's check-ins for a tenant — powers the admin dashboard's "live" stat. */
export function watchTodayCheckinCount(
  tenantId: string,
  onChange: (count: number) => void,
  onError?: WatchErrorHandler,
) {
  return live(`t:${tenantId}:checkins:today:count`, async () => (await todaysVisits(tenantId)).length, onChange, onError, { intervalMs: 20_000 });
}

/** Today's check-ins for the whole gym — powers the admin's "who's in right now" list. */
export function watchTodayCheckins(
  tenantId: string,
  onChange: (entries: { id: string; userId: string; checkedInAt: Date }[]) => void,
  onError?: WatchErrorHandler,
) {
  return live(
    `t:${tenantId}:checkins:today:list`,
    async () => {
      const rows = await todaysVisits(tenantId);
      await selfInternalId();
      return rows
        .map((c) => ({ id: c.id, userId: toAppId(c.memberId), checkedInAt: new Date(c.createdAt) }))
        .sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime());
    },
    onChange,
    onError,
    { intervalMs: 20_000 },
  );
}
