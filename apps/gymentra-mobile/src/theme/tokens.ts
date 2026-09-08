// Ported 1:1 from the approved Claude Design panel (GymEntra.dc.html).
// Every screen must read colors through these semantic tokens only —
// never a raw hex — so runtime tenant re-skinning stays correct.

import { adjustForContrast, onColorFor } from './contrast';
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
  /** Brand colour as a **fill**: buttons, selected chips, indicators. Stays at
   *  full brand vividness; what sits on top of it is `onp`. */
  p: string;
  /** Brand colour as **text or an icon on a surface**: links, card glyphs, the
   *  active tab. Split from `p` because one value cannot do both jobs in light
   *  mode — `surf2` is pale enough that AA forces a much darker green than the
   *  brand actually is, and using that everywhere drained the colour out of the
   *  UI. In dark mode the two are identical. */
  pText: string;
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
      pText: '#10B981',
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
      // Half a step darker than slate-500 (#64748B). `sub` is read at 11-13pt,
      // so AA wants 4.5:1 — and slate-500 only managed 4.20:1 on `surf2`,
      // which is exactly where chips and badges put it. This clears 4.90:1
      // on every surface in this palette.
      sub: '#5B6980',
      // `p` is the brand green at full strength — it is only ever a fill here,
      // and dark ink on it reads 5.13:1. `pText` carries the same green into
      // text and icons, where the pale `surf2` forces a darker value.
      p: '#059669',
      pText: '#047857',
      g1: '#059669',
      g2: '#0891B2',
      // Lighter than the brand blue: the pulse label is dark ink in light
      // mode, and #2563EB only gave it 3.74:1.
      g3: '#3B82F6',
      danger: '#B91C1C',
      warn: '#92400E',
      ok: '#047857',
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
      pText: '#F97316',
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
      // Same correction as GymEntra Light: stone-500 (#78716C) sat at 4.04:1
      // on `surf2`. This clears 4.90:1 everywhere.
      sub: '#6B645F',
      // Same correction as GymEntra Light — see the note there.
      p: '#EA580C',
      pText: '#B3380A',
      g1: '#EA580C',
      g2: '#F97316',
      g3: '#D97706',
      danger: '#B91C1C',
      warn: '#92400E',
      ok: '#136B33',
    },
  },
};

// Semantic colors stay fixed across every tenant — danger/warn/ok communicate
// universal meaning and shouldn't shift with brand hue.
const SEMANTIC_DARK = { danger: '#F87171', warn: '#FBBF24', ok: '#34D399' };
// Light-mode values are a step darker than the obvious 600s: a status badge
// puts them as text on `surf2`, which is the palest surface but not white,
// and the 600s only reached 3.97-4.13:1 there.
const SEMANTIC_LIGHT = { danger: '#B91C1C', warn: '#92400E', ok: '#065F46' };

type Semantic = typeof SEMANTIC_DARK;

/** Keeps the semantic constants unless the derived surface under them fails AA. */
function semantic(base: Semantic, surface: string): Semantic {
  return {
    danger: adjustForContrast(base.danger, surface),
    warn: adjustForContrast(base.warn, surface),
    ok: adjustForContrast(base.ok, surface),
  };
}

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
    const surf2 = hslToHex({ h: hue, s: 0.2, l: 0.19 });
    const p = tone(primaryHex, 0.52);
    // Read as text/icons on the surfaces, `surf2` being the lightest of them
    // and so the binding constraint. A muted brand lands too close to it at a
    // fixed 0.52 — 3.96:1 for a low-saturation red.
    const pText = adjustForContrast(p, surf2);
    // The pulse button paints one ink — `onp`, derived from `p` — across all
    // three stops, so every stop owes that ink AA, not just the one `p` came
    // from. `g1` is the raw brand hex and `g3` a hue shift away, so they can
    // easily land on the wrong side of it.
    const ink = onColorFor(p);
    return {
      bg0: hslToHex({ h: hue, s: 0.28, l: 0.07 }),
      bg1: hslToHex({ h: hue, s: 0.26, l: 0.1 }),
      surf: hslToHex({ h: hue, s: 0.22, l: 0.14 }),
      surf2,
      line: 'rgba(255,255,255,0.09)',
      txt: '#FFFFFF',
      sub: neutral,
      p,
      pText,
      g1: adjustForContrast(g1, ink),
      g2: adjustForContrast(g2, ink),
      g3: adjustForContrast(g3, ink),
      // The semantic three are fixed on purpose, but the surface under them is
      // not: a warm `surf2` is brighter than a cool one at the same HSL
      // lightness, and red-400 lands at 4.46:1 there. Nudge only where the
      // derived surface makes the constant fail.
      ...semantic(SEMANTIC_DARK, surf2),
    };
  }
  const bg1 = hslToHex({ h: hue, s: 0.28, l: 0.93 });
  const p = tone(primaryHex, Math.min(hexToHsl(primaryHex).l, 0.42));
  // A fixed lightness cap cannot make this legible: HSL 0.42 is three times
  // brighter in yellow than in blue. Darken until it actually clears AA
  // against the surface it sits on — and only for the text role, so the fill
  // keeps the brand's own colour.
  const pText = adjustForContrast(p, bg1);
  const ink = onColorFor(p);
  return {
    bg0: hslToHex({ h: hue, s: 0.3, l: 0.97 }),
    bg1,
    surf: '#FFFFFF',
    surf2: bg1,
    line: 'rgba(15,23,42,0.12)',
    txt: hslToHex({ h: hue, s: 0.2, l: 0.09 }),
    sub: neutral,
    p,
    pText,
    g1: adjustForContrast(tone(g1, Math.min(hexToHsl(g1).l, 0.42)), ink),
    g2: adjustForContrast(tone(g2, Math.min(hexToHsl(g2).l, 0.45)), ink),
    g3: adjustForContrast(tone(g3, Math.min(hexToHsl(g3).l, 0.48)), ink),
    ...semantic(SEMANTIC_LIGHT, bg1),
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
