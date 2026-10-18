import type { WatchErrorHandler } from '../firebase/watch';
import { ApiError, apiGet } from './client';
import { selfInternalId, toInternalId } from './membershipIdentity';
import { invalidate, pollWatch, type PollOptions } from './poll';
import type { Dto } from './programMap';

/**
 * Shared plumbing for the api versions of programRepo / programTemplateRepo / workoutLogRepo /
 * measurementRepo: id translation, "where does this id live" lookup, member / tenant fetchers, per-id
 * write ordering with optimistic echo, and a `pollWatch` wrapper.
 *
 * Why a locator: the Firebase repos address a program or a log by its id alone
 * (`saveProgramDays(programId, ...)`, `watchWorkoutLog(logId)`), but the Worker's write routes are
 * `/tenants/:t/programs/:id`. The tenant and member of an id are remembered whenever a list / create passes
 * them by, and otherwise resolved by `GET /programs/:id` / `GET /workout-logs/:id` (which return both).
 */

const enc = encodeURIComponent;

// --------------------------------------------------------------------------- identity

/**
 * The Worker keys people by its internal `users.id`; screens hold the Firebase uid for "me". The boundary
 * translation (membershipIdentity.ts, shared convention): ids going OUT are passed through `internalId`,
 * ids coming back are shown through `toAppId` in programMap.ts. Every fetcher below primes the id cache
 * first, because `toAppId` is synchronous.
 */
export const internalId = toInternalId;

// --------------------------------------------------------------------------- fetchers

/** Programs of one member, newest edit first (staff, the member, or an approved guardian). */
export async function fetchMemberPrograms(tenantId: string, memberId: string): Promise<Dto[]> {
  await selfInternalId();
  const rows = await apiGet<Dto[]>(`/tenants/${enc(tenantId)}/members/${enc(memberId)}/programs?limit=200`);
  rows.forEach((r) => rememberProgram(r.id, tenantId, memberId));
  return rows;
}

/** Workout logs of one member, newest first. The Worker caps `limit` at 200. */
export async function fetchMemberLogs(tenantId: string, memberId: string, limit: number): Promise<Dto[]> {
  await selfInternalId();
  const rows = await apiGet<Dto[]>(`/tenants/${enc(tenantId)}/members/${enc(memberId)}/workout-logs?limit=${limit}`);
  rows.forEach((r) => rememberLog(r.id, tenantId, memberId));
  return rows;
}

export type Located = Dto & { tenantId: string; memberId: string };

async function getOrNull<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;   // missing or not the caller's: same answer
    throw e;
  }
}

/** One program with its tenant and member; null when missing or not the caller's. */
export async function fetchProgram(id: string): Promise<Located | null> {
  await selfInternalId();
  const row = await getOrNull<Located>(`/programs/${enc(id)}`);
  if (row) rememberProgram(row.id, row.tenantId, row.memberId);
  return row;
}

/** One workout log with its tenant and member; null when missing or not the caller's. */
export async function fetchLog(id: string): Promise<Located | null> {
  await selfInternalId();
  const row = await getOrNull<Located>(`/workout-logs/${enc(id)}`);
  if (row) rememberLog(row.id, row.tenantId, row.memberId);
  return row;
}

const TENANT_LIST_CAP = 500;

/** Every program in the gym (staff), newest edit first; `activeOnly` filters on the server. */
export async function fetchTenantPrograms(tenantId: string, activeOnly: boolean): Promise<{ dto: Dto; memberId: string }[]> {
  await selfInternalId();
  const rows = await apiGet<(Dto & { memberId: string })[]>(
    `/tenants/${enc(tenantId)}/programs?limit=${TENANT_LIST_CAP}${activeOnly ? '&status=active' : ''}`,
  );
  if (rows.length >= TENANT_LIST_CAP) throw new Error('Program listesi sayfa sınırına ulaştı; liste eksik olabilir.');
  rows.forEach((r) => rememberProgram(r.id, tenantId, r.memberId));
  return rows.map((dto) => ({ dto, memberId: dto.memberId }));
}

// --------------------------------------------------------------------------- locator

export interface Loc { tenantId: string; memberId: string }
const programLoc = new Map<string, Loc>();
const logLoc = new Map<string, Loc>();

export const rememberProgram = (id: string, tenantId: string, memberId: string) => void programLoc.set(id, { tenantId, memberId });
export const rememberLog = (id: string, tenantId: string, memberId: string) => void logLoc.set(id, { tenantId, memberId });

/** Where a program lives: remembered, else asked of the Worker. */
export async function locateProgram(id: string): Promise<Loc | null> {
  const hit = programLoc.get(id);
  if (hit) return hit;
  const row = await fetchProgram(id);
  return row ? { tenantId: row.tenantId, memberId: row.memberId } : null;
}

