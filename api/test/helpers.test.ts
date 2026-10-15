import { expect, it } from 'vitest';

import { harness } from './helpers';

it('harness boots a seeded world', async () => {
  const h = await harness();
  const res = await h.send('GET', '/v1/me', 'fb-mem');
  expect(((await res.json()) as { userId: string }).userId).toBe('u-mem');
  expect((await h.send('GET', '/v1/me', null)).status).toBe(401);
});
