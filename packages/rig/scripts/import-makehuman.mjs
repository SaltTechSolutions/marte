#!/usr/bin/env node
/**
 * `data/bodyParts.json` üretir — MakeHuman (CC0) modelinden çıkarılan yandan
 * uzuv siluetleri. `build-body-parts.mjs`'in elle yazılmış profillerinin yerini
 * alıyor.
 *
 *     blender --background --python scripts/blender/extract-parts.py -- /tmp/mh.json
 *     node scripts/import-makehuman.mjs /tmp/mh.json [--dry]
 *
 * ## Neden
 *
 * Elle yazılan yarı genişlik profilleri (7 parça × 4–9 istasyon) figürü manken
 * görünümünden çıkaramadı (kullanıcı, 2026-10-07): gerçek bir uzvun kıvrımı
 * birkaç sayıyla anlatılamıyor. Burada siluet gerçek bir insan modelinin
 * geometrisinden geliyor.
 *
 * ## Ölçek
 *
 * Modelin oranları bizim iskeletimizle aynı değil (modelde baldır uyluktan,
 * ön kol üst koldan uzun; bizde tersi). Kemik boyunca her parça KENDİ
 * uzunluğuna esnetiliyor — şema `len`'i zorunlu tutuyor. Enine ise TEK bir
 * ölçek var (bacak boyu oranı): kalınlıklar vücut genelinde tutarlı kalıyor,
 * kısa çizilen bir parça "şişmanlamıyor".
 *
 * ## Gövde
 *
 * Gövde tek bir dik silüet olarak çıkarılıyor ve eklem yüksekliklerinde
 * (kalça, bel, omuz, boyun) üç banda kesiliyor. Bant ekseni iki eklemi
 * birleştiren çizgi; başa giden kemiklerde yerel +X ARKA (bkz.
 * `build-body-parts.mjs` → `HEADWARD`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
if (!src) {
  console.error('kullanım: node scripts/import-makehuman.mjs <extract-parts çıktısı.json> [--dry]');
  process.exit(1);
}
const mh = JSON.parse(readFileSync(src, 'utf8'));

/** Rig kemik boyları — şemanın zorunlu tuttuğu sayılar. */
const BONES = { thigh: 105, shin: 100, upper: 78, fore: 68, lumbar: 55, thorax: 85, neck: 44 };
/** Eklem payı: parça kemiğin iki ucundan bu kadar taşabilir. */
const CAP = 6;
/** Sadeleştirme toleransı, rig pikseli. Izgara 4 mm ≈ 1 px; altı merdiven. */
const TOL = 0.9;
/** Bant kesiğindeki köşenin içeri çekilme payı, rig birimi. */
const CUT_INSET = 1.5;
/** Enine ölçek: rig bacak boyu / model bacak boyu. */
const S = (BONES.thigh + BONES.shin) / mh.legLength;

const r1 = (n) => Math.round(n * 10) / 10;

/** Ramer–Douglas–Peucker, kapalı çokgen için iki yarıda. */
function rdp(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = -1, dmax = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), tol).slice(0, -1), ...rdp(pts.slice(idx), tol)];
}
const simplifyClosed = (pts, tol) => {
  // En uzak iki nokta arasından ikiye böl, her yarıyı ayrı sadeleştir.
  let far = 0, fd = 0;
  pts.forEach((p, i) => { const d = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); if (d > fd) { fd = d; far = i; } });
  const A = rdp(pts.slice(0, far + 1), tol);
  const B = rdp([...pts.slice(far), pts[0]], tol);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
};

/** Merdivenden kalan küçük kırıkları yumuşatır (iki tur Chaikin değil, komşu ortalaması). */
const smooth = (pts, n = 2) => {
  let p = pts;
  for (let k = 0; k < n; k++) {
    p = p.map((q, i) => {
      const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length];
      return [(a[0] + 2 * q[0] + b[0]) / 4, (a[1] + 2 * q[1] + b[1]) / 4];
    });
  }
  return p;
};

/**
 * Kapalı Catmull-Rom → kübik Bézier (`build-body-parts.mjs` ile aynı), bir farkla:
 * `sharp` işaretli noktalar (bant kesiminden gelen köşeler) yuvarlanmıyor. Spline
 * keskin köşede dışarı taşıyor ve kesik kenarın ucu siluetten çizgi gibi
 * çıkıyordu (omuz hizasında görüldü).
 */
