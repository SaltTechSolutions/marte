import { describe, expect, it } from 'vitest';

import { contrastRatio, onColorFor } from './contrast';
import { derivePalette, themes } from './tokens';

const DARK_INK = '#0A0F0D';
const LIGHT_INK = '#FFFFFF';

/** The two-ink floor: at the crossover neither ink reaches AA. Nothing may fall below it. */
const TWO_INK_FLOOR = 4.39;

function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0'))
      .join('')
  );
}

describe('onColorFor', () => {
  it('always picks whichever ink contrasts more', () => {
    for (let h = 0; h < 360; h += 3) {
      for (const s of [0.2, 0.4, 0.6, 0.8, 1]) {
        for (const l of [0.1, 0.25, 0.42, 0.52, 0.7, 0.95]) {
          const bg = hslHex(h, s, l);
          const chosen = onColorFor(bg);
          const other = chosen === DARK_INK ? LIGHT_INK : DARK_INK;
          expect(contrastRatio(bg, chosen)).toBeGreaterThanOrEqual(contrastRatio(bg, other));
        }
      }
    }
  });

  it('never leaves a derived primary below the two-ink floor', () => {
    for (let h = 0; h < 360; h += 3) {
      for (const s of [0.4, 0.6, 0.8, 1]) {
        for (const mode of ['dark', 'light'] as const) {
          const p = derivePalette(hslHex(h, s, 0.5), undefined, mode).p;
          expect(contrastRatio(p, onColorFor(p))).toBeGreaterThan(TWO_INK_FLOOR);
        }
      }
    }
  });

  it('keeps every shipped tenant primary at AA', () => {
    for (const theme of Object.values(themes)) {
      for (const palette of [theme.dark, theme.light]) {
        expect(contrastRatio(palette.p, onColorFor(palette.p))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // The bug this replaced: a 0.45 luminance threshold put every shipped
  // primary on white text at 2.5-2.8:1.
  it('puts dark ink on the shipped greens and oranges, not white', () => {
    for (const p of ['#10B981', '#059669', '#F97316', '#EA580C']) {
      expect(onColorFor(p)).toBe(DARK_INK);
    }
  });

  it('still picks white on a dark background and dark on a pale one', () => {
    expect(onColorFor('#0B0F19')).toBe(LIGHT_INK);
    expect(onColorFor('#FACC15')).toBe(DARK_INK);
    expect(onColorFor('#FFFFFF')).toBe(DARK_INK);
  });
});

/**
 * `txt` and `sub` carry nearly every word in the app, and `sub` is read at
 * 11-13pt, so both owe AA on all four surfaces. This guards the pair that
 * actually regressed: both light palettes shipped a `sub` that failed on
 * `surf2` — the surface chips and badges sit on.
 *
 * Deliberately not asserted here: `p`/`danger`/`warn`/`ok` on light-mode
 * `bg1`/`surf2`, which are still 3.00-4.43:1. Fixing those means retuning the
 * light semantic palette, a design call rather than a threshold — tracked as
 * K4 in docs/figma-tasarim-plani.md.
 */
describe('palette legibility', () => {
  const SURFACES = ['bg0', 'bg1', 'surf', 'surf2'] as const;
  const FOREGROUNDS = ['txt', 'sub'] as const;

  it('keeps text and secondary text at AA on every surface of every shipped palette', () => {
    for (const [tenant, theme] of Object.entries(themes)) {
      for (const [mode, palette] of Object.entries({ dark: theme.dark, light: theme.light })) {
        for (const fg of FOREGROUNDS) {
          for (const surface of SURFACES) {
            expect(
              contrastRatio(palette[fg], palette[surface]),
              `${tenant} ${mode}: ${fg} on ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('keeps a derived palette legible for any brand hue', () => {
    for (let h = 0; h < 360; h += 3) {
      for (const mode of ['dark', 'light'] as const) {
        const palette = derivePalette(hslHex(h, 0.8, 0.5), undefined, mode);
        for (const fg of FOREGROUNDS) {
          for (const surface of SURFACES) {
            expect(
              contrastRatio(palette[fg], palette[surface]),
              `${mode} h${h}: ${fg} on ${surface}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });
});
