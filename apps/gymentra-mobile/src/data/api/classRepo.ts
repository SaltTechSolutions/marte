import type { WatchErrorHandler } from '../firebase/watch';
import { ClassAttendance, ClassSession } from '../types';
import { ApiError, apiDelete, apiFetch, apiGet, apiPost, apiPut } from './client';
import { toAppId, toInternalId } from './membershipIdentity';
import {
  actingFor,
  getMe,
  isStaffIn,
  live,
  localized,
  mapLimit,
  refresh,
  rememberTenant,
  tenantOf,
  trackedMap,
} from './classSupport';

/**
 * Group classes on the Worker.
 *
 * What differs from Firestore (and how it is bridged so the screens stay unchanged):
 *  - a class used to carry `bookedUserIds` / `waitlistUserIds` / `attendance`. The Worker keeps bookings in
 *    their own tables and, on purpose, never lists who is booked to a member. The class list is therefore
 *    assembled from `classes` + `class-occupancy` (counts) + `class-bookings` (my own seats) and, for staff
 *    only, the per-class `roster` (identities and the register). For a member the arrays have the right
 *    LENGTH and contain my own id when I am in; the other entries are opaque placeholders (`~<classId>:<n>`).
 *  - booking: one Worker route covers the unlimited entitlement AND a quota credit; a full class answers
 *    "class full" and `bookClass` then joins the waitlist, exactly like the Firestore transaction did.
 *  - tenant-scoped routes vs id-only signatures: the gym of a class is remembered from the lists (see
 *    `tenantOf`).
 */

interface ClassDto {
  id: string;
  startsAt: number;
  name?: string;
  trainerId?: string;
  trainerName?: string;
  seriesId?: string;
  durationMinutes?: number;
  capacity?: number;
  [extra: string]: unknown;
}
interface Occupancy { classId: string; booked: number; waitlisted: number }
interface MyBooking { classId: string; startsAt: number; status: 'booked' | 'waitlisted'; since: number; paidWithCredit: boolean; waitlistPosition?: number }
interface Roster {
  capacity: number;
  booked: { memberId: string; name: string | null; paidWithCredit: boolean; bookedAt: number; attendance: 'present' | 'absent' | null }[];
  waitlist: { memberId: string; name: string | null; joinedAt: number }[];
}

/** The last DTO seen per class: `updateClass` merges a partial change into it (the Worker's PUT replaces the whole class). */
const dtoCache = trackedMap<string, ClassDto>();
const rosterCache = trackedMap<string, { at: number; roster: Roster }>();
const PAST_ROSTER_TTL_MS = 2 * 60_000;
const ROSTER_CONCURRENCY = 5;
/** Classes poll quickly: occupancy is the number members watch most. */
const POLL = { intervalMs: 15_000 };

const placeholders = (classId: string, n: number, prefix: string) =>
  Array.from({ length: Math.max(0, n) }, (_, i) => `~${prefix}${classId}:${i}`);

type RosterMode = 'none' | 'past' | 'all';

async function fetchRoster(tenantId: string, classId: string): Promise<Roster> {
  const roster = await apiGet<Roster>(`/tenants/${tenantId}/classes/${classId}/roster`);
  rosterCache.set(classId, { at: Date.now(), roster });
  return roster;
}

/**
 * Loads the sessions of a window and shapes them as the app's `ClassSession`s.
 * `memberId` = whose seats count as "mine" (omitted: the caller). `rosters`: staff only; 'all' = every class with
 * somebody in it, fresh (a coach taking the register); 'past' = only classes that already started, cached for a
 * couple of minutes (an admin's report needs the register of past classes, not of every future one).
 */
