import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

/** Rules-test matrix, chunk D (rows 189..249). Test names start with [L<line>] = source line in firestore.rules.test.ts. */

// The machine is shared with parallel runs; each harness() builds a fresh DB, so allow slow tests.
vi.setConfig({ testTimeout: 60_000 });

const YEAR = 365 * 86_400_000;
const T = '/v1/tenants/t1';

/** parent (u-par), child (u-kid), unrelated member (u-oth), trainer (u-coach). */
async function world(guardianStatus: 'pending' | 'approved' | null, kid: { status?: string; birth?: number | null } = {}) {
  const h = await harness();
  await h.addUser('u-par', ['member']);
  await h.addUser('u-oth', ['member']);
  await h.addUser('u-coach', ['trainer']);
  await h.addUser('u-kid', ['member'], { status: kid.status ?? 'active' });
  const birth = kid.birth === undefined ? Date.now() - 12 * YEAR : kid.birth;
  await h.run(`UPDATE memberships SET birth_date = ?, guardian_id = ?, guardian_status = ? WHERE tenant_id='t1' AND member_id='u-kid'`,
    birth, guardianStatus ? 'u-par' : null, guardianStatus);
  return h;
}

describe('[D] Guardian link (MEMBER-5b)', () => {
  it('[L2746] a parent can read their child\'s row', async () => {
    const h = await world('pending');
    const r = await h.send('GET', `${T}/members/u-kid`, 'fb-par');
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).memberId).toBe('u-kid');
  });
  it('[L2754] that read works while the request is still pending', async () => {
    const h = await world('pending');
    const r = await h.send('GET', `${T}/members/u-kid`, 'fb-par');
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).guardianStatus).toBe('pending');
  });
  it('[L2760] an unrelated member cannot read that row', async () => {
    const h = await world('approved');
    expect((await h.send('GET', `${T}/members/u-kid`, 'fb-oth')).status).toBe(404);
  });
  it('[L2766] the child cannot approve their own guardian', async () => {
    const h = await world('pending');
    expect((await h.send('PATCH', `${T}/members/u-kid/details`, 'fb-kid', { guardianStatus: 'approved' })).status).toBe(400);
    expect((await h.send('PUT', `${T}/members/u-kid/status`, 'fb-kid', { status: 'active' })).status).toBe(403);
    expect((await h.one(`SELECT guardian_status g FROM memberships WHERE member_id='u-kid'`)).g).toBe('pending');
  });
  it('[L2774] the child cannot attach themselves to a guardian', async () => {
    const h = await world(null);
    expect((await h.send('PATCH', `${T}/members/u-kid/details`, 'fb-kid', { guardianId: 'u-par' })).status).toBe(400);
    expect((await h.one(`SELECT guardian_id g FROM memberships WHERE member_id='u-kid'`)).g).toBeNull();
  });
  it('[L2780] even the parent cannot write the approval directly', async () => {
    const h = await world('pending');
    // Parent is neither self nor admin: details route is closed, and guardian fields are not editable at all.
    expect((await h.send('PATCH', `${T}/members/u-kid/details`, 'fb-par', { guardianStatus: 'approved' })).status).toBe(403);
    expect((await h.send('PUT', `${T}/members/u-kid/roles`, 'fb-par', { roles: ['member'] })).status).toBe(403);
    expect((await h.one(`SELECT guardian_status g FROM memberships WHERE member_id='u-kid'`)).g).toBe('pending');
  });
  it('[L2788] an admin cannot activate a minor whose guardian has not approved', async () => {
    const h = await world('pending', { status: 'pending' });
    expect((await h.send('PUT', `${T}/members/u-kid/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id='u-kid'`)).s).toBe('pending');
  });
  it('[L2796] an admin cannot activate a minor with no guardian at all', async () => {
    const h = await world(null, { status: 'pending' });
    expect((await h.send('PUT', `${T}/members/u-kid/status`, 'fb-admin', { status: 'active' })).status).toBe(409);
  });
  it('[L2804] once the guardian has approved, the admin can activate them', async () => {
    const h = await world('approved', { status: 'pending' });
    expect((await h.send('PUT', `${T}/members/u-kid/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id='u-kid'`)).s).toBe('active');
  });
  it('[L2812] an adult needs no guardian', async () => {
    const h = await world(null, { status: 'pending', birth: Date.now() - 30 * YEAR });
    expect((await h.send('PUT', `${T}/members/u-kid/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
  });
  it('[L2822] a member with no birth date is not blocked', async () => {
    const h = await world(null, { status: 'pending', birth: null });
    expect((await h.send('PUT', `${T}/members/u-kid/status`, 'fb-admin', { status: 'active' })).status).toBe(200);
  });
  it('[L2841] a minor without approval can still be rejected', async () => {
    const h = await world(null, { status: 'pending' });
    expect((await h.send('PUT', `${T}/members/u-kid/status`, 'fb-admin', { status: 'rejected' })).status).toBe(200);
    expect((await h.one(`SELECT status s FROM memberships WHERE member_id='u-kid'`)).s).toBe('rejected');
  });
});

describe('[D] Guardian authority (MEMBER-5c)', () => {
  async function seeded(status: 'pending' | 'approved') {
    const h = await world(status);
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
      VALUES ('c1','t1','u-kid','ptLesson','purchase','p1',10,0,1,9999999999999,'active')`);
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
      VALUES ('p1','t1','u-kid','gp1',0,1,9999999999999,'active','{"entitlements":{"groupClasses":{"unlimited":true}}}',1)`);
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at)
      VALUES ('s1','t1','u-coach','u-kid',9e12,60,'scheduled',1,1)`);
    await h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES ('pay1','t1','u-kid',500,'confirmed','{"kind":"charge"}',1)`);
    await h.run(`INSERT INTO measurements (id, tenant_id, member_id, data, measured_at) VALUES ('m1','t1','u-kid','{"weightKg":45}',1)`);
    const { id } = (await (await h.send('POST', `${T}/classes`, 'fb-admin', { name: 'Yoga', capacity: 10, startsAt: 9e12 })).json()) as { id: string };
    return { h, cls: id };
  }
  const get = (h: Awaited<ReturnType<typeof harness>>, sub: string, what: string) => h.send('GET', `${T}/members/u-kid/${what}`, sub);

  it('[L2901] an approved parent reads the child\'s packages, sessions, payments and measurements', async () => {
    const { h } = await seeded('approved');
    for (const what of ['packages', 'pt-sessions', 'payments', 'measurements']) {
      expect((await get(h, 'fb-par', what)).status, what).toBe(200);
    }
  });
  it.todo('[L2901] FIXED in matrix-fixes.test.ts (was GAP): approved parent gets 403 on GET /members/:id/credits (staff or self only) and there is no GET checkins route; rules allow guardian read of member_credits and checkins');
  it('[L2912] a PENDING link grants none of that', async () => {
    const { h } = await seeded('pending');
    for (const what of ['credits', 'pt-sessions', 'payments', 'packages', 'measurements']) {
      expect((await get(h, 'fb-par', what)).status, what).toBe(403);
    }
  });
  it('[L2920] an unrelated member gets nothing', async () => {
    const { h } = await seeded('approved');
    for (const what of ['credits', 'measurements', 'payments', 'pt-sessions']) {
      expect((await get(h, 'fb-oth', what)).status, what).toBe(403);
    }
  });
  it('[L2927] an approved parent books the child into a class', async () => {
    const { h, cls } = await seeded('approved');
    expect((await h.send('POST', `${T}/classes/${cls}/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(201);
    expect(await h.one(`SELECT 1 x FROM class_bookings WHERE class_id = ? AND member_id = 'u-kid'`, cls)).toEqual({ x: 1 });
  });
  it('[L2935] the parent needs no entitlement of their own', async () => {
    const { h, cls } = await seeded('approved');
    expect(await h.one(`SELECT count(*) c FROM member_packages WHERE member_id = 'u-par'`)).toEqual({ c: 0 });
    expect((await h.send('POST', `${T}/classes/${cls}/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(201);
  });
  it('[L2944] but the CHILD still needs one', async () => {
    const { h, cls } = await seeded('approved');
    await h.run(`DELETE FROM member_packages WHERE member_id = 'u-kid'`);
    expect((await h.send('POST', `${T}/classes/${cls}/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(409);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });
  it('[L2953] a parent cannot book somebody else\'s child', async () => {
    const { h, cls } = await seeded('approved');
    expect((await h.send('POST', `${T}/classes/${cls}/book`, 'fb-par', { memberId: 'u-oth' })).status).toBe(403);
  });
  it('[L2959] a pending link cannot book', async () => {
    const { h, cls } = await seeded('pending');
    expect((await h.send('POST', `${T}/classes/${cls}/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });
  it('[L2965] an approved parent cancels the child\'s class booking', async () => {
    const { h, cls } = await seeded('approved');
    await h.run(`INSERT INTO class_bookings (tenant_id, class_id, member_id, created_at) VALUES ('t1', ?, 'u-kid', 1)`, cls);
    expect((await h.send('DELETE', `${T}/classes/${cls}/book`, 'fb-par', { memberId: 'u-kid' })).status).toBe(200);
    expect(await h.one(`SELECT count(*) c FROM class_bookings`)).toEqual({ c: 0 });
  });
  it('[L2975] an approved parent files a payment notice in the child\'s ledger', async () => {
    const { h } = await seeded('approved');
    const r = await h.send('POST', `${T}/payments`, 'fb-par', { memberId: 'u-kid', amount: 300, method: 'cash' });
    expect(r.status).toBe(201);
    const row = await h.one(`SELECT member_id m, status s, json_extract(data,'$.submittedBy') by FROM payments WHERE id = ?`, ((await r.json()) as any).id);
    expect(row).toEqual({ m: 'u-kid', s: 'pending', by: 'u-par' });
  });
  it('[L2986] a parent cannot file one without naming themselves as the payer', async () => {
    const { h } = await seeded('approved');
    // NA by design: submittedBy is derived from the token; a client-supplied value is ignored.
    const r = await h.send('POST', `${T}/payments`, 'fb-par', { memberId: 'u-kid', amount: 300, method: 'cash', submittedBy: 'u-oth' });
    expect(r.status).toBe(201);
    expect((await h.one(`SELECT json_extract(data,'$.submittedBy') by FROM payments WHERE id = ?`, ((await r.json()) as any).id)).by).toBe('u-par');
  });
  it('[L2996] a parent cannot confirm their own notice', async () => {
    const { h } = await seeded('approved');
    const r = await h.send('POST', `${T}/payments`, 'fb-par', { memberId: 'u-kid', amount: 300, method: 'cash', status: 'confirmed' });
    const id = ((await r.json()) as any).id;
    expect((await h.one(`SELECT status s FROM payments WHERE id = ?`, id)).s).toBe('pending');
    expect((await h.send('PUT', `${T}/payments/${id}/decision`, 'fb-par', { status: 'confirmed' })).status).toBe(403);
    expect((await h.one(`SELECT status s FROM payments WHERE id = ?`, id)).s).toBe('pending');
  });
});

describe('[D] Guardian check-in reason (MEMBER-5d)', () => {
  it('[L3024] staff may record a guardian entry', async () => {
    const h = await world('approved');
    const r = await h.send('POST', `${T}/checkins`, 'fb-admin', { memberId: 'u-par', accessReason: 'guardian' });
    expect(r.status).toBe(201);
    expect((await h.one(`SELECT json_extract(data,'$.accessReason') a FROM checkins`)).a).toBe('guardian');
  });
  it('[L3034] an unknown reason is still refused', async () => {
    const h = await world('approved');
    expect((await h.send('POST', `${T}/checkins`, 'fb-admin', { memberId: 'u-par', accessReason: 'because-i-said-so' })).status).toBe(400);
  });
  it('[L3044] a member still cannot check themselves in as a guardian', async () => {
    const h = await world('approved');
    expect((await h.send('POST', `${T}/checkins`, 'fb-par', { memberId: 'u-par', accessReason: 'guardian' })).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM checkins`)).toEqual({ c: 0 });
  });
});

describe('[D] Guardian bulk payment (MEMBER-5e)', () => {
  async function two() {
    const h = await world('approved');
    await h.addUser('u-kidb', ['member']);
    await h.run(`UPDATE memberships SET guardian_id='u-par', guardian_status='approved' WHERE member_id='u-kidb'`);
    return h;
  }
  it('[L3106] the entries stay pending — a parent cannot confirm their own', async () => {
    const h = await two();
    for (const kid of ['u-kid', 'u-kidb']) {
      const r = await h.send('POST', `${T}/payments`, 'fb-par', { memberId: kid, amount: 300, method: 'cash', status: 'confirmed' });
      expect(r.status).toBe(201);
    }
    expect(await h.one(`SELECT count(*) c FROM payments WHERE status = 'pending'`)).toEqual({ c: 2 });
    expect(await h.one(`SELECT count(*) c FROM payments WHERE status = 'confirmed'`)).toEqual({ c: 0 });
  });
  it('[L3113] a parent can read back what they filed for each child', async () => {
    const h = await two();
    for (const kid of ['u-kid', 'u-kidb']) {
      await h.send('POST', `${T}/payments`, 'fb-par', { memberId: kid, amount: 300, method: 'cash' });
      const list = (await (await h.send('GET', `${T}/members/${kid}/payments`, 'fb-par')).json()) as any[];
      expect(list).toHaveLength(1);
      expect(list[0].status).toBe('pending');
    }
  });
  it('[L3098] per-entry denial holds (stranger child 403); batch atomicity itself is F3', async () => {
    const h = await two();
    expect((await h.send('POST', `${T}/payments`, 'fb-par', { memberId: 'u-oth', amount: 300, method: 'cash' })).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 0 });
  });
});

describe('[D] Payment reversal (ADMIN-4)', () => {
  async function pays() {
    const h = await harness();
    await h.run(`INSERT INTO payments (id, tenant_id, member_id, amount, status, data, created_at) VALUES
      ('orig','t1','u-mem',500,'confirmed','{"kind":"charge","method":"cash"}',1),
      ('done','t1','u-mem',500,'confirmed','{"kind":"charge","method":"cash","reversedAt":5,"reversedByPaymentId":"x"}',1)`);
    return h;
  }
  const rev = (h: Awaited<ReturnType<typeof harness>>, sub: string, o: object = {}) =>
    h.send('POST', `${T}/payments`, sub, { memberId: 'u-mem', amount: 500, method: 'cash', kind: 'reversal', reversesPaymentId: 'orig', ...o });

  it('[L3151] an admin writes a reversal and flags the original', async () => {
    const h = await pays();
    const r = await rev(h, 'fb-admin');
    expect(r.status).toBe(201);
    const id = ((await r.json()) as any).id;
    const orig = await h.one(`SELECT json_extract(data,'$.reversedByPaymentId') by, json_extract(data,'$.reversedAt') at FROM payments WHERE id='orig'`);
    expect(orig.by).toBe(id);
    expect(orig.at).toBeTruthy();
    expect((await h.one(`SELECT json_extract(data,'$.kind') k, status s FROM payments WHERE id = ?`, id))).toEqual({ k: 'reversal', s: 'confirmed' });
  });
  it('[L3165] a reversal must name what it cancels', async () => {
    const h = await pays();
    expect((await rev(h, 'fb-admin', { reversesPaymentId: undefined })).status).toBe(400);
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 2 });
  });
  it('[L3176] a member cannot write a reversal', async () => {
    const h = await pays();
    expect((await rev(h, 'fb-mem')).status).toBe(403);
    expect(await h.one(`SELECT json_extract(data,'$.reversedAt') at FROM payments WHERE id='orig'`)).toEqual({ at: null });
  });
  it('[L3186] a member cannot flag a payment as reversed (no flag route exists)', async () => {
    const h = await pays();
    for (const m of ['PUT', 'PATCH', 'POST']) {
      const r = await h.send(m, `${T}/payments/orig`, 'fb-mem', { reversedAt: 1, reversedByPaymentId: 'r' });
      expect([404, 405]).toContain(r.status);
    }
    expect(await h.one(`SELECT json_extract(data,'$.reversedAt') at FROM payments WHERE id='orig'`)).toEqual({ at: null });
  });
  it('[L3194] a row cannot be reversed a second time', async () => {
    const h = await pays();
    expect((await rev(h, 'fb-admin', { reversesPaymentId: 'done' })).status).toBe(409);
    expect((await rev(h, 'fb-admin')).status).toBe(201);
    expect((await rev(h, 'fb-admin')).status).toBe(409);
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 3 });
  });
  it('[L3202] the flag cannot be used to edit the amount', async () => {
    const h = await pays();
    const r = await h.send('PATCH', `${T}/payments/orig`, 'fb-admin', { reversedAt: 1, reversedByPaymentId: 'r', amount: 50 });
    expect([404, 405]).toContain(r.status);
    await rev(h, 'fb-admin');
    expect(await h.one(`SELECT amount a, status s FROM payments WHERE id='orig'`)).toEqual({ a: 500, s: 'confirmed' });
  });
  it('[L3209] deleting a payment stays impossible for everyone', async () => {
    const h = await pays();
    for (const sub of ['fb-admin', 'fb-mem']) {
      expect([404, 405]).toContain((await h.send('DELETE', `${T}/payments/orig`, sub)).status);
    }
    expect(await h.one(`SELECT count(*) c FROM payments`)).toEqual({ c: 2 });
  });
});

