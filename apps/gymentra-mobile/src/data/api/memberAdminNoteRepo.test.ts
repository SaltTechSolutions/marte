import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

import * as fb from '../firebase/memberAdminNoteRepo';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './memberAdminNoteRepo';
import type { MemberNote } from '../types';

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
beforeEach(async () => { w = await world(); w.as('admin'); });
afterEach(() => { stops.splice(0).forEach((s) => s()); });

describe('admin note', () => {
  it('id helper and limit match the Firebase module', () => {
    expect(repo.memberAdminNoteId('t1', 'abc')).toBe(fb.memberAdminNoteId('t1', 'abc'));
    expect(repo.MEMBER_ADMIN_NOTE_MAX).toBe(fb.MEMBER_ADMIN_NOTE_MAX);
  });

  it('null when there is none; saved note shows; blank deletes; over-long text is cut instead of refused', async () => {
    const onChange = vi.fn();
    stops.push(repo.watchMemberAdminNote('t1', 'u-mem', onChange));
    await calls(onChange);
    expect(lastCall<MemberNote | null>(onChange)).toBeNull();

    await repo.setMemberAdminNote({ tenantId: 't1', memberId: 'u-mem', text: ' Ödeme sorunu ', updatedBy: 'fb-admin' });
    await vi.waitFor(() => expect(lastCall<MemberNote | null>(onChange)).toMatchObject({ memberId: 'u-mem', text: 'Ödeme sorunu' }));

    await repo.setMemberAdminNote({ tenantId: 't1', memberId: 'u-mem', text: 'y'.repeat(3000), updatedBy: 'fb-admin' });
    expect((await w.h.one(`SELECT length(text) AS n FROM member_admin_notes WHERE member_id = 'u-mem'`)).n).toBe(2000);

    await repo.setMemberAdminNote({ tenantId: 't1', memberId: 'u-mem', text: '', updatedBy: 'fb-admin' });
    await vi.waitFor(() => expect(lastCall<MemberNote | null>(onChange)).toBeNull());
  });

  it('is admin-only: a trainer and the member are refused, for reading and for writing', async () => {
    await w.h.addUser('u-coach', ['trainer']);
    for (const who of ['coach', 'mem']) {
      w.as(who);
      const onError = vi.fn();
      stops.push(repo.watchMemberAdminNote('t1', 'u-mem', vi.fn(), onError));
      await calls(onError);
      expect((await refusal(repo.setMemberAdminNote({ tenantId: 't1', memberId: 'u-mem', text: 'x', updatedBy: 'z' }))).code).toBe('functions/permission-denied');
    }
  });
});
