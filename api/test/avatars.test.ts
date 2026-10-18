import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { AVATAR_IDS } from '../src/avatars';
import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });
const T1 = '/v1/tenants/t1';

describe('avatars', () => {
  it('the API list equals the app catalogue (same ids, same order)', () => {
    const file = readFileSync(fileURLToPath(new URL('../../apps/gymentra-mobile/src/data/avatars.generated.ts', import.meta.url)), 'utf8');
    const ids = [...file.matchAll(/\{ id: "([a-z]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([...AVATAR_IDS]);
  });

  it('a member picks and clears their own avatar; unknown ids and the old photoUrl are refused', async () => {
    const h = await harness();
    const patch = (sub: string, body: object, id = 'u-mem') => h.send('PATCH', `${T1}/members/${id}/details`, sub, body);
    expect((await patch('fb-mem', { avatarId: 'summit' })).status).toBe(200);
    expect((await h.one(`SELECT avatar_id a FROM memberships WHERE member_id = 'u-mem'`)).a).toBe('summit');
    expect((await patch('fb-mem', { avatarId: 'my-own-image' })).status).toBe(400);
    expect((await patch('fb-mem', { photoUrl: 'https://x/a.jpg' })).status).toBe(400);
    expect((await patch('fb-mem', { avatarId: null })).status).toBe(200);
    expect((await h.one(`SELECT avatar_id a FROM memberships WHERE member_id = 'u-mem'`)).a).toBeNull();
    expect((await patch('fb-admin', { avatarId: 'rock' })).status).toBe(403);          // not theirs to set: a real account owns it
  });

  it('an admin sets the avatar of a hand-added member; roster and membership reads carry avatarId', async () => {
    const h = await harness();
    const { memberId } = (await (await h.send('POST', `${T1}/members/managed`, 'fb-admin', { name: 'Ayşe' })).json()) as { memberId: string };
    expect((await h.send('PATCH', `${T1}/members/${memberId}/details`, 'fb-admin', { avatarId: 'spark' })).status).toBe(200);
    const roster = (await (await h.send('GET', `${T1}/members`, 'fb-admin')).json()) as { memberId: string; avatarId: string | null; photoUrl?: unknown }[];
    expect(roster.find((m) => m.memberId === memberId)?.avatarId).toBe('spark');
    expect(roster.every((m) => !('photoUrl' in m))).toBe(true);
    expect(((await (await h.send('GET', `${T1}/members/${memberId}`, 'fb-admin')).json()) as { avatarId: string }).avatarId).toBe('spark');
  });

  it('removing a person clears the avatar with the rest of their details', async () => {
    const h = await harness();
    await h.run(`UPDATE memberships SET avatar_id = 'rock' WHERE member_id = 'u-mem'`);
    expect((await h.send('DELETE', `${T1}/members/u-mem`, 'fb-admin')).status).toBe(200);
    expect((await h.one(`SELECT avatar_id a FROM memberships WHERE member_id = 'u-mem'`))?.a ?? null).toBeNull();
  });
});
