import { describe, expect, it, vi } from 'vitest';

import { creditRollover, expirePendingPackageChangeRequests, notifyExpiringPackages, runPackageJobs, sweepPackageStatuses } from '../src/jobs/packageJobs';
import { istanbulDayStart, trDate } from '../src/pkgSupport';
import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 18, 21, 30);          // 18 Oct 2026 21:30 UTC = 19 Oct 00:30 in Istanbul

const ent = { gymAccess: true, groupClasses: { unlimited: false, count: 8, periodDays: 30 }, ptLessons: { count: 2, periodDays: 14 } };

async function world() {
  const h = await harness();
  await h.run(`INSERT INTO gym_packages (id, tenant_id, data) VALUES ('gp1','t1','{}')`);
  const mp = (id: string, o: { status?: string; endsAt?: number; member?: string; data?: object; frozenUntil?: number | null; pkg?: string } = {}) =>
    h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at, frozen_until)
           VALUES (?, 't1', ?, ?, 1000, 1, ?, ?, ?, 1, ?)`, id, o.member ?? 'u-mem', o.pkg ?? 'gp1', o.endsAt ?? NOW + 30 * DAY, o.status ?? 'active',
      JSON.stringify({ kind: 'membership', packageName: 'Aylık', memberName: 'Üye', entitlements: ent, ...(o.data ?? {}) }), o.frozenUntil ?? null);
  const credit = (id: string, o: { kind?: string; source?: string; pkg?: string; status?: string; expiresAt?: number; total?: number; used?: number } = {}) =>
    h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
           VALUES (?, 't1', 'u-mem', ?, ?, ?, ?, ?, 1, ?, ?)`, id, o.kind ?? 'ptLesson', o.source ?? 'entitlement', o.pkg ?? 'mp1', o.total ?? 2, o.used ?? 0, o.expiresAt ?? NOW - 1, o.status ?? 'active');
  const outbox = async (like = '%') => (await h.db.prepare(`SELECT payload, dedupe_key FROM outbox WHERE dedupe_key LIKE ? ORDER BY dedupe_key`).bind(like).all<any>()).results
    .map((r: any) => ({ ...JSON.parse(r.payload), dedupe: r.dedupe_key }));
  return { ...h, mp, credit, outbox };
}

describe('time helpers', () => {
  it('Istanbul day boundaries use a fixed UTC+3', () => {
    expect(istanbulDayStart(NOW)).toBe(Date.UTC(2026, 9, 18, 21, 0));
    expect(istanbulDayStart(Date.UTC(2026, 9, 18, 20, 59, 59, 999))).toBe(Date.UTC(2026, 9, 17, 21, 0));
    expect(istanbulDayStart(Date.UTC(2026, 9, 18, 21, 0))).toBe(Date.UTC(2026, 9, 18, 21, 0));
    expect(trDate(Date.UTC(2026, 9, 18, 21, 30))).toBe('19.10.2026');
    expect(trDate(Date.UTC(2026, 9, 18, 20, 59))).toBe('18.10.2026');
  });
});

