import { Slot } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { TabBar } from '@/components/TabBar';

const TABS = [
  { href: '/trainer' as const, icon: 'people-outline' as const, label: 'Üyeler' },
  { href: '/trainer/calendar' as const, icon: 'calendar-outline' as const, label: 'Takvim' },
  { href: '/trainer/programs' as const, icon: 'clipboard-outline' as const, label: 'Programlar' },
  { href: '/trainer/profile' as const, icon: 'person-outline' as const, label: 'Profil' },
];

export default function TrainerLayout() {
  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <TabBar items={TABS} />
    </Screen>
  );
}
