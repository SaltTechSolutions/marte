import { Slot, usePathname } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TabBar } from '@/components/TabBar';

const TABS = [
  { href: '/member' as const, icon: 'home-outline' as const, label: 'Bugün' },
  { href: '/member/card' as const, icon: 'qr-code-outline' as const, label: 'Üye Kartım' },
  { href: '/member/classes' as const, icon: 'calendar-outline' as const, label: 'Dersler' },
  { href: '/member/workout' as const, icon: 'barbell-outline' as const, label: 'Program' },
  { href: '/member/progress' as const, icon: 'trending-up-outline' as const, label: 'Gelişim' },
];

export default function MemberLayout() {
  const pathname = usePathname();
  // Workout session hides the tab bar entirely — no accidental navigation mid-set.
  const hideTabBar = pathname.startsWith('/member/workout/session');

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      {!hideTabBar && <TabBar items={TABS} />}
    </Screen>
  );
}
