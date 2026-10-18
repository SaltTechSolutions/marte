import { tenantTimeFrom } from './cancellationDeadline';

/**
 * PT half of sendClassReminders ("randevun bir saat sonra"). The cron (every 15 minutes) calls this; it is
 * a sweep of a short window, not a timer per booking, so cancelling or moving a session needs no cleanup.
 *
 * Idempotent and safe under overlapping runs: per session, ONE batch stamps `reminder_sent_at` (only while it
 * is still NULL and the session still 'scheduled') and writes the outbox row only if that stamp changed a row.
 * The dedupe key is a second line of defence. Returns how many reminders were queued.
 */
export const REMINDER_LEAD_MINUTES = 60;
export const REMINDER_WINDOW_MINUTES = 20;

type Due = { id: string; member_id: string; starts_at: number; settings: string | null; trainer_name: string | null };

export async function sendPtReminders(db: D1Database, nowMs: number = Date.now()): Promise<number> {
  const from = nowMs + REMINDER_LEAD_MINUTES * 60_000;
  const to = nowMs + (REMINDER_LEAD_MINUTES + REMINDER_WINDOW_MINUTES) * 60_000;
  const { results } = await db.prepare(
    `SELECT s.id, s.member_id, s.starts_at, t.settings, COALESCE(NULLIF(tr.display_name, ''), tr.email) AS trainer_name
     FROM pt_sessions s
     JOIN tenants t ON t.id = s.tenant_id
     LEFT JOIN memberships tr ON tr.tenant_id = s.tenant_id AND tr.member_id = s.trainer_id
     WHERE s.status = 'scheduled' AND s.reminder_sent_at IS NULL AND s.starts_at >= ? AND s.starts_at < ?
     ORDER BY s.starts_at LIMIT 500`,
  ).bind(from, to).all<Due>();

  let queued = 0;
  for (const d of results) {
    const tz = tenantTimeFrom(d.settings).timeZone;
    const time = new Intl.DateTimeFormat('tr-TR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(d.starts_at));
    const payload = {
      userIds: [d.member_id], title: 'Randevun yaklaşıyor', category: 'bookings',
      body: `${d.trainer_name ?? 'Antrenörün'} ile ${time} randevun var.`,
      data: { screen: 'member/bookings', sessionId: d.id },
    };
    await db.batch([
      db.prepare(`UPDATE pt_sessions SET reminder_sent_at = ? WHERE id = ? AND status = 'scheduled' AND reminder_sent_at IS NULL`).bind(nowMs, d.id),
      db.prepare(
        `INSERT OR IGNORE INTO outbox (id, kind, payload, dedupe_key, next_attempt_at, created_at)
         SELECT ?, 'push', ?, ?, ?, ? WHERE changes() = 1`,
      ).bind('ob' + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join(''),
        JSON.stringify(payload), `pt-reminder:${d.id}`, nowMs, nowMs),
    ]);
    const stamped = await db.prepare(`SELECT 1 AS x FROM pt_sessions WHERE id = ? AND reminder_sent_at = ?`).bind(d.id, nowMs).first();
    if (stamped) queued++;
  }
  return queued;
}
