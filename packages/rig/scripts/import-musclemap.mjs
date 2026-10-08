#!/usr/bin/env node
/**
 * `data/anatomy.json` üretir — kas haritası (önden ve arkadan erkek gövde).
 *
 *     git clone https://github.com/melihcolpan/MuscleMap.git /tmp/mm
 *     node scripts/import-musclemap.mjs --src /tmp/mm [--dry]
 *
 * ## Kaynak ve lisans
 *
 * Yollar MuscleMap'ten (MIT, © 2026 Melih Colpan) geliyor. MuscleMap'in erkek
 * yollarının çoğu react-native-body-highlighter'dan (MIT, © 2022 ELABBASSI
 * Hicham) birebir alınmış — ölçüldü: arka 70/70, ön 89/111 yol aynı. İki lisans
 * metni de `third_party/`'de ve üretilen dosyanın `licenses` alanına gömülü;
 * veri uygulamaya giderken lisans da onunla gidiyor.
 *
 * ## Neden eşleme burada, neden MuscleMap'in grupları değil
 *
 * MuscleMap 22 ana grup + 14 alt grup taşıyor; alt grupların çoğu ÖN görünümde
 * gerçek bölge değil, ana grubun üstüne konmuş yuvarlak lekeler (üst göğüs,
 * iç/dış ön bacak). Arka görünümde hiç alt grup yok. Bizim sözlüğümüz 39 kas.
 *
 * Ama her grup birden çok YOLDAN oluşuyor ve yollar zaten anatomik bölümler:
 * baldırın iki gastrocnemius başı ve soleus, ön bacağın üç başı, sırtta lat,
 * infraspinatus ve teres ayrı yollar. Eşleme bu yüzden GRUP değil YOL düzeyinde:
 * `slug` + o slug'ın sol listesindeki sıra → bizim kas kimliklerimiz. Sağ taraf
 * aynı sırayı izliyor (MuscleMap'in sol/sağ listeleri birbirinin aynası).
 *
 * Tek yolun iki kası taşıdığı yerde (göğüs, sırttaki trapez, pazu) yol yatay
 * bir BANTLA bölünüyor: `clip: [y0, y1]`, yolun dikey sınır kutusunun oranı.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const src = args[args.indexOf('--src') + 1];
if (!args.includes('--src') || !src) {
  console.error('kullanım: node scripts/import-musclemap.mjs --src <MuscleMap klonu> [--dry]');
  process.exit(1);
}

/** Yalnızca anatomik bölge olmayan şekiller: silüet olarak çizilir, boyanmaz. */
const SILHOUETTE = new Set(['head', 'hair', 'hands', 'feet', 'knees', 'ankles']);
/** Ana grubun üstüne binen lekeler — bölge değil, alınmıyor. */
const OVERLAY = new Set(['upperChest', 'lowerChest', 'innerQuad', 'outerQuad', 'upperAbs', 'lowerAbs', 'frontDeltoid', 'hipFlexors']);

/**
 * `slug` → sol listedeki her yolun kasları. Bant: `{ m: [...], clip: [y0, y1] }`.
 * Bir yol birden çok bant taşıyabilir; bantlar yolu üstten alta böler.
 * Sıralar `slug`'ın kendi listesinde; numaralı haritayla elle eşlendi
 * (2026-10-07, editörde göz ile doğrulandı).
 */
const FRONT = {
  chest: [[{ m: ['pecClav'], clip: [0, 0.4] }, { m: ['pecSternal'], clip: [0.4, 1] }]],
  abs: [['absUpper'], ['absMid'], ['absUpper'], ['absLower']],
  biceps: [[{ m: ['biceps'], clip: [0, 0.72] }, { m: ['brachialis'], clip: [0.72, 1] }]],
  triceps: [['triLong']],
  deltoids: [['deltFront']],
  obliques: [['oblique'], ['oblique'], ['oblique'], ['oblique'], ['oblique'], ['oblique'], ['oblique'], ['oblique']],
  quadriceps: [['quadRF'], ['quadVL'], ['quadVM']],
  calves: [['peroneus'], ['gastroMed']],
  adductors: [['adductors'], ['sartorius'], ['adductors']],
  trapezius: [['trapFront']],
  neck: [['sterno'], ['sterno']],
  forearm: [['forearmFlex'], ['forearmFlex'], ['forearmExt']],
  tibialis: [['tibialis']],
  serratus: [['serratus'], ['serratus'], ['serratus']],
};
const BACK = {
  neck: [['trapUpper']],
  trapezius: [[{ m: ['trapMid'], clip: [0, 0.5] }, { m: ['trapLower'], clip: [0.5, 1] }]],
  deltoids: [['deltPost']],
  upperBack: [['infra'], ['lat'], ['teres']],
  triceps: [['triLong'], ['triLong'], ['triLat']],
  lowerBack: [['erector'], ['erector']],
  forearm: [['forearmExt'], ['forearmExt'], ['forearmExt'], ['forearmExt']],
  gluteal: [['gluteMed'], ['gluteMax']],
  adductors: [['addMagnus']],
  hamstring: [['hamBF'], ['hamST'], ['hamBF'], ['hamST']],
  calves: [['gastroLat'], ['soleus'], ['gastroMed'], ['soleus']],
};