describe('creditRollover (PKG-2)', () => {
  it('expires every past-due credit; active AND exhausted entitlement credits roll into the next period with a deterministic id', async () => {
    const w = await world();
    await w.mp('mp1');
    await w.credit('c-active', { kind: 'ptLesson' });
    await w.credit('c-spent', { kind: 'ptLesson', used: 2, status: 'exhausted' });
    await w.credit('c-group', { kind: 'groupClass', total: 8, used: 3 });
    await w.credit('c-future', { expiresAt: NOW + DAY });
    await w.credit('c-dead', { status: 'expired' });
    const r = await creditRollover(w.db, NOW);
    expect(r).toEqual({ due: 3, expired: 3, renewed: 3, skipped: 0, more: false });
    expect(await w.one(`SELECT status s FROM member_credits WHERE id = 'c-active'`)).toEqual({ s: 'expired' });
    expect(await w.one(`SELECT status s FROM member_credits WHERE id = 'c-spent'`)).toEqual({ s: 'expired' });
    expect(await w.one(`SELECT status s FROM member_credits WHERE id = 'c-future'`)).toEqual({ s: 'active' });
    expect(await w.one(`SELECT * FROM member_credits WHERE id = 'c-active_next'`)).toMatchObject({
      tenant_id: 't1', member_id: 'u-mem', kind: 'ptLesson', source: 'entitlement', source_package_id: 'mp1', total: 2, used: 0, starts_at: NOW, expires_at: NOW + 14 * DAY, status: 'active' });
    expect(await w.one(`SELECT total t, expires_at e FROM member_credits WHERE id = 'c-group_next'`)).toEqual({ t: 8, e: NOW + 30 * DAY });
    expect(await w.one(`SELECT used u FROM member_credits WHERE id = 'c-spent_next'`)).toEqual({ u: 0 });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE id LIKE '%_next'`)).toEqual({ c: 3 });
  });

  it('is idempotent: a second run (or a redelivered one) changes nothing', async () => {
    const w = await world();
    await w.mp('mp1');
    await w.credit('c1');
    await creditRollover(w.db, NOW);
    const snap = JSON.stringify((await w.db.prepare(`SELECT * FROM member_credits ORDER BY id`).all()).results);
    expect(await creditRollover(w.db, NOW)).toEqual({ due: 0, expired: 0, renewed: 0, skipped: 0, more: false });
    expect(await creditRollover(w.db, NOW + 1000)).toMatchObject({ due: 0 });
    expect(JSON.stringify((await w.db.prepare(`SELECT * FROM member_credits ORDER BY id`).all()).results)).toBe(snap);
    // crash-recovery shape: the successor already exists but the source is still due -> expired, no second row, no error
    await w.run(`UPDATE member_credits SET status = 'active' WHERE id = 'c1'`);
    await creditRollover(w.db, NOW);
    expect((await w.one(`SELECT status s FROM member_credits WHERE id = 'c1'`)).s).toBe('expired');
    expect(await w.one(`SELECT count(*) c FROM member_credits`)).toEqual({ c: 2 });
  });

  it('only expires (no successor) when: purchased bundle, package not active / ended / gone, quota removed, unlimited group classes', async () => {
    const w = await world();
    await w.mp('mp1');
    await w.mp('mp-frozen', { status: 'frozen' });
    await w.mp('mp-cancelled', { status: 'cancelled' });
    await w.mp('mp-ended', { endsAt: NOW });                                       // ends_at must be > now
    await w.mp('mp-noquota', { data: { entitlements: { gymAccess: true } } });
    await w.mp('mp-unlimited', { data: { entitlements: { gymAccess: true, groupClasses: { unlimited: true } } } });
    await w.credit('purchase', { source: 'purchase' });
    for (const p of ['mp-frozen', 'mp-cancelled', 'mp-ended', 'mp-noquota', 'mp-ghost']) await w.credit('c-' + p, { pkg: p });
    await w.credit('c-unlimited', { pkg: 'mp-unlimited', kind: 'groupClass' });
    const r = await creditRollover(w.db, NOW);
    expect(r).toMatchObject({ due: 7, expired: 7, renewed: 0, skipped: 7 });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE status = 'active'`)).toEqual({ c: 0 });
    expect(await w.one(`SELECT count(*) c FROM member_credits`)).toEqual({ c: 7 });
  });

  it("a package cancelled 'until-end' stays active, so its periodic credits keep renewing until it ends", async () => {
    const w = await world();
    await w.mp('mp1', { data: { cancelledAt: 5, cancellationAccess: 'until-end' } });
    await w.credit('c1');
    expect(await creditRollover(w.db, NOW)).toMatchObject({ renewed: 1 });
  });

  it('is chunked: at most `limit` credits per call, `more` says there is a rest, repeated calls drain it', async () => {
    const w = await world();
    await w.mp('mp1');
    for (let i = 0; i < 30; i++) await w.credit('c' + String(i).padStart(2, '0'), { expiresAt: NOW - 1000 + i });
    const a = await creditRollover(w.db, NOW, 12);
    expect(a).toMatchObject({ due: 12, expired: 12, renewed: 12, more: true });
    const b = await creditRollover(w.db, NOW, 12);
    expect(b).toMatchObject({ due: 12, more: true });
    const c = await creditRollover(w.db, NOW, 12);
    expect(c).toMatchObject({ due: 6, expired: 6, renewed: 6, more: false });
    expect(await w.one(`SELECT count(*) c FROM member_credits WHERE status = 'active'`)).toEqual({ c: 30 });   // 30 successors
  });
});

