#!/usr/bin/env node
/**
 * Kukla editörü — `npm run editor`.
 *
 * Tarayıcıda açılan yerel bir düzenleyici: hareketi seç, kareyi seç, figürün
 * eklemini sürükle, ekipmanı değiştir, denetim uyarılarını canlı gör, kaydet.
 *
 * İki karar bu dosyanın tamamını açıklıyor:
 *
 * 1. **Motor kopyalanmıyor.** `src/utils/rig.ts`, `rigAudit.ts` ve
 *    `rigEdit.ts` `tsc` ile tarayıcı modülüne derleniyor; editör uygulamanın
 *    çalıştırdığı KODUN AYNISINI çalıştırıyor. Daha önce önizleme sayfası
 *    motorun elle yazılmış bir kopyasını taşıyordu ve iki kez ayrıştı:
 *    ayak düzeltmesi orada eksik kaldı, dambıl yardımcısı sayfayı dondurdu.
 *
 * 2. **Doğruluk kaynağı depodaki JSON.** Kaydet İKİ dosyanın üstüne yazıyor:
 *    pozlar `data/rigArchetypes.json`'a, kullanıcının okuduğu metinler
 *    `data/exercises.json`'a — git diff'te görünür, test edilebilir, geri
 *    alınabilir. Tarayıcı deposunda biriken, kimsenin göremediği bir kopya yok.
 *    Metinler 11 Eylül 2026'ya kadar `build_exercise_library.py` içinde sabitti
 *    ve antrenörden gelen bir düzeltme ancak Python düzenlenerek girilebiliyordu.
 *
 * Yalnızca 127.0.0.1'i dinler ve depo dışına hiçbir şey yazmaz.
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildEngine, OUT, ROOT } from './engine-build.mjs';
import { loadSchema } from './schema.mjs';

const DATA = join(ROOT, 'data/rigArchetypes.json');
const CATALOG = join(ROOT, 'data/exercises.json');
const PORT = Number(process.env.RIG_PORT || 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const send = (res, code, body, type = 'text/plain; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

buildEngine();
const schema = loadSchema(OUT);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/**
 * Devir paketinin tamamı: kareler, hareket kataloğu ve kas verisi.
 *
 * Gelen kayıt hangi dosyayaysa O parça `over` ile değişiyor, kalanı diskten
 * okunuyor: kurallar parçalar ARASINDA da geçerli (bir hareketin arketibi
 * rigArchetypes.json'da yoksa hata), tek parçayı tek başına doğrulamak o
 * kuralları atlardı.
 */
const readBundle = (over = {}) => ({
  archetypes: over.archetypes ?? readJson(DATA),
  exercises: over.exercises ?? readJson(CATALOG),
  muscles: readJson(join(ROOT, 'data/rigMuscles.json')),
  anatomy: readJson(join(ROOT, 'data/anatomy.json')),
  bodyParts: readJson(join(ROOT, 'data/bodyParts.json')),
});

/**
 * Katalogda alan sırası: ekranda göründüğü sıra, dosyada da o sıra.
 *
 * Tarayıcı yeni bir alanı (`alt` yazılmamış bir harekete yazıldığında) nesnenin
 * SONUNA ekliyor. Sırayı kayıtta sabitlemeyince aynı veri, hangi alanın ne
 * zaman doldurulduğuna göre farklı sırayla yazılıyor ve diff okunmaz oluyor.
 */
const CATALOG_ORDER = ['name', 'alt', 'en', 'archetype', 'difficulty',
  'equipTr', 'equipEn', 'setsHint', 'restHint', 'steps'];

const orderCatalog = (cat) => Object.fromEntries(
  Object.entries(cat).map(([id, e]) => [
    id,
    Object.fromEntries([
      ...CATALOG_ORDER.filter((k) => k in e).map((k) => [k, e[k]]),
      // Sırada olmayan bir alan şemadan geçmez; yine de düşürmüyoruz ki
      // hata mesajı "bilinmeyen alan" desin, alan sessizce kaybolmasın.
      ...Object.entries(e).filter(([k]) => !CATALOG_ORDER.includes(k)),
    ]),
  ]),
);

