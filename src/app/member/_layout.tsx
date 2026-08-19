import { Stack, usePathname } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TabBar } from '@/components/TabBar';
import { useAppTheme } from '@/theme/ThemeContext';

const TABS = [
  { href: '/member' as const, icon: 'home-outline' as const, label: 'Bugün' },
  { href: '/member/card' as const, icon: 'qr-code-outline' as const, label: 'Üye Kartım' },
  { href: '/member/classes' as const, icon: 'calendar-outline' as const, label: 'Dersler' },
  { href: '/member/workout' as const, icon: 'barbell-outline' as const, label: 'Program' },
  { href: '/member/progress' as const, icon: 'trending-up-outline' as const, label: 'Gelişim' },
];

/**
 * Stack, not Slot. Slot renders the matched child with no navigator history,
 * so pushed detail screens got no back gesture, no transition and no
 * Android back handling — the tab roots and their detail screens were all
 * just swapped in place.
 *
 * Tab roots keep `headerShown: false` (they draw their own titles); pushed
 * detail screens opt into the native header, which is what gives them the
 * platform-correct back button, iOS edge-swipe and Android back for free.
 */

export default function MemberLayout() {
  const pathname = usePathname();
  const { colors } = useAppTheme();
  // Workout session hides the tab bar entirely — no accidental navigation mid-set.
  const hideTabBar = pathname.startsWith('/member/workout/session');

  // No bottom edge: the TabBar sits over that inset and consumes it itself.
  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg0 } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="card" />
          <Stack.Screen name="classes" />
          <Stack.Screen name="workout" />
          <Stack.Screen name="progress" />
          <Stack.Screen
            name="payments"
            options={{
              headerShown: true,
              title: 'Ödemelerim',
              headerStyle: { backgroundColor: colors.bg0 },
              headerTintColor: colors.txt,
              headerShadowVisible: false,
            }}
          />
        </Stack>
      </View>
      {!hideTabBar && <TabBar items={TABS} />}
    </Screen>
  );
}
