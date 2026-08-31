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
          <Stack.Screen name="index" options={{ title: 'Bugün' }} />
          <Stack.Screen name="card" options={{ title: 'Üye Kartım' }} />
          <Stack.Screen name="classes" options={{ title: 'Dersler' }} />
          <Stack.Screen name="workout" options={{ title: 'Program' }} />
          <Stack.Screen name="progress" options={{ title: 'Gelişim' }} />
          <Stack.Screen
            name="child"
            options={{
              headerShown: true,
              title: 'Çocuğum',
              headerStyle: { backgroundColor: colors.bg0 },
              headerTintColor: colors.txt,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="guardian-requests"
            options={{
              headerShown: true,
              title: 'Ebeveyn onayı',
              headerStyle: { backgroundColor: colors.bg0 },
              headerTintColor: colors.txt,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="edit-profile"
            options={{
              headerShown: true,
              title: 'Bilgilerim',
              headerStyle: { backgroundColor: colors.bg0 },
              headerTintColor: colors.txt,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="profile"
            options={{
              headerShown: true,
              title: 'Hesabım',
              headerStyle: { backgroundColor: colors.bg0 },
              headerTintColor: colors.txt,
              headerShadowVisible: false,
            }}
          />
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
          <Stack.Screen
            name="package-offer"
            options={{
              headerShown: true,
              title: 'Paket teklifi',
              headerStyle: { backgroundColor: colors.bg0 },
              headerTintColor: colors.txt,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="trainers"
            options={{
              headerShown: true,
              title: 'Antrenör seç',
              headerStyle: { backgroundColor: colors.bg0 },
              headerTintColor: colors.txt,
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="book-session"
            options={{
              headerShown: true,
              title: 'Randevu al',
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
