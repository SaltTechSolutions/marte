import AsyncStorage from '@react-native-async-storage/async-storage';

import { MembershipRole } from '@/data/types';

/**
 * Which surface a multi-role user is currently working in.
 *
 * A small studio's owner is often also a coach, and the two jobs need
 * different screens — so the choice has to survive app restarts rather than
 * snapping back to the most privileged role every launch.
 *
 * Stored per uid: a shared front-desk device must not carry one person's
 * choice over to the next.
 */

const KEY_PREFIX = 'gymentra.activeRole.v1.';

export async function saveActiveRole(uid: string, role: MembershipRole): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + uid, role);
  } catch {
    // A failed preference write is not worth interrupting the user for.
  }
}

export async function loadActiveRole(uid: string): Promise<MembershipRole | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + uid);
    return raw === 'admin' || raw === 'trainer' || raw === 'member' ? raw : null;
  } catch {
    return null;
  }
}

export async function clearActiveRole(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + uid);
  } catch {
    // Best-effort.
  }
}
