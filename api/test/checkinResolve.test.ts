import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

type H = Awaited<ReturnType<typeof harness>>;
const NOW = Date.now();
const DAY = 86_400_000;
const MIN = 60_000;
const T1 = '/v1/tenants/t1';
const resolve = async (h: H, sub: string | null, body: object) => {
  const r = await h.send('POST', `${T1}/checkins/resolve`, sub, body);
  return { status: r.status, body: (await r.json()) as any };
};
const pkg = (h: H, id: string, member: string, o: { status?: string; startsAt?: number; endsAt?: number; kind?: string; gymAccess?: boolean; name?: string } = {}) =>
  h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at) VALUES (?, 't1', ?, 'pk1', 1, ?, ?, ?, ?, 1)`,
    id, member, o.startsAt ?? NOW - DAY, o.endsAt ?? NOW + 10 * DAY, o.status ?? 'active',
    JSON.stringify({ kind: o.kind ?? 'membership', packageName: o.name ?? 'Aylık', entitlements: { gymAccess: o.gymAccess ?? true } }));

async function world() {
  const h = await harness();
  await h.addUser('u-fd', ['member'], { permissions: ['checkin'] });
  await h.addUser('u-tr', ['trainer']);
  await h.addUser('u-a', ['member']);       // the people being scanned
  await h.run(`UPDATE memberships SET display_name = 'Ayşe', short_code = '111111', avatar_id = 'rock' WHERE member_id = 'u-a'`);
  await h.run(`UPDATE memberships SET display_name = 'Mem', short_code = '222222' WHERE member_id = 'u-mem'`);
  await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('pk1','t1','{}')`);
  return h;
}

