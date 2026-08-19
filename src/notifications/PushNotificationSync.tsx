import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { registerPushToken } from '@/data/firebase/pushTokenRepo';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

  return null;
}
