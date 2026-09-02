import { Stack } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TabBar } from '@/components/TabBar';
import { useAppTheme } from '@/theme/ThemeContext';

const TABS = [
  { href: '/trainer' as const, icon: 'people-outline' as const, label: 'Üyeler' },
  { href: '/trainer/calendar' as const, icon: 'calendar-outline' as const, label: 'Takvim' },
  { href: '/trainer/classes' as const, icon: 'people-circle-outline' as const, label: 'Dersler' },
  { href: '/trainer/programs' as const, icon: 'clipboard-outline' as const, label: 'Programlar' },
  { href: '/trainer/profile' as const, icon: 'person-outline' as const, label: 'Profil' },
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

export default function TrainerLayout() {
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
          <Stack.Screen name="index" options={{ title: 'Üyeler' }} />
          <Stack.Screen name="calendar" options={{ title: 'Takvim' }} />
          <Stack.Screen name="classes" options={{ title: 'Derslerim' }} />
          <Stack.Screen name="programs" options={{ title: 'Programlar' }} />
          <Stack.Screen name="profile" options={{ title: 'Profil' }} />
          <Stack.Screen name="availability" options={{ ...detail, title: 'Çalışma Saatlerim' }} />
          <Stack.Screen name="member" options={{ ...detail, title: 'Üye' }} />
          <Stack.Screen name="builder" options={{ ...detail, title: 'Program' }} />
        </Stack>
      </View>
      <TabBar items={TABS} />
    </Screen>
  );
}
