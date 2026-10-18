/**
 * Test-only helper for the membership-area repo tests (kept out of `*.test.ts` so several files share it).
 * Every test file still has to declare, at its top (vi.mock is hoisted per file):
 *
 *   vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
 *   vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
 *   vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
 */
import { expect, vi } from 'vitest';

/** Starts the in-process Worker and returns helpers; `as('mem')` signs in as subject `fb-mem` (user `u-mem`). */
export async function world() {
  const { startWorld } = await import('./testWorld');
  const { auth } = await import('@/services/firebase');
  const { resetIdentity } = await import('./membershipIdentity');
  const { forgetDetails, forgetLabels } = await import('./membershipDto');
  const w = await startWorld();
  const as = (name: string, profile: { displayName?: string; email?: string } = {}) => {
    w.signInAs(`fb-${name}`);
    (auth as unknown as { currentUser: unknown }).currentUser = { uid: `fb-${name}`, ...profile };
    resetIdentity();
  };
  forgetDetails();
  forgetLabels();
  as('mem');
  return { ...w, as };
}

/** Resolves once the spy has been called `n` times (pollers answer asynchronously). */
export const calls = (fn: ReturnType<typeof vi.fn>, n = 1) =>
  vi.waitFor(() => expect(fn.mock.calls.length).toBeGreaterThanOrEqual(n), { timeout: 4000 });

export const lastCall = <T>(fn: ReturnType<typeof vi.fn>): T => fn.mock.calls[fn.mock.calls.length - 1][0] as T;

/** Awaits a rejection and returns it (the client's ApiError or a plain Error). */
export const refusal = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string; status?: number; apiCode?: string }; }
  throw new Error('expected a refusal, but the call succeeded');
};
