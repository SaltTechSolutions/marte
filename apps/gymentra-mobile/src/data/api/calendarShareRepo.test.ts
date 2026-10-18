import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const { __resetSupport } = await import('./classSupport');
const { resetSharedWatches } = await import('../firebase/sharedWatch');
const repo = await import('./calendarShareRepo');

type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const as = (sub: string) => { w.signInAs(sub); __resetSupport(); };
const shares = async () => (await w.h.db.prepare(`SELECT owner_trainer_id o, viewer_trainer_id v FROM calendar_shares ORDER BY o, v`).all<any>()).results;

beforeEach(async () => {
  __resetSupport();
  w = await startWorld();
  await w.h.addUser('u-trn', ['trainer']);
  await w.h.addUser('u-trn2', ['trainer']);
});
afterEach(() => resetSharedWatches());

describe('granting and revoking', () => {
  it('a coach shares their own calendar with a colleague; once is enough; revoking removes it', async () => {
    as('fb-trn');
    const p = { tenantId: 't1', ownerTrainerId: 'u-trn', ownerTrainerName: 'Mert', viewerTrainerId: 'u-trn2' };
    await repo.grantCalendarShare(p);
    await repo.grantCalendarShare(p);                      // idempotent: one grant per viewer
    expect(await shares()).toEqual([{ o: 'u-trn', v: 'u-trn2' }]);
    await repo.revokeCalendarShare('t1', 'u-trn', 'u-trn2');
    expect(await shares()).toEqual([]);
  });

  it('refusals: a member cannot share, the viewer must be a coach, nobody revokes someone else\'s share', async () => {
    const p = { tenantId: 't1', ownerTrainerId: 'u-mem', ownerTrainerName: 'Ali', viewerTrainerId: 'u-trn' };
    expect(((await repo.grantCalendarShare(p).catch((e) => e)) as any).code).toBe('functions/permission-denied');
    as('fb-trn');
    const notCoach: any = await repo.grantCalendarShare({ ...p, ownerTrainerId: 'u-trn', viewerTrainerId: 'u-mem' }).catch((e) => e);
    expect(notCoach.code).toBe('functions/invalid-argument');
    expect(notCoach.message).toBe('Takvim yalnızca başka bir antrenörle paylaşılabilir.');
    await repo.grantCalendarShare({ ...p, ownerTrainerId: 'u-trn', viewerTrainerId: 'u-trn2' });
    as('fb-trn2');
    expect(((await repo.revokeCalendarShare('t1', 'u-trn', 'u-trn2').catch((e) => e)) as any).code).toBe('functions/permission-denied');
    expect(await shares()).toHaveLength(1);
    as('fb-admin');
    await repo.revokeCalendarShare('t1', 'u-trn', 'u-trn2');   // an admin may
    expect(await shares()).toEqual([]);
  });

  it('calendarShareId is the Firestore document id', () => {
    expect(repo.calendarShareId('t1', 'a', 'b')).toBe('t1_a_b');
  });
});

describe('the lists', () => {
  const sub = (fn: 'watchSharesIGranted' | 'watchSharesGrantedToMe', who: string) =>
    new Promise<any[]>((resolve, reject) => {
      const stop = repo[fn]('t1', who, (l) => { queueMicrotask(stop); resolve(l); }, reject as never);
    });

  it('"I granted" and "granted to me" are the caller\'s own side, with names and the Firestore document id', async () => {
    await w.h.run(`UPDATE memberships SET display_name = 'Mert' WHERE member_id = 'u-trn'`);
    await w.h.run(`UPDATE memberships SET display_name = 'Ece' WHERE member_id = 'u-trn2'`);
    await w.h.run(`INSERT INTO calendar_shares (tenant_id, owner_trainer_id, viewer_trainer_id, created_at) VALUES ('t1','u-trn','u-trn2',1000)`);
    as('fb-trn');
    const mine = await sub('watchSharesIGranted', 'u-trn');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: 't1_u-trn_u-trn2', tenantId: 't1', ownerTrainerId: 'u-trn', ownerTrainerName: 'Mert', viewerTrainerId: 'u-trn2' });
    expect(mine[0].createdAt).toEqual(new Date(1000));
    expect(await sub('watchSharesGrantedToMe', 'u-trn')).toEqual([]);
    as('fb-trn2');
    const toMe = await sub('watchSharesGrantedToMe', 'u-trn2');
    expect(toMe.map((s) => [s.ownerTrainerId, s.ownerTrainerName, s.viewerTrainerId])).toEqual([['u-trn', 'Mert', 'u-trn2']]);
    expect(await sub('watchSharesIGranted', 'u-trn2')).toEqual([]);
  });

  it('a grant shows in the owner\'s list at once (the list is invalidated by the write)', async () => {
    as('fb-trn');
    const seen: any[][] = [];
    const stop = repo.watchSharesIGranted('t1', 'u-trn', (l) => seen.push(l));
    await vi.waitFor(() => expect(seen.length).toBe(1));
    await repo.grantCalendarShare({ tenantId: 't1', ownerTrainerId: 'u-trn', ownerTrainerName: 'Mert', viewerTrainerId: 'u-trn2' });
    await vi.waitFor(() => expect(seen.length).toBe(2), { timeout: 3000 });
    expect(seen[1].map((s) => s.viewerTrainerId)).toEqual(['u-trn2']);
    stop();
  });

  it('a plain member cannot list shares (onError)', async () => {
    const e: any = await sub('watchSharesIGranted', 'u-mem').catch((x) => x);
    expect(e.code).toBe('functions/permission-denied');
  });
});
