import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { signOut } from 'firebase/auth';

import { unregisterPushToken } from '@/data/firebase/pushTokenRepo';
import { resetSharedWatches } from '@/data/firebase/sharedWatch';

import { clearMembershipCache } from './membershipCache';
import { clearActiveRole } from './activeRole';
import { auth } from './firebase';

/**
 * Sign out, drop the offline membership cache, and revoke this device's push
 * registration.
 *
 * All of it has to happen *before* signing out — afterwards
 * `auth.currentUser` is null and we no longer know whose entries to remove.
 *
 * The push token matters most on a shared device: without revoking it the
 * previous user stays subscribed, so the next person to pick up the phone
 * receives their notifications.
 */
export async function signOutAndForget(): Promise<void> {
  const uid = auth.currentUser?.uid;

  if (uid) {
    await clearMembershipCache(uid);
    await clearActiveRole(uid);
  }

  try {
    // Same projectId the registration path uses — without it the SDK cannot
    // resolve which Expo project the token belongs to.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (projectId) {
      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (token) await unregisterPushToken(token);
    }
  } catch {
    // No token (simulator, permission denied, offline). Best-effort: never
    // block sign-out on notification plumbing.
  }

  // Drop shared listeners and their cached rows, so the next account on this
  // device never sees the previous one's data replayed.
  resetSharedWatches();

  await signOut(auth);
}
