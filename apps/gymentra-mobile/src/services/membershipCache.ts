import AsyncStorage from '@react-native-async-storage/async-storage';

import { Tenant, TenantMembership } from '@/data/types';

/**
 * Offline cache for the signed-in user's membership + gym.
 *
 * The Firebase **JS** SDK has no on-disk Firestore cache on React Native
 * (persistence is web-only / IndexedDB), so without this the app is fully
 * online-only: open it with no signal and `getActiveMembership()` throws,
 * leaving the member with no QR card at exactly the moment they need it —
 * standing at a front desk with unreliable wifi.
 *
 * Only this one small, non-sensitive slice is cached. Everything else keeps
 * requiring a connection.
 */

const KEY_PREFIX = 'gymentra.membership.v1.';

interface CachedPayload {
  membership: TenantMembership | null;
  tenant: Tenant | null;
  /**
   * Kişinin aktif olduğu diğer salonlar (P1-8). Salon değiştirici çevrimdışı
   * açıldığında da listeyi gösterebilsin diye burada; eski önbellek
   * kayıtlarında yok, o durumda seçili üyelik tek başına liste sayılır.
   */
  memberships?: TenantMembership[];
}

/** Dates don't survive JSON — revive the fields we know are Date-typed. */
function reviveMembership(raw: Record<string, unknown> | null): TenantMembership | null {
  if (!raw) return null;
  return {
    ...(raw as unknown as TenantMembership),
    requestedAt: new Date(raw.requestedAt as string),
    approvedAt: raw.approvedAt ? new Date(raw.approvedAt as string) : undefined,
  };
}

function reviveTenant(raw: Record<string, unknown> | null): Tenant | null {
  if (!raw) return null;
  return {
    ...(raw as unknown as Tenant),
    createdAt: new Date(raw.createdAt as string),
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt as string) : undefined,
  };
}

export async function saveMembershipCache(uid: string, payload: CachedPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + uid, JSON.stringify(payload));
  } catch {
    // A failed cache write must never break the signed-in flow.
  }
}

export async function loadMembershipCache(uid: string): Promise<CachedPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + uid);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      membership: Record<string, unknown> | null;
      tenant: Record<string, unknown> | null;
      memberships?: Record<string, unknown>[];
    };
    const membership = reviveMembership(parsed.membership);
    const revived = (parsed.memberships ?? [])
      .map(reviveMembership)
      .filter((m): m is TenantMembership => !!m);
    return {
      membership,
      tenant: reviveTenant(parsed.tenant),
      memberships: revived.length ? revived : membership ? [membership] : [],
    };
  } catch {
    return null;
  }
}

export async function clearMembershipCache(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + uid);
  } catch {
    // Best-effort.
  }
}
