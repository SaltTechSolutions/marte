import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

import * as fb from '../firebase/renewalRequestRepo';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './renewalRequestRepo';
import type { RenewalRequest } from '../types';

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
beforeEach(async () => { w = await world(); await w.h.run(`UPDATE users SET display_name = 'Üye Bir' WHERE id = 'u-mem'`); });
afterEach(() => { stops.splice(0).forEach((s) => s()); });

const ask = (note?: string) => repo.requestRenewal({ tenantId: 't1', memberId: 'fb-mem', memberName: 'yok sayılır', note });

describe('renewal requests', () => {
  it('id helper matches the Firebase module', () => {
    expect(repo.renewalRequestId('t1', 'abc')).toBe(fb.renewalRequestId('t1', 'abc'));
  });

  it('member asks (note trimmed), sees the state, a second ask while open is refused, then withdraws', async () => {
    const mine = vi.fn();
    stops.push(repo.watchMyRenewalRequest('t1', 'fb-mem', mine));
    await calls(mine);
    expect(lastCall<RenewalRequest | null>(mine)).toBeNull();

    await ask('  Haftaya yenilemek istiyorum  ');
    await vi.waitFor(() => expect(lastCall<RenewalRequest | null>(mine)).toMatchObject({
      tenantId: 't1', memberId: 'fb-mem', memberName: 'Üye Bir', status: 'pending', note: 'Haftaya yenilemek istiyorum',
    }));
    const again = await refusal(ask());
    expect(again.code).toBe('functions/failed-precondition');
    expect(again.message).toMatch(/Zaten bekleyen/);

    await repo.withdrawRenewal('t1', 'fb-mem');
    await vi.waitFor(() => expect(lastCall<RenewalRequest | null>(mine)?.status).toBe('withdrawn'));
    await ask();                                                          // a new request after withdrawing re-opens the same row
    await vi.waitFor(() => expect(lastCall<RenewalRequest | null>(mine)).toMatchObject({ status: 'pending' }));
    expect((await w.h.one(`SELECT count(*) AS n FROM renewal_requests`)).n).toBe(1);
  });

  it('the admin sees every open request and closes one by hand; handled drops out of the pending list', async () => {
    await ask('x');
    w.as('admin');
    const open = vi.fn();
    stops.push(repo.watchPendingRenewals('t1', open));
    await calls(open);
    expect(lastCall<RenewalRequest[]>(open).map((r) => [r.memberId, r.status])).toEqual([['u-mem', 'pending']]);

    await repo.markRenewalHandled('t1', 'u-mem', 'fb-admin');
    await vi.waitFor(() => expect(lastCall<RenewalRequest[]>(open)).toEqual([]));
    const row = await w.h.one(`SELECT status, handled_by FROM renewal_requests`);
    expect(row).toEqual({ status: 'handled', handled_by: 'u-admin' });

    w.as('mem');
    const mine = vi.fn();
    stops.push(repo.watchMyRenewalRequest('t1', 'fb-mem', mine));
    await calls(mine);
    expect(lastCall<RenewalRequest>(mine)).toMatchObject({ status: 'handled', handledAt: expect.any(Date) });
  });

  it('a member sees only their own request; closing is admin-only', async () => {
    await w.h.addUser('u-other', ['member']);
    await ask();
    w.as('other');
    const mine = vi.fn(); const pending = vi.fn();
    stops.push(repo.watchMyRenewalRequest('t1', 'fb-other', mine));
    stops.push(repo.watchPendingRenewals('t1', pending));
    await calls(mine); await calls(pending);
    expect(lastCall<RenewalRequest | null>(mine)).toBeNull();
    expect(lastCall<RenewalRequest[]>(pending).every((r) => r.memberId === 'fb-other')).toBe(true);   // own rows only, never the gym's
    expect(lastCall<RenewalRequest[]>(pending)).toEqual([]);
    expect((await refusal(repo.markRenewalHandled('t1', 'u-mem', 'fb-other'))).code).toBe('functions/permission-denied');
  });
});
