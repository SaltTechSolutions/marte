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
  const branding = activeTenant?.branding;

  // Keyed on the branding VALUES, not the object and not just the gym id. The id
  // alone meant a colour or logo the owner changed was applied only on the next
  // launch (the cached gym painted first, the fresh one never re-applied). The
  // object identity would re-apply on every unrelated gym-doc change and undo an
  // owner's unsaved colour preview in the settings screen; the values do not.
  useEffect(() => {
    if (activeTenant) applyTenantBranding(activeTenant.branding);
    else clearCustomBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id, branding?.primaryColor, branding?.accentColor, branding?.themeMode, branding?.logoUrl, branding?.appName]);

  return null;
}
