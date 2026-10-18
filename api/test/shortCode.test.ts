import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

describe('short codes (database trigger)', () => {
  it('every new membership gets a unique 6-digit code in its gym: join, managed member, tenant owner', async () => {
    const h = await harness();
    await h.send('POST', '/v1/me/bootstrap', 'fb-new');
    expect((await h.send('POST', '/v1/tenants/t1/join', 'fb-new')).status).toBe(201);
    expect((await h.send('POST', '/v1/tenants/t1/members/managed', 'fb-admin', { name: 'Ayşe' })).status).toBe(201);
    const rows = (await h.db.prepare(`SELECT short_code c FROM memberships WHERE tenant_id = 't1'`).all<{ c: string }>()).results;
    expect(rows).toHaveLength(4);
    for (const r of rows) expect(r.c).toMatch(/^[1-9]\d{5}$/);
    expect(new Set(rows.map((r) => r.c)).size).toBe(4);
  });

  it('a code already present (migrated rows) is kept; a scrubbed row that rejoins gets a fresh one', async () => {
    const h = await harness();
    await h.run(`UPDATE memberships SET short_code = '123456' WHERE member_id = 'u-mem'`);
    expect((await h.one(`SELECT short_code c FROM memberships WHERE member_id = 'u-mem'`)).c).toBe('123456');
    await h.run(`UPDATE memberships SET status = 'left', short_code = NULL WHERE member_id = 'u-mem'`);
    expect((await h.one(`SELECT short_code c FROM memberships WHERE member_id = 'u-mem'`)).c).toBeNull();
    expect((await h.send('POST', '/v1/tenants/t1/join', 'fb-mem')).status).toBe(201);
    expect((await h.one(`SELECT short_code c FROM memberships WHERE member_id = 'u-mem'`)).c).toMatch(/^\d{6}$/);
  });

  it('the code never collides inside a gym even when the space is crowded', async () => {
    const h = await harness();
    for (let i = 0; i < 40; i++) {
      await h.run(`INSERT INTO users (id, created_at) VALUES (?, 1)`, `ux${i}`);
      await h.run(`INSERT INTO memberships (tenant_id, member_id, status, requested_at) VALUES ('t1', ?, 'active', 1)`, `ux${i}`);
    }
    const rows = (await h.db.prepare(`SELECT short_code c FROM memberships`).all<{ c: string }>()).results;
    expect(new Set(rows.map((r) => r.c)).size).toBe(rows.length);
  });
});