async function loadSessions(
  tenantId: string,
  q: {
    from: number;
    to?: number;
    trainerId?: string;
    memberId?: string;
    onlyMine?: boolean;
    limit?: number;
    rosters: RosterMode;
    /** The roster is a staff read: only ask for it when the caller is staff. */
    staffOnly?: boolean;
  },
): Promise<ClassSession[]> {
  const me = await getMe();
  const internalMember = q.memberId ? await toInternalId(q.memberId) : undefined;
  const who = internalMember && internalMember !== me.userId ? internalMember : undefined;
  const trainerInternal = q.trainerId ? await toInternalId(q.trainerId) : undefined;
  const mode: RosterMode = q.staffOnly && !(await isStaffIn(tenantId, me)) ? 'none' : q.rosters;
  const mineQuery = who ? `&memberId=${encodeURIComponent(who)}` : '';
  const [classes, occupancy, mine] = await Promise.all([
    apiGet<ClassDto[]>(
      `/tenants/${tenantId}/classes?from=${q.from}${q.to !== undefined ? `&to=${q.to}` : ''}${trainerInternal ? `&trainerId=${encodeURIComponent(trainerInternal)}` : ''}`,
    ),
    apiGet<Occupancy[]>(`/tenants/${tenantId}/class-occupancy?from=${q.from}`),
    apiGet<MyBooking[]>(`/tenants/${tenantId}/class-bookings?from=${q.from}${mineQuery}`),
  ]);
  // The screens know me by my Firebase uid and everybody else by the internal id (membershipIdentity.ts).
  const myId = toAppId(who ?? me.userId ?? '');
  const occ = new Map(occupancy.map((o) => [o.classId, o]));
  const seat = new Map(mine.map((m) => [m.classId, m.status]));
  const position = new Map(mine.map((m) => [m.classId, m.waitlistPosition]));

  let list = classes;   // the window and the coach are filtered by the Worker
  if (q.onlyMine) list = list.filter((c) => seat.get(c.id) === 'booked');
  if (q.limit !== undefined) list = list.slice(0, q.limit);
  list.forEach((c) => dtoCache.set(c.id, c));
  rememberTenant('class', list, tenantId);

  const now = Date.now();
  const rosterFor = new Map<string, Roster>();
  if (mode !== 'none') {
    const wanted = list.filter((c) => {
      const o = occ.get(c.id);
      if (!o || o.booked + o.waitlisted === 0) return false;
      return mode === 'all' || c.startsAt <= now;
    });
    await mapLimit(wanted, ROSTER_CONCURRENCY, async (c) => {
      const cached = rosterCache.get(c.id);
      const reuse = mode === 'past' && cached && now - cached.at < PAST_ROSTER_TTL_MS;
      rosterFor.set(c.id, reuse ? cached.roster : await fetchRoster(tenantId, c.id));
    });
  }

  return list.map((c) => {
    const o = occ.get(c.id) ?? { classId: c.id, booked: 0, waitlisted: 0 };
    const roster = rosterFor.get(c.id);
    let booked: string[];
    let waitlist: string[];
    let attendance: ClassAttendance | undefined;
    if (roster) {
      booked = roster.booked.map((b) => toAppId(b.memberId));
      waitlist = roster.waitlist.map((w) => toAppId(w.memberId));
      const marks = roster.booked.filter((b) => b.attendance);
      if (marks.length) attendance = Object.fromEntries(marks.map((b) => [toAppId(b.memberId), b.attendance as 'present' | 'absent']));
    } else {
      const status = seat.get(c.id);
      booked = status === 'booked' ? [myId, ...placeholders(c.id, o.booked - 1, 'b')] : placeholders(c.id, o.booked, 'b');
      // My place in the queue is the Worker's `waitlistPosition` (1-based); the others stay opaque placeholders.
      waitlist = placeholders(c.id, o.waitlisted, 'w');
      if (status === 'waitlisted') {
        const at = Math.min(Math.max((position.get(c.id) ?? o.waitlisted) - 1, 0), Math.max(o.waitlisted - 1, 0));
        waitlist = [...waitlist.slice(0, at), myId, ...waitlist.slice(at + 1)];
        if (!waitlist.includes(myId)) waitlist = [myId];
      }
    }
    return {
      id: c.id,
      tenantId,
      name: String(c.name ?? ''),
      ...(c.trainerId ? { trainerId: toAppId(c.trainerId) } : {}),
      trainerName: String(c.trainerName ?? ''),
      ...(c.seriesId ? { seriesId: c.seriesId } : {}),
      date: new Date(c.startsAt),
      durationMinutes: Number(c.durationMinutes ?? 0),
      capacity: Number(c.capacity ?? 0),
      bookedUserIds: booked,
      waitlistUserIds: waitlist,
      ...(attendance ? { attendance } : {}),
    };
  });
}

