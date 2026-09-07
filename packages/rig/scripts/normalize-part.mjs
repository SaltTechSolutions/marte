#!/usr/bin/env node
/**
 * Bir SVG yolunu uzuv parçası yerel uzayına çevirir.
 *
 * Elle yapıldığında bu adımın hatası SESSİZ: yanlış origin ya da yanlış dönüş
 * parçayı kemiğe yanlış oturtur ama figür yine çizilir ve hiçbir denetim
 * uyarmaz. Script dönüşümü yapıyor ve sonucu kendi kendine doğruluyor —
 * kemik başı gerçekten (0,0)'a, kemik sonu (0,len)'e düşmüş mü.
 *
 * Kullanım:
 *   node scripts/normalize-part.mjs --part thigh --a 120,88 --b 118,193 --d "M ..."
 *   node scripts/normalize-part.mjs --part shin --a ... --b ... --file uyluk.txt --write
 *
 * `--a` kemiğin BAŞI (uyluk için kalça merkezi), `--b` SONU (diz merkezi),
 * ikisi de yolun kendi koordinat uzayında. `--write` sonucu doğrudan
 * data/bodyParts.json'a yazar.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Kemik boyları — `src/rig.ts`'teki `B` ile aynı olmak zorunda. */
export const BONES = { thigh: 105, shin: 100, upper: 78, fore: 68, lumbar: 55, thorax: 85, neck: 24 };

const ARITY = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };

/**
 * Belirteç deseni HER ÇAĞRIDA yeniden kuruluyor.
 *
 * Paylaşılan `g` bayraklı bir regex `exec` döngüsünde `lastIndex` taşıyor;
 * `parse` ortada hata fırlatırsa (yay komutu) o indeks kirli kalıyor ve bir
 * SONRAKİ çağrı dizginin ortasından taramaya başlayıp boş yol üretiyor.
 * Sessiz bir hata: yol boş çıkıyor ama hiçbir şey patlamıyor.
 */
const token = () => /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;

/**
 * Yolu mutlak komutlara ayırır.
 *
 * Göreli komutlar mutlağa çevriliyor, `H`/`V` ise `L`'ye: dönüş altında yatay
 * bir çizgi artık yatay kalmıyor, yani `H` dönüştürülemez.
 */
/** Yolu mutlak komut listesine ayrıştırır. */
export function parse(d) {
  const out = [];
  let cmd = null;
  let nums = [];
  let cur = [0, 0];
  let start = [0, 0];
  const flush = () => {
    while (cmd && (ARITY[cmd.toUpperCase()] === 0 || nums.length >= ARITY[cmd.toUpperCase()])) {
      const U = cmd.toUpperCase();
      const rel = cmd !== U;
      const n = nums.splice(0, ARITY[U]);
      if (U === 'Z') {
        out.push({ c: 'Z', p: [] });
        cur = [...start];
        cmd = null;
        break;
      }
      if (U === 'A') throw new Error('Yay komutu (A) desteklenmiyor: dönüşüm altında yarıçap ve bayraklar yeniden hesaplanmalı. Inkscape\'te Path > Object to Path ile eğriye çevir.');
      // Göreli → mutlak
      const abs = [];
      if (U === 'H') abs.push(rel ? cur[0] + n[0] : n[0], cur[1]);
      else if (U === 'V') abs.push(cur[0], rel ? cur[1] + n[0] : n[0]);
      else for (let i = 0; i < n.length; i += 2) abs.push(rel ? cur[0] + n[i] : n[i], rel ? cur[1] + n[i + 1] : n[i + 1]);
      const c = U === 'H' || U === 'V' ? 'L' : U;
      out.push({ c, p: abs });
      cur = [abs[abs.length - 2], abs[abs.length - 1]];
      if (U === 'M') { start = [...cur]; cmd = rel ? 'l' : 'L'; }
      if (nums.length === 0) break;
    }
  };
  const re = token();
  let m;
  while ((m = re.exec(d))) {
    if (m[1]) { flush(); cmd = m[1]; nums = []; if (cmd.toUpperCase() === 'Z') flush(); }
    else { nums.push(Number(m[2])); flush(); }
  }
  flush();
  if (nums.length) throw new Error(`yolda artık ${nums.length} sayı kaldı — komut/sayı sayısı tutmuyor`);
  return out;
}

