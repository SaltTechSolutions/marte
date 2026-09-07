import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { View } from 'react-native';

import { GymLogo } from '@/components/GymLogo';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { primaryRole, ROLE_HOME } from '@/data/membership';

/**
 * App entry point — routes to the right place based on auth state.
 *
 * While auth and the membership resolve it shows the gym's logo and name
 * rather than a blank screen. The branding comes from the on-disk membership
 * cache via ThemeSync, so on a warm start this is the first thing drawn and
 * it needs no network: every launch opens on the gym's own mark, which is
 * most of what "my gym's app" feels like. With no cached membership (first
 * run, signed out) it stays quiet — there is no gym to show yet.
 */
export default function Launcher() {
  const router = useRouter();
  const { user, authLoading, activeMembership, membershipLoading, activeRole, activeTenant } = useAuth();

  useEffect(() => {
    if (authLoading || membershipLoading) return;
    if (!user) {
      router.replace('/onboarding/register');
    } else if (activeRole ?? primaryRole(activeMembership)) {
      // activeRole is the surface a multi-role user last chose; it falls
      // back to the most privileged role they hold.
      router.replace(ROLE_HOME[(activeRole ?? primaryRole(activeMembership))!]);
    } else {
      router.replace('/onboarding/gym-code');
    }
  }, [authLoading, membershipLoading, user, activeMembership, activeRole, router]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        {activeTenant ? (
          <>
            <GymLogo size={72} />
            <Text variant="h3">{activeTenant.branding.appName || activeTenant.name}</Text>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
