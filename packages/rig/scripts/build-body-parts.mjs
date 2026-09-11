#!/usr/bin/env node
/**
 * `data/bodyParts.json` üretir — uzuv siluetleri.
 *
 *     node scripts/build-body-parts.mjs [--dry]
 *
 * ## Neden script, neden elle çizilmiş yol değil
 *
 * Dosya 11 Eylül 2026'ya kadar elle çizilmiş yollar taşıyordu; kendi `source`
 * alanı da bunu söylüyordu. Her parça 7–8 komuttu ve tek bir daralmadan
 * ibaretti: kas karnının nerede olduğu, önle arkanın farkı, diz kapağı, baldır
 * — hiçbiri yok. Figürün manken gibi okunmasının sebebi buydu.
 *
 * Burada siluet ÇİZİLMİYOR, **profilden üretiliyor**: her kemik için, boyunca
 * birkaç istasyonda ön (+X) ve arka (−X) yarı genişlik yazılı; script bunlardan
 * kapalı ve yumuşak bir dış hat kuruyor. Sayıyı değiştirmek şeklin o noktasını
 * değiştiriyor, yani biçim düzenlenebilir veri hâline geliyor.
 *
 * ## Bunun neyi OLMADIĞI
 *
 * `docs/uzuv-parcalari-nasil-uretilir.md`'deki yol bu değil. Orada anlatılan
 * zincir — CC0 bir MakeHuman modeli → Blender'da ortografik render → uzuvlara
 * bölme → `normalize-part.mjs` — hâlâ geçerli ve daha iyisini verir; burada
 * çalıştırılamadığı için (ne Blender ne MakeHuman ne Inkscape kurulu)
 * profilden üretim seçildi. O zincir çalıştırıldığında değişen tek şey yine
 * `data/bodyParts.json` olur: sözleşme aynı, bu script silinir.
 *
 * ## Sayılar nereden
 *
 * Kalınlıklar UYDURULMADI, bugünkü ölçeğe bağlandı. Rig'in kendi kemik
 * boylarından Drillis & Contini (1966) segment oranlarıyla türetilen boy
 * ≈ 430 birim; bu boyda yetişkin uyluk çevresi (≈ 0.31·boy) dairesele yakın
 * bir kesitte ≈ 21 birim yarı-derinlik veriyor ve bugünkü siluetin orta yarı
 * genişliği 18'di. Yani ölçek zaten doğru aralıktaydı, eksik olan biçimdi.
 * Bu yüzden istasyon değerleri bugünkü ÇEVRELERİ koruyor; değişen şey kütlenin
 * kemik boyunca NEREDE olduğu ve ön/arka farkı.
 *
 * Bu bir tarama değil, yüzey anatomisine göre kurulmuş stilize bir siluet.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './engine-build.mjs';

/** Kemik boyları. Şema bunlarla karşılaştırıyor; uyuşmazsa export duruyor. */
const BONES = { thigh: 105, shin: 100, upper: 78, fore: 68, lumbar: 55, thorax: 85, neck: 24 };

/**
 * Uçlarda kemiğin dışına taşan pay.
 *
 * Belge bunu istiyor: "Eklemlerde parçalar biraz ÇAKIŞSIN." Rig eklem yerlerine
 * üst üste binen toplar çiziyor, ama uç açılarda dikişi kapatan şey bu pay.
 */
const CAP = 4;

/**
 * Profil: kemik boyunca istasyonlar.
 *
 * `u` kemiğin başından sonuna 0→1. `f` ÖN (+X, figürün baktığı yön), `b` ARKA
 * (−X) yarı genişlik. Uzuvlarda ön = ekstansör tarafı (quadriceps, tibia,
 * biceps); gövdede ön = göğüs/karın, arka = sırt.
 */