function closedSpline(pts, sharp = new Set()) {
  const n = pts.length;
  const at = (i) => pts[((i % n) + n) % n];
  const isSharp = (i) => sharp.has(((i % n) + n) % n);
  let d = `M ${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = isSharp(i) ? p1 : [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = isSharp(i + 1) ? p2 : [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + ' Z';
}

/** Yatay iki çizgi arasına kırp (Sutherland–Hodgman, `u` ekseninde). */
function clipSlab(poly, lo, hi) {
  const clip = (pts, inside, cut) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) {
        const t = (cut - a[0]) / (b[0] - a[0]);
        out.push([cut, a[1] + t * (b[1] - a[1]), true]);
      }
    }
    return out;
  };
  return clip(clip(poly, (p) => p[0] >= lo, lo), (p) => p[0] <= hi, hi);
}

/**
 * Model hattını önce BÜTÜN olarak sadeleştirip yumuşatır (rig ölçeğinde), sonra
 * banda keser. Ters sıra (önce kes, sonra yumuşat) kesik uçları da yuvarlıyordu:
 * gövde bantları ayrı ayrı top gibi duruyor, belde boşluk kalıyordu. Kesik
 * kenarlar düz kalmalı; komşu parçayla çakışıyorlar ve zincirin iki geçişli
 * çizimi aradaki dikişi gizliyor.
 */
const prepare = (poly, tol = TOL, passes = 2) =>
  smooth(simplifyClosed(poly.map(([u, v]) => [u * S, v * S]), tol), passes).map(([u, v]) => [u / S, v / S]);

/** Model (u, v) hattını yerel parça yoluna çevirir. */
function toPart(name, poly, u0, u1, axisV, headward, cap = CAP, capLo = cap, roundLo = false) {
  const len = BONES[name];
  const ky = len / (u1 - u0);
  // u0..u1 dışına `cap` kadar taşmaya izin ver, sonrası komşu parçanın işi.
  const lo = u0 - capLo / ky;
  const slab = clipSlab(poly, lo, u1 + cap / ky);
  const sharp = new Set();
  const local = slab.map(([u, v, cut], i) => {
    // `roundLo`: alt kesik açıkta kalıyorsa (bel bandı kalçanın önünde) köşe yuvarlanır.
    if (cut && !(roundLo && Math.abs(u - lo) < 1e-9)) sharp.add(i);
    let x = (v - axisV(u)) * S;
    // Kesik köşesi silüetin TAM üstünde duruyordu; komşu bant aynı noktayı kendi
    // eğrisiyle geçince köşe 1–2 birim dışarı taşıyıp boyun ve omuz hizasında
    // çentik yapıyordu (kullanıcı: "boyundaki çentikler"). Köşe eksene doğru
    // içeri çekiliyor: komşu parçanın dolgusunun altında kalıyor.
    if (cut) x -= Math.sign(x) * Math.min(CUT_INSET, Math.abs(x));
    return [headward ? -x : x, (u - u0) * ky];
  });
  return { len, d: closedSpline(local, sharp) };
}

const parts = {};
for (const name of ['thigh', 'shin', 'upper', 'fore']) {
  const p = mh.parts[name];
  // Uzuvlar KESİLMİYOR: her uzuv kendi zinciri, kesik kenar gizlenmez ve kolun
  // tepesi düz kesilmiş görünüyordu. Modelin doğal uç biçimi (deltoid, kalça
  // kıvrımı) kalıyor; komşu parçayla çakışması zaten istenen şey.
  parts[name] = toPart(name, prepare(p.outline), 0, p.len, () => 0, false, Infinity);
}

// Gövde: üç bant TEK, dik bir eksene göre ölçülüyor. Önce her bandın ekseni
// kendi iki eklemini birleştiren doğruydu; modelin göğüs ekseni (bel → omuz)
// ~8° öne, bel ekseni hafif geriye eğik. Rig dik duruşta iki bandı da dik
// koyunca bu fark bel hizasında öne doğru bir basamağa dönüştü ve göbek gibi
// okundu (kullanıcı: "göbek saçma oldu"). Ortak eksen: dört eklemin ön-arka
// ortalaması — gövdenin kendi orta çizgisi.
const T = mh.trunk;
// Gövde tek yumuşatmayla (2 mm ızgaradan): göğüs kasının alt kenarı korunacak kadar
// az (0.5/1 turda boyun önü pürüzlüydü), ve TÜM bantlar aynı hattan kesiliyor —
// boyun bandını ayrıca yumuşatmak onu inceltiyor, göğüs bandının üst köşeleri
// omuz hizasında çentik olarak açıkta kalıyordu.
const trunk = prepare(T.outline, 0.7, 2);
/** Gövde bantları birbirine daha çok biniyor: kesik kenar zincirin içinde kalmalı. */
const TRUNK_CAP = 10;
const midV = (T.hip[1] + T.waist[1] + T.shoulder[1] + T.neck[1]) / 4;
const axis = () => midV;
// Bel bandının alt ucu kalça ekleminde biter ve yuvarlanır: aşağı taşan kesik
// köşe kalçanın önünde açıkta kalıyor, elin altında dişli bir çentik yapıyordu.
parts.lumbar = toPart('lumbar', trunk, T.hip[0], T.waist[0], axis, true, TRUNK_CAP, 0, true);
parts.thorax = toPart('thorax', trunk, T.waist[0], T.shoulder[0], axis, true, TRUNK_CAP);
// Boyun göğüsle AYNI dikey oranla ölçekleniyor. Her bant kendi kemik boyuna
// esnetilince (model boynu bizim 44'e, göğsü 85'e farklı oranlarla) örtüşme
// bölgesi iki bantta farklı yüksekliğe denk geliyordu; omuz eğiminde genişlik hızlı
// değiştiği için köşeler komşu bandın dışına taşıyıp çentik yapıyordu (kullanıcı:
// "boyundaki çentikler"). Aynı oranla iki bant örtüşmede aynı hattı çiziyor; boyun
// bandı modelde kafatası tabanına biraz kısa kalıyor, üstü kafanın çene-ense hattı.
const kyT = BONES.thorax / (T.shoulder[0] - T.waist[0]);
parts.neck = toPart('neck', trunk, T.shoulder[0], T.shoulder[0] + BONES.neck / kyT, axis, true, TRUNK_CAP);

// Leğen BİLEREK yok: kalça ekleminin altındaki gövde silüeti denendi ve ince bir
// şerit çıktı — gluteal kütlenin çoğu modelde uyluk kemiğine bağlı. Squat'ta
// gövdeyle birlikte dönüp kuyruk gibi geriye uzandı. Rig'in `pelvisMass`'ı kalıyor.

// Kafa: rig çerçevesi `headProfile` ile aynı — merkez (0,0), +X yüz, +Y aşağı —
// ve rig boyun ucunu merkezin `HEAD_UP` birim altına koyuyor (`skeleton`: head =
// neck + 28). Modelin kafatası tabanı tam o noktaya oturtuluyor; ölçek enine
// ölçekle aynı, kafa vücuda göre doğru büyüklükte.
//
// Bu çapa ancak boyun gerçek orandayken çalışıyor: rig boynu 24'ken çene göğse
// gömülüyordu (model: omuz → kafatası tabanı ≈ 47 birim). `B.neck` 44'e çıktı.
const HEAD_UP = 28;
const H = mh.head;
const headPts = smooth(
  // 0.35/1 tur çene altında dalgalı bir hat bırakıyordu; 0.5/2 burnu koruyup onu düzeltiyor.
  simplifyClosed(H.outline.map(([u, v]) => [(v - H.anchor[1]) * S, -(u - H.anchor[0]) * S + HEAD_UP]), 0.5),
  2,
);
const head = { d: closedSpline(headPts) };
const headH = Math.max(...headPts.map((q) => q[1])) - Math.min(...headPts.map((q) => q[1]));

const out = {
  _: 'ÜRETİLMİŞTİR — elle düzenleme. Kaynak: scripts/blender/extract-parts.py → scripts/import-makehuman.mjs',
  source: 'MakeHuman temel modeli (CC0, MPFB 2 ile kuruldu: erkek, kas 0.7, ideal oran), yandan izdüşüm',
  head,
  parts,
};
const json = JSON.stringify(out, null, 1) + '\n';
if (args.includes('--dry')) {
  for (const [k, v] of Object.entries(parts)) console.log(k, v.len, v.d.length, 'karakter');
} else {
  writeFileSync(join(ROOT, 'data/bodyParts.json'), json);
  console.log(`✓ data/bodyParts.json  (kafa yüksekliği ${headH.toFixed(1)}, ${Object.keys(parts).length} parça, ${json.length} B, enine ölçek ${S.toFixed(1)} px/m)`);
}
