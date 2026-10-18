import { Hono } from 'hono';

import { requireAuth } from '../src/auth';
import { account } from '../src/account';
import { billing, billingWebhook, type BillingEnv } from '../src/billing';
import { guardians } from '../src/guardians';
import { membership } from '../src/membership';
import { reads2 } from '../src/reads2';
import { reads3 } from '../src/reads3';
import { tenants } from '../src/tenants';
import type { Vars } from '../src/types';
import { writes } from '../src/writes';
import { PROJECT, harness } from './helpers';

/**
 * Harness for the tenants / guardians / account / billing routers. They are mounted on a LOCAL app, exactly the
 * way index.ts must mount them (webhook before requireAuth, the rest behind it), so these tests do not depend on
 * index.ts. `membership`, `writes` and the member reads ride along for the cross-checks (join, roles, payments read) the matrix rows need.
 */
export async function sliceHarness(secret?: string) {
  const h = await harness();
  const app = new Hono<{ Bindings: BillingEnv; Variables: Vars }>();
  app.route('/v1', billingWebhook);
  app.use('/v1/*', requireAuth);
  for (const r of [tenants, guardians, account, billing, membership, writes, reads2, reads3]) app.route('/v1', r as never);
  const env = { DB: h.db, FIREBASE_PROJECT_ID: PROJECT, REVENUECAT_WEBHOOK_SECRET: secret } as unknown as BillingEnv;

  const send = async (method: string, path: string, sub: string | null, body?: object) =>
    app.fetch(new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(sub ? { Authorization: `Bearer ${await h.sign(sub)}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }), env);
  /** RevenueCat-style webhook call. `auth` undefined = no header. `raw` overrides the JSON body. */
  const hook = (event: object | null, auth?: string, raw?: string) =>
    app.fetch(new Request('http://x/v1/webhooks/revenuecat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth !== undefined ? { Authorization: auth } : {}) },
      body: raw ?? JSON.stringify(event === null ? {} : { event }),
    }), env);
  const json = async (r: Response) => (await r.json()) as any;
  return { ...h, send, hook, json, app, env };
}