describe('[D] Package assignment stays closed to clients (ADMIN-4)', () => {
  async function pkgs() {
    const h = await harness();
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
      VALUES ('a1','t1','u-mem','gp1',0,1,9999999999999,'active','{}',1)`);
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
      VALUES ('c1','t1','u-mem','ptLesson','purchase','a1',10,2,1,9999999999999,'active')`);
    return h;
  }
  const closed = async (h: Awaited<ReturnType<typeof harness>>, sub: string, paths: string[]) => {
    for (const p of paths) for (const m of ['PUT', 'PATCH', 'POST', 'DELETE']) {
      const r = await h.send(m, p, sub, { status: 'cancelled', used: 0, total: 100 });
      expect([404, 405], `${m} ${p}`).toContain(r.status);
    }
  };
  const same = async (h: Awaited<ReturnType<typeof harness>>) => {
    expect(await h.one(`SELECT status s FROM member_packages WHERE id='a1'`)).toEqual({ s: 'active' });
    expect(await h.one(`SELECT total t, used u, status s FROM member_credits WHERE id='c1'`)).toEqual({ t: 10, u: 2, s: 'active' });
  };
  it('[L3244] not even an admin can cancel an assignment directly (no client route)', async () => {
    const h = await pkgs();
    await closed(h, 'fb-admin', [`${T}/member-packages/a1`, `${T}/members/u-mem/packages/a1`]);
    await same(h);
  });
  it('[L3249] nor delete it (no client route)', async () => {
    const h = await pkgs();
    expect([404, 405]).toContain((await h.send('DELETE', `${T}/member-packages/a1`, 'fb-admin')).status);
    expect([404, 405]).toContain((await h.send('DELETE', `${T}/members/u-mem/packages/a1`, 'fb-admin')).status);
    await same(h);
  });
  it('[L3254] a member cannot revoke their own credits, nor grant themselves more (no client route)', async () => {
    const h = await pkgs();
    await closed(h, 'fb-mem', [`${T}/member-credits/c1`, `${T}/members/u-mem/credits/c1`, `${T}/members/u-mem/credits`]);
    await same(h);
  });
  it('[L3261] an admin cannot hand-edit a credit balance either (no client route)', async () => {
    const h = await pkgs();
    await closed(h, 'fb-admin', [`${T}/member-credits/c1`, `${T}/members/u-mem/credits/c1`, `${T}/members/u-mem/credits`]);
    await same(h);
  });
});

