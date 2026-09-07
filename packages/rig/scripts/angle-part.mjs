#!/usr/bin/env node
/**
 * Yan siluetlerden AÇILI (3/4) siluet üretir — `npm run parts:angled`.
 *
 * Neden üretiliyor, elle çizilmiyor: ölçüldü, uzuvların silueti açıyla
 * neredeyse hiç değişmiyor (45°'de uyluk ×1.03, pazu ×1.00, baldır ×0.97)
 * çünkü kesitleri yuvarlak. Elle ikinci bir set çizmek o parçalarda aynı
 * şekli tekrar çizmek olurdu; değişen tek şey GÖVDE ve o da hesaplanabilir
 * bir dönüşüm.
 *
 * Model: her parça, kemik boyunca dizilmiş ELİPS kesitlerden oluşuyor. Yan
 * siluet her kemik istasyonunda kesitin ön (+X) ve arka (−X) sınırını veriyor;
 * aradaki yarı-mesafe `a` = ön-arka yarı derinlik, merkezi `c` = kesitin
 * kemikten kaçıklığı (kalçanın önde, baldırın arkada şişmesi). Yanal yarı
 * genişlik `ratio × a` kabul ediliyor.
 *
 * α açısından bakıldığında:
 *
 *   yarı genişlik  h' = a · sqrt(cos²α + ratio²·sin²α)
 *   merkez         c' = c · cos α
 *
 * Birincisi elips izdüşümünün genişliği, ikincisi sagittal düzlemdeki
 * kaçıklığın kısalması. İkisi farklı çarpanlar — tek bir ölçekle yapılamaz,
 * daha önce denenip yanlış çıkan şey buydu.
 *
 * SINIR: bu dönüşüm siluetin GENİŞLİĞİNİ ve KAÇIKLIĞINI düzeltiyor, kesitin
 * gerçek şeklini değil. Elips varsayımı gövdede iyi, dizin/dirseğin kemikli
 * çıkıntılarında kabaca doğru.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, BONES } from './normalize-part.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/bodyParts.json');

/**
 * Kesit oranı: yanal genişlik / ön-arka derinlik.
 *
 * Ölçüler yetişkin ortalaması, cm. Gövde yandan dar önden geniş (oran > 1),
 * uzuvlar yuvarlağa yakın (oran ≈ 1). Bu tablo dönüşümün TEK girdisi, o
 * yüzden burada duruyor ve veriye sızmıyor — veride duran bir sayı, kimsenin
 * kullanmadığı bir alan olarak kalıp sonraki turda yanlış karar verdirir.
 */
const KESIT = {
  thorax: [11, 16],
  lumbar: [10, 14],
  neck: [6, 6],
  thigh: [8, 8.5],
  shin: [5.5, 5],
  upper: [4.5, 4.5],
  fore: [4, 3.5],
};