describe('expirePendingPackageChangeRequests (PKG-6)', () => {
  const req = (w: Awaited<ReturnType<typeof world>>, id: string, status: string, expiresAt: number) =>
    w.run(`INSERT INTO package_change_requests (id, tenant_id, member_id, data, effective_at, expires_at, status, created_by, created_at) VALUES (?, 't1', 'u-mem', '{}', 1, ?, ?, 'u-admin', 1)`, id, expiresAt, status);
  it('closes only pending offers past their deadline; idempotent; chunked', async () => {
    const w = await world();
    await req(w, 'due1', 'pending', NOW - 1);
    await req(w, 'due2', 'pending', NOW);
    await req(w, 'future', 'pending', NOW + 1);
    await req(w, 'done', 'approved', NOW - 1);
    await req(w, 'cancelled', 'cancelled', NOW - 1);
    expect(await expirePendingPackageChangeRequests(w.db, NOW)).toEqual({ expired: 2, more: false });
    const st = (await w.db.prepare(`SELECT id, status FROM package_change_requests ORDER BY id`).all<any>()).results;
    expect(st).toEqual([{ id: 'cancelled', status: 'cancelled' }, { id: 'done', status: 'approved' }, { id: 'due1', status: 'expired' }, { id: 'due2', status: 'expired' }, { id: 'future', status: 'pending' }]);
    expect(await expirePendingPackageChangeRequests(w.db, NOW)).toEqual({ expired: 0, more: false });
    for (let i = 0; i < 5; i++) await req(w, 'x' + i, 'pending', NOW - 10);
    expect(await expirePendingPackageChangeRequests(w.db, NOW, 3)).toEqual({ expired: 3, more: true });
    expect(await expirePendingPackageChangeRequests(w.db, NOW, 3)).toEqual({ expired: 2, more: false });
  });
});

