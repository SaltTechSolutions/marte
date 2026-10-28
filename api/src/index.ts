import { Hono } from 'hono';

import { requireAuth, requireRole } from './auth';
import { reads } from './reads';
import { reads2 } from './reads2';
import { reads3 } from './reads3';
import { reads4 } from './reads4';
import { reads5 } from './reads5';
import { membership } from './membership';
import { writes } from './writes';
import { writes2 } from './writes2';
import { packages } from './packages';
import { pt } from './pt';
import { groupClasses } from './groupClasses';
import { packageLifecycle } from './packageLifecycle';
import { tenants } from './tenants';
import { guardians } from './guardians';
import { account } from './account';
import { memberRemoval } from './memberRemoval';
import { checkins } from './checkins';
import { classSeries } from './classSeries';
import { billing, billingWebhook } from './billing';
import { media, mediaPublic } from './media';
import { runScheduled } from './scheduled';
import { errorMessages } from './errorMessages';
import { createManagedMember } from './managedMembers';
import { setAdminNote } from './notes';
import type { Env, Vars } from './types';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('*', errorMessages);

app.get('/healthz', (c) => c.json({ ok: true }));

// RevenueCat authenticates with a shared secret, not a Firebase token: mounted BEFORE the auth gate.
app.route('/v1', billingWebhook as never);
app.route('/', mediaPublic as never);       // /media/* (public, unguessable keys)

/**
 * Maintenance gate (fail closed). Production stays shut until the data import and reconcile are done: unless the
 * var API_OPEN is exactly "1", every /v1 route answers 503 {"error":"maintenance"}. Unset, empty or any other
 * value means closed. It sits HERE on purpose: after /healthz, the RevenueCat webhook (it has its own fail-closed
 * 503 when its secret is unset) and public /media, which are mounted above and answer without reaching it, and
 * before requireAuth and every router below, so no authenticated route can be reached around it.
 */
app.use('/v1/*', async (c, next) => {
  if (c.env.API_OPEN !== '1') return c.json({ error: 'maintenance' }, 503);
  await next();
});

app.use('/v1/*', requireAuth);

app.get('/v1/me', async (c) => {
  const userId = c.get('userId');
  if (!userId) return c.json({ userId: null, memberships: [] });
  const { results } = await c.env.DB.prepare(
    `SELECT tenant_id, roles, status FROM memberships WHERE member_id = ?`,
  ).bind(userId).all<{ tenant_id: string; roles: string; status: string }>();
  return c.json({
    userId,
    memberships: results.map((r) => ({ tenantId: r.tenant_id, roles: JSON.parse(r.roles), status: r.status })),
  });
});

app.route('/v1', reads);
app.route('/v1', reads2);
app.route('/v1', reads3);
app.route('/v1', reads4);
app.route('/v1', reads5);
app.route('/v1', membership);
app.route('/v1', writes);
app.route('/v1', writes2);
app.route('/v1', packages);
app.route('/v1', packageLifecycle);
app.route('/v1', groupClasses);
app.route('/v1', pt);
app.route('/v1', tenants);
app.route('/v1', guardians);
app.route('/v1', account);
app.route('/v1', memberRemoval);
app.route('/v1', checkins);
app.route('/v1', classSeries);
app.route('/v1', billing);
app.route('/v1', media);
app.post('/v1/tenants/:tenantId/members/managed', requireRole('admin'), createManagedMember);
app.put('/v1/tenants/:tenantId/members/:memberId/admin-note', requireRole('admin'), setAdminNote);

export { app };
export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(env, event.cron).then((r) => console.log(JSON.stringify({ cron: event.cron, ...r }))));
  },
};
