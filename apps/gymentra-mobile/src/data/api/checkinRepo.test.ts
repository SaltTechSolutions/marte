import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const { __resetSupport } = await import('./classSupport');
const { resetSharedWatches } = await import('../firebase/sharedWatch');
const repo = await import('./checkinRepo');
const fb = await import('../firebase/checkinRepo');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const as = (sub: string) => { w.signInAs(sub); __resetSupport(); };

beforeEach(async () => {
  __resetSupport();
  w = await startWorld();
  as('fb-admin');                                           // the front desk
  await w.h.run(`UPDATE memberships SET display_name = 'Ali Üye', short_code = '123456' WHERE member_id = 'u-mem'`);
});
afterEach(() => resetSharedWatches());

// ---- seeds ---------------------------------------------------------------------------------------------------------
let n = 0;
const pkg = (member: string, o: { kind?: 'membership' | 'lessons'; status?: string; name?: string; start?: number; end?: number; gymAccess?: boolean; id?: string } = {}) => {
  const id = o.id ?? `mp${++n}`;
  return w.h
    .run(
      `INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
       VALUES (?, 't1', ?, 'g1', 0, ?, ?, ?, ?, 1)`,
      id, member, o.start ?? Date.now() - 5 * DAY, o.end ?? Date.now() + 25 * DAY, o.status ?? 'active',
      JSON.stringify({ packageName: o.name ?? 'Aylık Üyelik', kind: o.kind ?? 'membership', entitlements: { gymAccess: o.gymAccess ?? (o.kind ?? 'membership') === 'membership' } }),
    )
    .then(() => id);
};
const ptCredit = (member: string, source: string, o: { total?: number; used?: number; expires?: number } = {}) =>
  w.h.run(
    `INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
     VALUES (?, 't1', ?, 'ptLesson', 'purchase', ?, ?, ?, 1, ?, 'active')`,
    `cr${++n}`, member, source, o.total ?? 5, o.used ?? 0, o.expires ?? Date.now() + 20 * DAY,
  );
const sessionToday = (member: string, status = 'scheduled') => {
  const noon = new Date(); noon.setHours(12, 0, 0, 0);
  return w.h.run(
    `INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, created_at, updated_at) VALUES (?, 't1', 'u-admin', ?, ?, 60, ?, 1, 1)`,
    `ps${++n}`, member, noon.getTime(), status,
  );
};
const visits = async (member = 'u-mem') =>
  (await w.h.db.prepare(`SELECT data, created_at FROM checkins WHERE member_id = ? ORDER BY created_at`).bind(member).all<any>()).results.map((r: any) => ({ ...JSON.parse(r.data), at: r.created_at }));