/** Where a workout log lives: remembered, else asked of the Worker. */
export async function locateLog(id: string): Promise<Loc | null> {
  const hit = logLoc.get(id);
  if (hit) return hit;
  const row = await fetchLog(id);
  return row ? { tenantId: row.tenantId, memberId: row.memberId } : null;
}

export async function requireProgram(id: string): Promise<Loc> {
  const loc = await locateProgram(id);
  if (!loc) throw new ApiError(404, 'Program bulunamadı.');
  return loc;
}

export async function requireLog(id: string): Promise<Loc> {
  const loc = await locateLog(id);
  if (!loc) throw new ApiError(404, 'Antrenman kaydı bulunamadı.');
  return loc;
}

// --------------------------------------------------------------------------- writes: ordering + echo

const tails = new Map<string, Promise<unknown>>();

/** Runs writes for one key strictly one after another (two quick autosaves must land in order). */
export function serial<T>(key: string, run: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => tails.get(key) === tail && tails.delete(key));
  return next;
}

interface Channel { pending: number; seq: number; listeners: Set<(patch: Record<string, unknown>) => void> }
const channels = new Map<string, Channel>();
const channel = (id: string): Channel => {
  let c = channels.get(id);
  if (!c) channels.set(id, (c = { pending: 0, seq: 0, listeners: new Set() }));
  return c;
};

/**
 * Firestore showed a local write at once (latency compensation); a poller would not until the next
 * round trip, and the workout screen computes its next tap from the log it shows. So a write first echoes
 * its patch to the open single-document watchers of that id, then runs ordered; a poll that raced a write
 * is discarded in favour of the echoed value, and the invalidate after the write (success OR failure)
 * brings the server's truth back.
 */
export async function writeThrough(id: string, patch: Record<string, unknown>, run: () => Promise<void>): Promise<void> {
  const c = channel(id);
  c.pending += 1;
  c.seq += 1;
  c.listeners.forEach((l) => l(patch));
  try {
    await serial(`write:${id}`, run);
  } finally {
    c.pending -= 1;
    c.seq += 1;
  }
}

/**
 * Polls ONE document found by id: resolves its tenant first, then `fetchOne`; applies the echo of own
 * writes. `onChange(null)` = the server no longer has it (or it never existed for this caller).
 */
export function watchOne<T extends object>(
  context: string,
  id: string,
  locate: (id: string) => Promise<Loc | null>,
  area: string,
  fetchOne: (loc: Loc) => Promise<T | null>,
  onChange: (value: T | null) => void,
  onError?: WatchErrorHandler,
): () => void {
  let cancelled = false;
  let stop: (() => void) | undefined;
  let unlisten: (() => void) | undefined;
  locate(id)
    .then((loc) => {
      if (cancelled) return;
      if (!loc) return onChange(null);
      const c = channel(id);
      let local: T | null | undefined;
      // Every value reaches the screen through emit(): identical consecutive values are dropped, and a
      // poll result that differs from what the screen shows (an echo that failed) is still delivered even
      // though it equals the previous poll, which pollWatch alone would swallow.
      let lastEmitted: string | undefined;
      const emit = (v: T | null) => {
        const s = JSON.stringify(v);
        if (s === lastEmitted) return;
        lastEmitted = s;
        onChange(v);
      };
      const listener = (patch: Record<string, unknown>) => {
        if (!local) return;
        local = { ...local, ...patch } as T;
        emit(local);
      };
      c.listeners.add(listener);
      unlisten = () => c.listeners.delete(listener);
      stop = watchPoll(context, `t:${loc.tenantId}:${area}:one:${id}`, async () => {
        const seq = c.seq;
        const fresh = await fetchOne(loc);
        if (c.pending > 0 || c.seq !== seq) return local ?? fresh;   // a write raced this read: keep the echo
        local = fresh;
        emit(fresh);
        return fresh;
      }, emit, onError);
    })
    .catch((e) => reportWatchError(context, e, onError));
  return () => {
    cancelled = true;
    stop?.();
    unlisten?.();
  };
}

// --------------------------------------------------------------------------- polling

function reportWatchError(context: string, e: unknown, onError?: WatchErrorHandler) {
  console.warn(`[api] ${context} yoklaması başarısız: ${(e as Error)?.message ?? e}`);
  onError?.(e as never);
}

/** `pollWatch` with the same "never fail silently" console line the Firestore watchers have. */
export function watchPoll<T>(
  context: string,
  key: string,
  fetcher: () => Promise<T>,
  onChange: (value: T) => void,
  onError?: WatchErrorHandler,
  options?: PollOptions,
): () => void {
  return pollWatch(key, fetcher, onChange, (e) => reportWatchError(context, e, onError), options);
}

/** Refresh every watcher of one area of a gym after a write: `t:<tenantId>:<area>`. */
export const touch = (tenantId: string, area: string) => invalidate(`t:${tenantId}:${area}`);
