import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));

const { apiGet, apiPost, ApiError, __setApiTransport } = await import('./client');
const { isMaintenanceError, isUnderMaintenance, resetMaintenance, setMaintenance } = await import('./maintenance');

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
    const e: any = await apiGet('/x').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('functions/failed-precondition');
    expect(e.message).toBe('Yeterli ders kredin yok — 2 kaldı, 3 gerekiyor.');
    expect(e.apiCode).toBe('x');
    expect(e.extra).toMatchObject({ error: 'x' });
    for (const [s, c] of [[400, 'invalid-argument'], [401, 'unauthenticated'], [403, 'permission-denied'], [404, 'not-found'], [500, 'internal']] as const) {
      __setApiTransport((async () => res(s, { error: 'e' })) as never, async () => 'tok');
      expect(((await apiGet('/x').catch((x) => x)) as any).code).toBe(`functions/${c}`);
    }
  });

  it('network failure is untrusted (internal); no token is a 401 without any request', async () => {
    __setApiTransport((async () => { throw new Error('offline'); }) as never, async () => 'tok');
    expect(((await apiGet('/x').catch((x) => x)) as any).code).toBe('functions/internal');
    const f = vi.fn();
    __setApiTransport(f as never, async () => null);
    expect(((await apiGet('/x').catch((x) => x)) as any).code).toBe('functions/unauthenticated');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('api client: maintenance gate', () => {
  const tok = async () => 'tok';
  const gate = () => res(503, { error: 'maintenance' });

  it('turns 503 maintenance into a typed error and raises the flag', async () => {
    resetMaintenance();
    __setApiTransport((async () => gate()) as never, tok);
    const e: any = await apiGet('/x').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(503);
    expect(e.apiCode).toBe('maintenance');
    expect(isMaintenanceError(e)).toBe(true);
    expect(isUnderMaintenance()).toBe(true);
  });

  it.each([[200, { ok: true }], [404, { error: 'not_found' }]])('a following %s clears the flag (the request got past the gate)', async (status, body) => {
    setMaintenance(true);
    __setApiTransport((async () => res(status, body)) as never, tok);
    await apiGet('/x').catch(() => undefined);
    expect(isUnderMaintenance()).toBe(false);
  });

  it('a network failure and a plain 500 leave the flag as it was', async () => {
    for (const initial of [true, false]) {
      setMaintenance(initial);
      __setApiTransport((async () => { throw new Error('offline'); }) as never, tok);
      await apiGet('/x').catch(() => undefined);
      expect(isUnderMaintenance()).toBe(initial);
      __setApiTransport((async () => res(500, { error: 'boom' })) as never, tok);
      await apiGet('/x').catch(() => undefined);
      expect(isUnderMaintenance()).toBe(initial);
    }
  });

  it('a non-JSON 503 (edge page) is not maintenance: generic error, flag untouched', async () => {
    resetMaintenance();
    __setApiTransport((async () => new Response('<html>Service Unavailable</html>', { status: 503 })) as never, tok);
    const e: any = await apiGet('/x').catch((x) => x);
    expect(isMaintenanceError(e)).toBe(false);
    expect(e.code).toBe('functions/internal');
    expect(isUnderMaintenance()).toBe(false);
  });

  it('an edge HTML 403 (never reached the Worker) does not clear the flag; a JSON 404 does', async () => {
    setMaintenance(true);
    __setApiTransport((async () => new Response('<html>blocked</html>', { status: 403 })) as never, tok);
    await apiGet('/x').catch(() => undefined);
    expect(isUnderMaintenance()).toBe(true);
    __setApiTransport((async () => res(404, { error: 'not_found' })) as never, tok);
    await apiGet('/x').catch(() => undefined);
    expect(isUnderMaintenance()).toBe(false);
  });
});
