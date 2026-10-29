import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as fb from '../firebase/memberNoteRepo';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './memberNoteRepo';
import type { MemberNote } from '../types';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
beforeEach(async () => { w = await world(); w.as('admin'); await w.h.run(`UPDATE users SET display_name = 'Yönetici' WHERE id = 'u-admin'`); });
afterEach(() => { stops.splice(0).forEach((s) => s()); });

describe('trainer note', () => {
  it('id helper and limit match the Firebase module', () => {
    expect(repo.memberNoteId('t1', 'abc')).toBe(fb.memberNoteId('t1', 'abc'));
    expect(repo.MEMBER_NOTE_MAX).toBe(fb.MEMBER_NOTE_MAX);
  });

  it('no note is null; saving shows it (author name from the Worker); saving blank deletes it', async () => {
    const onChange = vi.fn();
    stops.push(repo.watchMemberNote('t1', 'u-mem', onChange));
    await calls(onChange);
    expect(lastCall<MemberNote | null>(onChange)).toBeNull();

    await repo.setMemberNote({ tenantId: 't1', memberId: 'u-mem', text: '  Diz sakatlığı  ', updatedBy: 'fb-admin', updatedByName: 'Yok sayılır' });
    await vi.waitFor(() => expect(lastCall<MemberNote | null>(onChange)).toMatchObject({ tenantId: 't1', memberId: 'u-mem', text: 'Diz sakatlığı', updatedByName: 'Yönetici' }));
    expect(lastCall<MemberNote>(onChange).updatedAt.getTime()).toBeGreaterThan(1e12);

    await repo.setMemberNote({ tenantId: 't1', memberId: 'u-mem', text: '   ', updatedBy: 'fb-admin' });
    await vi.waitFor(() => expect(lastCall<MemberNote | null>(onChange)).toBeNull());
    expect(await w.h.one(`SELECT 1 AS x FROM member_notes WHERE member_id = 'u-mem'`)).toBeFalsy();
  });

  it('a long note is cut to the limit; a member may neither read nor write it; the member id may be the Firebase uid', async () => {
    await repo.setMemberNote({ tenantId: 't1', memberId: 'u-mem', text: 'x'.repeat(2500), updatedBy: 'fb-admin' });
    expect((await w.h.one(`SELECT length(text) AS n FROM member_notes WHERE member_id = 'u-mem'`)).n).toBe(2000);

    w.as('mem');
    const onChange = vi.fn(); const onError = vi.fn();
    stops.push(repo.watchMemberNote('t1', 'fb-mem', onChange, onError));
    await calls(onError);
    expect(onChange).not.toHaveBeenCalled();
    expect((await refusal(repo.setMemberNote({ tenantId: 't1', memberId: 'fb-mem', text: 'x', updatedBy: 'fb-mem' }))).code).toBe('functions/permission-denied');

    w.as('admin');                                                         // staff note about themselves, id given as Firebase uid
    await repo.setMemberNote({ tenantId: 't1', memberId: 'fb-admin', text: 'kendim', updatedBy: 'fb-admin' });
    expect((await w.h.one(`SELECT text FROM member_notes WHERE member_id = 'u-admin'`)).text).toBe('kendim');
  });
});
