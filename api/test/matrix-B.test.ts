import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

/** Rules-test matrix, chunk B (rows 72..134). Test names start with [L<line>] = source line in firestore.rules.test.ts. */
// Many agents share this machine; keep the per-test budget generous.
vi.setConfig({ testTimeout: 120_000 });

async function world() {
  const h = await harness();
  await h.addUser('u-trn', ['trainer']);
  await h.addUser('u-mem2', ['member']);
  await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
  await h.addUser('u-out', null);
  await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-out','active','["member"]',1)`);
  return h;
}
const json = async (r: Response) => (await r.json()) as any;

describe('matrix B: profile (PER-20)', () => {
  it('[L1230] member sets own height and photo; absurd height refused', async () => {
    const h = await world();
    const p = '/v1/tenants/t1/members/u-mem/details';
    expect((await h.send('PATCH', p, 'fb-mem', { heightCm: 178 })).status).toBe(200);
    expect((await h.send('PATCH', p, 'fb-mem', { photoUrl: 'https://x/avatar.jpg?token=t' })).status).toBe(200);
    expect((await h.send('PATCH', p, 'fb-mem', { heightCm: 12 })).status).toBe(400);
    const row = await h.one(`SELECT height_cm, photo_url FROM memberships WHERE member_id = 'u-mem'`);
    expect(row).toEqual({ height_cm: 178, photo_url: 'https://x/avatar.jpg?token=t' });
  });

  it('[L1238] admin corrects height of a managed member; height cannot ride along on a role change', async () => {
    const h = await world();
    await h.run(`INSERT INTO users (id, display_name, created_at) VALUES ('mm1','Elle',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, managed, created_by, requested_at) VALUES ('t1','mm1','active','["member"]',1,'u-admin',1)`);
    expect((await h.send('PATCH', '/v1/tenants/t1/members/mm1/details', 'fb-admin', { heightCm: 180 })).status).toBe(200);
    expect((await h.one(`SELECT height_cm h FROM memberships WHERE member_id='mm1'`)).h).toBe(180);
    // The role endpoint ignores height entirely: it is a different route with a different write set.
    await h.send('PUT', '/v1/tenants/t1/members/mm1/roles', 'fb-admin', { roles: ['member', 'trainer'], heightCm: 181 });
    expect((await h.one(`SELECT height_cm h FROM memberships WHERE member_id='mm1'`)).h).toBe(180);
  });

  it('[L1253] admin does not correct the height of a member who signed up themself', async () => {
    const h = await world();
    expect((await h.send('PATCH', '/v1/tenants/t1/members/u-mem/details', 'fb-admin', { heightCm: 180 })).status).toBe(403);
    expect((await h.one(`SELECT height_cm h FROM memberships WHERE member_id='u-mem'`)).h).toBeNull();
  });
});

describe('matrix B: announcements (PER-16)', () => {
  it('[L1263] admin posts; members and trainers read', async () => {
    const h = await world();
    const res = await h.send('POST', '/v1/tenants/t1/announcements', 'fb-admin', { title: 'Pazar kapalıyız', body: '' });
    expect(res.status).toBe(201);
    for (const sub of ['fb-mem', 'fb-trn']) {
      const list = await json(await h.send('GET', '/v1/tenants/t1/announcements', sub));
      expect(list.map((a: any) => a.title)).toEqual(['Pazar kapalıyız']);
    }
  });

  it('[L1272] member/trainer cannot post; nobody edits; admin deletes', async () => {
    const h = await world();
    const post = (sub: string) => h.send('POST', '/v1/tenants/t1/announcements', sub, { title: 'x', body: '' });
    expect((await post('fb-mem')).status).toBe(403);
    expect((await post('fb-trn')).status).toBe(403);
    const { id } = await json(await h.send('POST', '/v1/tenants/t1/announcements', 'fb-admin', { title: 'a', body: '' }));
    // No edit route exists at all (update: false in the rules).
    expect((await h.send('PUT', `/v1/tenants/t1/announcements/${id}`, 'fb-admin', { title: 'Düzenlendi' })).status).toBe(404);
    expect((await h.send('PATCH', `/v1/tenants/t1/announcements/${id}`, 'fb-admin', { title: 'Düzenlendi' })).status).toBe(404);
    expect((await h.one(`SELECT title t FROM announcements WHERE id = ?`, id)).t).toBe('a');
    expect((await h.send('DELETE', `/v1/tenants/t1/announcements/${id}`, 'fb-trn')).status).toBe(403);
    expect((await h.send('DELETE', `/v1/tenants/t1/announcements/${id}`, 'fb-admin')).status).toBe(200);
    expect(await h.one(`SELECT 1 x FROM announcements WHERE id = ?`, id)).toBeNull();
  });

  it('[L1283] outsider cannot read; blank title refused', async () => {
    const h = await world();
    await h.send('POST', '/v1/tenants/t1/announcements', 'fb-admin', { title: 'a', body: '' });
    expect((await h.send('GET', '/v1/tenants/t1/announcements', 'fb-new')).status).toBe(403);
    expect((await h.send('GET', '/v1/tenants/t1/announcements', 'fb-out')).status).toBe(403);   // member of ANOTHER gym
    expect((await h.send('POST', '/v1/tenants/t1/announcements', 'fb-admin', { title: '', body: '' })).status).toBe(400);
    expect((await h.send('POST', '/v1/tenants/t1/announcements', 'fb-admin', { title: '   ', body: '' })).status).toBe(400);
  });
});