describe('[D] Admin seat cap (3 per gym)', () => {
  async function gym(count: number) {
    const h = await harness();
    await h.addUser('u-cand', ['member']);
    await h.run(`UPDATE tenants SET active_admin_count = ? WHERE id = 't1'`, count);
    return h;
  }
  const cnt = async (h: Awaited<ReturnType<typeof harness>>) => (await h.one(`SELECT active_admin_count c FROM tenants WHERE id='t1'`)).c;
  const roles = (h: Awaited<ReturnType<typeof harness>>, id: string, r: string[]) => h.send('PUT', `${T}/members/${id}/roles`, 'fb-admin', { roles: r });

  it('[L3283] promoting a member to admin succeeds under the cap', async () => {
    const h = await gym(2);
    expect((await roles(h, 'u-cand', ['member', 'admin'])).status).toBe(200);
    expect(await cnt(h)).toBe(3);
  });
  it('[L3289] a fourth admin is refused', async () => {
    const h = await gym(3);
    expect((await roles(h, 'u-cand', ['member', 'admin'])).status).toBe(409);
    expect((await h.one(`SELECT roles r FROM memberships WHERE member_id='u-cand'`)).r).toBe('["member"]');
    expect(await cnt(h)).toBe(3);
  });
  it('[L3295] a fresh/missing counter reads as under the limit (column defaults to 0, never NULL)', async () => {
    const h = await harness();
    await h.addUser('u-cand', ['member']);
    expect((await h.one(`SELECT active_admin_count c FROM tenants WHERE id='t1'`)).c).toBe(0);
    expect((await roles(h, 'u-cand', ['member', 'admin'])).status).toBe(200);
  });
  it('[L3310] editing an existing admin is not blocked by the cap they already occupy', async () => {
    const h = await gym(3);
    expect((await roles(h, 'u-admin', ['admin', 'trainer'])).status).toBe(200);
    expect(await cnt(h)).toBe(3);
  });
  it('[L3318] demoting an admin out of the role is allowed at the cap and frees a seat', async () => {
    const h = await gym(3);
    await h.addUser('u-second', ['admin']);
    expect((await roles(h, 'u-second', ['member'])).status).toBe(200);
    expect(await cnt(h)).toBe(2);
  });
});

