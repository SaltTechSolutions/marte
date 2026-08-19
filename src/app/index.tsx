import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { primaryRole, ROLE_HOME } from '@/data/membership';

/**
 * App entry point — silently routes to the right place based on auth state,
 * no UI of its own. Signed-out goes to registration, signed-in with an
 * active membership goes straight to their role's home, signed-in without
 * one goes to pick/join a gym.
 */
export default function Launcher() {
  const router = useRouter();
  const { user, authLoading, activeMembership, membershipLoading, activeRole } = useAuth();

  useEffect(() => {
    if (authLoading || membershipLoading) return;
    if (!user) {
      router.replace('/onboarding/register');
    } else if (activeRole ?? primaryRole(activeMembership)) {
      // activeRole is the surface a multi-role user last chose; it falls
      // back to the most privileged role they hold.
      router.replace(ROLE_HOME[(activeRole ?? primaryRole(activeMembership))!] as never);
    } else {
      router.replace('/onboarding/gym-code');
    }
  }, [authLoading, membershipLoading, user, activeMembership, activeRole, router]);

  return <Screen><></></Screen>;
}