/** Kübik/kare Bézier'i düz parçalara böler; sınır taraması poligon istiyor. */
const ORNEK = 24;
function flatten(cmds) {
  const pts = [];
  let cur = [0, 0];
  const lerp = (a, b, t) => a + (b - a) * t;
  for (const { c, p } of cmds) {
    if (c === 'M' || c === 'L') {
      cur = [p[0], p[1]];
      pts.push(cur);
    } else if (c === 'C') {
      const [x1, y1, x2, y2, x3, y3] = p;
      const [x0, y0] = cur;
      for (let i = 1; i <= ORNEK; i++) {
        const t = i / ORNEK;
        const u = 1 - t;
        pts.push([
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      cur = [x3, y3];
    } else if (c === 'Q') {
      const [x1, y1, x2, y2] = p;
      const [x0, y0] = cur;
      for (let i = 1; i <= ORNEK; i++) {
        const t = i / ORNEK;
        const u = 1 - t;
        pts.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]);
      }
      cur = [x2, y2];
    } else if (c === 'S' || c === 'T') {
      // Yumuşak varyantlar: kontrol noktası yansıması gerekiyor. Verimizde yok;
      // çıkarsa sessizce yanlış çizmek yerine durmak doğru.
      throw new Error(`${c} komutu desteklenmiyor — Inkscape'te C/Q'ya çevir`);
    }
  }
  return pts;
}

const ISTASYON = 48;

/**
 * Poligonu kemik boyunca tarayıp her istasyonda ön/arka sınırı okur.
 *
 * Yol kapalı bir dış hat olduğu için bir `y` seviyesinde birden çok kesişim
 * çıkabiliyor; en dıştakiler alınıyor. Hiç kesişim çıkmayan istasyon (yolun
 * ucundaki yuvarlaklık) komşusundan dolduruluyor.
 */
function sinirlar(pts, len) {
  const ust = Math.min(...pts.map((q) => q[1]));
  const alt = Math.max(...pts.map((q) => q[1]));
  const out = [];
  for (let i = 0; i <= ISTASYON; i++) {
    const y = ust + ((alt - ust) * i) / ISTASYON;
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < pts.length; j++) {
      const a = pts[j];
      const b = pts[(j + 1) % pts.length];
      if (a[1] === b[1]) continue;
      const t = (y - a[1]) / (b[1] - a[1]);
      if (t < 0 || t > 1) continue;
      const x = a[0] + (b[0] - a[0]) * t;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
    out.push(lo === Infinity ? null : { y, arka: lo, on: hi });
  }
  // Boş istasyonları komşudan doldur
  for (let i = 0; i < out.length; i++) {
    if (out[i]) continue;
    const k = out.find((q, j) => q && j > i) || [...out].reverse().find((q) => q);
    out[i] = k ? { ...k, y: ust + ((alt - ust) * i) / ISTASYON } : { y: 0, arka: 0, on: 0 };
  }
  return out;
}

const fmt = (v) => (Math.abs(v) < 5e-3 ? '0' : String(Math.round(v * 100) / 100));

/** Açılı silueti üretir: ön sınır aşağı, arka sınır yukarı, kapalı yol. */
export function acili(d, ratio, azDeg) {
  const r = (azDeg * Math.PI) / 180;
  const gen = Math.sqrt(Math.cos(r) ** 2 + ratio * ratio * Math.sin(r) ** 2);
  const kis = Math.cos(r);
  const s = sinirlar(flatten(parse(d)));
  const on = [];
  const arka = [];
  for (const q of s) {
    const c = (q.on + q.arka) / 2;
    const a = (q.on - q.arka) / 2;
    on.push([c * kis + a * gen, q.y]);
    arka.push([c * kis - a * gen, q.y]);
  }
  const seg = [...on, ...arka.reverse()];
  return `M ${fmt(seg[0][0])} ${fmt(seg[0][1])} ` + seg.slice(1).map((q) => `L ${fmt(q[0])} ${fmt(q[1])}`).join(' ') + ' Z';
}

/* --- CLI ----------------------------------------------------------------- */

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const az = Number(arg('az') ?? 50);
if (!Number.isFinite(az) || az < 0 || az > 89) {
  console.error('--az 0..89 arası bir açı olmalı (varsayılan 50)');
  process.exit(1);
}

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const parts = {};
let n = 0;
for (const [ad, q] of Object.entries(data.parts)) {
  const k = KESIT[ad];
  if (!k) { console.error(`✗ ${ad} için kesit ölçüsü yok`); process.exit(1); }
  const ratio = k[1] / k[0];
  parts[ad] = { len: BONES[ad], d: acili(q.d, ratio, az) };
  const r = (az * Math.PI) / 180;
  const gen = Math.sqrt(Math.cos(r) ** 2 + ratio * ratio * Math.sin(r) ** 2);
  console.log(`  ${ad.padEnd(8)} oran ${ratio.toFixed(3)}  genişlik ×${gen.toFixed(3)}  kaçıklık ×${Math.cos(r).toFixed(3)}`);
  n++;
}

data.angled = {
  _: `${az}° açıdan görülen siluetler. \`scripts/angle-part.mjs\` üretiyor, elle düzenleme — yan siluet değişirse yeniden çalıştır.`,
  az,
  parts,
};
writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
console.log(`\n✓ ${n} parça ${az}° için üretildi → data/bodyParts.json (angled)`);
