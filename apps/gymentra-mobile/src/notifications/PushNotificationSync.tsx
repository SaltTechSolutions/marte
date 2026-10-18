import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { invalidate } from '@/data/api/poll';
import { registerPushToken } from '@/data/repo/pushTokenRepo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Where a tapped notification should land.
 *
 * Every push already carried `{ screen }` in its data, but nothing on the
 * client ever read it — tapping a notification opened the app on whatever
 * screen it was last on. `highlight` carries the record id so the target
 * screen can point at the row the notification was about, instead of leaving
 * the member to find which of their twelve payments changed.
 */
function routeFromNotification(data: Record<string, unknown> | undefined) {
  const screen = typeof data?.screen === 'string' ? data.screen : null;
  if (!screen) return;

  // Both `member/payments` and `/member/payments` appear in the functions;
  // normalising here is cheaper than a migration of every call site.
  const pathname = screen.startsWith('/') ? screen : `/${screen}`;
  const highlight = data?.paymentId ?? data?.sessionId ?? data?.recordId;

  try {
    router.push(
      typeof highlight === 'string'
        ? { pathname: pathname as never, params: { highlight } }
        : (pathname as never),
    );
  } catch {
    // An unknown screen name must not crash the app on a notification tap.
    // The push has already been read; landing on the current screen is a
    // far better failure than a crash.
  }
}

/**
 * Registers this device's Expo push token once a real, active membership
 * loads. Best-effort throughout — a failed registration (no physical
 * device, permission denied, offline) never breaks the app. Renders nothing.
 */
export function PushNotificationSync() {
  const { user, activeMembership } = useAuth();
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  useEffect(() => {
    if (!user || !tenantId) return;
    let cancelled = false;

    (async () => {
      if (!Device.isDevice) return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== 'granted' || cancelled) return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) return;

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (cancelled || !token) return;

      await registerPushToken({
        userId: user.uid,
        tenantId,
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      });
    })().catch(() => {
      // Best-effort — see doc comment above.
    });

    return () => {
      cancelled = true;
    };
  }, [user, tenantId]);

  // The push IS the live-data signal in API mode (no sockets): any notification that arrives while the
  // app is open, or is tapped, refreshes every active poller at once. A no-op when nothing is polling
  // (Firebase mode keeps its own snapshot listeners).
  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => invalidate(''));
    const tapped = Notifications.addNotificationResponseReceivedListener(() => invalidate(''));
    return () => {
      received.remove();
      tapped.remove();
    };
  }, []);

  // Notification taps. Separate from token registration and deliberately not
  // gated on a membership: a tap can arrive before the membership snapshot
  // lands, and dropping it would send the user to the wrong place.
  useEffect(() => {
    // A tap that launched the app from cold has already happened by the time
    // this mounts; the listener alone would miss it.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) routeFromNotification(response.notification.request.content.data);
      })
      .catch(() => {
        // Best-effort — see doc comment above.
      });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotification(response.notification.request.content.data);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
