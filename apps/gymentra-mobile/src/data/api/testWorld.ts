/**
 * Test-only: runs the REAL Cloudflare Worker (api/src, in-process, on the SQLite D1 stand-in) behind the
 * mobile API client, so a repo's tests exercise client + server together instead of a hand-written mock.
 *
 * Usage in a repo test (the vi.mock/vi.stubEnv lines must be in the test file, they are hoisted there):
 *
 *   vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
 *   vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
 *   vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
 *   const { startWorld } = await import('./testWorld');
 *   const w = await startWorld();            // seeded: gym t1, u-admin (fb-admin, admin), u-mem (fb-mem, member)
 *   w.signInAs('fb-mem');                    // the client now sends fb-mem's token
 *   await w.h.run(`INSERT ...`);             // seed anything else straight into the database
 */
import { __setApiTransport } from './client';

export async function startWorld() {
  // Every test starts from the module state the app guarantees after sign-out. The API repos keep
  // caches (`/me`, tenant and label lookups, id registries), running pollers and shared watches at
  // module level; without this a test inherits whatever the previous one left, which is order-dependent
  // (it failed under `--sequence.shuffle`). Stops pollers first, so nothing refills a cache afterwards.
  const { resetApiState } = await import('./resetApiState');
  const { resetSharedWatches } = await import('../firebase/sharedWatch');
  resetSharedWatches();
  resetApiState();
  const { harness } = await import('../../../../../api/test/helpers');
  const h = await harness();
  let subject = 'fb-mem';
  __setApiTransport(
    (async (url: string, init: RequestInit) => {
      const u = new URL(String(url));
      return h.sendRaw(init.method ?? 'GET', u.pathname + u.search, subject, init.body as string | undefined);
    }) as never,
    async () => subject,
  );
  return { h, signInAs: (s: string) => { subject = s; } };
}
