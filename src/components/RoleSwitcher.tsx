import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME, ROLE_LABEL } from '@/data/membership';
import { MembershipRole } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

import { Chip } from './Chip';
import { Text } from './Text';

const ORDER: MembershipRole[] = ['admin', 'trainer', 'member'];

/**
 * Lets someone who holds more than one role in a gym move between the
 * surfaces — a small studio's owner is usually also a coach, and the two
 * jobs need different screens.
 *
 * Renders nothing for the single-role majority, so it never adds noise for
 * a plain member.
 */
export function RoleSwitcher() {
  const router = useRouter();
  const { spacing } = useAppTheme();
  const { activeMembership, activeRole, setActiveRole } = useAuth();

  const roles = ORDER.filter((r) => activeMembership?.roles.includes(r));
  if (roles.length < 2) return null;

  const switchTo = async (role: MembershipRole) => {
    if (role === activeRole) return;
    await setActiveRole(role);
    router.replace(ROLE_HOME[role]);
  };

  return (
    <View style={{ gap: 6, marginTop: spacing.sm }}>
      <Text variant="label" tone="sub">
        GÖRÜNÜM
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {roles.map((r) => (
          <Chip key={r} label={ROLE_LABEL[r]} selected={r === activeRole} onPress={() => switchTo(r)} />
        ))}
      </View>
    </View>
  );
}
