#!/usr/bin/env node
/**
 * CC0 insan mesh'inden uzuv siluetleri üretir — `npm run parts:mesh`.
 *
 * Kaynak: MakeHuman temel mesh'i (`base.obj`, 19158 köşe), CC0 — dosyanın
 * kendi başlığında yazılı, koşulsuz, ticari kullanım serbest.
 *
 * Bu script belgedeki 1-4. adımların yerine geçiyor: GUI'de model oluşturup
 * render alıp uzuv uzuv vektör çizmek yerine mesh doğrudan okunuyor. Mobil
 * tarafa hiç 3B gitmiyor — çıktı yine 2B yol.
 *
 * Mesh eklem merkezlerini KENDİSİ taşıyor (`joint-*` grupları): belgedeki en
 * zahmetli elle adım — "eklem merkezlerini işaretle" — bedavaya geliyor.
 *
 * Köşeleri kemiklere ayırma: her kemik, eksenine belli yarıçaptan yakın ve boyu
 * aralığındaki köşeleri alıyor (aşağıda `YARICAP`). Kaba bir deri (skinning)
 * yaklaşımı; gerçek ağırlık haritası değil ama siluet için yeterli, çünkü
 * bizi ilgilendiren dış hat.
 *
 * SINIR: mesh nötr pozda ve tek bir gövde tipi. Siluet kemik boyumuza
 * GERİLİYOR; kolda gerilme en çok (üst kol mesh 57px, bizim 78). Bu bizim
 * kusurumuz DEĞİL: antropometriyle (Dempster, 175 cm: üst kol ≈ 32 cm = 80px,
 * ön kol ≈ 26 cm = 64px) bizim boylar uyuşuyor, mesh'in kol eklemi
 * işaretçileri kısa ölçüyor. Kol siluetleri o yüzden biraz ince kalır.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BONES } from './normalize-part.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Kemiklerimizin mesh eklem karşılığı. Sol taraf; sağ ayna. */
const ZINCIR = {
  thigh: ['joint-l-upper-leg', 'joint-l-knee'],
  shin: ['joint-l-knee', 'joint-l-ankle'],
  upper: ['joint-l-shoulder', 'joint-l-elbow'],
  fore: ['joint-l-elbow', 'joint-l-hand'],
  lumbar: ['joint-pelvis', 'joint-spine-2'],
  thorax: ['joint-spine-2', 'joint-neck'],
  neck: ['joint-neck', 'joint-head'],
  // Kafa: kemik boyun → kafa merkezi (28px); siluet çeneden tepeye kadar
  // kemiğin çok ötesine uzanır (`ARALIK`).
  head: ['joint-neck', 'joint-head'],
};

/**
 * Kemik boyu oranı olarak istasyon aralığı; yazılmayan kemik [−pay, 1+pay].
 *
 * Kafanın ALT sınırı boyun ekleminin ALTINDA (negatif): 0.45'ken kafa
 * silueti eklemin 12.6px üstünde başlıyordu ve boyun parçası eklemde
 * bittiği için arada boşluk kalıyordu — önden bakışta kopuk kafa. Şimdi iki
 * parça biniyor; bindirme dikişi kapatan şey (bkz. `EKLEM_PAYI`).
 */
const ARALIK = { head: [-0.15, 2.45] };

/**
 * Kemik eksenine uzaklık yarıçapı, mesh birimi (1 birim ≈ 25px). Bir köşe bir
 * kemiğe, eksene bu yarıçaptan yakın ve kemik boyu aralığındaysa sayılıyor.
 *
 * "En yakın kemiğe ata" denendi ve bırakıldı: sağ bacak sol uyluğa, kafa
 * boyna, el ön kola gidiyordu; yem kemiklerle bastırılınca da köprücük
 * göğsün önünü yuttu ve her kenar dişli kaldı. Yarıçap kuralı bağımsız:
 * öbür bacak (x ≈ ±1.6) ve kollar (x ≥ 1.7) gövde yarıçapının dışında,
 * ayak ve el ise s > 1.04 ile kemik ucunda kesiliyor.
 */