const PROFILE = {
  // Kalçadan dize. Kütle üst-orta üçte birde (quadriceps karnı); en üstte
  // arka daha derin, çünkü gluteal kütle orada.
  thigh: [
    { u: 0.0, f: 17, b: 22 },
    { u: 0.12, f: 19, b: 22 },
    { u: 0.3, f: 20, b: 20 },
    { u: 0.5, f: 18, b: 17 },
    { u: 0.7, f: 16, b: 13 },
    { u: 0.88, f: 13, b: 10 },
    { u: 1.0, f: 12, b: 9 },
  ],
  // Dizden ayak bileğine. Asıl biçim ARKADA: gastrocnemius karnı üst üçte
  // birde şişiyor, ön yüz tibia boyunca neredeyse düz iniyor.
  shin: [
    { u: 0.0, f: 13, b: 12 },
    { u: 0.12, f: 12, b: 15 },
    { u: 0.28, f: 11, b: 17 },
    { u: 0.45, f: 10, b: 14 },
    { u: 0.65, f: 8, b: 10 },
    { u: 0.85, f: 7, b: 7 },
    { u: 1.0, f: 6, b: 6 },
  ],
  // Omuzdan dirseğe. Üstte deltoid kapağı, ortada biceps (ön) ile triceps
  // (arka); dirsekte arka biraz daha derin — olecranon.
  upper: [
    { u: 0.0, f: 13, b: 13 },
    { u: 0.2, f: 12, b: 13 },
    { u: 0.4, f: 11, b: 12 },
    { u: 0.65, f: 10, b: 10 },
    { u: 0.85, f: 9, b: 9 },
    { u: 1.0, f: 8, b: 9 },
  ],
  // Dirsekten bileğe. Kütle dirseğe yakın (fleksör karnı), bileğe doğru
  // belirgin biçimde inceliyor.
  fore: [
    { u: 0.0, f: 9, b: 10 },
    { u: 0.18, f: 10, b: 10 },
    { u: 0.4, f: 9, b: 8 },
    { u: 0.65, f: 7, b: 6 },
    { u: 0.85, f: 6, b: 5 },
    { u: 1.0, f: 5, b: 4 },
  ],
  // Leğenden bele. Aşağıda leğen geniş ve arkada daha derin; yukarı doğru
  // bel inceliyor.
  lumbar: [
    { u: 0.0, f: 20, b: 24 },
    { u: 0.3, f: 20, b: 21 },
    { u: 0.6, f: 19, b: 18 },
    { u: 1.0, f: 18, b: 16 },
  ],
  // Belden göğse. Göğüs kafesi açılıyor, en derin yer sternum hizası; omuz
  // kuşağına doğru yeniden daralıyor.
  thorax: [
    { u: 0.0, f: 18, b: 16 },
    { u: 0.25, f: 23, b: 21 },
    { u: 0.5, f: 27, b: 25 },
    { u: 0.75, f: 28, b: 25 },
    { u: 1.0, f: 23, b: 21 },
  ],
  // Göğüsten başa. Neredeyse silindirik, arkada ense biraz daha dolgun.
  neck: [
    { u: 0.0, f: 15, b: 16 },
    { u: 0.5, f: 13, b: 14 },
    { u: 1.0, f: 12, b: 13 },
  ],
};

const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Kapalı Catmull-Rom eğrisini kübik Bézier'e çevirir.
 *
 * Neden spline: istasyonları düz çizgilerle birleştirmek siluete köşe
 * bırakıyor ve uzuv kağıttan kesilmiş gibi duruyor. Catmull-Rom noktaların
 * ÜSTÜNDEN geçiyor — yani yazılan yarı genişlik gerçekten o genişlik oluyor,
 * kontrol noktası olarak yaklaşık alınmıyor.
 */
function closedSpline(pts) {
  const n = pts.length;
  const at = (i) => pts[((i % n) + n) % n];
  let d = `M ${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + ' Z';
}

/** Profilden kapalı dış hat: ön kenar aşağı, arka kenar yukarı, iki uçta kapak. */
function outline(stations, len) {
  const y = (u) => u * len;
  const front = stations.map((s) => [s.f, y(s.u)]);
  const back = [...stations].reverse().map((s) => [-s.b, y(s.u)]);
  // Uçlar yuvarlak: kemiğin dışına `CAP` kadar taşan tek nokta, spline'ı
  // oradan döndürüyor. Düz kesilmiş uç, eklem topu kaçtığında görünüyordu.
  return closedSpline([...front, [0, len + CAP], ...back, [0, -CAP]]);
}

const parts = {};
for (const [name, len] of Object.entries(BONES)) {
  const stations = PROFILE[name];
  if (!stations) throw new Error(`"${name}" için profil yok`);
  const bad = stations.find((s) => s.u < 0 || s.u > 1 || s.f <= 0 || s.b <= 0);
  if (bad) throw new Error(`"${name}" istasyonu geçersiz: ${JSON.stringify(bad)}`);
  for (let i = 1; i < stations.length; i++) {
    if (stations[i].u <= stations[i - 1].u) throw new Error(`"${name}" istasyonları artan sırada değil`);
  }
  parts[name] = { len, d: outline(stations, len) };
}

const out = {
  _: 'ÜRETİLMİŞTİR — elle düzenleme. Kaynak: scripts/build-body-parts.mjs',
  source:
    'profilden üretildi (scripts/build-body-parts.mjs): kemik boyunca ön/arka ' +
    'yarı genişlik istasyonları. Ölçek bugünkü siluetlerin çevresini koruyor; ' +
    'biçim yüzey anatomisine göre kuruldu. Tarama DEĞİL — 3B modelden türetme ' +
    'yolu docs/uzuv-parcalari-nasil-uretilir.md (11 Eylül 2026)',
  parts,
};

if (process.argv.includes('--dry')) {
  for (const [k, v] of Object.entries(parts)) {
    console.log(`${k.padEnd(7)} len=${String(v.len).padStart(3)}  ${v.d.length} bayt`);
  }
} else {
  const p = join(ROOT, 'data/bodyParts.json');
  writeFileSync(p, JSON.stringify(out, null, 1) + '\n');
  console.log(`✓ ${Object.keys(parts).length} parça → data/bodyParts.json`);
}
