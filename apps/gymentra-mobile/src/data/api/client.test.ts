import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));

const { apiGet, apiPost, ApiError, __setApiTransport } = await import('./client');

const res = (status: number, body: unknown) => new Response(body === null ? '' : JSON.stringify(body), { status });

describe('api client', () => {
  it('sends the ID token and JSON body', async () => {
    const f = vi.fn(async () => res(200, { ok: true }));
    __setApiTransport(f as never, async () => 'tok');
    await apiPost('/x', { a: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/v1/x')).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe('{"a":1}');
  });

  it('maps failures to the callable-style codes errors.ts trusts, keeping the server message', async () => {
    __setApiTransport((async () => res(409, { error: 'x', message: 'Yeterli ders kredin yok — 2 kaldı, 3 gerekiyor.' })) as never, async () => 'tok');
    const e = await apiGet('/x').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('functions/failed-precondition');
    expect(e.message).toBe('Yeterli ders kredin yok — 2 kaldı, 3 gerekiyor.');
    expect(e.apiCode).toBe('x');
    for (const [s, c] of [[400, 'invalid-argument'], [401, 'unauthenticated'], [403, 'permission-denied'], [404, 'not-found'], [500, 'internal']] as const) {
      __setApiTransport((async () => res(s, { error: 'e' })) as never, async () => 'tok');
      expect((await apiGet('/x').catch((x) => x)).code).toBe(`functions/${c}`);
    }
  });

  it('network failure is untrusted (internal); no token is a 401 without any request', async () => {
    __setApiTransport((async () => { throw new Error('offline'); }) as never, async () => 'tok');
    expect((await apiGet('/x').catch((x) => x)).code).toBe('functions/internal');
    const f = vi.fn();
    __setApiTransport(f as never, async () => null);
    expect((await apiGet('/x').catch((x) => x)).code).toBe('functions/unauthenticated');
    expect(f).not.toHaveBeenCalled();
  });
});
