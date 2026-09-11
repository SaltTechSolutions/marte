import { describe, expect, it } from 'vitest';

import { figureColors } from './figureColors';
import { themes } from './tokens';

import type { Palette } from './tokens';

/** WCAG 2.1 göreli parlaklık. */
function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Dört tema: iki kiracı × karanlık/aydınlık. */
const palettes: [string, Palette][] = Object.entries(themes).flatMap(([id, t]) => [
  [`${id} karanlık`, t.dark] as [string, Palette],
  [`${id} aydınlık`, t.light] as [string, Palette],
]);

describe('figureColors — figür kartın üstünde okunabiliyor', () => {
  it('kontrast yardımcısı bilinen değerleri veriyor', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#161D2B', '#161D2B')).toBeCloseTo(1, 5);
  });

  palettes.forEach(([ad, palette]) => {
    describe(ad, () => {
      const c = figureColors(palette);
      const kart = palette.surf;

      // Asıl kural bu. 11 Eylül 2026 öncesinde uzak uzuv karanlık temada
      // 1.00:1 ile çiziliyordu — yani hiç çizilmiyordu.
      it('yakın uzvun hattı karta göre 3:1 üstünde', () => {
        expect(contrast(c.edge, kart)).toBeGreaterThanOrEqual(3);
      });

      it('uzak uzvun hattı karta göre 3:1 üstünde', () => {
        expect(contrast(c.edgeFar, kart)).toBeGreaterThanOrEqual(3);
      });

      // Uzak uzuv İÇİ BOŞ: dolgusu kartın kendisi. Ayrımı hat taşıyor,
      // dolgu değil — üç kısıtı tek boyutlu renkle çözmenin yolu bu.
      it('uzak uzvun dolgusu kartın kendisi', () => {
        expect(c.skinFar).toBe(kart);
      });

      it('yakın uzvun dolgusu karttan ayrılıyor', () => {
        expect(contrast(c.skin, kart)).toBeGreaterThanOrEqual(1.6);
      });

      // Hat dolgunun üstünde de okunmalı, yoksa yakın uzuv tek düz leke olur.
      it('yakın hat kendi dolgusunun üstünde okunuyor', () => {
        expect(contrast(c.edge, c.skin)).toBeGreaterThanOrEqual(2.2);
      });

      it('yakın hat uzak hattan belirgin biçimde güçlü', () => {
        expect(contrast(c.edge, kart)).toBeGreaterThan(contrast(c.edgeFar, kart) * 1.3);
      });
    });
  });
});
