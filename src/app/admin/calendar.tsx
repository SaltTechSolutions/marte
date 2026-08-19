import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { canOverseeCalendars } from '@/data/membership';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

import { TrainerCalendarView } from '../trainer/calendar';

/**
 * Admin oversight of every trainer's calendar.
 *
 * The same view lives under `trainer/` for trainers, but pushing an admin
 * into that route group swapped the whole tab bar — mid-way through gym
 * settings the screen turned into the trainer UI. Rendering it from an
 * `admin/` route keeps the admin's own navigation intact.
 */
export default function AdminCalendar() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { user, activeMembership } = useAuth();

  if (!canOverseeCalendars(activeMembership) || !user || !activeMembership) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 }}>
          <Text style={{ fontSize: 28 }}>🔒</Text>
          <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
            Salon yönetici oturumu gerekli
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
        <Text onPress={() => safeBack(router, '/admin/settings')} style={{ fontSize: 20, color: colors.txt, paddingRight: 4 }}>
          ‹
        </Text>
        <Text variant="helper" tone="sub">
          Antrenör takvimleri
        </Text>
      </View>
      <TrainerCalendarView tenantId={activeMembership.tenantId} isAdmin user={user} />
    </View>
  );
}
