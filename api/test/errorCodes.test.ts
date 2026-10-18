import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { MESSAGES, messageFor, STATUS_FALLBACK } from '../src/errorMessages';
import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
/** Statuses where the app shows the server's `message` to a person: a code without an entry shows the generic fallback. */
const USER_FACING = new Set([403, 404, 409, 412, 429]);

/**
 * Codes that deliberately use the generic status fallback because it already says the right thing.
 * Adding a code here is a decision ("the fallback is accurate"); adding a MESSAGES entry is the default.
 */
const ALLOW_GENERIC = new Set([
  'not found',      // 404: "Aradığın kayıt bulunamadı." is exactly right
]);

type Hit = { file: string; code: string; status: number };

/** Reads one JS expression starting at `i` up to a top-level `,` or closing bracket; returns its text. */
function expr(src: string, i: number): string {
  let depth = 0, q = '';
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (q) { if (ch === '\\') j++; else if (ch === q) q = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { if (depth === 0) return src.slice(i, j); depth--; }
    else if (ch === ',' && depth === 0) return src.slice(i, j);
  }
  return src.slice(i);
}
const literals = (e: string) => [...e.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));

function scan(): Hit[] {
  const hits: Hit[] = [];
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const src = readFileSync(SRC + file, 'utf8');
    // c.json({ error: <expr>, ... }, 409)
    for (const m of src.matchAll(/\{\s*error:\s*/g)) {
      const start = m.index! + m[0].length;
      const e = expr(src, start);
      const tail = src.slice(start + e.length, start + e.length + 500).split(';')[0];
      const st = tail.match(/\}\s*,\s*(\d{3})\s*\)/);
      if (st) for (const code of literals(e)) hits.push({ file, code, status: Number(st[1]) });
    }
    // fail(c, 409, 'code'), conflict(c, 'code', 'error sentence') (always 409; the sentence is the `error`)
    for (const m of src.matchAll(/\bfail\(c,\s*(\d{3}),\s*/g)) for (const code of literals(expr(src, m.index! + m[0].length))) hits.push({ file, code, status: Number(m[1]) });
    // pt.ts plan objects: no(409, 'code', ...), and freezeBlock's return ['code', 'sentence'] pairs (409)
    for (const m of src.matchAll(/\bno\((\d{3}),\s*/g)) for (const code of literals(expr(src, m.index! + m[0].length))) hits.push({ file, code, status: Number(m[1]) });
    for (const m of src.matchAll(/return \[\s*'(?:[^'\\]|\\.)*',\s*/g)) for (const code of literals(expr(src, m.index! + m[0].length))) hits.push({ file, code, status: 409 });
    for (const m of src.matchAll(/\bconflict\(c,\s*'(?:[^'\\]|\\.)*',\s*/g)) for (const code of literals(expr(src, m.index! + m[0].length))) hits.push({ file, code, status: 409 });
  }
  return hits;
}

describe('error codes reach people in Turkish', () => {
  it('every 403/404/409/412/429 code a route returns has a MESSAGES entry (or is explicitly allowed to use the generic fallback)', () => {
    const hits = scan();
    expect(hits.length, 'the scanner found the routes').toBeGreaterThan(100);
    const missing = [...new Set(hits.filter((h) => USER_FACING.has(h.status) && !MESSAGES[h.code] && !ALLOW_GENERIC.has(h.code)).map((h) => `${h.status} '${h.code}' (${h.file})`))];
    expect(missing).toEqual([]);
  });

  it('dynamic codes the scanner cannot see (template strings) have entries too', () => {
    for (const code of ['already_completed', 'already_cancelled', 'already_no-show']) expect(MESSAGES[code], code).toBeTruthy();
  });

  it('numbered refusals get numbered Turkish sentences', () => {
    expect(messageFor('freeze quota used up (2 times)')).toContain('2 kez');
    expect(messageFor('a freeze must be at least 7 days')).toContain('7 gün');
    expect(messageFor('something unheard of')).toBeUndefined();
  });

  it('the allow-list does not hide codes that have a real entry, and every entry is a Turkish sentence', () => {
    for (const code of ALLOW_GENERIC) expect(MESSAGES[code], code).toBeUndefined();
    for (const [code, m] of Object.entries(MESSAGES)) {
      expect(m.length, code).toBeGreaterThan(5);
      expect(/[.!?]$/.test(m), `${code}: ends like a sentence`).toBe(true);
      expect(m, code).not.toMatch(/\b(undefined|null|true|false|error|failed|forbidden|conflict)\b/i);
    }
    expect(STATUS_FALLBACK[409]).toBeTruthy();
  });

  it('structured extras next to `error` survive the message middleware, and the message is attached', async () => {
    const h = await harness();
    await h.run(`INSERT INTO gym_packages (id, tenant_id, data, active_assignment_count) VALUES ('gp1','t1','{}',1)`);
    await h.run(`INSERT INTO member_packages (id, tenant_id, member_id, package_id, final_price, starts_at, ends_at, status, data, assigned_at)
      VALUES ('mp1','t1','u-mem','gp1',100,1,${Date.now() + 86_400_000},'active','{"kind":"lessons","packageName":"Paket"}',1)`);
    await h.run(`INSERT INTO member_credits (id, tenant_id, member_id, kind, source, source_package_id, total, used, starts_at, expires_at, status)
      VALUES ('cr1','t1','u-mem','ptLesson','purchase','mp1',5,1,1,${Date.now() + 86_400_000},'active')`);
    await h.addUser('u-tr', ['trainer']);
    await h.run(`INSERT INTO pt_sessions (id, tenant_id, trainer_id, member_id, starts_at, duration_minutes, status, credit_id, created_at, updated_at)
      VALUES ('s1','t1','u-tr','u-mem',${Date.now() + 3_600_000},60,'scheduled','cr1',1,1)`);
    const r = await h.send('POST', '/v1/tenants/t1/member-packages/mp1/cancel', 'fb-admin', { reason: 'test' });
    expect(r.status).toBe(409);
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ code: 'blocking-sessions', blocking: 1 });
    expect(typeof body.message).toBe('string');
    expect(body.message).toBe('Bu pakete bağlı 1 ileri tarihli randevu var. Önce onları iptal et.');
    expect(body.message).toBe(messageFor(body.error as string));
  });
});