describe('[D] Owner-only member note (member_admin_notes)', () => {
  const put = (h: Awaited<ReturnType<typeof harness>>, sub: string, text: unknown) =>
    h.send('PUT', `${T}/members/u-mem/admin-note`, sub, { text });
  const get = (h: Awaited<ReturnType<typeof harness>>, sub: string) => h.send('GET', `${T}/members/u-mem/admin-note`, sub);

  it('[L3340] an admin writes, reads and deletes the note', async () => {
    const h = await harness();
    expect((await put(h, 'fb-admin', 'Ödemeyi ayın 5\'inde yapıyor.')).status).toBe(200);
    expect(((await (await get(h, 'fb-admin')).json()) as any).text).toBe('Ödemeyi ayın 5\'inde yapıyor.');
    expect((await put(h, 'fb-admin', '')).status).toBe(200);
    expect(await h.one(`SELECT count(*) c FROM member_admin_notes`)).toEqual({ c: 0 });
  });
  it('[L3348] reading a note nobody has written yet works for an admin', async () => {
    const h = await harness();
    const r = await get(h, 'fb-admin');
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).text).toBe('');
  });
  it('[L3353] a trainer reads and writes the shared note, but not this one', async () => {
    const h = await harness();
    await h.addUser('u-trn', ['trainer']);
    await put(h, 'fb-admin', 'gizli');
    expect((await get(h, 'fb-trn')).status).toBe(403);
    expect((await put(h, 'fb-trn', 'x')).status).toBe(403);
    expect((await h.send('PUT', `${T}/members/u-mem/admin-note`, 'fb-trn', { text: '' })).status).toBe(403);
    expect((await h.one(`SELECT text t FROM member_admin_notes`)).t).toBe('gizli');
    expect((await h.send('PUT', `${T}/members/u-mem/note`, 'fb-trn', { text: 'Dizi sakat.' })).status).toBe(200);
    expect(((await (await h.send('GET', `${T}/members/u-mem/note`, 'fb-trn')).json()) as any).text).toBe('Dizi sakat.');
  });
  it('[L3367] the member the note is about cannot read it, even their own', async () => {
    const h = await harness();
    await put(h, 'fb-admin', 'gizli');
    expect((await get(h, 'fb-mem')).status).toBe(403);
    expect((await put(h, 'fb-mem', 'x')).status).toBe(403);
  });
  it('[L3376] an admin of another gym sees nothing', async () => {
    const h = await harness();
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Rival',1)`);
    await h.addUser('u-rival', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-rival','active','["admin"]',1)`);
    await put(h, 'fb-admin', 'gizli');
    expect((await get(h, 'fb-rival')).status).toBe(403);
    expect((await put(h, 'fb-rival', 'x')).status).toBe(403);
    expect((await h.one(`SELECT text t FROM member_admin_notes`)).t).toBe('gizli');
  });
  it('[L3383] key is pinned by path; oversized/non-string text rejected, author is server-set (empty = delete, deliberate)', async () => {
    const h = await harness();
    expect((await put(h, 'fb-admin', 'x'.repeat(2001))).status).toBe(400);
    expect((await put(h, 'fb-admin', 123)).status).toBe(400);
    expect((await h.send('PUT', `${T}/members/u-nobody/admin-note`, 'fb-admin', { text: 'x' })).status).toBe(404);
    expect((await put(h, 'fb-admin', 'ok')).status).toBe(200);
    expect(await h.one(`SELECT member_id m, tenant_id t, updated_by u FROM member_admin_notes`)).toEqual({ m: 'u-mem', t: 't1', u: 'u-admin' });
  });
});