describe('matrix B: empty deterministic documents', () => {
  it('[L1306] member_entitlements: a member with no packages can read their (empty) list', async () => {
    const h = await world();
    const res = await h.send('GET', '/v1/tenants/t1/members/u-mem/packages', 'fb-mem');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('[L1313] trainer_availability: unset hours are not a permission error (404 for members, 403 for outsiders)', async () => {
    const h = await world();
    const p = '/v1/tenants/t1/trainers/u-trn/availability';
    expect((await h.send('GET', p, 'fb-mem')).status).toBe(404);   // authorised; nothing there yet
    expect((await h.send('GET', p, 'fb-new')).status).toBe(403);
    await h.send('PUT', p, 'fb-trn', { weekly: {}, slotMinutes: 60 });
    expect((await h.send('GET', p, 'fb-mem')).status).toBe(200);
  });

  it('[L1320] member_notes: staff reads a never-written note as empty, not an error', async () => {
    const h = await world();
    const res = await h.send('GET', '/v1/tenants/t1/members/u-mem/note', 'fb-admin');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: '' });
  });
});

describe('matrix B: renewal requests (PER-15)', () => {
  const P = '/v1/tenants/t1/renewal-request';
  it('[L1338] member opens a renewal request for themselves and reads it', async () => {
    const h = await world();
    const res = await h.send('POST', P, 'fb-mem', { note: 'yenile' });
    expect(res.status).toBe(201);
    expect((await json(res)).id).toBe('t1_u-mem');
    const list = await json(await h.send('GET', '/v1/tenants/t1/renewal-requests', 'fb-mem'));
    expect(list.map((r: any) => [r.id, r.status])).toEqual([['t1_u-mem', 'pending']]);
  });

  it('[L1345] member can subscribe (list) before any request exists', async () => {
    const h = await world();
    const res = await h.send('GET', '/v1/tenants/t1/renewal-requests', 'fb-mem');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('[L1357] an empty state is not a hole: a member never sees another member\'s request', async () => {
    const h = await world();
    await h.send('POST', P, 'fb-mem2', {});
    const mine = await json(await h.send('GET', '/v1/tenants/t1/renewal-requests', 'fb-mem'));
    expect(mine).toEqual([]);
    expect((await h.send('GET', '/v1/tenants/t1/renewal-requests', 'fb-out')).status).toBe(403);
  });

  it('[L1367] not for someone else, not under a foreign id: the id is always tenant_caller', async () => {
    const h = await world();
    const res = await h.send('POST', P, 'fb-mem', { memberId: 'u-mem2', id: 'free-id', tenantId: 't2' });
    expect(res.status).toBe(201);
    expect((await h.one(`SELECT id, member_id, tenant_id FROM renewal_requests`))).toEqual({ id: 't1_u-mem', member_id: 'u-mem', tenant_id: 't1' });
    expect((await h.send('POST', P, 'fb-out', {})).status).toBe(403);   // not a member of t1
  });

  it('[L1374] member can withdraw, then open again (api.test "F2 writes: renewal" covers it; re-asserted here)', async () => {
    const h = await world();
    await h.send('POST', P, 'fb-mem', {});
    await h.send('POST', `${P}/withdraw`, 'fb-mem');
    expect((await h.one(`SELECT status s FROM renewal_requests`)).s).toBe('withdrawn');
    expect((await h.send('POST', P, 'fb-mem', {})).status).toBe(201);
    expect((await h.one(`SELECT status s FROM renewal_requests`)).s).toBe('pending');
  });

  it('[L1382] staff read it; admin closes it as handled; trainer cannot', async () => {
    const h = await world();
    await h.send('POST', P, 'fb-mem', {});
    const asTrainer = await json(await h.send('GET', '/v1/tenants/t1/renewal-requests', 'fb-trn'));
    expect(asTrainer).toHaveLength(1);
    expect((await h.send('POST', '/v1/tenants/t1/renewal-requests/t1_u-mem/handle', 'fb-trn')).status).toBe(403);
    expect((await h.one(`SELECT status s FROM renewal_requests`)).s).toBe('pending');
    expect((await h.send('POST', '/v1/tenants/t1/renewal-requests/t1_u-mem/handle', 'fb-admin')).status).toBe(200);
    expect(await h.one(`SELECT status s, handled_by b FROM renewal_requests`)).toEqual({ s: 'handled', b: 'u-admin' });
    expect((await json(await h.send('GET', '/v1/tenants/t1/renewal-requests', 'fb-admin')))[0].status).toBe('handled');
  });

  it('[L1392] another member cannot read it', async () => {
    const h = await world();
    await h.send('POST', P, 'fb-mem', {});
    expect(await json(await h.send('GET', '/v1/tenants/t1/renewal-requests', 'fb-mem2'))).toEqual([]);
  });
});

describe('matrix B: trainer note (PER-14c)', () => {
  const N = '/v1/tenants/t1/members/u-mem/note';
  it('[L1406] trainer writes and reads a note', async () => {
    const h = await world();
    expect((await h.send('PUT', N, 'fb-trn', { text: 'Sol diz' })).status).toBe(200);
    expect((await json(await h.send('GET', N, 'fb-trn'))).text).toBe('Sol diz');
  });

  it('[L1413] admin reads and edits the same note (one per member)', async () => {
    const h = await world();
    await h.send('PUT', N, 'fb-trn', { text: 'Sol diz' });
    expect((await json(await h.send('GET', N, 'fb-admin'))).text).toBe('Sol diz');
    expect((await h.send('PUT', N, 'fb-admin', { text: 'Güncellendi' })).status).toBe(200);
    expect(await h.one(`SELECT count(*) c FROM member_notes`)).toEqual({ c: 1 });
    expect((await h.one(`SELECT text t, updated_by u FROM member_notes`))).toEqual({ t: 'Güncellendi', u: 'u-admin' });
  });

  it('[L1422] the member cannot read the note about themselves', async () => {
    const h = await world();
    await h.send('PUT', N, 'fb-trn', { text: 'gizli' });
    expect((await h.send('GET', N, 'fb-mem')).status).toBe(403);
  });

  it('[L1430] a note cannot be re-addressed: tenant and member come only from the path', async () => {
    const h = await world();
    expect((await h.send('PUT', N, 'fb-trn', { text: 'x', memberId: 'u-mem2', tenantId: 't2' })).status).toBe(200);
    expect(await h.one(`SELECT tenant_id t, member_id m FROM member_notes`)).toEqual({ t: 't1', m: 'u-mem' });
    // A member id that is not in the gym cannot receive a note; neither can another gym via a t1 trainer.
    expect((await h.send('PUT', '/v1/tenants/t1/members/u-out/note', 'fb-trn', { text: 'x' })).status).toBe(404);
    expect((await h.send('PUT', '/v1/tenants/t2/members/u-out/note', 'fb-trn', { text: 'x' })).status).toBe(403);
  });

  it('[L1436] updatedBy is the writer; empty and oversize text refused', async () => {
    const h = await world();
    expect((await h.send('PUT', N, 'fb-trn', { text: 'x', updatedBy: 'someone-else' })).status).toBe(200);
    expect((await h.one(`SELECT updated_by u FROM member_notes`)).u).toBe('u-trn');
    expect((await h.send('PUT', N, 'fb-trn', { text: '' })).status).toBe(400);
    expect((await h.send('PUT', N, 'fb-trn', { text: 'x'.repeat(2001) })).status).toBe(400);
    expect((await h.send('PUT', N, 'fb-trn', { text: 'x'.repeat(2000) })).status).toBe(200);
  });
});

describe('matrix B: exercise reports (PER-19)', () => {
  const R = '/v1/tenants/t1/exercise-reports';
  const rep = (o: object = {}) => ({ exerciseId: 'back-squat', exerciseName: 'Back squat', reason: 'pose', note: 'diz açısı', ...o });
  it('[L1456] trainer files a report', async () => {
    const h = await world();
    expect((await h.send('POST', R, 'fb-trn', rep())).status).toBe(201);
    expect(await h.one(`SELECT tenant_id t, reported_by r FROM exercise_reports`)).toEqual({ t: 't1', r: 'u-trn' });
  });
  it('[L1462] admin files a report', async () => {
    const h = await world();
    expect((await h.send('POST', R, 'fb-admin', rep())).status).toBe(201);
  });
  it('[L1468] a member cannot', async () => {
    const h = await world();
    expect((await h.send('POST', R, 'fb-mem', rep())).status).toBe(403);
    expect(await h.one(`SELECT 1 x FROM exercise_reports`)).toBeNull();
  });
  it('[L1474] staff of one gym cannot file against another gym', async () => {
    const h = await world();
    expect((await h.send('POST', '/v1/tenants/t2/exercise-reports', 'fb-trn', rep())).status).toBe(403);
    expect(await h.one(`SELECT 1 x FROM exercise_reports`)).toBeNull();
  });
  it('[L1480] the reporter cannot be someone else', async () => {
    const h = await world();
    await h.send('POST', R, 'fb-trn', rep({ reportedBy: 'u-admin' }));
    expect((await h.one(`SELECT reported_by r FROM exercise_reports`)).r).toBe('u-trn');
  });
  it('[L1486] reason must be a known kind; note is bounded', async () => {
    const h = await world();
    expect((await h.send('POST', R, 'fb-trn', rep({ reason: 'whatever' }))).status).toBe(400);
    expect((await h.send('POST', R, 'fb-trn', rep({ note: 'x'.repeat(501) }))).status).toBe(400);
    expect((await h.send('POST', R, 'fb-trn', rep({ note: 'x'.repeat(500) }))).status).toBe(201);
    expect((await h.send('POST', R, 'fb-trn', rep({ exerciseId: '' }))).status).toBe(400);
  });
  it.todo('[L1486] FIXED in matrix-fixes.test.ts (was GAP): rules cap exerciseId at 64 chars; POST /tenants/:t/exercise-reports accepts any length (not asserted by the rules test itself, but in the rule)');
  it('[L1493] reports are write-only: no read, update or delete route', async () => {
    const h = await world();
    await h.send('POST', R, 'fb-admin', rep());
    const id = (await h.one(`SELECT id FROM exercise_reports`)).id;
    for (const [m, p] of [['GET', R], ['GET', `${R}/${id}`], ['PUT', `${R}/${id}`], ['PATCH', `${R}/${id}`], ['DELETE', `${R}/${id}`]] as const) {
      expect((await h.send(m, p, 'fb-admin', m === 'GET' || m === 'DELETE' ? undefined : { note: 'x' })).status, `${m} ${p}`).toBe(404);
    }
    expect((await h.one(`SELECT note n FROM exercise_reports`)).n).toBe('diz açısı');
  });
});

describe('matrix B: push tokens', () => {
  const tok = 'ExponentPushToken[mine]';
  it('[L1506] nobody can read push tokens: no read route', async () => {
    const h = await world();
    await h.send('PUT', '/v1/me/push-token', 'fb-mem', { token: tok, platform: 'ios', tenantId: 't1' });
    for (const sub of ['fb-mem', 'fb-admin']) {
      expect((await h.send('GET', '/v1/me/push-token', sub)).status).toBe(404);
      expect((await h.send('GET', `/v1/me/push-token?token=${encodeURIComponent(tok)}`, sub)).status).toBe(404);
    }
  });
  it('[L1514] register/remove own token only; cannot delete somebody else\'s', async () => {
    const h = await world();
    expect((await h.send('PUT', '/v1/me/push-token', 'fb-mem', { token: tok, platform: 'ios', tenantId: 't1' })).status).toBe(200);
    expect((await h.one(`SELECT user_id u FROM push_tokens`)).u).toBe('u-mem');       // user comes from the token, not the body
    await h.send('DELETE', `/v1/me/push-token?token=${encodeURIComponent(tok)}`, 'fb-admin');
    expect(await h.one(`SELECT 1 x FROM push_tokens`)).not.toBeNull();                // not the owner
    await h.send('DELETE', `/v1/me/push-token?token=${encodeURIComponent(tok)}`, 'fb-mem');
    expect(await h.one(`SELECT 1 x FROM push_tokens`)).toBeNull();
    expect((await h.send('PUT', '/v1/me/push-token', 'fb-out', { token: tok, platform: 'ios', tenantId: 't1' })).status).toBe(403);   // not in that gym
  });
});

describe('matrix B: programs and templates', () => {
  it('[L1534] only staff author a program; a member cannot', async () => {
    const h = await world();
    expect((await h.send('POST', '/v1/tenants/t1/programs', 'fb-mem', { memberId: 'u-mem', name: 'x' })).status).toBe(403);
    expect((await h.send('POST', '/v1/tenants/t1/programs', 'fb-trn', { memberId: 'u-mem', name: 'x' })).status).toBe(201);
  });
  it('[L1549] a member reads their own program, not another member\'s', async () => {
    const h = await world();
    await h.run(`INSERT INTO programs (id, tenant_id, member_id, data, updated_at) VALUES ('p-mine','t1','u-mem','{"n":1}',1), ('p-theirs','t1','u-mem2','{"n":2}',1)`);
    const mine = await json(await h.send('GET', '/v1/tenants/t1/members/u-mem/programs', 'fb-mem'));
    expect(mine.map((p: any) => p.id)).toEqual(['p-mine']);
    expect((await h.send('GET', '/v1/tenants/t1/members/u-mem2/programs', 'fb-mem')).status).toBe(403);
  });
  it('[L1565] a member can read templates (global + own gym); api.test "program templates" covers the scoping', async () => {
    const h = await world();
    await h.run(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES ('gl',NULL,'{"title":"G"}',1)`);
    const ids = (await json(await h.send('GET', '/v1/program-templates', 'fb-mem'))).map((t: any) => t.id);
    expect(ids).toEqual(['gl']);
  });
  it('[L1575] nobody can write a global template from a client', async () => {
    const h = await world();
    await h.run(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES ('g-1',NULL,'{"title":"G"}',1)`);
    // A body claiming tenantId null still lands in the path's gym.
    const res = await h.send('POST', '/v1/tenants/t1/program-templates', 'fb-admin', { tenantId: null, title: 'T' });
    expect(res.status).toBe(201);
    const { id } = await json(res);
    expect((await h.one(`SELECT tenant_id t FROM program_templates WHERE id = ?`, id)).t).toBe('t1');
    // Update / delete addressed at the global id through a gym path are no-ops.
    await h.send('PUT', '/v1/tenants/t1/program-templates/g-1', 'fb-admin', { title: 'Ele geçirildi' });
    await h.send('DELETE', '/v1/tenants/t1/program-templates/g-1', 'fb-admin');
    expect(JSON.parse((await h.one(`SELECT data d FROM program_templates WHERE id = 'g-1'`)).d)).toEqual({ title: 'G' });
    expect((await h.send('POST', '/v1/program-templates', 'fb-admin', { title: 'x' })).status).toBe(404);   // no global write route
  });
  it('[L1589] gym staff own their gym\'s templates, a member does not', async () => {
    const h = await world();
    expect((await h.send('POST', '/v1/tenants/t1/program-templates', 'fb-mem', { title: 'x' })).status).toBe(403);
    expect((await h.send('POST', '/v1/tenants/t1/program-templates', 'fb-trn', { title: 'x' })).status).toBe(201);
    expect((await h.send('POST', '/v1/tenants/t2/program-templates', 'fb-trn', { title: 'x' })).status).toBe(403);
  });
  it('[L1601] a template cannot be moved to another gym', async () => {
    const h = await world();
    await h.run(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES ('t-1','t1','{"title":"Bizim"}',1)`);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-trn','active','["trainer"]',1)`);
    // body tenantId is ignored; the column never changes
    expect((await h.send('PUT', '/v1/tenants/t1/program-templates/t-1', 'fb-trn', { title: 'v2', tenantId: 't2' })).status).toBe(200);
    expect((await h.one(`SELECT tenant_id t FROM program_templates WHERE id = 't-1'`)).t).toBe('t1');
    // a trainer who is staff in BOTH gyms cannot touch t1's template through t2's path
    await h.send('PUT', '/v1/tenants/t2/program-templates/t-1', 'fb-trn', { title: 'hijack' });
    await h.send('DELETE', '/v1/tenants/t2/program-templates/t-1', 'fb-trn');
    expect(await h.one(`SELECT tenant_id t, data d FROM program_templates WHERE id = 't-1'`)).toEqual({ t: 't1', d: '{"title":"v2","tenantId":"t2"}' });
  });
});

describe('matrix B: gym packages (PKG-1)', () => {
  it('[L1624] any active member of the gym reads the catalog', async () => {
    const h = await world();
    await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('g1','t1','{"name":"Aylık"}')`);
    expect((await h.send('GET', '/v1/tenants/t1/packages', 'fb-mem')).status).toBe(200);
    expect((await h.send('GET', '/v1/tenants/t1/packages', 'fb-trn')).status).toBe(200);
  });
  it('[L1634] a member of another gym cannot read the catalog', async () => {
    const h = await world();
    await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('g1','t1','{"name":"Aylık"}')`);
    expect((await h.send('GET', '/v1/tenants/t1/packages', 'fb-out')).status).toBe(403);
    expect((await h.send('GET', '/v1/tenants/t1/packages', 'fb-new')).status).toBe(403);
  });
  it('[L1701] packages are never deleted: no delete route', async () => {
    const h = await world();
    await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('g1','t1','{"name":"Aylık"}')`);
    expect((await h.send('DELETE', '/v1/tenants/t1/packages/g1', 'fb-admin')).status).toBe(404);
    expect(await h.one(`SELECT 1 x FROM gym_packages WHERE id = 'g1'`)).not.toBeNull();
  });
});

describe('matrix B: package change requests (PKG-6)', () => {
  const seed = async () => {
    const h = await world();
    await h.run(`INSERT INTO package_change_requests (id, tenant_id, member_id, data, effective_at, expires_at, status, created_by, created_at)
      VALUES ('r1','t1','u-mem','{}',1,2,'pending','u-admin',1)`);
    return h;
  };
  it('[L1740] no client write path to status (approve/reject is a server action)', async () => {
    const h = await seed();
    for (const sub of ['fb-mem', 'fb-mem2', 'fb-admin']) {
      for (const m of ['PUT', 'PATCH', 'POST']) {
        expect((await h.send(m, '/v1/tenants/t1/package-change-requests/r1', sub, { status: 'approved' })).status, `${m} ${sub}`).toBe(404);
      }
    }
    expect((await h.one(`SELECT status s FROM package_change_requests`)).s).toBe('pending');
  });
  it('[L1754] another member cannot respond to someone else\'s request (same: no route)', async () => {
    const h = await seed();
    expect((await h.send('PUT', '/v1/tenants/t1/package-change-requests/r1/respond', 'fb-mem2', { status: 'approved' })).status).toBe(404);
    expect((await h.send('POST', '/v1/tenants/t1/package-change-requests/r1/approve', 'fb-mem2')).status).toBe(404);
    expect((await h.one(`SELECT status s FROM package_change_requests`)).s).toBe('pending');
  });
  it('[L1785] a member reads their own request; a colleague does not', async () => {
    const h = await seed();
    expect((await json(await h.send('GET', '/v1/tenants/t1/package-change-requests', 'fb-mem'))).map((r: any) => r.id)).toEqual(['r1']);
    expect(await json(await h.send('GET', '/v1/tenants/t1/package-change-requests', 'fb-mem2'))).toEqual([]);
  });
});

describe('matrix B: promotions (PKG-5)', () => {
  it('[L1813] staff can read promotions; a member cannot; only an admin writes them', async () => {
    const h = await world();
    await h.run(`INSERT INTO promotions (id, tenant_id, data) VALUES ('pr1','t1','{"kind":"bonusDays"}')`);
    expect((await h.send('GET', '/v1/tenants/t1/promotions', 'fb-trn')).status).toBe(200);
    expect((await h.send('GET', '/v1/tenants/t1/promotions', 'fb-admin')).status).toBe(200);
    expect((await h.send('GET', '/v1/tenants/t1/promotions', 'fb-mem')).status).toBe(403);
    expect((await h.send('POST', '/v1/tenants/t1/promotions', 'fb-trn', { kind: 'bonusDays' })).status).toBe(403);
  });
});

describe('matrix B: member packages and credits (PKG-2)', () => {
  const seedPkg = async () => {
    const h = await world();
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at, assigned_by)
      VALUES ('mp1','t1','u-mem','g1',500,1,9999999999999,'active','{"packageName":"Gold"}',1,'u-admin')`);
    return h;
  };
  it('[L1939] a member reads their own assignment; another member cannot', async () => {
    const h = await seedPkg();
    const own = await json(await h.send('GET', '/v1/tenants/t1/members/u-mem/packages', 'fb-mem'));
    expect(own.map((p: any) => p.id)).toEqual(['mp1']);
    expect((await h.send('GET', '/v1/tenants/t1/members/u-mem/packages', 'fb-mem2')).status).toBe(403);
    expect((await h.send('GET', '/v1/tenants/t1/members/u-mem/packages', 'fb-out')).status).toBe(403);
  });
  it('[L1956] an assignment can never be updated or deleted by a client: no route', async () => {
    const h = await seedPkg();
    for (const [m, p] of [['PUT', '/v1/tenants/t1/members/u-mem/packages/mp1'], ['PATCH', '/v1/tenants/t1/members/u-mem/packages/mp1'],
      ['DELETE', '/v1/tenants/t1/members/u-mem/packages/mp1'], ['PUT', '/v1/tenants/t1/member-packages/mp1'], ['DELETE', '/v1/tenants/t1/member-packages/mp1']] as const) {
      expect((await h.send(m, p, 'fb-admin', m === 'DELETE' ? undefined : { status: 'cancelled' })).status, `${m} ${p}`).toBe(404);
    }
    expect((await h.one(`SELECT status s FROM member_packages`)).s).toBe('active');
  });
  it('[L1995] a credit can never be updated by a client: no route', async () => {
    const h = await world();
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
      VALUES ('c1','t1','u-mem','ptLesson','purchase','p1',8,0,1,9999999999999,'active')`);
    for (const [m, p] of [['PUT', '/v1/tenants/t1/members/u-mem/credits/c1'], ['PATCH', '/v1/tenants/t1/members/u-mem/credits/c1'], ['PUT', '/v1/tenants/t1/credits/c1']] as const) {
      expect((await h.send(m, p, 'fb-admin', { used: 1 })).status, `${m} ${p}`).toBe(404);
    }
    expect((await h.one(`SELECT used u FROM member_credits`)).u).toBe(0);
  });
  it('[L2007] a member reads own credits; staff too; another member cannot', async () => {
    const h = await world();
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
      VALUES ('c1','t1','u-mem','ptLesson','purchase','p1',8,0,1,9999999999999,'active')`);
    const p = '/v1/tenants/t1/members/u-mem/credits';
    expect((await h.send('GET', p, 'fb-mem')).status).toBe(200);
    expect((await h.send('GET', p, 'fb-trn')).status).toBe(200);
    expect((await h.send('GET', p, 'fb-admin')).status).toBe(200);
    expect((await h.send('GET', p, 'fb-mem2')).status).toBe(403);
    expect((await h.send('GET', p, 'fb-out')).status).toBe(403);
  });
});