describe('POST checkins/resolve: the decision, without recording', () => {
  it('a covering membership package lets them in; the answer names the member', async () => {
    const h = await world();
    await pkg(h, 'mp1', 'u-a');
    const r = await resolve(h, 'fb-admin', { memberId: 'u-a' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ decision: 'ok', access: 'ok', accessReason: 'ok', packageLabel: 'Aylık',
      member: { id: 'u-a', name: 'Ayşe', avatarId: 'rock', shortCode: '111111' } });
    expect(await h.one(`SELECT count(*) c FROM checkins`)).toEqual({ c: 0 });        // resolving never records
  });

  it('the package must really cover today: not started yet, expired, frozen or without gym access do not', async () => {
    const h = await world();
    const decide = async (o: Parameters<typeof pkg>[3]) => {
      await h.run(`DELETE FROM member_packages`);
      await pkg(h, 'p', 'u-a', o);
      return (await resolve(h, 'fb-admin', { memberId: 'u-a' })).body.decision;
    };
    expect(await decide({})).toBe('ok');
    expect(await decide({ startsAt: NOW + DAY })).toBe('no-package');                  // starts_at is honoured
    expect(await decide({ endsAt: NOW - DAY })).toBe('no-package');
    expect(await decide({ gymAccess: false })).toBe('no-package');
    expect(await decide({ status: 'cancelled' })).toBe('no-package');
    expect(await decide({ status: 'frozen' })).toBe('frozen');
    expect(await decide({ status: 'frozen', endsAt: NOW - DAY })).toBe('no-package');
    const frozen = await resolve(h, 'fb-admin', { memberId: 'u-a' });
    expect(frozen.body).toMatchObject({ access: 'warn' });
    await h.run(`DELETE FROM member_packages`);
    await pkg(h, 'p', 'u-a', { status: 'frozen', name: 'Dondurulmuş' });
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body).toMatchObject({ decision: 'frozen', warnReason: 'frozen', accessReason: 'frozen', packageLabel: 'Dondurulmuş', access: 'warn' });
  });

  it('a session booked today is access on its own; a usable lesson credit without one is a warning; nothing at all is no-package', async () => {
    const h = await world();
    await pkg(h, 'lp', 'u-a', { kind: 'lessons', name: '10 ders', gymAccess: false });
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status) VALUES
      ('cr1','t1','u-a','ptLesson','purchase','lp',5,2,1,${NOW + 20 * DAY},'active')`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body).toMatchObject({ decision: 'no-session-today', access: 'warn', warnReason: 'no-session-today', packageLabel: '10 ders' });
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at) VALUES
      ('s1','t1','u-tr','u-a',${NOW + 1000},60,'cancelled','cr1',1,1)`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body.decision).toBe('no-session-today');          // a cancelled one does not count
    await h.run(`UPDATE pt_sessions SET status = 'scheduled' WHERE id = 's1'`);
    // "today" is the gym's day: a session booked for the same moment is today whatever the server's own zone is
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body).toMatchObject({ decision: 'ok', accessReason: 'ok', packageLabel: '10 ders · bugün randevulu' });
    await h.run(`UPDATE pt_sessions SET starts_at = ${NOW + 2 * DAY} WHERE id = 's1'`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body.decision).toBe('no-session-today');
    // no credit left, no package, nothing
    await h.run(`UPDATE member_credits SET used = total`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body).toMatchObject({ decision: 'no-package', access: 'warn', warnReason: 'no-package', packageLabel: null });
    expect((await resolve(h, 'fb-admin', { memberId: 'u-mem' })).body.decision).toBe('no-package');
  });

  it("a parent is let in on an approved, active child's covering membership (and only then); their own package wins first", async () => {
    const h = await world();
    await h.addUser('u-kid', ['member']);
    await h.run(`UPDATE memberships SET display_name = 'Deniz', guardian_id = 'u-a', guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body.decision).toBe('no-package');                  // child has nothing yet
    await pkg(h, 'kp', 'u-kid', { name: 'Çocuk Aylık' });
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body).toMatchObject({ decision: 'guardian', access: 'ok', accessReason: 'guardian', packageLabel: 'Deniz velisi · Çocuk Aylık' });
    await h.run(`UPDATE memberships SET guardian_status = 'pending' WHERE member_id = 'u-kid'`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body.decision).toBe('no-package');
    await h.run(`UPDATE memberships SET guardian_status = 'approved', status = 'suspended' WHERE member_id = 'u-kid'`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body.decision).toBe('no-package');
    await h.run(`UPDATE memberships SET status = 'active' WHERE member_id = 'u-kid'`);
    await pkg(h, 'own', 'u-a', { name: 'Kendi' });
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body).toMatchObject({ decision: 'ok', packageLabel: 'Kendi' });
  });

  it('a scan inside 60 minutes is a duplicate (with lastCheckinAt); outside it is a new visit; recording is separate', async () => {
    const h = await world();
    await pkg(h, 'mp1', 'u-a');
    await h.run(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES ('old','t1','u-a','{}',${NOW - 61 * MIN})`);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-a' })).body.decision).toBe('ok');
    await h.run(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES ('new','t1','u-a','{}',${NOW - 59 * MIN})`);
    const r = await resolve(h, 'fb-admin', { shortCode: '111111' });
    expect(r.body).toMatchObject({ decision: 'duplicate', lastCheckinAt: NOW - 59 * MIN, member: { id: 'u-a' } });
    expect(await h.one(`SELECT count(*) c FROM checkins`)).toEqual({ c: 2 });
  });

  it('non-active memberships are inactive (with the member shown), unknown codes are not-found', async () => {
    const h = await world();
    await h.addUser('u-p', ['member'], { status: 'pending' });
    expect((await resolve(h, 'fb-admin', { memberId: 'u-p' })).body).toMatchObject({ decision: 'inactive', member: { id: 'u-p' } });
    expect((await resolve(h, 'fb-admin', { shortCode: '000000' })).body).toEqual({ decision: 'not-found' });
    expect((await resolve(h, 'fb-admin', { memberId: 'u-nobody' })).body).toEqual({ decision: 'not-found' });
  });
});

describe('who is scanned: memberId, shortCode, or the Firebase uid on the card QR', () => {
  it('a real account resolves by Firebase uid, a hand-added member (no identity) by internal id, and a uid from another gym is not-found', async () => {
    const h = await world();
    await pkg(h, 'mp1', 'u-a');
    // real account: identity subject is `fb-a` (addUser maps u-a -> fb-a)
    expect((await resolve(h, 'fb-admin', { subject: 'fb-a' })).body).toMatchObject({ decision: 'ok', member: { id: 'u-a', name: 'Ayşe' } });
    // hand-added member: no identity row at all
    const made = await h.send('POST', `${T1}/members/managed`, 'fb-admin', { name: 'Elle Eklenen' });
    const { memberId } = (await made.json()) as { memberId: string };
    expect(await h.one(`SELECT 1 x FROM identities WHERE user_id = ?`, memberId)).toBeNull();
    expect((await resolve(h, 'fb-admin', { memberId })).body).toMatchObject({ decision: 'no-package', member: { id: memberId, name: 'Elle Eklenen' } });
    expect((await resolve(h, 'fb-admin', { subject: memberId })).body).toEqual({ decision: 'not-found' });         // an internal id is not a uid
    // a uid that exists, but only in ANOTHER gym: indistinguishable from a uid nobody has
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-far', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-far','active','["member"]',1)`);
    const far = await resolve(h, 'fb-admin', { subject: 'fb-far' });
    expect(far.body).toEqual({ decision: 'not-found' });
    expect(JSON.stringify(far.body)).not.toMatch(/u-far/);
    expect((await resolve(h, 'fb-admin', { subject: 'fb-ghost-nobody' })).body).toEqual(far.body);
    expect((await resolve(h, 'fb-admin', { memberId: 'u-far' })).body).toEqual({ decision: 'not-found' });
    await h.run(`UPDATE memberships SET short_code = '777777' WHERE member_id = 'u-far'`);
    expect((await resolve(h, 'fb-admin', { shortCode: '777777' })).body).toEqual({ decision: 'not-found' });
  });

  it('exactly one reference is required', async () => {
    const h = await world();
    for (const b of [{}, { memberId: '' }, { memberId: 'u-a', shortCode: '111111' }, { memberId: 5 }, { subject: 'fb-a', shortCode: '111111' }]) {
      expect((await resolve(h, 'fb-admin', b)).status, JSON.stringify(b)).toBe(400);
    }
  });
});