/** Live class schedule for a tenant, soonest first. */
export function watchClassesForTenant(
  tenantId: string,
  /** Window to load. The schedule is browsed a month at a time. */
  range: { from: Date; to: Date },
  onChange: (sessions: ClassSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return live(
    `t:${tenantId}:classes:tenant:${from}:${to}`,
    () => loadSessions(tenantId, { from, to, limit: 200, rosters: 'past', staffOnly: true }),
    onChange,
    onError,
    POLL,
  );
}

type NewClass = {
  tenantId: string;
  name: string;
  /** Omitted only when the gym has not added its trainers yet and the name
   *  was typed by hand — see `ClassSession.trainerId`. */
  trainerId?: string;
  trainerName: string;
  date: Date;
  durationMinutes: number;
  capacity: number;
};

export async function createClass(params: NewClass): Promise<void> {
  await createOne(params, undefined);
}

async function createOne(params: NewClass, seriesId: string | undefined): Promise<string> {
  const { id } = await localized(
    apiPost<{ id: string }>(`/tenants/${params.tenantId}/classes`, {
      name: params.name,
      ...(params.trainerId ? { trainerId: await toInternalId(params.trainerId) } : {}),
      trainerName: params.trainerName,
      ...(seriesId ? { seriesId } : {}),
      startsAt: params.date.getTime(),
      durationMinutes: params.durationMinutes,
      capacity: params.capacity,
    }),
  );
  rememberTenant('class', id, params.tenantId);
  refresh(params.tenantId, 'classes');
  return id;
}

/** The stored class, from the last list read (or, on a cold start, a fresh read of the gym's classes). */
async function currentDto(classId: string, tenantId: string): Promise<ClassDto> {
  const hit = dtoCache.get(classId);
  if (hit) return hit;
  const all = await apiGet<ClassDto[]>(`/tenants/${tenantId}/classes?from=0`);
  all.forEach((c) => dtoCache.set(c.id, c));
  const found = all.find((c) => c.id === classId);
  if (!found) throw new ApiError(404, 'Ders bulunamadı.');
  return found;
}

/**
 * Edits a class the gym already published — the time moves, the coach changes, the room shrinks.
 * Who is booked is not editable here. The Worker's PUT replaces the class body, so the change is merged into the
 * stored class first (everything else, `seriesId` included, stays).
 */
export async function updateClass(
  classId: string,
  changes: {
    name?: string;
    trainerId?: string;
    trainerName?: string;
    date?: Date;
    durationMinutes?: number;
    capacity?: number;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) patch.name = changes.name.trim();
  if (changes.trainerId !== undefined) patch.trainerId = await toInternalId(changes.trainerId);
  if (changes.trainerName !== undefined) patch.trainerName = changes.trainerName.trim();
  if (changes.date !== undefined) patch.startsAt = changes.date.getTime();
  if (changes.durationMinutes !== undefined) patch.durationMinutes = changes.durationMinutes;
  if (changes.capacity !== undefined) patch.capacity = changes.capacity;
  if (Object.keys(patch).length === 0) return;
  const tenantId = await tenantOf('class', classId);
  const { id: _id, ...current } = await currentDto(classId, tenantId);
  await localized(apiPut(`/tenants/${tenantId}/classes/${classId}`, { ...current, ...patch }));
  dtoCache.delete(classId);
  refresh(tenantId, 'classes');
}

/**
 * Cancels a class outright. Credit-paid bookings are refunded and everyone booked or waiting is told, by the
 * Worker, in the same step.
 */
export async function deleteClass(classId: string): Promise<void> {
  const tenantId = await tenantOf('class', classId);
  await localized(apiDelete(`/tenants/${tenantId}/classes/${classId}`));
  dtoCache.delete(classId);
  rosterCache.delete(classId);
  refresh(tenantId);
}

type BookingStatus = 'booked' | 'waitlisted' | 'already-booked' | 'already-waitlisted';

/**
 * Takes a place if there is one, otherwise joins the waitlist (the Firestore transaction did the same).
 * The unlimited entitlement and a quota credit go through the same route; the Worker decides how it is paid.
 */
async function bookOrWait(classId: string, memberId: string | undefined): Promise<BookingStatus> {
  const tenantId = await tenantOf('class', classId);
  const body = await actingFor(memberId);
  try {
    try {
      const r = await localized(apiPost<{ status: BookingStatus }>(`/tenants/${tenantId}/classes/${classId}/book`, body));
      return r.status;
    } catch (e) {
      if (e instanceof ApiError && e.apiCode === 'already on the waitlist') return 'already-waitlisted';
      if (!(e instanceof ApiError) || e.apiCode !== 'class full') throw e;
    }
    try {
      const r = await localized(apiPost<{ status: BookingStatus }>(`/tenants/${tenantId}/classes/${classId}/waitlist`, body));
      return r.status;
    } catch (e) {
      if (e instanceof ApiError && e.apiCode === 'already booked') return 'already-booked';
      throw e;
    }
  } finally {
    refresh(tenantId);
  }
}

/** Books the class if there's room, otherwise joins the waitlist. */
export async function bookClass(classId: string, userId: string): Promise<'booked' | 'waitlisted' | 'already-in'> {
  const status = await bookOrWait(classId, userId);
  return status === 'already-booked' || status === 'already-waitlisted' ? 'already-in' : status;
}

/** Cancels a booking or leaves the waitlist — whichever the member is currently in. */
export async function cancelBooking(classId: string, userId: string): Promise<void> {
  await cancelFor(classId, userId);
}

async function cancelFor(classId: string, memberId: string | undefined): Promise<{ refunded: boolean }> {
  const tenantId = await tenantOf('class', classId);
  try {
    const r = await localized(apiFetch<{ refunded?: boolean }>('DELETE', `/tenants/${tenantId}/classes/${classId}/book`, await actingFor(memberId)));
    return { refunded: r.refunded === true };
  } finally {
    refresh(tenantId);
  }
}

/** The group classes this member is booked into, from now on (MEMBER-3). */
export function watchMyUpcomingClasses(
  tenantId: string,
  userId: string,
  onChange: (classes: ClassSession[]) => void,
  onError?: WatchErrorHandler,
) {
  return live(
    `t:${tenantId}:classes:mine:${userId}`,
    () => loadSessions(tenantId, { from: Date.now(), memberId: userId, onlyMine: true, limit: 30, rosters: 'none' }),
    onChange,
    onError,
    POLL,
  );
}

/** The classes one coach runs, in a window (PER-8). The register and the roster come with them. */
export function watchClassesForTrainer(
  tenantId: string,
  trainerId: string,
  range: { from: Date; to: Date },
  onChange: (sessions: ClassSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return live(
    `t:${tenantId}:classes:trainer:${trainerId}:${from}:${to}`,
    () => loadSessions(tenantId, { from, to, trainerId, limit: 200, rosters: 'all' }),
    onChange,
    onError,
    POLL,
  );
}

/** Marks one person present or absent, or clears the mark (cleared = "nobody took the register", not "absent"). */
export async function setClassAttendance(
  classId: string,
  userId: string,
  value: 'present' | 'absent' | null,
): Promise<void> {
  const tenantId = await tenantOf('class', classId);
  await localized(apiPut(`/tenants/${tenantId}/classes/${classId}/attendance`, { memberId: await toInternalId(userId), value }));
  rosterCache.delete(classId);
  refresh(tenantId, 'classes');
}

export type GroupBookingResult = 'booked' | 'waitlisted' | 'already-booked' | 'already-waitlisted';

/** Books a place using a quota'd allowance (PER-9); the Worker spends the credit and takes the seat in one step. */
export async function bookGroupClassWithCredit(classId: string, memberId?: string): Promise<GroupBookingResult> {
  return bookOrWait(classId, memberId);
}

/** Cancels a quota-paid booking; the Worker decides whether the credit returns. */
export async function cancelGroupClassWithCredit(classId: string, memberId?: string): Promise<{ refunded: boolean }> {
  return cancelFor(classId, memberId);
}

/**
 * Creates a weekly repeat of the same class (PER-10 / PKG-9). `weeks` counts occurrences INCLUDING the first, so 1 is an
 * ordinary single class. One Worker call: the series exists completely or not at all (the Worker allows 1..52).
 */
export async function createClassSeries(
  params: NewClass,
  weeks: number,
): Promise<{ created: number; seriesId?: string }> {
  const count = Math.max(1, Math.floor(weeks));
  if (count === 1) {
    await createClass(params);
    return { created: 1 };
  }
  const { ids, seriesId } = await localized(
    apiPost<{ ids: string[]; seriesId: string }>(`/tenants/${params.tenantId}/classes/series`, {
      name: params.name,
      ...(params.trainerId ? { trainerId: await toInternalId(params.trainerId) } : {}),
      trainerName: params.trainerName,
      startsAt: params.date.getTime(),
      durationMinutes: params.durationMinutes,
      capacity: params.capacity,
      repeat: { everyDays: 7, count },
    }),
  );
  rememberTenant('class', ids.map((id) => ({ id })), params.tenantId);
  refresh(params.tenantId, 'classes');
  return { created: ids.length, seriesId };
}

/** Cancels the rest of a repeating class, from `fromDate` onward (forward-only: classes that ran keep their register). */
export async function deleteClassSeriesFrom(
  tenantId: string,
  seriesId: string,
  fromDate: Date,
): Promise<{ deleted: number }> {
  try {
    const r = await localized(apiDelete<{ deleted: number }>(`/tenants/${tenantId}/classes/series/${encodeURIComponent(seriesId)}?from=${fromDate.getTime()}`));
    return { deleted: r.deleted };
  } finally {
    dtoCache.clear();
    refresh(tenantId);
  }
}