/**
 * Kemik başının ÜSTÜNE taşan istasyon payı (kemik boyu oranı). Uyluk için kalça
 * kası: kemik kalça ekleminden başlıyor ama kütle onun üstünde ve arkasında;
 * kesilirse figür kalçasız kalıyor (bel parçası pelvisten YUKARI gidiyor).
 */
const USTE_TASMA = { thigh: 0.22 };

/**
 * Eklem payı (kemik boyu oranı): parça her iki uçta kemiğin bu kadar ötesine
 * uzanıyor. Düz kesilmiş iki parça bükülü eklemde dış tarafta köşe açıyordu;
 * taşma dikişi kapatıyor. Rig'in eklem topları da aynı işi yapıyor, ama
 * dizde top yok.
 */
const EKLEM_PAYI = 0.08;

const YARICAP = {
  thigh: 0.9, shin: 0.6, upper: 0.55, fore: 0.45,
  lumbar: 1.65, thorax: 1.65, neck: 0.6, head: 1.2,
};

function okuObj(yol) {
  const V = [];
  const G = {};
  let cur = null;
  for (const l of readFileSync(yol, 'utf8').split('\n')) {
    if (l.startsWith('v ')) { const p = l.split(/\s+/); V.push([+p[1], +p[2], +p[3]]); }
    else if (l.startsWith('g ')) { cur = l.slice(2).trim(); G[cur] = G[cur] || new Set(); }
    else if (l.startsWith('f ') && cur) {
      for (const t of l.slice(2).trim().split(/\s+/)) {
        const i = +t.split('/')[0];
        G[cur].add(i > 0 ? i - 1 : V.length + i);
      }
    }
  }
  return { V, G };
}

const merkez = (V, set) => {
  const s = [...set];
  const m = [0, 0, 0];
  for (const i of s) { m[0] += V[i][0]; m[1] += V[i][1]; m[2] += V[i][2]; }
  return m.map((v) => v / s.length);
};

/** Noktanın kemik parçasına uzaklığı ve parça üzerindeki oranı. */
function parcayaUzaklik(p, a, b) {
  const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const ap = [p[0]-a[0], p[1]-a[1], p[2]-a[2]];
  const uzunluk2 = ab[0]**2 + ab[1]**2 + ab[2]**2;
  let t = (ap[0]*ab[0] + ap[1]*ab[1] + ap[2]*ab[2]) / uzunluk2;
  const tc = Math.max(0, Math.min(1, t));
  const q = [a[0]+ab[0]*tc, a[1]+ab[1]*tc, a[2]+ab[2]*tc];
  return { d: Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]), t };
}

/**
 * Kemiğe atanmış köşeleri α açısından izdüşürüp DIŞ HATTINI çıkarır.
 *
 * Kemik boyunca istasyonlara bölünüyor, her istasyonda en soldaki ve en
 * sağdaki nokta alınıyor. Konveks kabuk DEĞİL: baldırın arkadaki şişkinliği
 * gibi içbükey yerler korunsun diye.
 */
const ISTASYON = 40;
/** Pencere yarı genişliği, PİKSEL. Mesh'in köşe sıraları ~7px aralıklı; pencere
 *  ondan darken (±2px denendi) sıralar arası istasyon boş kalıp komşudan
 *  kopyalanıyor ve kenar testere dişine dönüyordu. */
