import { Hono } from 'hono';

import { rolesIn } from './auth';
import type { Env, Vars } from './types';

type App = { Bindings: Env; Variables: Vars };
type Ctx = import('hono').Context<App>;

/** Authenticated uploads (gym logos only: member profile photos were removed, 18 Oct 2026). */
export const media = new Hono<App>();
/** Public image reads — mounted BEFORE the auth gate (an <Image> cannot send a token). */
export const mediaPublic = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 1_000_000;   // the app resizes to 512 px JPEG: a normal upload is ~50 KB
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Only real images, decided by the bytes, never by the claimed content type. */
export function sniffImage(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

function decode(base64: unknown): Uint8Array | null {
  if (typeof base64 !== 'string' || !base64 || base64.length > MAX_BYTES * 1.4) return null;
  try {
    const bin = atob(base64);
    if (bin.length > MAX_BYTES) return null;
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

const publicUrl = (c: Ctx, key: string) => `${(c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/$/, '')}/media/${key}`;

/** Unguessable key (128 random bits), like the token URLs Firebase Storage handed out. */
async function put(c: Ctx, prefix: string, base64: unknown): Promise<Response> {
  const bytes = decode(base64);
  const type = bytes && sniffImage(bytes);
  if (!bytes || !type) return c.json({ error: 'bad image' }, 400);
  const key = `${prefix}/${hex(16)}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`;
  await c.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  return c.json({ url: publicUrl(c, key), key });
}

async function wipe(c: Ctx, prefix: string, keep?: string) {
  const list = await c.env.MEDIA.list({ prefix: `${prefix}/` });
  const old = list.objects.map((o) => o.key).filter((k) => k !== keep);
  if (old.length) await c.env.MEDIA.delete(old);
}

media.post('/tenants/:tenantId/logo', async (c) => {
  const tenantId = c.req.param('tenantId')!;
  if (!(await rolesIn(c.env.DB, tenantId, c.get('userId'))).includes('admin')) return c.json({ error: 'forbidden' }, 403);
  const res = await put(c, `tenants/${tenantId}`, ((await c.req.json().catch(() => null)) as { base64?: unknown } | null)?.base64);
  if (res.status !== 200) return res;
  const { key } = (await res.clone().json()) as { key: string };
  await wipe(c, `tenants/${tenantId}`, key);
  return res;
});

mediaPublic.get('/media/*', async (c) => {
  const key = new URL(c.req.url).pathname.replace(/^\/(?:v1\/)?media\//, '');
  if (!/^tenants\/[A-Za-z0-9_-]+\/[0-9a-f]{32}\.(jpg|png|webp)$/.test(key)) return c.json({ error: 'not found' }, 404);
  const obj = await c.env.MEDIA.get(key);
  if (!obj) return c.json({ error: 'not found' }, 404);
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
});
