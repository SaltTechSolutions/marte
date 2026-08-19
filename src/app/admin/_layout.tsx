import { Slot } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TabBar } from '@/components/TabBar';

const TABS = [
  { href: '/admin' as const, icon: 'stats-chart-outline' as const, label: 'Panel' },
  { href: '/admin/members' as const, icon: 'people-outline' as const, label: 'Üyeler' },
  { href: '/admin/classes' as const, icon: 'calendar-outline' as const, label: 'Dersler' },
  { href: '/admin/payments' as const, icon: 'card-outline' as const, label: 'Ödemeler' },
  { href: '/admin/settings' as const, icon: 'settings-outline' as const, label: 'Salon' },
];

export default function AdminLayout() {
  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <TabBar items={TABS} />
    </Screen>
  );
}