describe('resolveAccess (same decision, same order as the Firestore repo)', () => {
  it('1. a membership covering today is access', async () => {
    await pkg('u-mem', { name: 'Aylık Üyelik' });
    expect(await repo.resolveAccess('t1', 'u-mem')).toEqual({ access: 'ok', packageLabel: 'Aylık Üyelik', warnReason: null });
  });

  it('1b. an expired, not-yet-started, non-gym or frozen membership does not open the door', async () => {
    await pkg('u-mem', { end: Date.now() - DAY, status: 'expired' });
    await pkg('u-mem', { start: Date.now() + DAY });
    expect((await repo.resolveAccess('t1', 'u-mem')).warnReason).toBe('no-package');
  });

  it('2. a booked session today is access, labelled with the lesson package', async () => {
    await pkg('u-mem', { kind: 'lessons', name: '12 Ders' });
    await sessionToday('u-mem');
    expect(await repo.resolveAccess('t1', 'u-mem')).toEqual({ access: 'ok', packageLabel: '12 Ders · bugün randevulu', warnReason: null });
  });

  it('2b. a cancelled session today does not count; without a package the label falls back', async () => {
    await sessionToday('u-mem', 'cancelled');
    expect((await repo.resolveAccess('t1', 'u-mem')).access).toBe('warn');
    await sessionToday('u-mem');
    expect((await repo.resolveAccess('t1', 'u-mem')).packageLabel).toBe('Ders paketi · bugün randevulu');
  });

  it('3. a usable lesson credit but no session today is a warning that names the package', async () => {
    const p = await pkg('u-mem', { kind: 'lessons', name: '12 Ders' });
    await ptCredit('u-mem', p);
    expect(await repo.resolveAccess('t1', 'u-mem')).toEqual({ access: 'warn', packageLabel: '12 Ders', warnReason: 'no-session-today' });
  });

  it('3b. a spent or expired credit is not usable', async () => {
    const p = await pkg('u-mem', { kind: 'lessons', status: 'expired', end: Date.now() - DAY });
    await ptCredit('u-mem', p, { total: 2, used: 2 });
    await ptCredit('u-mem', p, { expires: Date.now() - HOUR });
    expect((await repo.resolveAccess('t1', 'u-mem')).warnReason).toBe('no-package');
  });

  it('4. a frozen package warns "frozen" and names itself', async () => {
    await pkg('u-mem', { status: 'frozen', name: 'Aylık Üyelik' });
    expect(await repo.resolveAccess('t1', 'u-mem')).toEqual({ access: 'warn', packageLabel: 'Aylık Üyelik', warnReason: 'frozen' });
  });

  it('5. a parent with nothing of their own is admitted on an approved child\'s membership (reason guardian)', async () => {
    await w.h.addUser('u-kid', ['member']);
    await w.h.run(`UPDATE memberships SET display_name = 'Küçük Can', birth_date = ?, guardian_id = 'u-mem', guardian_status = 'approved' WHERE member_id = 'u-kid'`, Date.now() - 10 * 365 * DAY);
    await pkg('u-kid', { name: 'Çocuk Üyeliği' });
    expect(await repo.resolveAccess('t1', 'u-mem')).toEqual({
      access: 'ok', packageLabel: 'Küçük Can velisi · Çocuk Üyeliği', warnReason: null, reason: 'guardian',
    });
  });

  it('5b. a pending link, a child without a package, or an adult child do not open the door', async () => {
    await w.h.addUser('u-kid', ['member']);
    await w.h.run(`UPDATE memberships SET birth_date = ?, guardian_id = 'u-mem', guardian_status = 'pending' WHERE member_id = 'u-kid'`, Date.now() - 10 * 365 * DAY);
    await pkg('u-kid');
    expect((await repo.resolveAccess('t1', 'u-mem')).warnReason).toBe('no-package');     // pending
    await w.h.run(`UPDATE memberships SET guardian_status = 'approved' WHERE member_id = 'u-kid'`);
    await w.h.run(`UPDATE member_packages SET status = 'expired' WHERE member_id = 'u-kid'`);
    expect((await repo.resolveAccess('t1', 'u-mem')).warnReason).toBe('no-package');     // no live package
  });

  it('6. nothing at all: no-package with no label', async () => {
    expect(await repo.resolveAccess('t1', 'u-mem')).toEqual({ access: 'warn', packageLabel: null, warnReason: 'no-package' });
  });

  it('a package of the member\'s own beats the guardian path', async () => {
    await pkg('u-mem', { name: 'Kendi Üyeliği' });
    expect((await repo.resolveAccess('t1', 'u-mem')).reason).toBeUndefined();
  });
});

