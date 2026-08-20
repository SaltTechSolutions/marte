import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TabBar } from '@/components/TabBar';
import { useAppTheme } from '@/theme/ThemeContext';

const TABS = [
  { href: '/admin' as const, icon: 'stats-chart-outline' as const, label: 'Panel' },
  { href: '/admin/members' as const, icon: 'people-outline' as const, label: 'Üyeler' },
  { href: '/admin/classes' as const, icon: 'calendar-outline' as const, label: 'Dersler' },
  { href: '/admin/payments' as const, icon: 'card-outline' as const, label: 'Ödemeler' },
  { href: '/admin/settings' as const, icon: 'settings-outline' as const, label: 'Salon' },
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

export default function AdminLayout() {
  const { colors } = useAppTheme();
  const detail = {
    headerShown: true,
    headerStyle: { backgroundColor: colors.bg0 },
    headerTintColor: colors.txt,
    headerShadowVisible: false,
  } as const;

  // No bottom edge: the TabBar sits over that inset and consumes it itself.
  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg0 } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="members" />
          <Stack.Screen name="classes" />
          <Stack.Screen name="payments" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="today" options={{ ...detail, title: 'Bugün girenler' }} />
          <Stack.Screen name="staff" options={{ ...detail, title: 'Ekip ve yetkiler' }} />
          <Stack.Screen name="calendar" options={{ ...detail, title: 'Antrenör takvimleri' }} />
          <Stack.Screen name="packages" options={{ ...detail, title: 'Paketler' }} />
          <Stack.Screen name="package-form" options={{ ...detail, title: 'Paket' }} />
        </Stack>
      </View>
      <TabBar items={TABS} />
    </Screen>
  );
}
