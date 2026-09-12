// Contrast guard — guarantees AA-legible text/icons on top of an arbitrary
// tenant primary color.

import { hexToHsl, hslToHex } from './deriveColor';

/** The two inks anything can sit on. `#0A0F0D` rather than pure black is the
 *  design token value, so the choice stays consistent with the Figma library. */
const DARK_INK = '#0A0F0D';
const LIGHT_INK = '#FFFFFF';

function channelLuminance(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG relative contrast between two colors, 1:1 (identical) to 21:1 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Returns the readable on-color (dark or white) for a given background hex.
 *
 * This used to switch on a fixed luminance threshold of 0.45, which was wrong:
 * the crossover between the two inks sits at ~0.19, so every color in between
 * — including all four shipped tenant primaries — got white text at 2.5-2.8:1,
 * well under the 4.5:1 AA floor. Picking whichever ink actually contrasts more
 * needs no threshold and stays correct for any hex a gym owner chooses,
 * including a near-white brand color.
 *
 * With only two inks the worst case is ~4.4:1, at the crossover itself; every
 * color outside that narrow band clears AA comfortably.
 */
export function onColorFor(hex: string): string {
  return contrastRatio(hex, DARK_INK) >= contrastRatio(hex, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}

/** WCAG AA for normal text. Everything `sub`-sized is read below 18pt. */
export const AA = 4.5;

/**
 * Nudges a color's lightness away from `against` until they clear `target`,
 * keeping hue and saturation.
 *
 * Used where a value has to stay legible against something the tenant does not
 * control: a brand primary read as text on a pale surface, or a gradient stop
 * carrying a fixed ink. A hand-picked lightness cap cannot do this job — the
 * luminance of HSL 0.42 differs by a factor of three between blue and yellow,
 * so one cap is always wrong for some hue.
 */
export function adjustForContrast(hex: string, against: string, target = AA): string {
  if (contrastRatio(hex, against) >= target) return hex;
  const { h, s } = hexToHsl(hex);
  // Move away from the other color: darker when it is the lighter of the two.
  const step = relativeLuminance(against) > relativeLuminance(hex) ? -0.02 : 0.02;
  let l = hexToHsl(hex).l;
  while (l > 0 && l < 1) {
    l = Math.max(0, Math.min(1, l + step));
    const candidate = hslToHex({ h, s, l });
    if (contrastRatio(candidate, against) >= target) return candidate;
  }
  return hslToHex({ h, s, l });
}