describe('who may resolve and record', () => {
  it('admin, trainers and checkin holders resolve; a plain member, a suspended holder and a stranger do not', async () => {
    const h = await world();
    for (const sub of ['fb-admin', 'fb-tr', 'fb-fd']) expect((await resolve(h, sub, { memberId: 'u-a' })).status, sub).toBe(200);
    expect((await resolve(h, 'fb-mem', { memberId: 'u-a' })).status).toBe(403);
    expect((await resolve(h, null, { memberId: 'u-a' })).status).toBe(401);
    await h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-fd'`);
    expect((await resolve(h, 'fb-fd', { memberId: 'u-a' })).status).toBe(403);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-oa', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-oa','active','["admin"]',1)`);
    expect((await resolve(h, 'fb-oa', { memberId: 'u-a' })).status).toBe(403);
  });

  it('POST checkins records by memberId or by subject (a checkin holder may), keeps its reason validation, and 404s a uid from another gym', async () => {
    const h = await world();
    const rec = (sub: string, b: object) => h.send('POST', `${T1}/checkins`, sub, b);
    expect((await rec('fb-fd', { subject: 'fb-a', accessReason: 'ok' })).status).toBe(201);
    expect((await rec('fb-fd', { memberId: 'u-mem', accessReason: 'frozen' })).status).toBe(201);
    expect((await h.db.prepare(`SELECT member_id m, data d FROM checkins ORDER BY created_at, rowid`).all<any>()).results.map((x) => [x.m, JSON.parse(x.d).accessReason, JSON.parse(x.d).by]))
      .toEqual([['u-a', 'ok', 'u-fd'], ['u-mem', 'frozen', 'u-fd']]);
    expect((await rec('fb-fd', { subject: 'fb-a', accessReason: 'nonsense' })).status).toBe(400);
    expect((await rec('fb-fd', { accessReason: 'ok' })).status).toBe(400);
    expect((await rec('fb-fd', { memberId: 'u-a', subject: 'fb-a', accessReason: 'ok' })).status).toBe(400);
    expect((await rec('fb-fd', { memberId: 5, accessReason: 'ok' })).status).toBe(400);
    expect((await rec('fb-fd', { subject: 'fb-nobody', accessReason: 'ok' })).status).toBe(404);
    expect((await rec('fb-tr', { memberId: 'u-a', accessReason: 'ok' })).status).toBe(403);          // trainers resolve, only admin / holders record
    expect((await rec('fb-mem', { memberId: 'u-a', accessReason: 'ok' })).status).toBe(403);
    await h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
    await h.addUser('u-far', null);
    await h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-far','active','["member"]',1)`);
    expect((await rec('fb-fd', { subject: 'fb-far', accessReason: 'ok' })).status).toBe(404);
    expect(await h.one(`SELECT count(*) c FROM checkins WHERE member_id = 'u-far'`)).toEqual({ c: 0 });
  });
});
