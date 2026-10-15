import { Hono } from 'hono';

import { requireAuth, requireRole } from './auth';
import { reads } from './reads';
import { reads2 } from './reads2';
import { reads3 } from './reads3';
import { membership } from './membership';
import { writes } from './writes';
import { createManagedMember } from './managedMembers';
import { setAdminNote } from './notes';
import type { Env, Vars } from './types';

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.get('/healthz', (c) => c.json({ ok: true }));

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
app.route('/v1', membership);
app.route('/v1', writes);
app.post('/v1/tenants/:tenantId/members/managed', requireRole('admin'), createManagedMember);
app.put('/v1/tenants/:tenantId/members/:memberId/admin-note', requireRole('admin'), setAdminNote);

export default app;
