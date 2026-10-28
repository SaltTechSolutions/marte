import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

/** Rows that share a timestamp must come back in a fixed order (newest id first), not in whatever order the planner picks. */
const ids = async (r: Response) => ((await r.json()) as any[]).map((x) => x.id);

describe('same-timestamp ordering', () => {
  it('announcements: ties on created_at fall back to id DESC', async () => {
    const h = await harness();
    for (const id of ['an-b', 'an-a', 'an-c']) {
      await h.run(`INSERT INTO announcements (id, tenant_id, title, body, created_by, created_at) VALUES (?, 't1', 'x', 'y', 'u-admin', 5)`, id);
    }
    expect(await ids(await h.send('GET', '/v1/tenants/t1/announcements', 'fb-mem'))).toEqual(['an-c', 'an-b', 'an-a']);
  });

  it('programs: ties on updated_at fall back to id DESC (staff list and per-member list)', async () => {
    const h = await harness();
    for (const id of ['p-b', 'p-a', 'p-c']) {
      await h.run(`INSERT INTO programs (id, tenant_id, member_id, data, updated_at) VALUES (?, 't1', 'u-mem', '{}', 5)`, id);
    }
    expect(await ids(await h.send('GET', '/v1/tenants/t1/programs', 'fb-admin'))).toEqual(['p-c', 'p-b', 'p-a']);
    expect(await ids(await h.send('GET', '/v1/tenants/t1/members/u-mem/programs', 'fb-admin'))).toEqual(['p-c', 'p-b', 'p-a']);
  });
});