const PENCERE_PX = 7;
function siluet(noktalar, a, b, azDeg, lenPx, ustTasma = 0, aralik = null) {
  const pencere = PENCERE_PX / (lenPx / ISTASYON);
  const ilk = aralik ? Math.round(aralik[0] * ISTASYON) : -Math.round(ustTasma * ISTASYON);
  const son_i = aralik ? Math.round(aralik[1] * ISTASYON) : ISTASYON;
  const [s0, s1] = aralik ?? [-EKLEM_PAYI - ustTasma, 1 + EKLEM_PAYI];
  const r = (azDeg * Math.PI) / 180;
  // az=0 YANDAN bakış: yatay eksen mesh'in DERİNLİĞİ (+Z, figürün baktığı yön),
  // yani parça uzayının +X'i. az=90 önden: yatay eksen mesh'in yanal ekseni (+X).
  const pr = (p) => [p[2]*Math.cos(r) + p[0]*Math.sin(r), p[1]];
  const A = pr(a), B = pr(b);
  const dx = B[0]-A[0], dy = B[1]-A[1];
  const L = Math.hypot(dx, dy);
  const ux = dx/L, uy = dy/L;          // kemik yönü
  const vx = -uy, vy = ux;             // dik yön
  const orn = [];
  for (const p of noktalar) {
    const q = pr(p);
    const ex = q[0]-A[0], ey = q[1]-A[1];
    const s = (ex*ux + ey*uy) / L;                 // kemik boyunca 0..1
    // Kemiğin ötesindeki kütle (kalça, omuz başı) uç istasyona yığılmasın:
    // eklem topu zaten orayı örtüyor.
    if (s < s0 || s > s1) continue;
    orn.push([s * ISTASYON, ex*vx + ey*vy]);
  }
  const bant = [];
  for (let i = ilk; i <= son_i; i++) {
    let lo = Infinity, hi = -Infinity;
    for (const [si, w] of orn) {
      if (Math.abs(si - i) > pencere) continue;
      if (w < lo) lo = w;
      if (w > hi) hi = w;
    }
    bant.push({ i, lo, hi });
  }
  // Boş istasyonu komşudan doldur
  for (let j = 0; j < bant.length; j++) {
    if (bant[j].lo !== Infinity) continue;
    const k = bant.find((q, m) => m > j && q.lo !== Infinity) || [...bant].reverse().find((q) => q.lo !== Infinity);
    bant[j] = k ? { ...k, i: bant[j].i } : { i: bant[j].i, lo: 0, hi: 0 };
  }
  // 5'li hareketli ortalama: mesh'in kaba kafesinden kalan basamakları alır
  const son = bant.length - 1;
  const duz = bant.map((q, j) => {
    const c = [-2, -1, 0, 1, 2].map((o) => bant[Math.max(0, Math.min(son, j + o))]);
    return { i: q.i, lo: c.reduce((t, b) => t + b.lo, 0) / 5, hi: c.reduce((t, b) => t + b.hi, 0) / 5 };
  });
  // Kemik üstüne taşan kısım tepeye doğru kapansın: düz kesilince kalça kare
  // bir çıkıntı gibi duruyordu. Kosinüs yumuşatması, merkez sabit.
  if (ilk < 0 && !aralik) {
    for (const q of duz) {
      if (q.i >= 0) continue;
      const k = Math.cos((q.i / ilk) * (Math.PI / 2));
      const c = (q.lo + q.hi) / 2, a = (q.hi - q.lo) / 2;
      q.lo = c - a * k; q.hi = c + a * k;
    }
  }
  if (aralik) {
    // Kafa gibi iki ucu da serbest parça: tepe ve çene yuvarlak kapansın
    const n = duz.length - 1, kapak = Math.max(2, Math.round(n * 0.12));
    duz.forEach((q, j) => {
      const u = Math.min(j, n - j);
      if (u >= kapak) return;
      const k = Math.sin(((u + 0.5) / kapak) * (Math.PI / 2));
      const c = (q.lo + q.hi) / 2, a = (q.hi - q.lo) / 2;
      q.lo = c - a * k; q.hi = c + a * k;
    });
  }
  return duz;
}

const fmt = (v) => (Math.abs(v) < 5e-3 ? '0' : String(Math.round(v * 100) / 100));

/* --- CLI ----------------------------------------------------------------- */

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
const objYol = arg('obj');
const az = Number(arg('az') ?? 0);
if (!objYol || !existsSync(objYol)) {
  console.error('Kullanım: --obj <base.obj yolu> [--az 0|90] [--write]');
  console.error('Mesh: makehumancommunity/makehuman → makehuman/data/3dobjs/base.obj (CC0)');
  process.exit(1);
}

const { V, G } = okuObj(objYol);
const J = {};
for (const g of Object.keys(G)) if (g.startsWith('joint-')) J[g] = merkez(V, G[g]);

// Gövde mesh'i: yardımcı geometri (saç, göz, diş, kıyafet) dışarıda
const govde = [...(G.body || [])];
if (!govde.length) { console.error('✗ "body" grubu bulunamadı'); process.exit(1); }

