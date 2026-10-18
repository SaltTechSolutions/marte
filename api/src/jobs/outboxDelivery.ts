import type { Env } from '../types';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60_000;
type Fetch = typeof fetch;
const MUTABLE = ['bookings', 'packages', 'payments', 'programs', 'announcements'];

type Row = { id: string; kind: string; payload: string; attempts: number };

/** Exponential backoff: 1, 2, 4 ... minutes, capped at one hour. */
export const backoffMs = (attempts: number) => Math.min(2 ** (attempts - 1) * 60_000, 3_600_000);

async function sendPush(db: D1Database, p: any, doFetch: Fetch): Promise<void> {
  const userIds: string[] = p.userIds ?? [];
  const category: string = p.category ?? 'account';
  const wanted: string[] = [];
  for (const uid of userIds) {
    if (MUTABLE.includes(category)) {
      const s = await db.prepare(`SELECT json_extract(notifications, '$.' || ?) AS v FROM user_settings WHERE user_id = ?`).bind(category, uid).first<{ v: unknown }>();
      if (s && (s.v === 0 || s.v === false)) continue;   // an absent answer means yes
    }
    wanted.push(uid);
  }
  if (!wanted.length) return;
  const marks = wanted.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT token FROM push_tokens WHERE user_id IN (${marks})`).bind(...wanted).all<{ token: string }>();
  if (!results.length) return;                          // nobody to notify is success, not an error
  const messages = results.map((r) => ({ to: r.token, title: p.title, body: p.body, sound: 'default', ...(p.data ? { data: p.data } : {}) }));
  const res = await doFetch(EXPO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(messages) });
  if (!res.ok) throw new Error(`expo ${res.status}`);
  const out = (await res.json().catch(() => null)) as { data?: { details?: { error?: string } }[] } | null;
  const dead = (out?.data ?? []).map((t, i) => (t?.details?.error === 'DeviceNotRegistered' ? results[i].token : null)).filter((t): t is string => !!t);
  if (dead.length) await db.batch(dead.map((t) => db.prepare(`DELETE FROM push_tokens WHERE token = ?`).bind(t)));
}

async function sendEmail(env: Omit<Env, 'MEDIA'>, p: any, doFetch: Fetch): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  const res = await doFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM ?? 'GymEntra <bildirim@salt-tech-apps.com>', to: [p.to], subject: p.subject, text: p.text, ...(p.replyTo ? { reply_to: p.replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}`);
}

/**
 * Delivers due outbox rows. Claiming is one atomic UPDATE ... RETURNING that also leases the row
 * (next_attempt_at = now + lease), so two overlapping runs never deliver the same row, and a crash
 * mid-delivery only delays the retry. Failures back off; after MAX_ATTEMPTS the row is 'dead'
 * (kept for inspection, never silently dropped).
 */
export async function deliverOutbox(env: Omit<Env, 'MEDIA'>, now: number, limit = 50, doFetch: Fetch = fetch) {
  const db = env.DB;
  const { results } = await db.prepare(
    `UPDATE outbox SET attempts = attempts + 1, next_attempt_at = ?
     WHERE id IN (SELECT id FROM outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?)
     RETURNING id, kind, payload, attempts`,
  ).bind(now + LEASE_MS, now, limit).all<Row>();
  let sent = 0, failed = 0, dead = 0;
  for (const row of results) {
    try {
      const payload = JSON.parse(row.payload);
      if (row.kind === 'push') await sendPush(db, payload, doFetch);
      else if (row.kind === 'email') await sendEmail(env, payload, doFetch);
      else throw new Error(`unknown kind ${row.kind}`);
      await db.prepare(`UPDATE outbox SET status = 'sent', last_error = NULL WHERE id = ?`).bind(row.id).run();
      sent++;
    } catch (e) {
      const isDead = row.attempts >= MAX_ATTEMPTS;
      await db.prepare(`UPDATE outbox SET status = ?, next_attempt_at = ?, last_error = ? WHERE id = ?`)
        .bind(isDead ? 'dead' : 'pending', now + backoffMs(row.attempts), String((e as Error).message).slice(0, 300), row.id).run();
      isDead ? dead++ : failed++;
    }
  }
  return { claimed: results.length, sent, failed, dead };
}
