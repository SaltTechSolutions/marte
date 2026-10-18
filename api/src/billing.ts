import { Hono } from 'hono';

import { rolesIn } from './auth';
import type { App } from './guarded';
import type { Env } from './types';

/**
 * Gym subscription (P0-1). `subscription_status` is SERVER-OWNED: the free-tier seat gate reads it, so a
 * client that could write it would own an unlimited gym. The app asks RevenueCat to sell; RevenueCat verifies
 * the receipt with Apple/Google and calls the webhook below. Nothing the phone says is trusted.
 */
export const billing = new Hono<App>();

/** The admin's view of the gym's subscription, including what the webhook last did (read-only: no write route exists). */
billing.get('/tenants/:tenantId/subscription', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!(await rolesIn(c.env.DB, tenantId, c.get('userId'))).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const t = await c.env.DB.prepare(
    `SELECT subscription_status, subscription_plan, subscription_platform, subscription_expires_at, subscription_event_at, subscription_event_id,
            active_member_count FROM tenants WHERE id = ?`,
  ).bind(tenantId).first<any>();
  if (!t) return c.json({ error: 'not found' }, 404);
  return c.json({
    status: t.subscription_status, plan: t.subscription_plan, platform: t.subscription_platform, expiresAt: t.subscription_expires_at,
    lastEventAt: t.subscription_event_at, lastEventId: t.subscription_event_id, activeMemberCount: t.active_member_count,
  });
});

// ---------------------------------------------------------------------------------------------
// RevenueCat webhook. MOUNT OUTSIDE requireAuth: RevenueCat has no Firebase token. Authorisation is a shared
// secret in the Authorization header (RevenueCat does not sign its webhooks, so this header is the only thing
// separating a real event from anyone who learns the URL). Binding: REVENUECAT_WEBHOOK_SECRET.
// ---------------------------------------------------------------------------------------------
export type BillingEnv = Env & { REVENUECAT_WEBHOOK_SECRET?: string };
export const billingWebhook = new Hono<{ Bindings: BillingEnv }>();

/** Event types that mean "this gym is entitled right now". */
const GRANTING = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'SUBSCRIPTION_EXTENDED']);
/**
 * Event types that end entitlement immediately. CANCELLATION is deliberately NOT here: a cancelled subscription
 * runs to the end of the period it was paid for, and EXPIRATION is the event that actually ends it.
 */
const REVOKING = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED', 'REFUND']);

/**
 * Constant-time string equality. Both sides are HMAC'd under a throwaway key first, so the comparison runs over
 * two fixed-size digests whatever the lengths are (a plain === leaks the secret one character at a time).
 */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.sign('HMAC', key, enc.encode(a)), crypto.subtle.sign('HMAC', key, enc.encode(b))]);
  const ax = new Uint8Array(x), ay = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ ay[i];
  return diff === 0;
}

billingWebhook.post('/webhooks/revenuecat', async (c) => {
  // Fail closed: with no secret configured NOTHING is accepted (503 so RevenueCat retries once it is set).
  const expected = (c.env.REVENUECAT_WEBHOOK_SECRET ?? '').trim();
  if (!expected) return c.json({ error: 'webhook not configured' }, 503);

  // "Bearer " is optional and both sides are trimmed: RevenueCat's field is free text people fill with the bare
  // token, and a secret from `openssl rand -base64 32` can carry a stray newline. Neither weakens the check.
  const header = (c.req.header('Authorization') ?? '').trim();
  const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : header;
  if (!presented || !(await safeEqual(presented, expected))) return c.json({ error: 'unauthorized' }, 401);

  const payload = (await c.req.json().catch(() => null)) as { event?: Record<string, unknown> } | null;
  const event = payload?.event;
  if (!event || typeof event !== 'object' || typeof event.type !== 'string' || !event.type) return c.json({ error: 'bad event' }, 400);
  const type = event.type;

  const tenantId = typeof event.app_user_id === 'string' ? event.app_user_id : '';
  // 200 on purpose for events we can never route: RevenueCat retries non-2xx, and that would never drain.
  if (!tenantId) return c.json({ ignored: 'no app_user_id' });
  const known = await c.env.DB.prepare(`SELECT 1 AS x FROM tenants WHERE id = ?`).bind(tenantId).first();
  if (!known) return c.json({ ignored: 'unknown gym' });

  const acting = GRANTING.has(type) || REVOKING.has(type);
  const at = event.event_timestamp_ms;
  // Ordering needs a timestamp. Without one an acting event cannot be placed, and guessing "now" would let a
  // delayed old event overwrite a newer state: refuse it instead (400, the sender can fix and resend).
  if (acting && !(typeof at === 'number' && Number.isFinite(at) && at > 0)) return c.json({ error: 'event_timestamp_ms required' }, 400);
  const eventAt = typeof at === 'number' && Number.isFinite(at) && at > 0 ? Math.trunc(at) : Date.now();
  const eventId = typeof event.id === 'string' && event.id ? event.id : `${type}:${eventAt}:${tenantId}`;

  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [
    // Idempotency + audit: a redelivery is ignored here...
    db.prepare(
      `INSERT OR IGNORE INTO billing_events (event_id, tenant_id, type, event_at, applied, received_at) VALUES (?, ?, ?, ?, 0, ?)`,
    ).bind(eventId, tenantId, type, eventAt, Date.now()),
  ];
  if (GRANTING.has(type)) {
    const exp = Number(event.expiration_at_ms ?? 0);
    const yearly = String(event.period_type ?? '').toUpperCase() === 'ANNUAL' || /annual|year/i.test(String(event.product_id ?? ''));
    stmts.push(db.prepare(
      // ...and the watermark makes the state change itself order-proof: only a STRICTLY newer event may write.
      `UPDATE tenants SET subscription_status = 'active', subscription_plan = ?, subscription_platform = ?, subscription_expires_at = ?,
         subscription_event_at = ?, subscription_event_id = ?
       WHERE id = ? AND (subscription_event_at IS NULL OR subscription_event_at < ?)`,
    ).bind(yearly ? 'yearly' : 'monthly', String(event.store ?? '').toUpperCase() === 'PLAY_STORE' ? 'android' : 'ios',
      exp > 0 ? Math.trunc(exp) : null, eventAt, eventId, tenantId, eventAt));
  } else if (REVOKING.has(type)) {
    stmts.push(db.prepare(
      `UPDATE tenants SET subscription_status = ?, subscription_event_at = ?, subscription_event_id = ?
       WHERE id = ? AND (subscription_event_at IS NULL OR subscription_event_at < ?)`,
    ).bind(type === 'REFUND' ? 'cancelled' : 'expired', eventAt, eventId, tenantId, eventAt));
  }
  // CANCELLATION, BILLING_ISSUE, TRANSFER, TEST and the rest are recorded, not acted on: reacting to an event
  // whose meaning has not been thought through is how a paying gym gets locked out. They never move the watermark.
  if (acting) {
    stmts.push(db.prepare(`UPDATE billing_events SET applied = 1 WHERE event_id = ? AND changes() = 1`).bind(eventId));
  }
  await db.batch(stmts);

  const rec = await db.prepare(`SELECT applied FROM billing_events WHERE event_id = ?`).bind(eventId).first<{ applied: number }>();
  return c.json({ applied: rec?.applied === 1 });
});
