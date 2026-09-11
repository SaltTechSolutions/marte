import { hexToHsl, mix } from './deriveColor';

import type { Palette } from './tokens';

/**
 * Hareket figürünün renkleri.
 *
 * Figür `Card`'ın üstünde duruyor, o yüzden renkler `surf`'ten TÜRETİLİYOR.
 * 11 Eylül 2026'ya kadar `surf2` ve `bg0`'dan türetiliyordu ve karanlık temada
 * `skinFar` tam olarak kartın rengine düşüyordu: ölçülen kontrast **1.00:1**,
 * yani uzak uzuv hiç çizilmemiş gibiydi. Kaybolan şey süs değil — hamlede
 * hangi bacağın arkada olduğu, bird-dog'da hangi kolun uzandığı, step-up'ta
 * hangi ayağın basamakta olduğu hep uzak uzuvda.
 *
 * Ayrımı DOLGU değil KENAR ÇİZGİSİ taşıyor. Renk tek boyutlu ama kısıt üç
 * tane — yakın↔kart, uzak↔kart, yakın↔uzak aynı anda ayrışmalı — ve üçünü
 * birden dolgu açıklığıyla çözmeye kalkınca yakın uzuv gümüşe kadar açılıyor.
 * Bu yüzden uzak uzuv kart renginde İÇİ BOŞ, yakın uzuv dolu; ikisini de
 * görünür bir hat çiziyor.
 *
 * Kat sayılar keyfî değil: dört temanın (gymentra/tarabya × karanlık/aydınlık)
 * dördünde de her iki hattın karta göre kontrastı WCAG 1.4.11'in grafikler
 * için istediği 3:1'i geçiyor. `figureColors.test.ts` bunu sınıyor — kat sayı
 * ya da tema rengi değişirse test düşer.
 */
export interface FigureColors {
  /** Yakın uzuv dolgusu. */
  skin: string;
  /** Uzak uzuv dolgusu: kartın kendisi, yani içi boş. */
  skinFar: string;
  /** Yakın uzvun hattı. */
  edge: string;
  /** Uzak uzvun hattı — yakınınkinden soluk ama yine de 3:1 üstünde. */
  edgeFar: string;
  /** Halter göbeği gibi küçük iç parçalar. */
  joint: string;
  /** Zemin çizgisi ve gölge. */
  floor: string;
  /** Halter/dambıl metali. */
  metal: string;
}

export function figureColors(colors: Palette): FigureColors {
  // `hexToHsl` parlaklığı 0–1 ölçeğinde veriyor (bkz. `tone` belgesi). Bu
  // koşul `RigFigure` içinde `> 50` yazılmıştı, yani HİÇBİR ZAMAN doğru
  // olmuyordu: aydınlık temada da karanlık tema kat sayıları kullanılıyordu
  // ve figür beyaz kartın üstünde neredeyse görünmüyordu.
  const light = hexToHsl(colors.bg0).l > 0.5;
  const g = colors.surf;
  const t = colors.txt;
  return {
    skin: mix(g, t, light ? 0.24 : 0.3),
    skinFar: g,
    edge: mix(g, t, light ? 0.74 : 0.72),
    edgeFar: mix(g, t, light ? 0.5 : 0.38),
    joint: mix(g, t, light ? 0.34 : 0.4),
    floor: mix(g, t, light ? 0.3 : 0.22),
    metal: mix(colors.bg0, t, light ? 0.55 : 0.04),
  };
}
