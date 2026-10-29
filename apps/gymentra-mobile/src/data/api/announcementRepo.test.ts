import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as fb from '../firebase/announcementRepo';
import { calls, lastCall, refusal, world } from './membershipTestKit';
import * as repo from './announcementRepo';
import type { Announcement } from '../types';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

type W = Awaited<ReturnType<typeof world>>;
let w: W;
const stops: (() => void)[] = [];
beforeEach(async () => { w = await world(); await w.h.run(`UPDATE users SET display_name = 'Yönetici' WHERE id = 'u-admin'`); });
afterEach(() => { stops.splice(0).forEach((s) => s()); });

const post = (over: Partial<Parameters<typeof repo.createAnnouncement>[0]> = {}) =>
  repo.createAnnouncement({ tenantId: 't1', title: 'Yarın kapalıyız', body: 'Bakım var', createdBy: 'fb-admin', ...over });

describe('constants and helpers match the Firebase module', () => {
  it('limits, default days and isLive', () => {
    expect([repo.ANNOUNCEMENT_TITLE_MAX, repo.ANNOUNCEMENT_BODY_MAX, repo.ANNOUNCEMENT_DEFAULT_DAYS])
      .toEqual([fb.ANNOUNCEMENT_TITLE_MAX, fb.ANNOUNCEMENT_BODY_MAX, fb.ANNOUNCEMENT_DEFAULT_DAYS]);
    const base = { id: 'a', tenantId: 't', title: 'x', body: '', createdBy: 'u', createdAt: new Date() };
    const now = new Date(1000);
    for (const expiresAt of [undefined, new Date(500), new Date(1500)]) {
      expect(repo.isLive({ ...base, expiresAt }, now)).toBe(fb.isLive({ ...base, expiresAt }, now));
    }
  });
});

describe('announcements', () => {
  it('an admin posts, members see it at once (newest first, trimmed, default 14 days), the admin deletes it', async () => {
    w.as('mem');
    const seen = vi.fn();
    stops.push(repo.watchAnnouncements('t1', seen));
    await calls(seen);
    expect(lastCall<Announcement[]>(seen)).toEqual([]);

    w.as('admin');
    const before = Date.now();
    await post({ title: '  Başlık  ', body: '  Gövde  ' });
    await post({ title: 'İkinci' });
    await vi.waitFor(() => expect(lastCall<Announcement[]>(seen).map((a) => a.title)).toEqual(['İkinci', 'Başlık']));
    const a = lastCall<Announcement[]>(seen).find((x) => x.title === 'Başlık')!;
    expect(a).toMatchObject({ tenantId: 't1', body: 'Gövde', createdByName: 'Yönetici' });
    expect(a.expiresAt!.getTime() - before).toBeGreaterThan(13.9 * 86_400_000);
    expect(repo.isLive(a)).toBe(true);

    await repo.deleteAnnouncement(a.id);
    await vi.waitFor(() => expect(lastCall<Announcement[]>(seen).map((x) => x.title)).toEqual(['İkinci']));
  });

  it('title and body are cut to their limits; expiresInDays is honoured; max caps the list', async () => {
    w.as('admin');
    await post({ title: 't'.repeat(120), body: 'b'.repeat(900), expiresInDays: 1 });
    await post({ title: 'ikinci' });
    const row = await w.h.one(`SELECT length(title) AS tl, length(body) AS bl, expires_at - created_at AS span FROM announcements WHERE title LIKE 'tttt%'`);
    expect([row.tl, row.bl]).toEqual([80, 600]);
    expect(row.span).toBeGreaterThan(0.99 * 86_400_000);
    expect(row.span).toBeLessThan(1.01 * 86_400_000);
    const one = vi.fn();
    stops.push(repo.watchAnnouncements('t1', one, undefined, 1));
    await calls(one);
    expect(lastCall<Announcement[]>(one)).toHaveLength(1);
  });

  it('expired posts are not listed by the Worker (documented difference), and a plain member may not post or delete', async () => {
    w.as('admin');
    await post({ title: 'Eski' });
    await w.h.run(`UPDATE announcements SET expires_at = 1`);
    const seen = vi.fn();
    stops.push(repo.watchAnnouncements('t1', seen));
    await calls(seen);
    expect(lastCall<Announcement[]>(seen)).toEqual([]);
    w.as('mem');
    expect((await refusal(post())).code).toBe('functions/permission-denied');
  });

  it('delete of an id not read in this session finds the one gym the caller administers; ambiguity is refused', async () => {
    await w.h.run(`INSERT INTO announcements (id, tenant_id, title, body, created_by, created_at) VALUES ('a-old','t1','Eski','',  'u-admin', 1)`);
    w.as('admin');
    await repo.deleteAnnouncement('a-old');
    expect(await w.h.one(`SELECT 1 AS x FROM announcements WHERE id = 'a-old'`)).toBeFalsy();

    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Two',1)`);
    await w.h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-admin','active','["admin"]',1)`);
    w.as('admin');                                                       // re-resolve identity
    expect((await refusal(repo.deleteAnnouncement('a-unknown'))).message).toMatch(/salonu bilinmiyor/);
  });

  it('a gym cannot delete another gym\'s post by id', async () => {
    await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Two',1)`);
    await w.h.run(`INSERT INTO announcements (id, tenant_id, title, body, created_by, created_at) VALUES ('a-t2','t2','Başka','', 'x', 1)`);
    w.as('admin');
    const seen = vi.fn();
    stops.push(repo.watchAnnouncements('t1', seen));
    await calls(seen);
    await repo.deleteAnnouncement('a-t2');                               // unknown here: falls back to t1 (the only admin gym), where it matches nothing
    expect(await w.h.one(`SELECT 1 AS x FROM announcements WHERE id = 'a-t2'`)).toBeTruthy();
  });
});
