import { expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const { apiGet, apiPost } = await import('./client');

it('client and Worker run together; a server refusal arrives as a callable-style error with the Turkish message', async () => {
  const w = await startWorld();
  expect(((await apiGet('/me')) as { userId: string }).userId).toBe('u-mem');
  w.signInAs('fb-admin');
  const e: any = await apiPost('/tenants/t1/leave').catch((x) => x);   // the only admin may not leave
  expect(e.code).toBe('functions/failed-precondition');
  expect(e.message).toMatch(/son yöneticisisin/);
});
