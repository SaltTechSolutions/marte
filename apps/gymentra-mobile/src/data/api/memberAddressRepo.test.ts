import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

import * as fb from '../firebase/memberAddressRepo';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './memberAddressRepo';
import type { MemberAddress } from '../types';

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
beforeEach(async () => { w = await world(); });
afterEach(() => { stops.splice(0).forEach((s) => s()); });

describe('member address', () => {
  it('id helper and limit match the Firebase module', () => {
    expect(repo.memberAddressId('t1', 'abc')).toBe(fb.memberAddressId('t1', 'abc'));
    expect(repo.MEMBER_ADDRESS_MAX).toBe(fb.MEMBER_ADDRESS_MAX);
  });

  it('the member sets, reads, watches and clears their own address (id given as their Firebase uid)', async () => {
    expect(await repo.getMemberAddress('t1', 'fb-mem')).toBeNull();
    const onChange = vi.fn();
    stops.push(repo.watchMemberAddress('t1', 'fb-mem', onChange));
    await calls(onChange);
    expect(lastCall<MemberAddress | null>(onChange)).toBeNull();

    await repo.setMemberAddress({ tenantId: 't1', memberId: 'fb-mem', address: '  Moda Cd. 1  ', updatedBy: 'fb-mem' });
    expect(await repo.getMemberAddress('t1', 'fb-mem')).toMatchObject({ tenantId: 't1', memberId: 'fb-mem', address: 'Moda Cd. 1' });
    await vi.waitFor(() => expect(lastCall<MemberAddress | null>(onChange)?.address).toBe('Moda Cd. 1'));

    await repo.setMemberAddress({ tenantId: 't1', memberId: 'fb-mem', address: '   ', updatedBy: 'fb-mem' });
    await vi.waitFor(() => expect(lastCall<MemberAddress | null>(onChange)).toBeNull());
    expect(await w.h.one(`SELECT 1 AS x FROM member_addresses WHERE member_id = 'u-mem'`)).toBeFalsy();
  });

  it('an over-long address is cut to the limit', async () => {
    await repo.setMemberAddress({ tenantId: 't1', memberId: 'fb-mem', address: 'a'.repeat(400), updatedBy: 'fb-mem' });
    expect((await w.h.one(`SELECT length(address) AS n FROM member_addresses WHERE member_id = 'u-mem'`)).n).toBe(300);
  });

  it('an admin reads any address but writes only a hand-added member\'s; a trainer reads none', async () => {
    await repo.setMemberAddress({ tenantId: 't1', memberId: 'fb-mem', address: 'Gizli', updatedBy: 'fb-mem' });
    w.as('admin');
    expect((await repo.getMemberAddress('t1', 'u-mem'))!.address).toBe('Gizli');
    const e = await refusal(repo.setMemberAddress({ tenantId: 't1', memberId: 'u-mem', address: 'Başka', updatedBy: 'fb-admin' }));
    expect(e.code).toBe('functions/permission-denied');
    await w.h.run(`INSERT INTO users (id, display_name, created_at) VALUES ('mm1','El',1)`);
    await w.h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, managed, requested_at) VALUES ('t1','mm1','active','["member"]',1,1)`);
    await repo.setMemberAddress({ tenantId: 't1', memberId: 'mm1', address: 'Elle girildi', updatedBy: 'fb-admin' });
    expect((await repo.getMemberAddress('t1', 'mm1'))!.address).toBe('Elle girildi');

    await w.h.addUser('u-coach', ['trainer']);
    w.as('coach');
    expect((await refusal(repo.getMemberAddress('t1', 'u-mem'))).code).toBe('functions/permission-denied');
  });
});
