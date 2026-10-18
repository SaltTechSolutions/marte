import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

describe('single-record and gym-wide reads', () => {
  it('programs: staff list the gym (with memberId); single reads follow the member/staff/guardian audience; strangers get 404', async () => {
    const h = await harness();
    await h.addUser('u-trn', ['trainer']);
    await h.addUser('u-oth', ['member']);
    await h.addUser('u-par', null);
    await h.run(`UPDATE memberships SET guardian_id='u-par', guardian_status='approved' WHERE member_id='u-mem'`);
    await h.run(`INSERT INTO programs (id, tenant_id, member_id, data, updated_at) VALUES ('p1','t1','u-mem','{"status":"active","name":"A"}',5), ('p2','t1','u-oth','{"status":"draft"}',4)`);
    await h.run(`INSERT INTO workout_logs (id, tenant_id, member_id, data, logged_at) VALUES ('w1','t1','u-mem','{"programId":"p1"}',7)`);
    const list = (await (await h.send('GET', '/v1/tenants/t1/programs', 'fb-trn')).json()) as any[];
    expect(list.map((p) => [p.id, p.memberId])).toEqual([['p1', 'u-mem'], ['p2', 'u-oth']]);
    expect(((await (await h.send('GET', '/v1/tenants/t1/programs?status=active', 'fb-trn')).json()) as any[]).map((p) => p.id)).toEqual(['p1']);
    expect((await h.send('GET', '/v1/tenants/t1/programs', 'fb-mem')).status).toBe(403);
    for (const [sub, code] of [['fb-mem', 200], ['fb-trn', 200], ['fb-par', 200], ['fb-oth', 404], [null, 401]] as const) {
      expect((await h.send('GET', '/v1/programs/p1', sub)).status, `program ${sub}`).toBe(code);
      expect((await h.send('GET', '/v1/workout-logs/w1', sub)).status, `log ${sub}`).toBe(code);
    }
    expect((await h.send('GET', '/v1/programs/ghost', 'fb-trn')).status).toBe(404);
    const mine = (await (await h.send('GET', '/v1/tenants/t1/members/u-mem/programs', 'fb-mem')).json()) as any[];
    expect(mine[0].memberId).toBe('u-mem');
  });

  it('template by id: global or own gym only', async () => {
    const h = await harness();
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','O',1)`);
    await h.run(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES ('g',NULL,'{"n":1}',1), ('mine','t1','{"n":2}',1), ('theirs','t2','{"n":3}',1)`);
    expect((await h.send('GET', '/v1/program-templates/g', 'fb-mem')).status).toBe(200);
    expect((await h.send('GET', '/v1/program-templates/mine', 'fb-mem')).status).toBe(200);
    expect((await h.send('GET', '/v1/program-templates/theirs', 'fb-mem')).status).toBe(404);
  });
});

describe('single package / promotion reads', () => {
  it('package: any active member; promotion: staff; both 404 for an unknown id and never cross gyms', async () => {
    const h = await harness();
    await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('g1','t1','{"name":"Aylık"}')`);
    await h.run(`INSERT INTO promotions (id, tenant_id, data) VALUES ('pr1','t1','{"name":"P"}')`);
    expect(((await (await h.send('GET', '/v1/tenants/t1/packages/g1', 'fb-mem')).json()) as any).name).toBe('Aylık');
    expect((await h.send('GET', '/v1/tenants/t1/packages/nope', 'fb-mem')).status).toBe(404);
    expect((await h.send('GET', '/v1/tenants/t1/promotions/pr1', 'fb-mem')).status).toBe(403);
    expect((await h.send('GET', '/v1/tenants/t1/promotions/pr1', 'fb-admin')).status).toBe(200);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','O',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-admin','active','["admin"]',1)`);
    expect((await h.send('GET', '/v1/tenants/t2/packages/g1', 'fb-admin')).status).toBe(404);   // id from another gym
  });
});
