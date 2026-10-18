import { sharedWatch } from '../firebase/sharedWatch';
import type { WatchErrorHandler } from '../firebase/watch';
import { ApiError } from './client';
import { fetchMe, resetIdentity, selfInternalId, toInternalId, type MeDto } from './membershipIdentity';
import { invalidate, pollWatch, type PollOptions } from './poll';

/**
 * Shared plumbing of the scheduling repos (classRepo, ptSessionRepo, checkinRepo, availabilityRepo,
 * calendarShareRepo): who am I, which gym owns an id, live polling with the Firebase `watch*` contract,
 * Turkish texts for refusals the Worker sends with an English code, and a few small utilities.
 *
 * Identity: the screens hold my FIREBASE uid for "me" and the internal `users.id` for everybody else;
 * everything sent to the Worker goes through `toInternalId` and every person id handed back goes through
 * `toAppId` (membershipIdentity.ts). Both are no-ops for other people's ids.
 */

// ---- who am I -------------------------------------------------------------------------------------------

export type Me = MeDto;

/** `GET /me` (fresh: its membership list is data, the roles gate what a poll fetches). */
export const getMe = fetchMe;

/** The caller's roles in a gym (empty unless the membership is active). */
export async function myRoles(tenantId: string, me?: Me): Promise<string[]> {
  const m = me ?? (await fetchMe());
  return m.memberships.find((x) => x.tenantId === tenantId && x.status === 'active')?.roles ?? [];
}

export async function isStaffIn(tenantId: string, me?: Me): Promise<boolean> {
  const r = await myRoles(tenantId, me);
  return r.includes('admin') || r.includes('trainer');
}

/**
 * `{}` for "myself", `{ memberId }` (the INTERNAL id) for anyone else: a child of a guardian, a member a coach
 * acts for. The screens hold my Firebase uid for "me" and the internal id for everybody else
 * (membershipIdentity.ts), so both spellings of "me" must come out as `{}`.
 */
export async function actingFor(memberId?: string): Promise<{ memberId?: string }> {
  if (!memberId) return {};
  const internal = await toInternalId(memberId);
  return internal === (await selfInternalId()) ? {} : { memberId: internal };
}

/** Path-safe internal id of a person the screen named (my Firebase uid becomes my internal id). */
export async function pid(personId: string): Promise<string> {
  return encodeURIComponent(await toInternalId(personId));
}

// ---- which gym owns this id ----------------------------------------------------------------------------

/**
 * Several Firebase functions take ONLY a document id (`deleteClass(classId)`, `cancelPtSession(sessionId)`),
 * but every Worker route is tenant-scoped. Signatures cannot change, so the gym is recovered from a registry
 * filled by every list these repos read (the screen always loaded the row before acting on it), else from
 * the caller's only active gym. Never guessed across several gyms: a mutating call must not be probed.
 */
export type IdKind = 'class' | 'pt';
const owners = new Map<string, string>();
const ownerKey = (kind: IdKind, id: string) => `${kind}:${id}`;

export function rememberTenant(kind: IdKind, items: { id: string }[] | string, tenantId: string): void {
  if (typeof items === 'string') owners.set(ownerKey(kind, items), tenantId);
  else items.forEach((i) => owners.set(ownerKey(kind, i.id), tenantId));
}

export async function tenantOf(kind: IdKind, id: string): Promise<string> {
  const known = owners.get(ownerKey(kind, id));
  if (known) return known;
  const me = await getMe();
  const active = me.memberships.filter((m) => m.status === 'active');
  if (active.length === 1) return active[0].tenantId;
  throw new Error(`GAP(api): the gym of ${kind} "${id}" is unknown (not loaded yet) and the user has ${active.length} gyms`);
}

// ---- live data ---------------------------------------------------------------------------------------------

