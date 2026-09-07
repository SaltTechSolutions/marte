import React, { createContext, useContext, useMemo, useState } from 'react';

import { TenantBranding } from '@/data/types';

import { onColorFor } from './contrast';
import { derivePalette, Palette, Radius, Spacing, TenantId, ThemeMode, Type, themes } from './tokens';

export interface AppTheme {
  tenantId: TenantId;
  tenantName: string;
  /** The gym's uploaded mark, from the same branding the palette comes from.
   *  Undefined for a gym that never uploaded one — `GymLogo` falls back. */
  logoUrl?: string;
  mode: ThemeMode;
  colors: Palette & { onp: string };
  type: typeof Type;
  spacing: typeof Spacing;
  radius: typeof Radius;
  setTenant: (t: TenantId) => void;
  setMode: (m: ThemeMode) => void;
  /** Real signed-in tenant's branding takes over from the dev gymentra/tarabya toggle. */
  applyTenantBranding: (branding: TenantBranding) => void;
  clearCustomBranding: () => void;
}

const ThemeCtx = createContext<AppTheme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenant] = useState<TenantId>('gymentra');
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [customBranding, setCustomBranding] = useState<TenantBranding | null>(null);

  const applyTenantBranding = (branding: TenantBranding) => {
    setCustomBranding(branding);
    if (branding.themeMode === 'dark' || branding.themeMode === 'light') setMode(branding.themeMode);
  };
  const clearCustomBranding = () => setCustomBranding(null);

  const value = useMemo<AppTheme>(() => {
    const palette = customBranding
      ? derivePalette(customBranding.primaryColor, customBranding.accentColor, mode)
      : themes[tenantId][mode];
    const tenantName = customBranding?.appName ?? themes[tenantId].name;
    return {
      tenantId,
      tenantName,
      logoUrl: customBranding?.logoUrl,
      mode,
      colors: { ...palette, onp: onColorFor(palette.p) },
      type: Type,
      spacing: Spacing,
      radius: Radius,
      setTenant,
      setMode,
      applyTenantBranding,
      clearCustomBranding,
    };
  }, [tenantId, mode, customBranding]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useAppTheme(): AppTheme {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useAppTheme must be used within ThemeProvider');
  return ctx;
}
