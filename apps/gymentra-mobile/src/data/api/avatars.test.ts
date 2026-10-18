import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.setConfig({ testTimeout: 60_000 });

import { resetSharedWatches } from '../firebase/sharedWatch';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './membershipRepo';
import type { TenantMembership } from '../types';

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
const keep = (stop: () => void) => { stops.push(stop); return stop; };

beforeEach(async () => { w = await world(); });
afterEach(() => { stops.splice(0).forEach((s) => s()); resetSharedWatches(); });

const ME = 't1_fb-mem';

describe('member avatar through the Worker', () => {
  it('a member picks an avatar and the single-membership read returns it; no photoUrl exists any more', async () => {
    expect((await repo.getMembership('t1', 'fb-mem'))!.avatarId).toBeUndefined();
    await repo.updateMemberDetails(ME, { avatarId: 'summit' });
    const m = await repo.getMembership('t1', 'fb-mem');
    expect(m!.avatarId).toBe('summit');
    expect(m).not.toHaveProperty('photoUrl');
  });

  it('the staff roster carries it too', async () => {
    await repo.updateMemberDetails(ME, { avatarId: 'summit' });
    w.as('admin');
    const onChange = vi.fn();
    keep(repo.watchActiveMembers('t1', onChange));
    await calls(onChange);
    const row = lastCall<TenantMembership[]>(onChange).find((r) => r.userId === 'u-mem')!;
    expect(row.avatarId).toBe('summit');
    expect(row).not.toHaveProperty('photoUrl');
  });

  it('changing and then clearing works (null = back to initials); other details are untouched', async () => {
    await repo.updateMemberDetails(ME, { avatarId: 'rock', phone: '0555' });
    await repo.updateMemberDetails(ME, { avatarId: 'trail' });
    expect((await repo.getMembership('t1', 'fb-mem'))).toMatchObject({ avatarId: 'trail', phone: '0555' });
    await repo.updateMemberDetails(ME, { avatarId: null });
    const cleared = await repo.getMembership('t1', 'fb-mem');
    expect(cleared!.avatarId == null).toBe(true);
    expect(cleared!.phone).toBe('0555');
  });

  it('a bogus id is refused with a Turkish sentence and nothing is stored', async () => {
    await repo.updateMemberDetails(ME, { avatarId: 'rock' });
    for (const bad of ['my-own-image', 'Rock', '', 'https://img.example/a.jpg']) {
      const e = await refusal(repo.updateMemberDetails(ME, { avatarId: bad }));
      expect(e.code).toBe('functions/invalid-argument');
      expect(e.message).toBe('Bu avatar seçilemedi, listeden başka bir tane seç.');
    }
    expect((await repo.getMembership('t1', 'fb-mem'))!.avatarId).toBe('rock');
  });

  it('the Worker itself also refuses an id outside its list (client check is not the only line)', async () => {
    const res = await w.h.send('PATCH', '/v1/tenants/t1/members/u-mem/details', 'fb-mem', { avatarId: 'my-own-image' });
    expect(res.status).toBe(400);
  });

  it('an admin sets the avatar of a hand-added member but not of a real account', async () => {
    w.as('admin');
    const { memberId, membershipId } = await repo.createManagedMember({ tenantId: 't1', name: 'Elle Eklenen' });
    await repo.updateMemberDetails(membershipId, { avatarId: 'spark' });
    expect((await repo.getMembership('t1', memberId))!.avatarId).toBe('spark');
    expect((await refusal(repo.updateMemberDetails('t1_u-mem', { avatarId: 'rock' }))).code).toBe('functions/permission-denied');
  });
});