describe('sweepPackageStatuses (PKG-10 + PKG-12)', () => {
  const freezes = (endsAt: number) => ({ freezes: [{ startsAt: 1, endsAt, days: 5 }] });
  it('un-freezes when the freeze span is over (to active, or straight to expired if the package ended too) and expires lapsed packages', async () => {
    const w = await world();
    await w.mp('over', { status: 'frozen', frozenUntil: NOW - 1 });
    await w.mp('over-and-ended', { status: 'frozen', frozenUntil: NOW - 1, endsAt: NOW - 5 });
    await w.mp('still-frozen', { status: 'frozen', frozenUntil: NOW + DAY });
    await w.mp('legacy-json', { status: 'frozen', frozenUntil: null, data: freezes(NOW - 10) });          // no column value: falls back to freezes[last].endsAt
    await w.mp('no-record', { status: 'frozen', frozenUntil: null });                                      // nothing says when it ends: left alone (as in Firebase)
    await w.mp('lapsed', { endsAt: NOW - 1 });
    await w.mp('lapsed-edge', { endsAt: NOW });
    await w.mp('fine', { endsAt: NOW + 1 });
    await w.mp('cancelled-old', { status: 'cancelled', endsAt: NOW - 1 });
    const r = await sweepPackageStatuses(w.db, NOW);
    expect(r).toEqual({ resumed: 3, expired: 2, more: false });
    const st = Object.fromEntries((await w.db.prepare(`SELECT id, status FROM member_packages`).all<any>()).results.map((x: any) => [x.id, x.status]));
    expect(st).toEqual({ over: 'active', 'over-and-ended': 'expired', 'still-frozen': 'frozen', 'legacy-json': 'active', 'no-record': 'frozen',
      lapsed: 'expired', 'lapsed-edge': 'expired', fine: 'active', 'cancelled-old': 'cancelled' });
    expect((await w.one(`SELECT frozen_until f FROM member_packages WHERE id = 'over'`)).f).toBeNull();
    // the in-use counter follows: active + frozen are in use
    expect(await w.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = 'gp1'`)).toEqual({ n: 5 });   // over, still-frozen, legacy-json, no-record, fine
  });

  it('is idempotent and chunked; the counter is reconciled in the same step', async () => {
    const w = await world();
    for (let i = 0; i < 7; i++) await w.mp('a' + i, { endsAt: NOW - 1 - i });
    for (let i = 0; i < 5; i++) await w.mp('f' + i, { status: 'frozen', frozenUntil: NOW - 1 - i });
    await w.run(`UPDATE gym_packages SET active_assignment_count = 12 WHERE id = 'gp1'`);
    expect(await sweepPackageStatuses(w.db, NOW, 3)).toEqual({ resumed: 3, expired: 3, more: true });
    expect(await sweepPackageStatuses(w.db, NOW, 3)).toEqual({ resumed: 2, expired: 3, more: true });
    expect(await sweepPackageStatuses(w.db, NOW, 3)).toEqual({ resumed: 0, expired: 1, more: false });
    expect(await sweepPackageStatuses(w.db, NOW)).toEqual({ resumed: 0, expired: 0, more: false });
    expect(await w.one(`SELECT count(*) c FROM member_packages WHERE status = 'active'`)).toEqual({ c: 5 });
    expect(await w.one(`SELECT active_assignment_count n FROM gym_packages WHERE id = 'gp1'`)).toEqual({ n: 5 });
  });
});

describe('notifyExpiringPackages (ADMIN-3)', () => {
  const day = (offset: number, hh = 12, mm = 0) => istanbulDayStart(NOW) + offset * DAY + hh * 3_600_000 + mm * 60_000;   // Istanbul wall clock
  it('fires on exactly 7 and exactly 1 Istanbul days left - not on 6, 8 or at the boundary of the next day', async () => {
    const w = await world();
    await w.mp('d7-late', { endsAt: day(7, 23, 59) });                         // 26 Oct 23:59 Istanbul = 20:59 UTC: outside a UTC-day window
    await w.mp('d7-early', { endsAt: day(7, 0, 0) });
    await w.mp('d8-edge', { endsAt: day(8, 0, 0) });                           // next day, 00:00 sharp
    await w.mp('d6-edge', { endsAt: day(7, 0, 0) - 1 });
    await w.mp('d1', { endsAt: day(1, 9) });
    await w.mp('d3', { endsAt: day(3) });
    const r = await notifyExpiringPackages(w.db, NOW);
    expect(r).toEqual({ notified: 3, more: false });
    const sent = (await w.outbox('pkg-expiry:%member')).map((o) => o.dedupe).sort();
    expect(sent).toEqual(['pkg-expiry:d1:1:member', 'pkg-expiry:d7-early:7:member', 'pkg-expiry:d7-late:7:member']);
    const m7 = (await w.outbox('pkg-expiry:d7-late:7:member'))[0];
    expect(m7).toMatchObject({ userIds: ['u-mem'], title: 'Paketin bitmek üzere', body: 'Aylık paketin 7 gün sonra sona eriyor.', category: 'packages' });
    expect((await w.outbox('pkg-expiry:d1:1:member'))[0].body).toBe('Aylık paketin yarın sona eriyor.');
    const a = (await w.outbox('pkg-expiry:d1:1:admins'))[0];
    expect(a).toMatchObject({ title: 'Paket bitmek üzere', body: 'Üye · Aylık yarın bitiyor.', category: 'packages' });
    expect(a.userIds).toEqual(['u-admin']);
    expect(JSON.parse((await w.one(`SELECT data d FROM member_packages WHERE id = 'd1'`)).d).notifiedExpiryAt).toBe(1);
    expect(JSON.parse((await w.one(`SELECT data d FROM member_packages WHERE id = 'd3'`)).d).notifiedExpiryAt).toBeUndefined();
  });

  it('warns once per stage: a re-run sends nothing; the same package gets the 7-day and later the 1-day warning', async () => {
    const w = await world();
    await w.mp('p', { endsAt: NOW + 7 * DAY });
    expect(await notifyExpiringPackages(w.db, NOW)).toMatchObject({ notified: 1 });
    expect(await notifyExpiringPackages(w.db, NOW)).toMatchObject({ notified: 0 });
    expect(await notifyExpiringPackages(w.db, NOW + 3_600_000)).toMatchObject({ notified: 0 });     // same Istanbul day, an hour later
    expect(await w.outbox('pkg-expiry:%')).toHaveLength(2);                                          // member + admins, once
    expect(await notifyExpiringPackages(w.db, NOW + 6 * DAY)).toMatchObject({ notified: 1 });       // 1 day left now
    expect(await w.outbox('pkg-expiry:p:1:%')).toHaveLength(2);
    expect(await notifyExpiringPackages(w.db, NOW + 6 * DAY)).toMatchObject({ notified: 0 });
    expect(await w.outbox('pkg-expiry:%')).toHaveLength(4);
  });

  it('skips packages that are not active, tells only the member when the gym has no active admin, and honours the limit', async () => {
    const w = await world();
    await w.mp('frozen', { status: 'frozen', endsAt: NOW + 7 * DAY });
    await w.mp('cancelled', { status: 'cancelled', endsAt: NOW + 7 * DAY });
    await w.mp('ok', { endsAt: NOW + 7 * DAY });
    await w.run(`UPDATE memberships SET status = 'suspended' WHERE member_id = 'u-admin'`);
    expect(await notifyExpiringPackages(w.db, NOW)).toEqual({ notified: 1, more: false });
    expect(await w.outbox('pkg-expiry:%')).toHaveLength(1);                                          // member only
    const w2 = await world();
    for (let i = 0; i < 5; i++) await w2.mp('q' + i, { endsAt: NOW + 7 * DAY + i });
    expect(await notifyExpiringPackages(w2.db, NOW, 3)).toEqual({ notified: 3, more: true });
    expect(await notifyExpiringPackages(w2.db, NOW, 3)).toEqual({ notified: 2, more: false });
    expect(await w2.outbox('pkg-expiry:%member')).toHaveLength(5);
  });
});

describe('runPackageJobs', () => {
  it('runs every job and reports each; one failing job does not starve the rest', async () => {
    const w = await world();
    await w.mp('lapsed', { endsAt: NOW - 1 });
    const out = await runPackageJobs(w.db, NOW) as any;
    expect(Object.keys(out).sort()).toEqual(['creditRollover', 'expirePendingPackageChangeRequests', 'notifyExpiringPackages', 'sweepPackageStatuses']);
    expect(out.sweepPackageStatuses).toMatchObject({ expired: 1 });
    await w.run(`DROP TABLE package_change_requests`);
    const broken = await runPackageJobs(w.db, NOW) as any;
    expect(broken.expirePendingPackageChangeRequests.error).toBeTruthy();
    expect(broken.sweepPackageStatuses).toBeDefined();
    expect(broken.notifyExpiringPackages.error).toBeUndefined();
  });
});
