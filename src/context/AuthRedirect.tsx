import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from './AuthContext';

/** Routes a signed-out person is allowed to sit on. `/` is the launcher,
 *  which redirects on its own. */
function isPublic(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/onboarding');
}

/**
 * Sends a signed-out user back to registration, from wherever they are.
 *
 * Auth-state routing used to live only in `app/index.tsx`, whose effect runs
 * when that screen mounts. Signing out from anywhere else — the profile
 * screen, or the escape hatch on `AccessGuard` — left the person stranded on
 * the screen they were already on: the listener cleared `user`, but nothing
 * navigated, so the surface just sat there showing an empty/locked state with
 * no way forward.
 *
 * Headless and mounted inside `AuthProvider`, alongside `ThemeSync`, so it
 * watches the whole app rather than one route.
 */
export function AuthRedirect() {
  const { user, authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (authLoading || user || isPublic(pathname)) return;
    router.replace('/onboarding/register');
  }, [authLoading, user, pathname, router]);

  return null;
}