describe('scanning (checkInByMembershipId)', () => {
  it('a covered member is let in at once and the visit is recorded; a second scan inside an hour is the same visit', async () => {
    await pkg('u-mem');
    expect(await repo.checkInByMembershipId('t1', 't1_u-mem')).toEqual({ ok: true, name: 'Ali Üye', access: 'ok', packageLabel: 'Aylık Üyelik' });
    expect(await visits()).toMatchObject([{ accessReason: 'ok', by: 'u-admin' }]);
    expect(await repo.checkInByMembershipId('t1', 't1_u-mem')).toEqual({ ok: false, reason: 'already-checked-in' });
    expect(await visits()).toHaveLength(1);
    // an hour and a bit later it is a new visit
    await w.h.run(`UPDATE checkins SET created_at = ?`, Date.now() - 61 * 60_000);
    expect((await repo.checkInByMembershipId('t1', 't1_u-mem')).ok).toBe(true);
    expect(await visits()).toHaveLength(2);
  });

  it('a guardian entry is recorded as "guardian", not "ok"', async () => {
    await w.h.addUser('u-kid', ['member']);
    await w.h.run(`UPDATE memberships SET display_name = 'Can', birth_date = ?, guardian_id = 'u-mem', guardian_status = 'approved' WHERE member_id = 'u-kid'`, Date.now() - 9 * 365 * DAY);
    await pkg('u-kid', { name: 'Çocuk' });
    const out = await repo.checkInByMembershipId('t1', 't1_u-mem');
    expect(out).toMatchObject({ ok: true, access: 'ok', packageLabel: 'Can velisi · Çocuk' });
    expect((await visits())[0].accessReason).toBe('guardian');
  });

  it('a warning is NOT written; staff confirm it and the SHOWN reason is the recorded one', async () => {
    const out = await repo.checkInByMembershipId('t1', 't1_u-mem');
    expect(out).toEqual({ ok: true, name: 'Ali Üye', access: 'warn', packageLabel: null, warnReason: 'no-package', membershipDocId: 't1_u-mem' });
    expect(await visits()).toEqual([]);
    expect(await repo.confirmCheckInDespiteWarning('t1', 't1_u-mem', 'no-package')).toEqual({ ok: true, name: 'Ali Üye' });
    expect(await visits()).toMatchObject([{ accessReason: 'no-package' }]);
    // the pause between warning and tap is real time: a second confirm is a duplicate
    expect(await repo.confirmCheckInDespiteWarning('t1', 't1_u-mem', 'no-package')).toEqual({ ok: false, reason: 'already-checked-in' });
  });

  it('wrong gym, unknown member and inactive member are named before anything is written', async () => {
    expect(await repo.checkInByMembershipId('t1', 't2_u-mem')).toEqual({ ok: false, reason: 'wrong-tenant' });
    expect(await repo.checkInByMembershipId('t1', 't1_nobody')).toEqual({ ok: false, reason: 'not-found' });
    expect(await repo.confirmCheckInDespiteWarning('t1', 't1_nobody', 'frozen')).toEqual({ ok: false, reason: 'not-found' });
    await w.h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-mem'`);
    expect(await repo.checkInByMembershipId('t1', 't1_u-mem')).toEqual({ ok: false, reason: 'inactive' });
    expect(await visits()).toEqual([]);
  });

  it('a trainer (staff but without the check-in permission) can look but not record: the Worker refuses with a sentence', async () => {
    await w.h.addUser('u-trn', ['trainer']);
    await pkg('u-mem');
    as('fb-trn');
    const e: any = await repo.checkInByMembershipId('t1', 't1_u-mem').catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
    expect(await visits()).toEqual([]);
  });

  it('KNOWN GAP: a front-desk helper who only holds the delegated permission cannot read the member, so the scan is "not-found"', async () => {
    await w.h.addUser('u-desk', ['member'], { permissions: ['checkin'] });
    await pkg('u-mem');
    as('fb-desk');
    expect(await repo.checkInByMembershipId('t1', 't1_u-mem')).toEqual({ ok: false, reason: 'not-found' });
  });
});

