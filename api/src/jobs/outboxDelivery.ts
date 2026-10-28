import type { Env } from '../types';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60_000;
type Fetch = typeof fetch;
const MUTABLE = ['bookings', 'packages', 'payments', 'programs', 'announcements'];

type Row = { id: string; kind: string; payload: string; attempts: number };

/** Exponential backoff: 1, 2, 4 ... minutes, capped at one hour. */
export const backoffMs = (attempts: number) => Math.min(2 ** (attempts - 1) * 60_000, 3_600_000);

/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH = 100;
/** D1 allows at most 100 bound parameters per statement; leave room for the one extra `?` some queries carry. */
const D1_IN_CHUNK = 90;

const chunks = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

/**
 * Some Expo batches failed. `remaining` are the tokens whose batch was NOT accepted; the delivery loop stores
 * them in the row's payload (`retryTokens`) so the retry sends only those and never re-sends a batch Expo
 * already accepted.
 */
class PartialPushError extends Error {
  constructor(message: string, readonly remaining: string[]) { super(message); }
}

/**
 * Push delivery, chunked to stay inside the platform limits (Expo: 100 messages/request; D1: 100 bound
 * parameters/statement).
 *
 * Chunk-failure semantics: every batch is attempted, a failing batch never stops the others. Tokens Expo
 * reported as DeviceNotRegistered are pruned from the batches that succeeded. If any batch failed, the row
 * fails (so it backs off and retries, then goes 'dead' after MAX_ATTEMPTS: never silently dropped) and its
 * payload is rewritten to `retryTokens` = the failed batches only. A retry therefore re-sends nothing that
 * was already accepted. On a retry each stored token is re-checked against its CURRENT owner: a token that
 * moved to another user (someone signed in on the same phone) or was deleted (erased account) is dropped, so a
 * message never reaches a person who was not a recipient.
 * Remaining duplicate window: a crash between a successful Expo response and the outbox update re-sends the
 * batches of that run (at-least-once, same as before chunking). A failing dead-token prune after an accepted
 * batch is logged and does NOT fail the batch, so it cannot cause a re-send.
 */
async function sendPush(db: D1Database, p: any, doFetch: Fetch): Promise<void> {
  let tokens: string[];
  if (Array.isArray(p.retryTokens)) {
    // Already filtered by preference on the first attempt; ownership is checked again (one chunked query).
    const recipients = new Set<string>(p.userIds ?? []);
    const stored = [...new Set<string>(p.retryTokens)];
    tokens = [];
    for (const part of chunks(stored, D1_IN_CHUNK)) {
      const marks = part.map(() => '?').join(',');
      const { results } = await db.prepare(`SELECT token, user_id FROM push_tokens WHERE token IN (${marks})`).bind(...part).all<{ token: string; user_id: string }>();
      for (const r of results) if (recipients.has(r.user_id)) tokens.push(r.token);
    }
  } else {
    const userIds = [...new Set<string>(p.userIds ?? [])];
    const category: string = p.category ?? 'account';
    let wanted = userIds;
    if (MUTABLE.includes(category) && userIds.length) {
      // Muted = the stored answer is explicitly false/0; an absent answer means yes.
      const muted = new Set<string>();
      for (const part of chunks(userIds, D1_IN_CHUNK)) {
        const marks = part.map(() => '?').join(',');
        const { results } = await db.prepare(
          `SELECT user_id FROM user_settings WHERE json_extract(notifications, '$.' || ?) = 0 AND user_id IN (${marks})`,
        ).bind(category, ...part).all<{ user_id: string }>();
        for (const r of results) muted.add(r.user_id);
      }
      wanted = userIds.filter((u) => !muted.has(u));
    }
    if (!wanted.length) return;
    const found = new Set<string>();
    for (const part of chunks(wanted, D1_IN_CHUNK)) {
      const marks = part.map(() => '?').join(',');
      const { results } = await db.prepare(`SELECT token FROM push_tokens WHERE user_id IN (${marks})`).bind(...part).all<{ token: string }>();
      for (const r of results) found.add(r.token);
    }
    tokens = [...found];
  }
  if (!tokens.length) return;                            // nobody to notify is success, not an error

  const remaining: string[] = [];
  let firstError = '';
  let failedBatches = 0;
  for (const batch of chunks(tokens, EXPO_BATCH)) {
    const messages = batch.map((to) => ({ to, title: p.title, body: p.body, sound: 'default', ...(p.data ? { data: p.data } : {}) }));
    try {
      const res = await doFetch(EXPO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(messages) });
      if (!res.ok) throw new Error(`expo ${res.status}`);
      const out = (await res.json().catch(() => null)) as { data?: { details?: { error?: string } }[] } | null;
      const dead = (out?.data ?? []).map((t, i) => (t?.details?.error === 'DeviceNotRegistered' ? batch[i] : null)).filter((t): t is string => !!t);
      if (dead.length) {
        // The batch is already accepted: a prune failure must not put it back in the retry list (double send).
        await db.batch(dead.map((t) => db.prepare(`DELETE FROM push_tokens WHERE token = ?`).bind(t)))
          .catch((e) => console.error(JSON.stringify({ push: 'dead-token prune failed', error: String((e as Error).message).slice(0, 200) })));
      }
    } catch (e) {
      failedBatches++;
      remaining.push(...batch);
      firstError ||= (e as Error).message;
    }
  }
  if (remaining.length) {
    const total = chunks(tokens, EXPO_BATCH).length;
    throw new PartialPushError(`${firstError} (${failedBatches}/${total} batches failed)`, remaining);
  }
}

async function sendEmail(env: Omit<Env, 'MEDIA'>, p: any, doFetch: Fetch): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');
  // A recipient is either an address in the payload or the NAME of a Worker var, resolved now (delivery time), so
  // no address has to live in the repo or in the row and a late-set var delivers rows that were waiting.
  let to: string | undefined = p.to;
  if (!to && p.toEnv === 'EXERCISE_REPORT_TO') to = env.EXERCISE_REPORT_TO?.trim();
  if (!to) throw new Error(`${p.toEnv ?? 'recipient'} not configured`);
  const res = await doFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM ?? 'GymEntra <bildirim@salt-tech-apps.com>', to: [to], subject: p.subject, text: p.text, ...(p.replyTo ? { reply_to: p.replyTo } : {}) }),
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
      // A partly delivered push keeps only its undelivered tokens, so a retry cannot double-send the rest.
      const payload = e instanceof PartialPushError ? JSON.stringify({ ...JSON.parse(row.payload), retryTokens: e.remaining }) : row.payload;
      await db.prepare(`UPDATE outbox SET status = ?, next_attempt_at = ?, last_error = ?, payload = ? WHERE id = ?`)
        .bind(isDead ? 'dead' : 'pending', now + backoffMs(row.attempts), String((e as Error).message).slice(0, 300), payload, row.id).run();
      isDead ? dead++ : failed++;
    }
  }
  return { claimed: results.length, sent, failed, dead };
}