/** Noktayı yerel uzaya taşıyan dönüşüm. */
export function makeTransform(a, b, len) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (l < 1e-9) throw new Error('kemik başı ve sonu aynı nokta');
  const s = len / l;
  // (b−a) vektörünü +Y'ye çeviren dönüş açısı.
  //   dx·cosφ − dy·sinφ = 0  ve  dx·sinφ + dy·cosφ = L   ⇒   φ = atan2(dx, dy)
  // İşareti ters yazmak kimlik durumunda (dx=0) fark etmiyor, o yüzden yalnızca
  // kemik yatayken ortaya çıkıyor — testi o yüzden döndürülmüş kemikle yazdık.
  const th = Math.atan2(dx, dy);
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return ([x, y]) => {
    const px = x - a[0];
    const py = y - a[1];
    return [(px * cos - py * sin) * s, (px * sin + py * cos) * s];
  };
}

const fmt = (v) => (Math.abs(v) < 5e-3 ? '0' : String(Math.round(v * 100) / 100));

/** Yolu yerel uzaya çevirir ve sonucu kendi kendine doğrular. */
export function normalizePath(d, a, b, len) {
  const T = makeTransform(a, b, len);
  const cmds = parse(d);
  const parts = cmds.map(({ c, p }) => {
    if (c === 'Z') return 'Z';
    const q = [];
    for (let i = 0; i < p.length; i += 2) q.push(...T([p[i], p[i + 1]]));
    return c + ' ' + q.map(fmt).join(' ');
  });

  // Kendi kendini doğrula: kemik başı (0,0)'a, sonu (0,len)'e düşmeli.
  const A = T(a);
  const Bp = T(b);
  const err = Math.hypot(A[0], A[1]) + Math.hypot(Bp[0], Bp[1] - len);
  if (err > 1e-6) throw new Error(`dönüşüm doğrulaması başarısız: kemik başı ${A} , sonu ${Bp}, beklenen (0,0) ve (0,${len})`);

  // Ayna kontrolü için genişlik dağılımı: +X figürün baktığı yön.
  const pts = cmds.flatMap(({ p }) => { const o = []; for (let i = 0; i < p.length; i += 2) o.push(T([p[i], p[i + 1]])); return o; });
  const front = Math.max(0, ...pts.map((q) => q[0]));
  const back = Math.min(0, ...pts.map((q) => q[0]));
  return { d: parts.join(' '), front, back };
}

// --- CLI ------------------------------------------------------------------

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const pt = (s, name) => {
  const v = String(s || '').split(',').map(Number);
  if (v.length !== 2 || v.some((x) => !Number.isFinite(x))) throw new Error(`--${name} "x,y" biçiminde olmalı`);
  return v;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const part = arg('part');
    if (!part || !(part in BONES)) {
      throw new Error(`--part gerekli ve şunlardan biri olmalı: ${Object.keys(BONES).join(', ')}`);
    }
    const d = arg('d') ?? (arg('file') ? readFileSync(arg('file'), 'utf8') : undefined);
    if (!d) throw new Error('--d ya da --file gerekli');
    const len = BONES[part];
    const res = normalizePath(d, pt(arg('a'), 'a'), pt(arg('b'), 'b'), len);

    console.log(`\n${part} (kemik boyu ${len})`);
    console.log(`  ön (+X) en uzak: ${res.front.toFixed(1)}   arka (−X): ${res.back.toFixed(1)}`);
    if (res.front < Math.abs(res.back)) {
      console.log('  UYARI: kütle ARKA tarafta ağır basıyor. +X figürün baktığı yön —');
      console.log('         uyluk için quadriceps orada olmalı. Parça aynalanmış olabilir.');
    }
    console.log(`\n${res.d}\n`);

    if (argv.includes('--write')) {
      const p = join(ROOT, 'data/bodyParts.json');
      const j = JSON.parse(readFileSync(p, 'utf8'));
      j.parts[part] = { len, d: res.d };
      writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
      console.log(`✓ data/bodyParts.json güncellendi (${part})`);
      console.log('  Doğrula:  npm test && npm run export');
    }
  } catch (e) {
    console.error('✗ ' + e.message);
    process.exit(1);
  }
}
