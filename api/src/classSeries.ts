import { Hono } from 'hono';

import { rolesIn } from './auth';
import { localParts, tenantTimeFrom, zonedTimeToMs } from './cancellationDeadline';
import { deleteClassStatements, mayEditClass, refundOutcomes, type ClassRow } from './groupClasses';
import { newId } from './guarded';
import type { Env, Vars } from './types';
import { classData } from './writes2';

/**
 * Recurring classes. A series is nothing more than classes that share `data.seriesId`: every occurrence is an ordinary
 * class (bookings, waitlist, register, single delete all work per occurrence).
 */
type App = { Bindings: Env; Variables: Vars };
export const classSeries = new Hono<App>();

export const MAX_SERIES = 52;
const MAX_EVERY_DAYS = 366;

/**
 * POST /tenants/:t/classes/series — admin, or a trainer for their OWN classes. Body: a normal class body
 * (name, capacity, startsAt, trainerId, ...) plus `repeat: { everyDays: 1..366, count: 1..52 }`.
 * Occurrences keep the same wall-clock time in the gym's time zone (a daylight-saving change does not move them).
 * ALL occurrences are inserted by ONE statement (one json_each over a single bound array), so the series exists
 * completely or not at all, whatever its length. Answers 201 { ids, seriesId } in date order.
 */
classSeries.post('/tenants/:tenantId/classes/series', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  const r = await rolesIn(c.env.DB, tenantId, uid);
  const b = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (!r.includes('admin') && !(r.includes('trainer') && b.trainerId === uid)) return c.json({ error: 'forbidden' }, 403);
  const { repeat, ...classBody } = b;
  const rep = repeat as { everyDays?: unknown; count?: unknown } | undefined;
  if (!rep || typeof rep !== 'object' || !Number.isInteger(rep.everyDays) || (rep.everyDays as number) < 1 || (rep.everyDays as number) > MAX_EVERY_DAYS
      || !Number.isInteger(rep.count) || (rep.count as number) < 1 || (rep.count as number) > MAX_SERIES) return c.json({ error: 'bad repeat' }, 400);
  const parsed = classData(classBody);
  if (!parsed) return c.json({ error: 'bad class' }, 400);

  const t = await c.env.DB.prepare(`SELECT settings FROM tenants WHERE id = ?`).bind(tenantId).first<{ settings: string }>();
  const tz = tenantTimeFrom(t?.settings).timeZone;
  const first = localParts(parsed.startsAt, tz);
  const seriesId = newId('sr');
  const every = rep.everyDays as number;
  const occurrences = Array.from({ length: rep.count as number }, (_, i) => ({
    id: newId('k'),
    startsAt: i === 0 ? parsed.startsAt : zonedTimeToMs(first.year, first.month, first.day + i * every, first.hour, first.minute, tz) + (parsed.startsAt % 60_000),
  }));
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO classes (id, tenant_id, data, starts_at)
       SELECT json_extract(value, '$.id'), ?1, ?2, json_extract(value, '$.startsAt') FROM json_each(?3)`,
    ).bind(tenantId, JSON.stringify({ ...parsed.data, seriesId }), JSON.stringify(occurrences)),
  ]);
  return c.json({ ids: occurrences.map((o) => o.id), seriesId }, 201);
});

/**
 * DELETE /tenants/:t/classes/series/:seriesId?from=<ms> — deletes the occurrences that have not started (those at or after
 * `from`, never earlier than now: what already took place stays as history). Each occurrence goes exactly the way a single
 * delete does (credit-paid bookings refunded, booked and waitlisted people told). One batch PER occurrence rather than one
 * giant batch: a long series would otherwise be hundreds of statements in one D1 transaction. Every occurrence is
 * all-or-nothing and the call is safely repeatable (what is already gone matches nothing), so a failure midway is retried
 * by calling again. Admin; a trainer only when every occurrence is theirs.
 */
classSeries.delete('/tenants/:tenantId/classes/series/:seriesId', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  const uid = c.get('userId');
  const r = await rolesIn(c.env.DB, tenantId, uid);
  if (!r.includes('admin') && !r.includes('trainer')) return c.json({ error: 'forbidden' }, 403);
  const now = Date.now();
  const fromQ = c.req.query('from');
  const from = fromQ === undefined || fromQ === '' ? now : Number(fromQ);
  if (!Number.isFinite(from)) return c.json({ error: 'bad range' }, 400);
  const db = c.env.DB;
  const { results } = await db.prepare(
    `SELECT id, data, starts_at FROM classes WHERE tenant_id = ? AND json_extract(data, '$.seriesId') = ? AND starts_at >= ? AND starts_at > ? ORDER BY starts_at LIMIT 200`,
  ).bind(tenantId, c.req.param('seriesId'), from, now).all<{ id: string; data: string; starts_at: number }>();
  const classes: ClassRow[] = results.map((x) => ({ id: x.id, tenantId, data: JSON.parse(x.data), startsAt: x.starts_at }));
  if (classes.some((k) => !mayEditClass(r, uid, k.data))) return c.json({ error: 'forbidden' }, 403);
  for (const k of classes) await db.batch(deleteClassStatements(db, k, now));
  return c.json({ ok: true, deleted: classes.length, refunds: await refundOutcomes(db, classes.map((k) => k.id)) });
});