/** Kaydın ortak gövdesi: doğrula, sonra yaz. Biri geçmezse hiçbiri yazılmıyor. */
const acceptPut = (req, res, { file, key: bundleKey, birim, say, duzelt }) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    try {
      const parsed = duzelt ? duzelt(JSON.parse(body)) : JSON.parse(body);
      // Doğruluk kaynağının üstüne yazıyoruz: biçimi bozuk bir kayıt 30
      // arketibi birden götürür. Kurallar `src/rigSchema.ts`'te, testlerin
      // okuduğu yerde.
      const errs = schema.validateBundle(readBundle({ [bundleKey]: parsed }));
      if (errs.length) throw new Error(errs.slice(0, 8).join('; ') + (errs.length > 8 ? ` (+${errs.length - 8} tane daha)` : ''));
      const count = Object.keys(parsed).length;
      // Depodaki iki JSON da tek boşlukla girintili; editörün iki boşlukla
      // yazması her kaydı dosyanın tamamını değiştiren bir diff yapardı.
      writeFileSync(file, JSON.stringify(parsed, null, 1) + '\n');
      console.log(`✓ kaydedildi: ${count} ${birim} → data/${say}`);
      send(res, 200, JSON.stringify({ ok: true, count }), TYPES['.json']);
    } catch (e) {
      send(res, 400, JSON.stringify({ ok: false, error: String(e.message || e) }), TYPES['.json']);
    }
  });
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, readFileSync(join(ROOT, 'editor/index.html')), TYPES['.html']);
  }
  if (req.method === 'GET' && url.pathname === '/editor.js') {
    return send(res, 200, readFileSync(join(ROOT, 'editor/editor.js')), TYPES['.js']);
  }
  if (req.method === 'GET' && url.pathname.startsWith('/engine/')) {
    // Derlenmiş motor. Yol depo dışına çıkamasın diye dosya adı süzülüyor.
    const name = url.pathname.replace('/engine/', '').replace(/[^\w.-]/g, '');
    // tsc modül tanımlayıcılarını olduğu gibi bırakıyor: derlenen dosyalar
    // birbirini `./rig` diye çağırıyor, tarayıcı da uzantısız istiyor.
    for (const candidate of [name, name + '.js']) {
      try {
        return send(res, 200, readFileSync(join(OUT, candidate)), TYPES['.js']);
      } catch {
        /* sıradakini dene */
      }
    }
    return send(res, 404, 'yok');
  }
  if (req.method === 'GET' && url.pathname === '/exercises') {
    // Hareket kataloğu: kimlik → iki ad, arketip ve kullanıcının okuduğu
    // metinlerin tamamı. Arketip anahtarları (`hip_hinge_dumbbell`) insanın
    // kafasındaki isim değil; listede Türkçe adları gösteriyoruz. Bir arketip
    // birden çok harekete hizmet edebiliyor.
    return send(res, 200, readFileSync(CATALOG), TYPES['.json']);
  }
  if (req.method === 'PUT' && url.pathname === '/exercises') {
    // Metin panelinin kaydı. Pozlardan AYRI yol: iki dosya, iki kayıt — biri
    // kuralı geçmezse öteki yazılmış olsun, kullanıcı hangisinin tutmadığını
    // görsün.
    acceptPut(req, res, { file: CATALOG, key: 'exercises', birim: 'hareket', say: 'exercises.json', duzelt: orderCatalog });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/muscles') {
    // Hareket başına birincil/ikincil kaslar. Önizleme çipi ve metin listesi
    // bunu okuyor; uygulamadan taşındı, anahtarı uygulamanın egzersiz kimliği.
    try {
      return send(res, 200, readFileSync(join(ROOT, 'data/rigMuscles.json'), 'utf8'), TYPES['.json']);
    } catch {
      return send(res, 200, '{}', TYPES['.json']);
    }
  }
  if (req.method === 'GET' && url.pathname === '/parts') {
    try {
      return send(res, 200, readFileSync(join(ROOT, 'data/bodyParts.json'), 'utf8'), TYPES['.json']);
    } catch {
      return send(res, 200, '{}', TYPES['.json']);
    }
  }
  if (req.method === 'GET' && url.pathname === '/anatomy') {
    try {
      return send(res, 200, readFileSync(join(ROOT, 'data/anatomy.json'), 'utf8'), TYPES['.json']);
    } catch {
      return send(res, 200, '{}', TYPES['.json']);
    }
  }
  if (req.method === 'GET' && url.pathname === '/data') {
    return send(res, 200, readFileSync(DATA), TYPES['.json']);
  }
  if (req.method === 'PUT' && url.pathname === '/data') {
    acceptPut(req, res, { file: DATA, key: 'archetypes', birim: 'arketip', say: 'rigArchetypes.json' });
    return;
  }
  send(res, 404, 'yok');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n${PORT} portu dolu — editör zaten açık olabilir: http://127.0.0.1:${PORT}`);
    console.error('Başka bir port için:  RIG_PORT=8124 npm run editor\n');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nKukla editörü hazır:  http://127.0.0.1:${PORT}\n`);
  console.log('Kaydet dediğinde data/rigArchetypes.json ve data/exercises.json üstüne yazılır.');
  console.log('Kapatmak için Ctrl+C.\n');
});