/** MuscleMap'in Swift veri dosyasından `slug → {left, right, common}` okur. */
function readSwift(file) {
  const s = readFileSync(join(src, 'Sources/MuscleMap/Data', file), 'utf8');
  const out = {};
  for (const m of s.matchAll(/slug: \.(\w+),([\s\S]*?)\n {8}\)/g)) {
    const list = (key) => {
      const block = m[2].match(new RegExp(`${key}: \\[([\\s\\S]*?)\\]`));
      return block ? [...block[1].matchAll(/"(M[^"]*)"/g)].map((x) => x[1]) : [];
    };
    out[m[1]] = { left: list('left'), right: list('right'), common: list('common') };
  }
  return out;
}

/**
 * Yolun dikey sınırı — bantların mutlak y'si buradan. Uç ve kontrol noktaları
 * üstünden kaba bir sınır; bölme çizgisi için yeterli (eğri kontrol noktasını
 * aşamaz, yani kutu hiç dar kalmaz).
 */
function bbox(d) {
  // Karakter akışı: SVG sayıları ayraçsız yazılabiliyor ("-.39-10.47") ve yay
  // bayrakları tek hane, boşluksuz ("01.94" = bayrak 0, bayrak 1, .94).
  let i = 0;
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const num = () => {
    skip();
    const m = d.slice(i).match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (!m) throw new Error(`sayı bekleniyordu: ${d.slice(i, i + 12)}`);
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = () => { skip(); return Number(d[i++]); };
  const ARGS = { m: 2, l: 2, c: 6, s: 4, q: 4, t: 2 };
  let cmd = '', x = 0, y = 0, sx = 0, sy = 0, lo = Infinity, hi = -Infinity, xl = Infinity, xh = -Infinity;
  const see = (yy) => { lo = Math.min(lo, yy); hi = Math.max(hi, yy); };
  const seeX = (xx) => { xl = Math.min(xl, xx); xh = Math.max(xh, xx); };
  for (skip(); i < d.length; skip()) {
    if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
    const c = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    if (c === 'z') { x = sx; y = sy; continue; }
    if (c === 'a') {
      num(); num(); num(); flag(); flag();
      const nx = num(), ny = num();
      x = rel ? x + nx : nx; y = rel ? y + ny : ny; see(y); seeX(x);
    } else if (c === 'h') {
      const n = num(); x = rel ? x + n : n; seeX(x);
    } else if (c === 'v') {
      const n = num(); y = rel ? y + n : n; see(y);
    } else {
      const v = []; for (let k = 0; k < ARGS[c]; k++) v.push(num());
      for (let k = 1; k < v.length; k += 2) see(rel ? y + v[k] : v[k]);
      for (let k = 0; k < v.length; k += 2) seeX(rel ? x + v[k] : v[k]);
      x = rel ? x + v[v.length - 2] : v[v.length - 2];
      y = rel ? y + v[v.length - 1] : v[v.length - 1];
    }
    if (c === 'm') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
  }
  return { y0: lo, y1: hi, cx: (xl + xh) / 2, cy: (lo + hi) / 2 };
}

function build(file, map, view, midX) {
  const data = readSwift(file);
  const paths = [];
  const used = new Set();
  for (const [slug, sides] of Object.entries(data)) {
    if (OVERLAY.has(slug)) continue;
    if (SILHOUETTE.has(slug)) {
      [...sides.left, ...sides.right, ...sides.common].forEach((d) => paths.push({ d, muscles: [] }));
      continue;
    }
    const plan = map[slug];
    if (!plan) throw new Error(`${view}: "${slug}" eşlenmemiş`);
    if (plan.length !== sides.left.length) {
      throw new Error(`${view}: "${slug}" ${sides.left.length} yol taşıyor, eşleme ${plan.length}`);
    }
    if (sides.right.length && sides.right.length !== sides.left.length) {
      throw new Error(`${view}: "${slug}" sol ${sides.left.length} / sağ ${sides.right.length} yol — sıra eşleşmez`);
    }
    used.add(slug);
    const emit = (d, entry) => {
      if (typeof entry[0] === 'string') return paths.push({ d, muscles: entry });
      entry.forEach((band) => {
        const { y0: lo, y1: hi } = bbox(d);
        const r = (f) => Math.round((lo + (hi - lo) * f) * 10) / 10;
        paths.push({ d, muscles: band.m, clip: [r(band.clip[0]), r(band.clip[1])] });
      });
    };
    sides.left.forEach((d, k) => emit(d, plan[k]));
    // Sağ liste sol listeyle AYNI SIRADA DEĞİL (ölçüldü: karın ve baldırda sıra
    // farklı, sağ tarafta yanlış blok boyanıyordu). Her sağ yol, aynadaki
    // karşılığına en yakın sol yolun eşlemesini alıyor.
    const mirrored = sides.left.map((d) => { const b = bbox(d); return [2 * midX - b.cx, b.cy]; });
    const taken = new Set();
    sides.right.forEach((d) => {
      const b = bbox(d);
      let best = -1, bestD = Infinity;
      mirrored.forEach(([mx, my], k) => {
        const dist = Math.hypot(mx - b.cx, my - b.cy);
        if (!taken.has(k) && dist < bestD) { bestD = dist; best = k; }
      });
      if (bestD > 60) throw new Error(`${view}: "${slug}" sağ yolunun aynası bulunamadı (en yakın ${Math.round(bestD)})`);
      taken.add(best);
      emit(d, plan[best]);
    });
    // `common` orta çizgide tek yol (boyun önü gibi): ilk eşlemeyi alır.
    sides.common.forEach((d) => emit(d, plan[0]));
  }
  Object.keys(map).forEach((slug) => {
    if (!used.has(slug)) throw new Error(`${view}: eşlemede "${slug}" var ama kaynakta yok`);
  });
  return paths;
}

const viewBoxOf = (name) => {
  const s = readFileSync(join(src, 'Sources/MuscleMap/Data/BodyPathData.swift'), 'utf8');
  const m = s.match(new RegExp(`static let ${name} = BodyViewBox\\(\\s*origin: CGPoint\\(x: ([\\d.]+), y: ([\\d.]+)\\),\\s*size: CGSize\\(width: ([\\d.]+), height: ([\\d.]+)\\)`));
  if (!m) throw new Error(`${name} viewBox okunamadı`);
  return m.slice(1).join(' ');
};

/** Gövdenin orta çizgisi: viewBox'ın yatay ortası. */
const midOf = (vb) => { const [x, , w] = vb.split(' ').map(Number); return x + w / 2; };

let commit = 'bilinmiyor';
try {
  commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}

const out = {
  _: 'ÜRETİLMİŞTİR — elle düzenleme. Kaynak: scripts/import-musclemap.mjs',
  source: `MuscleMap (github.com/melihcolpan/MuscleMap) @ ${commit}; erkek yollarının çoğu react-native-body-highlighter'dan`,
  licenses: [
    readFileSync(join(ROOT, 'third_party/MuscleMap.LICENSE'), 'utf8'),
    readFileSync(join(ROOT, 'third_party/react-native-body-highlighter.LICENSE'), 'utf8'),
  ],
  front: { viewBox: viewBoxOf('maleFront'), paths: build('MaleFrontPaths.swift', FRONT, 'front', midOf(viewBoxOf('maleFront'))) },
  back: { viewBox: viewBoxOf('maleBack'), paths: build('MaleBackPaths.swift', BACK, 'back', midOf(viewBoxOf('maleBack'))) },
};

const json = JSON.stringify(out, null, 1) + '\n';
if (args.includes('--dry')) {
  console.log(`ön ${out.front.paths.length} yol, arka ${out.back.paths.length} yol, ${json.length} B`);
} else {
  writeFileSync(join(ROOT, 'data/anatomy.json'), json);
  console.log(`✓ data/anatomy.json  (ön ${out.front.paths.length}, arka ${out.back.paths.length} yol, ${json.length} B)`);
}
