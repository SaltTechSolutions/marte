import {
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_900Black,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';

import { ToastProvider } from '@/components/Toast';
import { AuthProvider } from '@/context/AuthContext';
import { AuthRedirect } from '@/context/AuthRedirect';
import { PushNotificationSync } from '@/notifications/PushNotificationSync';
import { ThemeProvider as AppThemeProvider } from '@/theme/ThemeContext';
import { ThemeSync } from '@/theme/ThemeSync';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
    // react-native matches style fontWeight against the family name "Inter";
    // register the regular cut under that same family key too.
    Inter: Inter_500Medium,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <AppThemeProvider>
      {/* Outside AuthProvider so a toast survives sign-out, and outside the
          navigator so it floats over every screen including the tab bar. */}
      <ToastProvider>
        <AuthProvider>
          <AuthRedirect />
          <ThemeSync />
          <PushNotificationSync />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="member" />
            <Stack.Screen name="trainer" />
            <Stack.Screen name="admin" />
            {/* Shared: check-in is a capability (canCheckIn), not an admin-only
                screen, so it lives outside both role tab groups. */}
            <Stack.Screen name="checkin" />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          </Stack>
        </AuthProvider>
      </ToastProvider>
    </AppThemeProvider>
  );
}
