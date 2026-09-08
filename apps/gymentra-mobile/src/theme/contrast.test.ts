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
 * Every foreground token is read as text or as an icon somewhere — `p` in
 * links and card icons, the semantic three in status badges — so all of them
 * owe AA on all four surfaces. Both regressions this guards were the same
 * shape: a value tuned against white, failing on `surf2`, which is the palest
 * surface but is not white.
 */
describe('palette legibility', () => {
  const SURFACES = ['bg0', 'bg1', 'surf', 'surf2'] as const;
  const FOREGROUNDS = ['txt', 'sub', 'p', 'danger', 'warn', 'ok'] as const;

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
      for (const s of [0.4, 0.7, 1]) {
        for (const mode of ['dark', 'light'] as const) {
          const palette = derivePalette(hslHex(h, s, 0.5), undefined, mode);
          for (const fg of FOREGROUNDS) {
            for (const surface of SURFACES) {
              expect(
                contrastRatio(palette[fg], palette[surface]),
                `${mode} h${h} s${s}: ${fg} on ${surface}`,
              ).toBeGreaterThanOrEqual(4.5);
            }
          }
        }
      }
    }
  });

  // The pulse button paints one ink across a three-stop gradient, so the ink
  // `p` chose has to work on all three. Before this, GymEntra Light had no
  // ink that worked: dark managed 3.74 on g3, white 3.68 on g2.
  it('keeps the pulse gradient legible under a single ink', () => {
    const check = (palette: ReturnType<typeof derivePalette>, label: string) => {
      const ink = onColorFor(palette.p);
      for (const stop of ['g1', 'g2', 'g3'] as const) {
        expect(contrastRatio(palette[stop], ink), `${label}: ink on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
    };
    for (const [tenant, theme] of Object.entries(themes)) {
      check(theme.dark, `${tenant} dark`);
      check(theme.light, `${tenant} light`);
    }
    for (let h = 0; h < 360; h += 3) {
      for (const mode of ['dark', 'light'] as const) {
        check(derivePalette(hslHex(h, 0.8, 0.5), undefined, mode), `derived ${mode} h${h}`);
      }
    }
  });
});
