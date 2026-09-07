import { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

import { useAppTheme } from './ThemeContext';

/**
 * Bridges auth state into the theme engine: once a real signed-in member's
 * tenant loads, the app re-skins to that tenant's actual branding instead of
 * the dev launcher's gymentra/tarabya toggle. Renders nothing.
 */
export function ThemeSync() {
  const { activeTenant } = useAuth();
  const { applyTenantBranding, clearCustomBranding } = useAppTheme();

  useEffect(() => {
    if (activeTenant) applyTenantBranding(activeTenant.branding);
    else clearCustomBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id]);

  return null;
}
