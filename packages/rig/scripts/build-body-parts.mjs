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
 * `u` kemiğin başından sonuna 0→1. `f` ANATOMİK ÖN (figürün baktığı yön), `b`
 * ANATOMİK ARKA yarı genişlik. Uzuvlarda ön = quadriceps, tibia, biceps; gövdede
 * ön = göğüs/karın, arka = sırt. Hangi yerel yarıya düştükleri `HEADWARD`'da.
 */
const PROFILE = {
  // Kalçadan dize. Üstte arka en derin: gluteal kıvrım uyluğun arkasına
  // biniyor. Ön yüzde rectus femoris + vastus karnı üst-orta üçte birde,
  // dize yakın vastus medialis'in "damlası" ikinci, küçük bir şişkinlik.
  // Arka yüz hamstring boyunca dize doğru düzenli inceliyor.
  thigh: [
    { u: 0.0, f: 17, b: 24 },
    { u: 0.08, f: 19, b: 23 },
    { u: 0.2, f: 21, b: 20.5 },
    { u: 0.38, f: 21.5, b: 18.5 },
    { u: 0.55, f: 20, b: 16.5 },
    { u: 0.72, f: 17.5, b: 14 },
    { u: 0.86, f: 15, b: 11.5 },
    { u: 0.95, f: 13, b: 10 },
    { u: 1.0, f: 12, b: 9 },
  ],
  // Dizden ayak bileğine. Asıl biçim ARKADA: gastrocnemius karnı üst üçte
  // birde belirgin şişiyor, alt yarıda Aşil tendonuna doğru hızla inceliyor.
  // Ön yüz tibia boyunca neredeyse düz.
  shin: [
    { u: 0.0, f: 13, b: 12 },
    { u: 0.1, f: 12, b: 15 },
    { u: 0.22, f: 11, b: 18 },
    { u: 0.34, f: 10.5, b: 17.5 },
    { u: 0.5, f: 9.5, b: 13 },
    { u: 0.65, f: 8, b: 9.5 },
    { u: 0.8, f: 7, b: 7 },
    { u: 1.0, f: 6, b: 6 },
  ],
  // Omuzdan dirseğe. Üstte deltoid kütlesi iki yüzü de doldurur; ortada
  // biceps karnı önde (u≈0.5), triceps kütlesi arkada daha yüksekte (u≈0.3);
  // dirsekte arka biraz daha derin — olecranon.
  upper: [
    { u: 0.0, f: 14, b: 14 },
    { u: 0.15, f: 14.5, b: 14 },
    { u: 0.3, f: 12, b: 13.5 },
    { u: 0.5, f: 12.5, b: 12 },
    { u: 0.68, f: 11.5, b: 10.5 },
    { u: 0.85, f: 9, b: 9 },
    { u: 1.0, f: 8, b: 9 },
  ],
  // Dirsekten bileğe. Brachioradialis ve fleksör karnı dirseğin hemen
  // altında şişiyor; bileğe doğru tendonlara inip belirgin biçimde inceliyor.
  fore: [
    { u: 0.0, f: 9.5, b: 10 },
    { u: 0.15, f: 11, b: 10.5 },
    { u: 0.32, f: 10, b: 9 },
    { u: 0.55, f: 8, b: 7 },
    { u: 0.78, f: 6, b: 5.5 },
    { u: 1.0, f: 5, b: 4.5 },
  ],
  // Leğenden bele. Arkada sakrum ve kalça kütlesinin üst kenarı en derin;
  // yukarıda bel çukuru (lomber lordoz) arkayı İÇERİ çekiyor. Önde karın
  // düz — eski profilde (ters yüze çizildiği için) alt karın şişkindi.
  lumbar: [
    { u: 0.0, f: 19, b: 22 },
    { u: 0.3, f: 19, b: 18.5 },
    { u: 0.6, f: 18.5, b: 16.5 },
    { u: 1.0, f: 19, b: 17 },
  ],
  /**
   * Belden göğse — ERKEK gövde profili (Bridgman, `Constructive Anatomy`).
   *
   * 0. Göğüs OMUZ HİZASINDA en derindir; daralma göğüste değil BOYUNDA olur.
   * 1. Önden gövde tek düz eğri değil: pektoralin alt kenarının altında bir
   *    çöküntü var (epigastrium), göğüs kasının kütlesi üst üçte birde.
   * 2. Arkada torasik kifoz + trapez ve kürek kemiği kütlesi: ÜST göğüste
   *    arka önden daha dolgun.
   *
   * 2026-10-07'ye kadar bu profil ters yüze çiziliyordu (bkz. `HEADWARD`);
   * eski sayılar ters görüntüye göre ayarlanmıştı ve aradaki fark 1 px
   * olduğu için göğüs ön/arka ayrımı zaten silikti.
   */
  thorax: [
    { u: 0.0, f: 18, b: 17 },
    { u: 0.25, f: 20, b: 19 },
    { u: 0.45, f: 21, b: 21 },
    { u: 0.62, f: 24, b: 23.5 },
    { u: 0.8, f: 25.5, b: 25 },
    { u: 0.9, f: 25, b: 26 },
    { u: 1.0, f: 24, b: 24.5 },
  ],
  // Göğüsten başa. Arkada trapezin eğimi enseyi doldurur; önde boyun ince.
  neck: [
    { u: 0.0, f: 14, b: 17 },
    { u: 0.5, f: 12.5, b: 14 },
    { u: 1.0, f: 12, b: 13 },
  ],
};

/**
 * Kemiği BAŞA doğru giden parçalar: rig bu kemikleri leğenden yukarı doğru
 * kuruyor ve `partTransform` yerel +Y'yi kemik yönüne çevirirken 180° döndürüyor.
 * Sonuç: bu parçalarda yerel +X figürün ARKASINA düşüyor. `f`/`b` her zaman
 * ANATOMİK ön/arka; hangi yerel yarıya yazılacağını burası seçiyor.
 *
 * Bulunuşu (2026-10-07): kas bantları figüre boyanırken bel kası hinge'de
 * göğsün altında çıktı; aynı dönüş siluet profillerini de ters çiziyordu.
 * `muscles.ts`'teki `HEADWARD` aynı listeyi taşıyor.
 */
const HEADWARD = new Set(['lumbar', 'thorax', 'neck']);

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
function outline(stations, len, headward) {
  const y = (u) => u * len;
  // Yerel +X yarısı: uzuvlarda anatomik ön, başa giden kemiklerde anatomik arka.
  const pos = (s) => (headward ? s.b : s.f);
  const neg = (s) => (headward ? s.f : s.b);
  const front = stations.map((s) => [pos(s), y(s.u)]);
  const back = [...stations].reverse().map((s) => [-neg(s), y(s.u)]);
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
  parts[name] = { len, d: outline(stations, len, HEADWARD.has(name)) };
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
