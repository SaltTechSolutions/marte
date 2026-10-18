/**
 * Port of backend/functions/src/cancellationDeadline.ts plus the trainer-availability arithmetic from
 * sessions.ts. One difference on purpose: the Firebase code used the runtime's local clock
 * (`getDay`, `setHours`), which on Cloud Functions is UTC, while gyms and the app think in local time.
 * Here every wall-clock rule ("opens at 08:00", "09:00-12:00") is evaluated in the gym's own time zone
 * (`tenants.settings.timeZone`, default Europe/Istanbul).
 *
 * Times are unix milliseconds. Weekday numbers follow `Date.getDay()` (0 = Sunday) because that is how
 * `tenants.openingHours` is keyed.
 */

export const DEFAULT_CANCELLATION_HOURS = 24;
/** Assumed opening time when the gym has not set its hours. */
export const DEFAULT_DAY_START_HOUR = 8;
/** Assumed closing time, used as the previous evening's deadline. */
export const DEFAULT_DAY_END_HOUR = 22;
export const DEFAULT_TIME_ZONE = 'Europe/Istanbul';

export type DayWindow = { open?: string; close?: string } | null | undefined;
export type OpeningHours = Record<string, DayWindow>;

/** The slice of `tenants.settings` that the deadline and availability rules read. */
export type TenantTime = { cancellationHours?: number; openingHours?: OpeningHours; timeZone: string };

export function tenantTimeFrom(settingsJson: string | null | undefined): TenantTime {
  let s: Record<string, unknown> = {};
  try { s = JSON.parse(settingsJson || '{}') ?? {}; } catch { /* unreadable settings = defaults */ }
  const hours = s.cancellationHours;
  const oh = s.openingHours;
  let timeZone = DEFAULT_TIME_ZONE;
  if (typeof s.timeZone === 'string') {
    try { new Intl.DateTimeFormat('en-US', { timeZone: s.timeZone }); timeZone = s.timeZone; } catch { /* bad zone = default */ }
  }
  return {
    ...(typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? { cancellationHours: hours } : {}),
    ...(oh && typeof oh === 'object' && !Array.isArray(oh) ? { openingHours: oh as OpeningHours } : {}),
    timeZone,
  };
}

// ---- wall-clock helpers (no Date local-time APIs) ----
const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    });
    formatters.set(timeZone, f);
  }
  return f;
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

export function localParts(ms: number, timeZone: string): LocalParts {
  const o: Record<string, string> = {};
  for (const p of fmt(timeZone).formatToParts(new Date(ms))) o[p.type] = p.value;
  return {
    year: Number(o.year), month: Number(o.month), day: Number(o.day), hour: Number(o.hour) % 24,
    minute: Number(o.minute), second: Number(o.second), weekday: WD.indexOf(o.weekday),
  };
}

const offsetAt = (ms: number, tz: string) => {
  const p = localParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};

/** The instant at which the wall clock of `timeZone` reads y-m-d h:mi (hour 24 = next midnight). */
export function zonedTimeToMs(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetAt(asUtc, timeZone);
  const guess = asUtc - first;
  const second = offsetAt(guess, timeZone);
  return second === first ? guess : asUtc - second;
}

/** 'YYYY-MM-DD' of the instant in the gym's zone (what availability exceptions are keyed by). */
export function isoDateOf(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseHour(value: string | undefined, fallback: number): { h: number; m: number } {
  if (!value) return { h: fallback, m: 0 };
  const [h, m] = value.split(':').map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(h)) return { h: fallback, m: 0 };
  return { h, m: Number.isFinite(m) ? m : 0 };
}

/**
 * When a member's chance to cancel without losing the lesson runs out (policy 3 Sep 2026): N hours before
 * the session, but never earlier than the gym opened that day; if it would be, it moves back to the
 * previous day's closing time. Frozen at booking time by the caller.
 */
export function computeCancellationDeadline(sessionStartMs: number, t: TenantTime): number {
  const hours = t.cancellationHours ?? DEFAULT_CANCELLATION_HOURS;
  const naive = sessionStartMs - hours * 3_600_000;

  const day = localParts(sessionStartMs, t.timeZone);
  const open = parseHour(t.openingHours?.[String(day.weekday)]?.open, DEFAULT_DAY_START_HOUR);
  const opensAt = zonedTimeToMs(day.year, day.month, day.day, open.h, open.m, t.timeZone);

  if (naive < opensAt) {
    const prev = localParts(sessionStartMs - 86_400_000, t.timeZone);
    const close = parseHour(t.openingHours?.[String(prev.weekday)]?.close, DEFAULT_DAY_END_HOUR);
    const closesAt = zonedTimeToMs(prev.year, prev.month, prev.day, close.h, close.m, t.timeZone);
    // Only pull it back: a gym open until midnight must not push the deadline LATER than the notice period.
    return closesAt < naive ? closesAt : naive;
  }
  return naive;
}

/** Whether cancelling at `nowMs` is still in time. */
export const isBeforeDeadline = (deadlineMs: number, nowMs: number) => nowMs <= deadlineMs;

// ---- trainer availability ----
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export type Availability = {
  weekly: Record<string, { start: string; end: string }[]>;
  slotMinutes: number;
  exceptions: { date: string; closed?: boolean; windows?: { start: string; end: string }[] }[];
};

function timeAt(day: LocalParts, hhmm: string, tz: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
  return m ? zonedTimeToMs(day.year, day.month, day.day, Number(m[1]), Number(m[2]), tz) : Number.NaN;
}

/**
 * The gate behind the member-facing free-slot list (the client's list is UX, this is the guarantee):
 * the slot must start on the `slotMinutes` grid counted from its window's start, and must END before the
 * window closes. An unreadable window never matches.
 */
export function isWithinAvailability(av: Availability, slotMs: number, timeZone: string): boolean {
  const day = localParts(slotMs, timeZone);
  const exception = (av.exceptions ?? []).find((e) => e?.date === isoDateOf(slotMs, timeZone));
  if (exception?.closed) return false;
  const windows = exception?.windows ?? av.weekly?.[WEEKDAYS[(day.weekday + 6) % 7]] ?? [];
  const gridMs = (av.slotMinutes ?? 60) * 60_000;
  return Array.isArray(windows) && windows.some((w) => {
    const start = timeAt(day, w?.start, timeZone);
    const end = timeAt(day, w?.end, timeZone);
    if (!(slotMs >= start) || !(slotMs + gridMs <= end)) return false;
    return (slotMs - start) % gridMs === 0;
  });
}
