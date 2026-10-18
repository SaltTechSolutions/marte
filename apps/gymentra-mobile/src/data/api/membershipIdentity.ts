import { auth } from '@/services/firebase';

import { apiGet, apiPost } from './client';

/**
 * Two kinds of person id meet in the app after the move to the Worker:
 *
 *  - the Firebase uid (`auth.currentUser.uid`): what every screen holds for "me" (`user.uid`, ~70 places);
 *  - the internal `users.id` (`u` + hex, `mm…` for hand-added members): what every Worker route and every
 *    row of other people carries. D1 never stores the Firebase uid (docs/CLOUDFLARE-GECIS.md).
 *
 * Screens must keep working unchanged, so the boundary is translated HERE and only for the signed-in
 * person: an id equal to my Firebase uid is sent to the Worker as my internal id (`toInternalId`), and my
 * internal id coming back is shown to the screens as my Firebase uid (`toAppId`). Everyone else's id is
 * the internal id on both sides, which is also what the screens pass back to us.
 *
 * The cache is keyed by the Firebase uid, so switching accounts re-resolves by itself.
 */
export interface MeDto {
  userId: string | null;
  memberships: { tenantId: string; roles: string[]; status: string }[];
}

let cache: { firebaseUid: string; internalId: string } | null = null;
let pending: Promise<MeDto> | null = null;

export const firebaseUid = (): string | null => auth.currentUser?.uid ?? null;

/** Sign-out hygiene and the test seam. */
export function resetIdentity(): void {
  cache = null;
  pending = null;
}

/** `GET /me`, always fresh (its membership list is data); also primes the id cache. */
export async function fetchMe(): Promise<MeDto> {
  const uid = firebaseUid();
  const call = (pending ??= apiGet<MeDto>('/me').finally(() => { pending = null; }));
  const me = await call;
  if (uid && me.userId) cache = { firebaseUid: uid, internalId: me.userId };
  return me;
}

/** My internal id, or null for a person who has not been bootstrapped yet (a brand-new account). */
export async function selfInternalId(): Promise<string | null> {
  const uid = firebaseUid();
  if (uid && cache?.firebaseUid === uid) return cache.internalId;
  return (await fetchMe()).userId;
}

/**
 * My internal id, creating the internal user on the very first call (idempotent on the server).
 * The first thing a new account does that needs one is joining or founding a gym.
 */
export async function ensureSelfInternalId(profile: { displayName?: string | null; email?: string | null } = {}): Promise<string> {
  const known = await selfInternalId();
  if (known) return known;
  const res = await apiPost<{ userId: string }>('/me/bootstrap', {
    ...(profile.displayName ? { displayName: profile.displayName } : {}),
    ...(profile.email ? { email: profile.email } : {}),
  });
  const uid = firebaseUid();
  if (uid) cache = { firebaseUid: uid, internalId: res.userId };
  return res.userId;
}

/** What the Worker is told: my Firebase uid becomes my internal id; any other id passes through. */
export async function toInternalId(id: string): Promise<string> {
  if (id && id === firebaseUid()) return (await selfInternalId()) ?? id;
  return id;
}

/** What the screens are shown. Synchronous: call it after something awaited `selfInternalId()`. */
export function toAppId(internalId: string): string;
export function toAppId(internalId: string | null | undefined): string | undefined;
export function toAppId(internalId: string | null | undefined): string | undefined {
  if (!internalId) return undefined;
  const uid = firebaseUid();
  return cache && uid && cache.firebaseUid === uid && cache.internalId === internalId ? uid : internalId;
}

/** Ids of the form `${tenantId}_${personId}` (membership, note, address, renewal request). */
export function splitDocId(id: string): { tenantId: string; personId: string } {
  const i = id.indexOf('_');
  if (i <= 0 || i === id.length - 1) throw new Error(`Geçersiz kayıt kimliği: ${id}`);
  return { tenantId: id.slice(0, i), personId: id.slice(i + 1) };
}

/**
 * Birth dates are calendar dates. The app builds them at local midnight, hand-added members arrive at
 * 12:00 UTC, migrated Firestore values are local midnight in Istanbul (21:00 UTC the day before). Reading
 * the calendar date in Istanbul time (UTC+3, no DST) recovers the intended day from all three.
 */
const ISTANBUL_OFFSET_MS = 3 * 3_600_000;

export function birthDateFromMs(ms: number | null | undefined): Date | undefined {
  if (ms === null || ms === undefined) return undefined;
  const d = new Date(ms + ISTANBUL_OFFSET_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** The app's local-midnight Date to the 12:00 UTC the Worker uses for a calendar date. */
export function birthDateToMs(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}