/**
 * `sharedWatch` + `pollWatch` with the Firebase `watch*` contract: returns an unsubscribe, the error callback
 * is the screen's `onError`, and a dropped subscription is never silent (console, like `watch.ts`).
 * `key` must encode EVERY argument of the query and start with `t:<tenantId>:<area>`.
 */
export function live<T>(
  key: string,
  fetcher: () => Promise<T>,
  onChange: (value: T) => void,
  onError?: WatchErrorHandler,
  options?: PollOptions,
): () => void {
  return sharedWatch<T>(
    key,
    (emit, fail) =>
      pollWatch(key, fetcher, emit, (e) => {
        console.warn(`[api] ${key} aboneliği düştü:`, e instanceof Error ? e.message : e);
        fail(e as never);
      }, options),
    onChange,
    onError,
  );
}

/** Refreshes the live queries of one gym: `invalidate('t:<tenant>:<area>')` for each area ('' = the whole gym). */
export function refresh(tenantId: string, ...areas: string[]): void {
  (areas.length ? areas : ['']).forEach((a) => invalidate(a ? `t:${tenantId}:${a}` : `t:${tenantId}`));
}

// ---- utilities --------------------------------------------------------------------------------------------------

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
export async function mapLimit<A, B>(items: A[], limit: number, fn: (item: A) => Promise<B>): Promise<B[]> {
  const out = new Array<B>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const tracked: Map<unknown, unknown>[] = [];
/** A module-level cache that `__resetSupport` also empties (tests, sign-out). */
export function trackedMap<K, V>(): Map<K, V> {
  const m = new Map<K, V>();
  tracked.push(m as Map<unknown, unknown>);
  return m;
}

/**
 * Sign-out hygiene and the test seam: forgets everything these repos cache (gym of each id, roster, names, class
 * bodies and registers) and the signed-in person's id translation. Call it when the account changes.
 */
export function resetSchedulingCaches(): void {
  resetIdentity();
  owners.clear();
  tracked.forEach((m) => m.clear());
}

/** Same as `resetSchedulingCaches`; the name the tests use. */
export const __resetSupport = resetSchedulingCaches;

// ---- refusals in Turkish -------------------------------------------------------------------------------------------

/**
 * The Worker sends the Turkish sentence itself (`message`, api/src/errorMessages.ts) and the screens show it
 * verbatim. This is only the FALLBACK for input-validation codes the Worker has no sentence for yet, which would
 * otherwise reach the screen as the generic "Bu işlem şu an yapılamıyor.". A refusal that the Worker covers is
 * never touched (its code is not listed here).
 */
const SCHED_MESSAGES: Record<string, string> = {
  'unreadable slot': 'Tarih okunamadı.',
  'at most 20 slots per request': 'Bir seferde en fazla 20 randevu alınabilir.',
  'trainerId and slots required': 'Eksik bilgi.',
  'trainerId and memberId required': 'Eksik bilgi.',
  durationMinutes: 'Randevu süresi geçersiz.',
  startsAt: 'Tarih okunamadı.',
  'bad class': 'Ders bilgileri geçersiz. Ad, saat ve kontenjanı kontrol et.',
  'bad repeat': 'Tekrar sayısı 1 ile 52 arasında olmalı.',
  'bad roles': 'Rol bilgisi geçersiz.',
  slotMinutes: 'Randevu süresi 30, 45, 60 ya da 90 dakika olmalı.',
  weekly: 'Çalışma saatleri geçersiz.',
  exceptions: 'İstisna günleri geçersiz.',
};

export function localizeSchedError(e: unknown): unknown {
  if (!(e instanceof ApiError) || !e.apiCode) return e;
  const text = SCHED_MESSAGES[e.apiCode];
  return text ? new ApiError(e.status, text, e.apiCode) : e;
}

/** `await localized(apiPost(...))`: same promise, refusals in Turkish. */
export const localized = <T>(p: Promise<T>): Promise<T> =>
  p.catch((e) => {
    throw localizeSchedError(e);
  });
