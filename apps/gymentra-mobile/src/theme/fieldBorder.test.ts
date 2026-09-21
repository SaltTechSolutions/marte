import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast';
import { fieldBorderColor } from './fieldBorder';
import { derivePalette, themes } from './tokens';

// A field is filled with `surf` and sits on the page (`bg0`, `bg1`) or on a
// card, so its outline owes 3:1 to all three.
const NEIGHBOURS = ['surf', 'bg0', 'bg1'] as const;
const NON_TEXT_AA = 3;

function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (
    '#' +
    [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0')).join('')
  );
}

describe('text-field outline contrast', () => {
  it('reaches 3:1 on every shipped palette', () => {
    for (const [tenant, theme] of Object.entries(themes)) {
      for (const [mode, palette] of Object.entries({ dark: theme.dark, light: theme.light })) {
        const border = fieldBorderColor(palette);
        for (const n of NEIGHBOURS) {
          expect(contrastRatio(border, palette[n]), `${tenant} ${mode}: outline on ${n}`).toBeGreaterThanOrEqual(NON_TEXT_AA);
        }
      }
    }
  });

  it('reaches 3:1 on a derived palette for any brand hue', () => {
    for (let h = 0; h < 360; h += 3) {
      for (const s of [0.4, 0.7, 1]) {
        for (const mode of ['dark', 'light'] as const) {
          const palette = derivePalette(hslHex(h, s, 0.5), undefined, mode);
          const border = fieldBorderColor(palette);
          for (const n of NEIGHBOURS) {
            expect(contrastRatio(border, palette[n]), `${mode} h${h} s${s}: outline on ${n}`).toBeGreaterThanOrEqual(NON_TEXT_AA);
          }
        }
      }
    }
  });
});
