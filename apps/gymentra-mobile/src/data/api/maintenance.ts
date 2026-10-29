/**
 * The Worker's maintenance gate (`api/src/index.ts`) answers every `/v1/*` call with
 * `503 {"error":"maintenance"}` until the owner opens it (`API_OPEN`). That is an expected, temporary
 * condition, not a failure: the app shows one "bakım" screen (`MaintenanceGate`), reports nothing to Sentry
 * and recovers by itself when a request gets through.
 *
 * Dependency-free on purpose: `data/errors.ts` imports this and runs in both backend modes, so it must not
 * pull in `client.ts` (which loads the Firebase auth service). In Firebase mode nothing ever sets the flag.
 */

/** Duck-typed so it works on `ApiError` without importing it. A non-JSON 503 (an edge page) is NOT maintenance. */
export function isMaintenanceError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { status, apiCode } = e as { status?: unknown; apiCode?: unknown };
  return status === 503 && apiCode === 'maintenance';
}

// No brand name: the app is white-label.
export const MAINTENANCE_TITLE = 'Kısa bir bakım yapıyoruz';
export const MAINTENANCE_MESSAGE = 'Uygulama kısa süre içinde yeniden açılacak. Bilgilerin yerinde duruyor; biraz sonra tekrar dene.';
export const MAINTENANCE_STILL = 'Bakım henüz bitmedi. Birkaç dakika sonra tekrar dene.';
/** Toast / inline text for a write that hit the gate. */
export const MAINTENANCE_INLINE = 'Şu an kısa bir bakım var. Biraz sonra tekrar dene.';
export const MAINTENANCE_ANNOUNCEMENT = 'Bakım çalışması. Uygulama kısa süre içinde yeniden açılacak.';

let on = false;
const listeners = new Set<() => void>();

export const isUnderMaintenance = (): boolean => on;

export function subscribeMaintenance(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Notifies only on a change, so a poll loop hitting the gate does not re-render anything. */
export function setMaintenance(next: boolean): void {
  if (next === on) return;
  on = next;
  listeners.forEach((fn) => fn());
}

export const resetMaintenance = (): void => setMaintenance(false);

/**
 * The gate counts as "opened" only when the flag falls while the same signed-in person stays signed in and
 * is not leaving. Sign-out clears the flag too (`resetApiState`), and that must not fire recovery requests
 * for the account that is going away.
 */
export function isRecovery(a: { wasOn: boolean; nowOn: boolean; leaving: boolean }): boolean {
  return a.wasOn && !a.nowOn && !a.leaving;
}

/**
 * Recovery resets the navigation stack only to repair a misroute (`/me` unreadable, so the Launcher sent a
 * signed-in member to onboarding). Otherwise the screens under the overlay keep their unsaved state.
 */
export function needsReroute(a: { pathname: string; hadMembershipAtStart: boolean }): boolean {
  return !a.hadMembershipAtStart || a.pathname.startsWith('/onboarding');
}
