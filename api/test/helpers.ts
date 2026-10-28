import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

import app from '../src/index';
import { __setKeyResolver } from '../src/auth';
import { makeDb } from './d1shim';
import { makeRealDb } from './d1real';

export const PROJECT = 'proj-test';

/** In-memory stand-in for an R2 bucket (put / get / delete / list-by-prefix). */
export function fakeBucket() {
  const store = new Map<string, { body: Uint8Array; httpMetadata?: { contentType?: string } }>();
  return {
    store,
    put: async (key: string, body: Uint8Array, opts?: { httpMetadata?: { contentType?: string } }) => { store.set(key, { body, httpMetadata: opts?.httpMetadata }); },
    get: async (key: string) => { const o = store.get(key); return o ? { body: o.body, httpMetadata: o.httpMetadata } : null; },
    delete: async (keys: string | string[]) => { for (const k of [keys].flat()) store.delete(k); },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}

/**
 * Per-test API harness. Seeded world (same as api.test.ts):
 *   gym t1 (code T1); users u-admin (fb-admin, admin), u-mem (fb-mem, member), both active.
 * Everyone else is created by the test via `run()`. Subjects are `fb-<name>`.
 */
export async function harness() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: 'RS256', kid: 'k1' }] });
  __setKeyResolver(() => keys);
  const media = fakeBucket();
  const db = process.env.REAL_D1 ? await makeRealDb() : makeDb();
  const run = (q: string, ...a: unknown[]) => db.prepare(q).bind(...a).run();
  const one = async (q: string, ...a: unknown[]) => await db.prepare(q).bind(...a).first<any>();
  const sign = (sub: string, aud = PROJECT) =>
    new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setSubject(sub)
      .setIssuer(`https://securetoken.google.com/${PROJECT}`).setAudience(aud)
      .setIssuedAt().setExpirationTime('1h').sign(privateKey);
  /** send(method, path, subject|null, body?) → Response. subject null = no token. */
  const send = async (method: string, path: string, sub: string | null, body?: object) =>
    app.fetch(new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(sub ? { Authorization: `Bearer ${await sign(sub)}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }), { DB: db, MEDIA: media as never, API_OPEN: '1', FIREBASE_PROJECT_ID: PROJECT });
  /** Same as send() but takes an already-signed token's SUBJECT as `fb-…` and a raw JSON string body: for the mobile client contract tests. */
  const sendRaw = async (method: string, path: string, tokenOrSub: string, body?: string) =>
    app.fetch(new Request(`http://x${path}`, {
      method,
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${tokenOrSub.startsWith('fb-') ? await sign(tokenOrSub) : tokenOrSub}` },
      body,
    }), { DB: db, MEDIA: media as never, API_OPEN: '1', FIREBASE_PROJECT_ID: PROJECT });
  /** Adds a user with a Firebase identity and, optionally, an active membership in t1. */
  const addUser = async (id: string, roles: string[] | null = ['member'], extra: { permissions?: string[]; status?: string } = {}) => {
    await run(`INSERT INTO users (id, display_name, created_at) VALUES (?, ?, 1)`, id, id);
    await run(`INSERT INTO identities VALUES ('firebase', ?, ?)`, 'fb-' + id.replace(/^u-/, ''), id);
    if (roles) {
      await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, permissions, requested_at) VALUES ('t1', ?, ?, ?, ?, 1)`,
        id, extra.status ?? 'active', JSON.stringify(roles), JSON.stringify(extra.permissions ?? []));
    }
  };
  await run(`INSERT INTO users (id, display_name, created_at) VALUES ('u-admin','u-admin',1), ('u-mem','u-mem',1)`);
  await run(`INSERT INTO identities VALUES ('firebase','fb-admin','u-admin'), ('firebase','fb-mem','u-mem')`);
  await run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t1','T1','Gym',1)`);
  await run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES
    ('t1','u-admin','active','["admin"]',1), ('t1','u-mem','active','["member"]',1)`);
  return { db, run, one, send, sendRaw, sign, addUser, media };
}
