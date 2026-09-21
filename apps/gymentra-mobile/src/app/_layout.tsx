// One entry per weight, never the package root. The root index `require`s ALL
// 18 Inter cuts (9 weights x normal/italic), so Metro bundled every TTF into
// the app: ~6 MB shipped for the 4 cuts used below, ~4.7 MB of it dead weight
// (DEN-11). `useFonts` from `/useFonts` is the same hook the root re-exports,
// just without the barrel.
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_900Black } from '@expo-google-fonts/inter/900Black';
import { useFonts } from '@expo-google-fonts/inter/useFonts';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/Toast';
import { AuthProvider } from '@/context/AuthContext';
import { AuthRedirect } from '@/context/AuthRedirect';
import { PushNotificationSync } from '@/notifications/PushNotificationSync';
import { createEventBudget } from '@/services/eventBudget';
import { ThemeProvider as AppThemeProvider } from '@/theme/ThemeContext';
import { ThemeSync } from '@/theme/ThemeSync';

SplashScreen.preventAutoHideAsync();

// plan-eng-review Faz 2.2 — GlitchTip speaks the Sentry event protocol, so
// the stock @sentry/react-native SDK works unmodified against it, just
// pointed at a different DSN host. No-op (never inits, `reportError`/
// `errorMessage` in data/errors.ts fall back to their local no-Sentry path)
// if the env var isn't set, so a contributor without a DSN still gets a
// working app rather than a crash on startup.
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  // plan.md D-4. `reportError`'ın kendi süzgeci (data/errors.ts) yalnızca
  // *bizim* çağırdığımız yolu görüyor; bir çökme döngüsü oradan geçmiyor,
  // SDK'nın küresel yakalayıcısından geliyor. Kotayı yakan da o, bu yüzden
  // kapı en dışta, `beforeSend`'de duruyor.
  const allowEvent = createEventBudget();

  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    // Sends stack traces without also recording user session replay/
    // performance traces — this app doesn't need those, and every extra
    // capture is more of the free tier's monthly event budget spent on
    // something other than the errors it exists to catch.
    //
    // Tracing is off because `tracesSampleRate` is NOT set. It used to say
    // `tracesSampleRate: 0`, which reads as "off" but is not: the RN SDK turns
    // tracing on for any NUMBER (integrations/default.js:
    // `typeof options.tracesSampleRate === 'number'`), so app-start,
    // native-frames, stall, user-interaction and time-to-display integrations
    // were installed and ran for traces that were never going to be sent
    // (DEN-11).
    beforeSend: (event) => (allowEvent(event) ? event : null),
  });
}

function RootLayout() {
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
    // Swipe-to-reveal rows (admin member list) need this at the very root —
    // without it the gesture silently never fires.
    <GestureHandlerRootView style={{ flex: 1 }}>
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
            {/* Shared: staff hold this up at the front desk, so it hangs off
                both the admin and trainer account screens rather than living
                inside either tab group. */}
            <Stack.Screen name="gym-qr" options={{ presentation: 'modal' }} />
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            {/* Shared: the member opens it mid-workout and the trainer while
                writing a programme, so it sits outside both tab groups. */}
            <Stack.Screen name="exercise-detail" />
            <Stack.Screen name="exercise-library" />
          </Stack>
        </AuthProvider>
      </ToastProvider>
    </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);
