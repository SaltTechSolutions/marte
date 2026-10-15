import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });
const T1 = '/v1/tenants/t1';

// Rows the matrix first marked GAP; the API was fixed and the todo became a test.
describe('matrix fixes', () => {
  it('[L2701] hiring staff is never paywalled and takes no member seat', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer'], { status: 'pending' });
    await h.run(`UPDATE tenants SET active_member_count = 10`);
    expect((await h.send('PUT', `${T1}/members/u-coach/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
    expect((await h.one(`SELECT active_member_count c FROM tenants`)).c).toBe(10);   // unchanged
    // a plain member is still blocked at the cap
    await h.addUser('u-new', ['member'], { status: 'pending' });
    expect((await h.send('PUT', `${T1}/members/u-new/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
  });

  it('[L2701] a staff member leaving does not free a member seat', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    await h.run(`UPDATE tenants SET active_member_count = 5`);
    expect((await h.send('POST', `${T1}/leave`, 'fb-coach')).status).toBe(200);
    expect((await h.one(`SELECT active_member_count c FROM tenants`)).c).toBe(5);
  });

  it('[L2701] adding or dropping the member role moves the seat counter', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    await h.run(`UPDATE tenants SET active_member_count = 5`);
    expect((await h.send('PUT', `${T1}/members/u-coach/roles`, 'fb-admin', { roles: ['trainer', 'member'] })).status).toBe(200);
    expect((await h.one(`SELECT active_member_count c FROM tenants`)).c).toBe(6);
    expect((await h.send('PUT', `${T1}/members/u-coach/roles`, 'fb-admin', { roles: ['trainer'] })).status).toBe(200);
    expect((await h.one(`SELECT active_member_count c FROM tenants`)).c).toBe(5);
  });

  it('[L2901] an approved guardian reads the child\'s credits and check-ins; a pending one does not', async () => {
    const h = await harness();
    await h.addUser('u-par', null);
    await h.run(`UPDATE memberships SET guardian_id='u-par', guardian_status='approved' WHERE member_id='u-mem'`);
    expect((await h.send('GET', `${T1}/members/u-mem/credits`, 'fb-par')).status).toBe(200);
    expect((await h.send('GET', `${T1}/members/u-mem/checkins`, 'fb-par')).status).toBe(200);
    await h.run(`UPDATE memberships SET guardian_status='pending' WHERE member_id='u-mem'`);
    expect((await h.send('GET', `${T1}/members/u-mem/credits`, 'fb-par')).status).toBe(403);
    expect((await h.send('GET', `${T1}/members/u-mem/checkins`, 'fb-par')).status).toBe(403);
  });

  it('check-in history: self, admin or `checkin` permission; other members denied', async () => {
    const h = await harness();
    await h.addUser('u-oth', ['member']);
    await h.addUser('u-desk', ['member'], { permissions: ['checkin'] });
    await h.run(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES ('c1','t1','u-mem','{"accessReason":"ok"}',1)`);
    for (const [sub, code] of [['fb-mem', 200], ['fb-admin', 200], ['fb-desk', 200], ['fb-oth', 403], [null, 401]] as const) {
      expect((await h.send('GET', `${T1}/members/u-mem/checkins`, sub)).status, String(sub)).toBe(code);
    }
  });

  it('[L1486] exerciseId is capped at 64 characters', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    const post = (id: string) => h.send('POST', `${T1}/exercise-reports`, 'fb-coach', { exerciseId: id, reason: 'pose', note: 'x' });
    expect((await post('a'.repeat(65))).status).toBe(400);
    expect((await post('a'.repeat(64))).status).toBe(201);
  });

  it('read DTOs: client-supplied id/tenantId in the body can never override the real columns', async () => {
    const h = await harness();
    await h.addUser('u-coach', ['trainer']);
    const res = await h.send('POST', `${T1}/program-templates`, 'fb-coach', { id: 'evil', tenantId: 't2', name: 'A' });
    const { id } = (await res.json()) as { id: string };
    const list = (await (await h.send('GET', '/v1/program-templates', 'fb-coach')).json()) as { id: string; tenantId: string }[];
    expect(list[0]).toMatchObject({ id, tenantId: 't1' });
  });
});
