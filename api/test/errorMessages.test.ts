import { describe, expect, it, vi } from 'vitest';

import { harness } from './helpers';
import { MESSAGES, STATUS_FALLBACK } from '../src/errorMessages';

vi.setConfig({ testTimeout: 60_000 });

describe('error messages', () => {
  it('a known code gets its Turkish message; an unknown one gets the status fallback; success is untouched', async () => {
    const h = await harness();
    const known = await h.send('POST', '/v1/tenants/t1/leave', 'fb-admin');          // last admin cannot leave
    expect(await known.json()).toMatchObject({ error: 'last admin cannot leave', message: MESSAGES['last admin cannot leave'] });
    const unknown = await h.send('PUT', '/v1/tenants/t1/members/u-mem/roles', 'fb-admin', { roles: ['superuser'] });
    expect(((await unknown.json()) as { message: string }).message).toBe(STATUS_FALLBACK[400]);
    expect(await (await h.send('GET', '/healthz', null)).json()).toEqual({ ok: true });
    expect(((await (await h.send('GET', '/v1/me', null)).json()) as { message: string }).message).toBe(STATUS_FALLBACK[401]);
  });

  it('no catalogue message contains Latin-only jargon words that would leak to a screen', () => {
    for (const m of Object.values(MESSAGES)) expect(m).not.toMatch(/\b(kuruş|isActive|sortOrder|admin|bootstrap)\b|undefined|null/i);
  });
});