// Her kemik kendi yarıçapındaki köşeleri alır; bir köşe birden çok kemiğe girebilir
const kemikler = Object.entries(ZINCIR).map(([ad, [a, b]]) => ({ ad, a: J[a], b: J[b] }));
if (kemikler.some((k) => !k.a || !k.b)) { console.error('✗ eklem eksik'); process.exit(1); }
const kova = Object.fromEntries(kemikler.map((k) => [k.ad, []]));
for (const i of govde) {
  const p = V[i];
  for (const k of kemikler) {
    const { d, t } = parcayaUzaklik(p, k.a, k.b);
    const [t0, t1] = ARALIK[k.ad] ?? [-EKLEM_PAYI - (USTE_TASMA[k.ad] ?? 0), 1 + EKLEM_PAYI];
    if (d <= YARICAP[k.ad] && t > t0 && t < t1) kova[k.ad].push(p);
  }
}

// Uyluk referanslı ölçek: mesh birimini bizim piksele çevirir
const uylukMesh = Math.hypot(...[0,1,2].map((i) => J['joint-l-knee'][i] - J['joint-l-upper-leg'][i]));
const OLCEK = BONES.thigh / uylukMesh;

const parts = {};
console.log(`  açı ${az}°   ölçek 1 mesh birimi = ${OLCEK.toFixed(2)} px   \n`);
console.log('  parça     köşe    mesh boy   bizim   gerilme   genişlik');
for (const k of kemikler) {
  const bant = siluet(kova[k.ad], k.a, k.b, az, BONES[k.ad], USTE_TASMA[k.ad] ?? 0, ARALIK[k.ad] ?? null);
  const meshBoy = Math.hypot(...[0,1,2].map((i) => k.b[i] - k.a[i])) * OLCEK;
  const ger = BONES[k.ad] / meshBoy;
  // Kemiği (0,0)→(0,len)'e oturt: istasyon i → y = len*i/ISTASYON, x = w * ölçek
  const on = [], arka = [];
  for (const b of bant) {
    const y = (BONES[k.ad] * b.i) / ISTASYON;
    on.push([b.hi * OLCEK, y]);
    arka.push([b.lo * OLCEK, y]);
  }
  const seg = [...on, ...arka.reverse()];
  parts[k.ad] = {
    len: BONES[k.ad],
    d: `M ${fmt(seg[0][0])} ${fmt(seg[0][1])} ` + seg.slice(1).map((q) => `L ${fmt(q[0])} ${fmt(q[1])}`).join(' ') + ' Z',
  };
  const gen = Math.max(...bant.map((b) => b.hi - b.lo)) * OLCEK;
  console.log(`  ${k.ad.padEnd(9)}${String(kova[k.ad].length).padStart(6)}${meshBoy.toFixed(0).padStart(10)}${String(BONES[k.ad]).padStart(8)}${('×' + ger.toFixed(2)).padStart(10)}${gen.toFixed(0).padStart(11)}px`);
}

if (argv.includes('--write')) {
  if (az !== 0 && az !== 90) { console.error('✗ yalnız --az 0 (yan) ve --az 90 (ön) yazılabilir; 2B kararı, açılı set yok'); process.exit(1); }
  const yol = join(ROOT, 'data/bodyParts.json');
  const data = JSON.parse(readFileSync(yol, 'utf8'));
  if (az === 0) {
    data.parts = parts;
    data.source = `MakeHuman base.obj (CC0) mesh'inden üretildi, yandan ortografik — scripts/mesh-silhouette.mjs`;
  } else {
    data.front = { _: `Önden (90°) siluetler, aynı mesh'ten — scripts/mesh-silhouette.mjs --az 90, elle düzenleme. Mesh'in SOL uzuvları; ekranda sağda görünen taraf bunlar, sol taraf aynalanır.`, parts };
  }
  delete data.angled;
  writeFileSync(yol, JSON.stringify(data, null, 2) + '\n');
  console.log(`\n✓ data/bodyParts.json → ${az === 0 ? 'parts' : 'front'}`);
}