describe('[D] Member address (member_addresses)', () => {
  const addr = (h: Awaited<ReturnType<typeof harness>>, sub: string, who: string, a: unknown) =>
    h.send('PUT', `${T}/members/${who}/address`, sub, { address: a });
  const get = (h: Awaited<ReturnType<typeof harness>>, sub: string, who = 'u-mem') => h.send('GET', `${T}/members/${who}/address`, sub);
  const ADDR = 'Bağdat Cad. 12/3, Kadıköy';

  it('[L3406] a member writes, reads and deletes their own address', async () => {
    const h = await harness();
    expect((await addr(h, 'fb-mem', 'u-mem', ADDR)).status).toBe(200);
    expect(((await (await get(h, 'fb-mem')).json()) as any).address).toBe(ADDR);
    expect((await h.send('DELETE', `${T}/members/u-mem/address`, 'fb-mem')).status).toBe(200);
    expect(await h.one(`SELECT count(*) c FROM member_addresses`)).toEqual({ c: 0 });
  });
  it('[L3414] a member with no row in the gym cannot attach an address to it', async () => {
    const h = await harness();
    await h.addUser('u-out', null);
    expect((await addr(h, 'fb-out', 'u-out', ADDR)).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM member_addresses`)).toEqual({ c: 0 });
  });
  it('[L3419] a member cannot write or read someone else\'s address', async () => {
    const h = await harness();
    await h.addUser('u-two', ['member']);
    await addr(h, 'fb-mem', 'u-mem', ADDR);
    expect((await get(h, 'fb-two')).status).toBe(403);
    expect((await addr(h, 'fb-two', 'u-mem', 'x')).status).toBe(403);
    expect((await h.send('DELETE', `${T}/members/u-mem/address`, 'fb-two')).status).toBe(403);
    expect((await h.one(`SELECT address a FROM member_addresses WHERE member_id='u-mem'`)).a).toBe(ADDR);
  });
  it('[L3429] the gym\'s admin reads it; a trainer and another gym\'s admin do not', async () => {
    const h = await harness();
    await h.addUser('u-trn', ['trainer']);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Rival',1)`);
    await h.addUser('u-rival', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-rival','active','["admin"]',1)`);
    await addr(h, 'fb-mem', 'u-mem', ADDR);
    expect((await get(h, 'fb-admin')).status).toBe(200);
    expect((await get(h, 'fb-trn')).status).toBe(403);
    expect((await get(h, 'fb-rival')).status).toBe(403);
  });
  it('[L3440] reading an address nobody has written yet works for the person and the admin', async () => {
    const h = await harness();
    for (const sub of ['fb-mem', 'fb-admin']) {
      const r = await get(h, sub);
      expect(r.status).toBe(200);
      expect(((await r.json()) as any).address).toBe('');
    }
  });
  it('[L3447] an admin writes the address of a managed member, and no one else\'s', async () => {
    const h = await harness();
    const created = await h.send('POST', `${T}/members/managed`, 'fb-admin', { name: 'Yönetilen' });
    const mm = ((await created.json()) as any).memberId;
    await h.addUser('u-self', ['member']);
    expect((await addr(h, 'fb-admin', mm, ADDR)).status).toBe(200);
    expect((await h.send('DELETE', `${T}/members/${mm}/address`, 'fb-admin')).status).toBe(200);
    expect((await addr(h, 'fb-admin', 'u-self', ADDR)).status).toBe(403);
  });
  it('[L3459] an admin cannot delete the address of a member who signed up themself', async () => {
    const h = await harness();
    await addr(h, 'fb-mem', 'u-mem', ADDR);
    expect((await h.send('DELETE', `${T}/members/u-mem/address`, 'fb-admin')).status).toBe(403);
    expect(await h.one(`SELECT count(*) c FROM member_addresses`)).toEqual({ c: 1 });
  });
  it('[L3466] empty, oversized or non-string addresses are rejected; author is server-set', async () => {
    const h = await harness();
    for (const bad of ['', '   ', 'x'.repeat(301), 123]) expect((await addr(h, 'fb-mem', 'u-mem', bad)).status).toBe(400);
    expect(await h.one(`SELECT count(*) c FROM member_addresses`)).toEqual({ c: 0 });
    expect((await h.send('PUT', `${T}/members/u-mem/address`, 'fb-mem', { address: ADDR, updatedBy: 'someone-else' })).status).toBe(200);
    expect((await h.one(`SELECT updated_by u FROM member_addresses`)).u).toBe('u-mem');
  });
});
