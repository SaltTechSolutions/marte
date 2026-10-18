import { upcomingScheduled } from '../ptSession';
import type { WatchErrorHandler } from '../firebase/watch';
import { PtSession, PtSessionStatus } from '../types';
import { apiPost } from './client';
import { actingFor, live, localized, refresh, tenantOf } from './classSupport';
import { toInternalId } from './membershipIdentity';
import { fetchMemberSessions, fetchTenantSessions, fetchTrainerSessions, toPtSessions } from './ptSupport';

/**
 * PT sessions on the Worker. Writes that touch a credit (book, cancel) refresh the whole gym's live queries
 * (`t:<tenant>`) because the balance, the busy slots and the home card all move; the rest refresh `pt` + `busy`.
 */

const POLL = { intervalMs: 20_000 };
const UPCOMING_WINDOW = 20;

/**
 * PER-6: a trainer (or an admin) puts a session on a trainer's calendar. The Worker checks what the client
 * cannot (collision with a booking made a second ago, trainer still working, member still active).
 * Display names are not passed: they are read from the memberships.
 */
export async function createPtSession(params: {
  tenantId: string;
  trainerId: string;
  memberId: string;
  date: Date;
  durationMinutes: number;
}): Promise<void> {
  await localized(
    apiPost(`/tenants/${params.tenantId}/pt-sessions`, {
      trainerId: await toInternalId(params.trainerId),
      memberId: await toInternalId(params.memberId),
      startsAt: params.date.getTime(),
      durationMinutes: params.durationMinutes,
    }),
  );
  refresh(params.tenantId, 'pt', 'busy');
}

/** A trainer's calendar for one window (their own, or — for an admin / a calendar-share viewer — any trainer's). */
export function watchSessionsForTrainer(
  tenantId: string,
  trainerId: string,
  range: { from: Date; to: Date },
  onChange: (sessions: PtSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return live(
    `t:${tenantId}:pt:trainer:${trainerId}:${from}:${to}`,
    async () => {
      const rows = await fetchTrainerSessions(tenantId, trainerId, { from, to });
      return toPtSessions(tenantId, rows.sort((a, b) => a.startsAt - b.startsAt));
    },
    onChange,
    onError,
    POLL,
  );
}

/** A member's own PT sessions for one calendar window. */
export function watchSessionsForMember(
  tenantId: string,
  memberId: string,
  range: { from: Date; to: Date },
  onChange: (sessions: PtSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return live(
    `t:${tenantId}:pt:member:${memberId}:${from}:${to}`,
    async () => {
      const rows = await fetchMemberSessions(tenantId, memberId, { from, to });
      return toPtSessions(tenantId, rows.sort((a, b) => a.startsAt - b.startsAt));
    },
    onChange,
    onError,
    POLL,
  );
}

/**
 * A member's own upcoming PT sessions — still-scheduled ones only. Like the Firestore query, the soonest 20
 * are taken first (cancelled ones included) and the status filter comes after.
 */
export function watchUpcomingSessionsForMember(
  tenantId: string,
  memberId: string,
  onChange: (sessions: PtSession[]) => void,
  onError?: WatchErrorHandler,
) {
  return live(
    `t:${tenantId}:pt:upcoming:${memberId}`,
    async () => {
      const now = Date.now();
      const rows = (await fetchMemberSessions(tenantId, memberId, { from: now }))
        .sort((a, b) => a.startsAt - b.startsAt)
        .slice(0, UPCOMING_WINDOW);
      return upcomingScheduled(await toPtSessions(tenantId, rows));
    },
    onChange,
    onError,
    POLL,
  );
}

/**
 * A member spends their own lesson credit on a specific trainer/time. Server-side: which credit pays, and the
 * race against a second device, are decided in one transaction. `memberId`: a parent booking for their child.
 */
export async function bookPtSessions(params: {
  tenantId: string;
  trainerId: string;
  slots: Date[];
  /** MEMBER-5c: a parent booking for their approved child. Omit to book for yourself. */
  memberId?: string;
}): Promise<{ booked: number }> {
  try {
    const r = await localized(
      apiPost<{ booked: number }>(`/tenants/${params.tenantId}/pt-sessions/book`, {
        trainerId: await toInternalId(params.trainerId),
        slots: params.slots.map((s) => s.getTime()),
        // "book for myself" is the default; only a child's id (internal) is named
        ...(await actingFor(params.memberId)),
      }),
    );
    return { booked: r.booked };
  } finally {
    // A refusal (slot taken, no credit) is exactly when the screen's slot list has gone stale.
    refresh(params.tenantId);
  }
}

/** Whether a member has a non-cancelled PT session scheduled today — check-in's ders-paketi path uses this. */
export async function hasSessionToday(tenantId: string, memberId: string, now: Date): Promise<boolean> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await fetchMemberSessions(tenantId, memberId, { from: start.getTime(), to: end.getTime() });
  return rows.some((s) => s.status !== 'cancelled');
}

/** Every PT session in the tenant — admin oversight (`GET /tenants/:t/pt-sessions?from&to`, up to 1000). */
export function watchSessionsForTenant(
  tenantId: string,
  range: { from: Date; to: Date },
  onChange: (sessions: PtSession[]) => void,
  onError?: WatchErrorHandler,
) {
  const from = range.from.getTime();
  const to = range.to.getTime();
  return live(
    `t:${tenantId}:pt:tenant:${from}:${to}`,
    async () => toPtSessions(tenantId, await fetchTenantSessions(tenantId, { from, to })),
    onChange,
    onError,
    POLL,
  );
}

/**
 * Moves a session to a new trainer — a colleague "taking over" (needs a calendar share) or an admin
 * reassigning an absent trainer's session. `originalTrainerId` is set once, on the first move, by the Worker;
 * the new trainer's name is not needed (it is read from the membership).
 */
export async function reassignSession(session: PtSession, newTrainerId: string, _newTrainerName: string): Promise<void> {
  await localized(apiPost(`/tenants/${session.tenantId}/pt-sessions/${session.id}/reassign`, { trainerId: await toInternalId(newTrainerId) }));
  refresh(session.tenantId, 'pt', 'busy');
}

/**
 * Sets a session's status. The Worker has one route per legal transition: `completed`, `cancelled` (the cancel
 * route, so a credit-linked session is refunded by the same rules as `cancelPtSession`) and `no-show` (the lesson is
 * not given back; only once the session has started). Nothing moves a session back to `scheduled`.
 */
export async function setSessionStatus(sessionId: string, status: PtSessionStatus): Promise<void> {
  if (status === 'cancelled') {
    await cancelPtSession(sessionId);
    return;
  }
  if (status !== 'completed' && status !== 'no-show') throw new Error(`PT session status "${status}" cannot be set`);
  const tenantId = await tenantOf('pt', sessionId);
  await localized(apiPost(`/tenants/${tenantId}/pt-sessions/${sessionId}/${status === 'completed' ? 'complete' : 'no-show'}`));
  refresh(tenantId, 'pt', 'checkins');
}

/** Cancels a session and decides whether the credit that paid for it comes back (the Worker owns that rule). */
export async function cancelPtSession(sessionId: string): Promise<{ refunded: boolean }> {
  const tenantId = await tenantOf('pt', sessionId);
  try {
    const r = await localized(apiPost<{ refunded: boolean }>(`/tenants/${tenantId}/pt-sessions/${sessionId}/cancel`));
    return { refunded: r.refunded === true };
  } finally {
    refresh(tenantId);
  }
}