describe('short code (checkInByShortCode)', () => {
  it('finds the member in this gym, records the visit; an unknown code and another gym\'s code are "not-found"', async () => {
    await pkg('u-mem');
    expect(await repo.checkInByShortCode('t1', '123456')).toEqual({ ok: true, name: 'Ali Üye', access: 'ok', packageLabel: 'Aylık Üyelik' });
    expect(await repo.checkInByShortCode('t1', '000000')).toEqual({ ok: false, reason: 'not-found' });
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Gym 2',1)`);
    await w.h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, short_code, requested_at) VALUES ('t2','u-mem','active','["member"]','999999',1)`);
    expect(await repo.checkInByShortCode('t1', '999999')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('a member created a moment ago is found (a cached roster is not trusted for a miss)', async () => {
    await repo.checkInByShortCode('t1', '123456');                       // fills the roster cache
    await w.h.addUser('u-new', ['member']);
    await w.h.run(`UPDATE memberships SET short_code = '777777', display_name = 'Yeni' WHERE member_id = 'u-new'`);
    expect(await repo.checkInByShortCode('t1', '777777')).toMatchObject({ ok: true, name: 'Yeni', access: 'warn', warnReason: 'no-package' });
  });

  it('inactive members are named', async () => {
    await w.h.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-mem'`);
    expect(await repo.checkInByShortCode('t1', '123456')).toEqual({ ok: false, reason: 'inactive' });
  });
});

describe('a member\'s own history (watchMyCheckins)', () => {
  const dates = (since: Date, who = 'fb-mem') =>
    new Promise<Date[]>((resolve, reject) => {
      as(who);
      const stop = repo.watchMyCheckins('t1', 'u-mem', since, (d) => { queueMicrotask(stop); resolve(d); }, reject as never);
    });

  it('newest first, only since the window start', async () => {
    const now = Date.now();
    for (const [i, at] of [now - 10 * DAY, now - 2 * DAY, now - HOUR].entries()) {
      await w.h.run(`INSERT INTO checkins (id, tenant_id, member_id, data, created_at) VALUES (?, 't1', 'u-mem', '{"accessReason":"ok"}', ?)`, 'c' + i, at);
    }
    const out = await dates(new Date(now - 3 * DAY));
    expect(out.map((d) => d.getTime())).toEqual([now - HOUR, now - 2 * DAY]);
  });

  it('a new visit shows at once for a member watching', async () => {
    await pkg('u-mem');
    as('fb-mem');
    const seen: Date[][] = [];
    const stop = repo.watchMyCheckins('t1', 'u-mem', new Date(Date.now() - DAY), (d) => seen.push(d));
    await vi.waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0]).toEqual([]);
    as('fb-admin');                                                   // the desk scans while the member's phone is open
    await repo.checkInByMembershipId('t1', 't1_u-mem');
    await vi.waitFor(() => expect(seen.length).toBe(2), { timeout: 3000 });
    expect(seen[1]).toHaveLength(1);
    stop();
  });

  it('another member\'s history is refused through onError', async () => {
    await w.h.addUser('u-x', ['member']);
    const e: any = await dates(new Date(0), 'fb-x').catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
  });
});

describe('gym-wide lists are a named gap; the wording is the app\'s', () => {
  it('today\'s count and list give the screen its error callback, never a made-up 0 / empty list', () => {
    const onChange = vi.fn(); const onError = vi.fn();
    repo.watchTodayCheckinCount('t1', onChange, onError);
    repo.watchTodayCheckins('t1', onChange, onError);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][0].message).toMatch(/^GAP\(api\): GET \/tenants\/:t\/checkins\?from=/);
    expect(onChange).not.toHaveBeenCalled();
    expect(() => repo.watchTodayCheckinCount('t1', onChange)).toThrow(/GAP\(api\)/);
  });

  it('WARN_MESSAGE is the Firestore repo\'s own constant', () => {
    expect(repo.WARN_MESSAGE).toBe(fb.WARN_MESSAGE);
    expect(repo.WARN_MESSAGE['no-package']).toBe('Üyelik paketi yok.');
  });
});
