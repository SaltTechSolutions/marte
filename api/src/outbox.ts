/**
 * Statement that records a side effect. Include it in the SAME `db.batch([...])` as the state change
 * so both commit or neither does. `dedupeKey` makes a retried request idempotent (INSERT OR IGNORE).
 *
 * Push payload: { userIds: string[], title: string, body: string, category: 'bookings'|'packages'|'payments'|'programs'|'announcements'|'account', data?: object }
 * (every category except 'account' can be switched off by the recipient in user_settings)
 * E-mail payload: { to: string, subject: string, text: string, replyTo?: string }
 */
export function outboxStatement(
  db: D1Database,
  kind: 'push' | 'email',
  payload: Record<string, unknown>,
  dedupeKey?: string,
): D1PreparedStatement {
  const id = 'ob' + [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  return db.prepare(
    `INSERT OR IGNORE INTO outbox (id, kind, payload, dedupe_key, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, kind, JSON.stringify(payload), dedupeKey ?? null, now, now);
}
