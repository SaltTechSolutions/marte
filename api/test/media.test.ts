import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';

vi.setConfig({ testTimeout: 60_000 });

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const jpeg = (n = 40) => b64(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(n).fill(7)]));
const png = () => btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0));

describe('media (R2): gym logos only', () => {
  it('member profile photos no longer exist: the upload route is gone', async () => {
    const h = await harness();
    expect((await h.send('POST', '/v1/me/photo', 'fb-mem', { base64: jpeg() })).status).toBe(404);
    expect(h.media.store.size).toBe(0);
  });

  it('gym logo: admin uploads, URL is public and served safely; a new logo replaces the old', async () => {
    const h = await harness();
    expect((await h.send('POST', '/v1/tenants/t1/logo', 'fb-mem', { base64: jpeg() })).status).toBe(403);
    const up = await h.send('POST', '/v1/tenants/t1/logo', 'fb-admin', { base64: jpeg() });
    expect(up.status).toBe(200);
    const { url } = (await up.json()) as { url: string };
    expect(url).toMatch(/^http:\/\/x\/media\/tenants\/t1\/[0-9a-f]{32}\.jpg$/);
    const get = await h.send('GET', new URL(url).pathname, null);        // no token: <Image> cannot send one
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/jpeg');
    expect(get.headers.get('x-content-type-options')).toBe('nosniff');
    await h.send('POST', '/v1/tenants/t1/logo', 'fb-admin', { base64: jpeg(60) });
    expect(h.media.store.size).toBe(1);
  });

  it('only real images under the size cap are accepted, judged by bytes', async () => {
    const h = await harness();
    const post = (base64: unknown) => h.send('POST', '/v1/tenants/t1/logo', 'fb-admin', { base64 });
    expect((await post(btoa('<html><script>alert(1)</script></html>'))).status).toBe(400);
    expect((await post('%%%not-base64')).status).toBe(400);
    expect((await post(undefined)).status).toBe(400);
    expect((await post(jpeg(1_100_000))).status).toBe(400);
    expect((await post(png())).status).toBe(200);
    expect([...h.media.store.keys()][0]).toMatch(/\.png$/);
  });

  it('the public path rejects anything but our key shape (no traversal, no member prefix)', async () => {
    const h = await harness();
    for (const bad of ['/media/../secret', '/media/tenants/t1/short.jpg', '/media/members/u-mem/0123456789abcdef0123456789abcdef.jpg', '/media/other/x/0123456789abcdef0123456789abcdef.jpg']) {
      expect((await h.send('GET', bad, null)).status, bad).toBe(404);
    }
  });

  it('PUBLIC_BASE_URL decides the origin used in URLs', async () => {
    const h = await harness();
    const { default: app } = await import('../src/index');
    const res = await app.fetch(new Request('http://internal/v1/tenants/t1/logo', {
      method: 'POST', headers: { Authorization: `Bearer ${await h.sign('fb-admin')}`, 'content-type': 'application/json' }, body: JSON.stringify({ base64: jpeg() }),
    }), { DB: h.db, MEDIA: h.media as never, FIREBASE_PROJECT_ID: 'proj-test', PUBLIC_BASE_URL: 'https://api.example.test/' });
    expect(((await res.json()) as { url: string }).url).toMatch(/^https:\/\/api\.example\.test\/media\/tenants\/t1\//);
  });
});
