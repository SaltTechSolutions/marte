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
    expect(notCoach.message).toBe('Takvim yalnızca bir antrenörle paylaşılabilir.');
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

describe('the two lists are a named gap (the Worker has no read route)', () => {
  it('the screen gets its error callback, never an empty list; without a callback it throws', () => {
    const onChange = vi.fn(); const onError = vi.fn();
    const unsubA = repo.watchSharesIGranted('t1', 'u-trn', onChange, onError);
    const unsubB = repo.watchSharesGrantedToMe('t1', 'u-trn', onChange, onError);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][0].message).toMatch(/^GAP\(api\): GET \/tenants\/:t\/calendar-shares\?as=owner/);
    expect(onError.mock.calls[1][0].message).toMatch(/as=viewer/);
    expect(onChange).not.toHaveBeenCalled();
    expect(() => { unsubA(); unsubB(); }).not.toThrow();
    expect(() => repo.watchSharesIGranted('t1', 'u-trn', onChange)).toThrow(/GAP\(api\)/);
  });
});
