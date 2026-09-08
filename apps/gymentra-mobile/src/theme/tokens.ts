// Ported 1:1 from the approved Claude Design panel (GymEntra.dc.html).
// Every screen must read colors through these semantic tokens only —
// never a raw hex — so runtime tenant re-skinning stays correct.

import { hexToHsl, hslToHex, mix, shiftHue, tone } from './deriveColor';

export type TenantId = 'gymentra' | 'tarabya';
export type ThemeMode = 'dark' | 'light';

export interface Palette {
  bg0: string;
  bg1: string;
  surf: string;
  surf2: string;
  line: string;
  txt: string;
  sub: string;
  p: string; // primary
  g1: string;
  g2: string;
  g3: string; // pulse gradient stops
  danger: string;
  warn: string;
  ok: string;
}

export interface TenantTheme {
  name: string;
  dark: Palette;
  light: Palette;
}

export const themes: Record<TenantId, TenantTheme> = {
  gymentra: {
    name: 'GymEntra',
    dark: {
      bg0: '#0B0F19',
      bg1: '#111827',
      surf: '#161D2B',
      surf2: '#1D2536',
      line: 'rgba(255,255,255,0.08)',
      txt: '#FFFFFF',
      sub: '#9CA3AF',
      p: '#10B981',
      g1: '#10B981',
      g2: '#06B6D4',
      g3: '#3B82F6',
      danger: '#F87171',
      warn: '#FBBF24',
      ok: '#34D399',
    },
    light: {
      bg0: '#F6F8FB',
      bg1: '#EDF1F7',
      surf: '#FFFFFF',
      surf2: '#EDF1F7',
      line: 'rgba(15,23,42,0.12)',
      txt: '#0B1220',
      sub: '#64748B',
      p: '#059669',
      g1: '#059669',
      g2: '#0891B2',
      g3: '#2563EB',
      danger: '#DC2626',
      warn: '#B45309',
      ok: '#059669',
    },
  },
  tarabya: {
    name: 'Tarabya Marte',
    dark: {
      bg0: '#12100C',
      bg1: '#1B1610',
      surf: '#221C13',
      surf2: '#2B2418',
      line: 'rgba(255,255,255,0.09)',
      txt: '#FFFFFF',
      sub: '#A8A29E',
      p: '#F97316',
      g1: '#F97316',
      g2: '#FB923C',
      g3: '#FACC15',
      danger: '#F87171',
      warn: '#FBBF24',
      ok: '#4ADE80',
    },
    light: {
      bg0: '#FAF7F2',
      bg1: '#F1EBDF',
      surf: '#FFFFFF',
      surf2: '#F1EBDF',
      line: 'rgba(28,25,23,0.12)',
      txt: '#1C1917',
      sub: '#78716C',
      p: '#EA580C',
      g1: '#EA580C',
      g2: '#F97316',
      g3: '#D97706',
      danger: '#DC2626',
      warn: '#B45309',
      ok: '#15803D',
    },
  },
};

// Semantic colors stay fixed across every tenant — danger/warn/ok communicate
// universal meaning and shouldn't shift with brand hue.
const SEMANTIC_DARK = { danger: '#F87171', warn: '#FBBF24', ok: '#34D399' };
const SEMANTIC_LIGHT = { danger: '#DC2626', warn: '#B45309', ok: '#059669' };

/**
 * Derives a full usable palette from just a primary (+ optional accent) hex —
 * this is what makes white-label actually "any color a gym owner picks",
 * not just the two hand-tuned palettes shipped with the design. Surfaces are
 * tonal variations of the primary hue (Material-You-style), text/borders
 * stay neutral, and danger/warn/ok are never derived.
 */
export function derivePalette(primaryHex: string, accentHex: string | undefined, mode: ThemeMode): Palette {
  const hue = hexToHsl(primaryHex).h;
  const g1 = primaryHex;
  const g3 = accentHex ?? shiftHue(primaryHex, 40);
  const g2 = mix(g1, g3, 0.5);
  const neutral = hslToHex({ h: hue, s: 0.06, l: mode === 'dark' ? 0.65 : 0.4 });

  if (mode === 'dark') {
    return {
      bg0: hslToHex({ h: hue, s: 0.28, l: 0.07 }),
      bg1: hslToHex({ h: hue, s: 0.26, l: 0.1 }),
      surf: hslToHex({ h: hue, s: 0.22, l: 0.14 }),
      surf2: hslToHex({ h: hue, s: 0.2, l: 0.19 }),
      line: 'rgba(255,255,255,0.09)',
      txt: '#FFFFFF',
      sub: neutral,
      p: tone(primaryHex, 0.52),
      g1,
      g2,
      g3,
      ...SEMANTIC_DARK,
    };
  }
  return {
    bg0: hslToHex({ h: hue, s: 0.3, l: 0.97 }),
    bg1: hslToHex({ h: hue, s: 0.28, l: 0.93 }),
    surf: '#FFFFFF',
    surf2: hslToHex({ h: hue, s: 0.28, l: 0.93 }),
    line: 'rgba(15,23,42,0.12)',
    txt: hslToHex({ h: hue, s: 0.2, l: 0.09 }),
    sub: neutral,
    // Darken the primary for light-mode use so it stays legible on white.
    p: tone(primaryHex, Math.min(hexToHsl(primaryHex).l, 0.42)),
    g1: tone(g1, Math.min(hexToHsl(g1).l, 0.42)),
    g2: tone(g2, Math.min(hexToHsl(g2).l, 0.45)),
    g3: tone(g3, Math.min(hexToHsl(g3).l, 0.48)),
    ...SEMANTIC_LIGHT,
  };
}

// Type scale (Inter): 34/28/22 headings (900), 17 body (500), 15 callout,
// 13 helper, 11 label.
//
// `callout` closes the gap the design audit flagged (designplan D2-5): body
// dropped straight from 17 to 13, so every piece of secondary text was
// squeezed into `helper` and, paired with `sub`, read badly. It is the step
// list rows, chips and card values actually want.
export const Type = {
  h1: { fontSize: 34, fontWeight: '900' as const, lineHeight: 38 },
  h2: { fontSize: 28, fontWeight: '900' as const, lineHeight: 32 },
  h3: { fontSize: 22, fontWeight: '900' as const, lineHeight: 26 },
  body: { fontSize: 17, fontWeight: '500' as const, lineHeight: 23 },
  callout: { fontSize: 15, fontWeight: '500' as const, lineHeight: 21 },
  helper: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700' as const, lineHeight: 14 },
};

// Spacing scale
export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Radius scale
export const Radius = { sm: 10, md: 14, lg: 20, pill: 999 };

// Layout tokens (from design: --gutter, --rowgap)
export const Layout = { gutter: 10, rowgap: 4 };

// Touch targets
export const TouchTarget = { min: 44, critical: 56 };
