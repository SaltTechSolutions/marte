#!/usr/bin/env node
/**
 * Kukla editörü — `npm run rig`.
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
 * 2. **Doğruluk kaynağı depodaki JSON.** Kaydet, `src/data/rigArchetypes.json`
 *    dosyasının üstüne yazıyor — git diff'te görünür, test edilebilir, geri
 *    alınabilir. Tarayıcı deposunda biriken, kimsenin göremediği bir kopya yok.
 *
 * Yalnızca 127.0.0.1'i dinler ve depo dışına hiçbir şey yazmaz.
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSchema } from './schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data/rigArchetypes.json');
const OUT = join(ROOT, '.editor-build');
const PORT = Number(process.env.RIG_PORT || 8123);

/** Motoru tarayıcı modülüne derle. Editör her açılışta güncel kodu alır. */
function buildEngine() {
  mkdirSync(OUT, { recursive: true });
  // Dosyaları komut satırında saymak yerine geçici bir tsconfig yazıyoruz:
  // TypeScript 5 komut satırı dosyalarında proje ayarını sessizce yok sayıyor,
  // 6 ise hata veriyor. Proje dosyası ikisinde de aynı çalışıyor.
  const cfg = join(OUT, 'tsconfig.editor.json');
  writeFileSync(
    cfg,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'es2020',
          module: 'es2020',
          moduleResolution: 'bundler',
          outDir: '.',
          skipLibCheck: true,
          resolveJsonModule: true,
        },
        files: ['../src/rig.ts', '../src/rigEdit.ts', '../src/rigAudit.ts', '../src/muscles.ts'],
      },
      null,
      2,
    ),
  );
  const res = spawnSync('npx', ['tsc', '-p', cfg], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stdout || res.stderr);
    throw new Error('motor derlenemedi');
  }
  console.log('✓ motor derlendi →', OUT);
}

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
let schema = loadSchema(OUT);
let builtAt = Date.now();
/**
 * Kaynak, sunucu açıldıktan sonra değiştiyse (git pull, başka oturumda
 * düzenleme) motor ve şema yeniden derlenir. Yaşandı: şemaya yeni poz
 * alanları eklendi, açık kalan eski sunucu her kaydı "bilinmeyen alan" diye
 * reddetti; kullanıcı için görünen şey "kaydedilemedi"ydi.
 */
function ensureFresh() {
  const files = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.ts')).map((f) => join(ROOT, 'src', f));
  const newest = Math.max(...files.map((f) => statSync(f).mtimeMs));
  if (newest <= builtAt) return false;
  console.log('… kaynak değişmiş, motor ve şema yeniden derleniyor');
  buildEngine();
  schema = loadSchema(OUT);
  builtAt = Date.now();
  return true;
}
/** Devir paketinin tamamı: kareler, hareket kataloğu ve kas verisi. */
const readBundle = (archetypes) => ({
  archetypes,
  exercises: JSON.parse(readFileSync(join(ROOT, 'data/exercises.json'), 'utf8')),
  muscles: JSON.parse(readFileSync(join(ROOT, 'data/rigMuscles.json'), 'utf8')),
  anatomy: JSON.parse(readFileSync(join(ROOT, 'data/anatomy.json'), 'utf8')),
  bodyParts: JSON.parse(readFileSync(join(ROOT, 'data/bodyParts.json'), 'utf8')),
});

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
  if (req.method === 'GET' && url.pathname === '/names') {
    // Hareket kataloğu: kimlik → görünen ad + arketip. Arketip anahtarları
    // (`hip_hinge_dumbbell`) insanın kafasındaki isim değil; listede Türkçe
    // adları gösteriyoruz. Bir arketip birden çok harekete hizmet edebiliyor.
    try {
      const lib = readFileSync(join(ROOT, 'data/exercises.json'), 'utf8');
      return send(res, 200, lib, TYPES['.json']);
    } catch {
      return send(res, 200, '{}', TYPES['.json']);
    }
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
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const rebuilt = ensureFresh();
        // Doğruluk kaynağının üstüne yazıyoruz: biçimi bozuk bir kayıt 30
        // arketibi birden götürür. Kurallar `src/rigSchema.ts`'te, testlerin
        // okuduğu yerde.
        const errs = schema.validateBundle(readBundle(parsed));
        if (errs.length) throw new Error(errs.slice(0, 8).join('; ') + (errs.length > 8 ? ` (+${errs.length - 8} tane daha)` : '') + (rebuilt ? ' — motor yeniden derlendi, tarayıcıyı yenile' : ''));
        const count = Object.keys(parsed).length;
        writeFileSync(DATA, JSON.stringify(parsed, null, 2) + '\n');
        console.log(`✓ kaydedildi: ${count} arketip → data/rigArchetypes.json`);
        send(res, 200, JSON.stringify({ ok: true, count }), TYPES['.json']);
      } catch (e) {
        send(res, 400, JSON.stringify({ ok: false, error: String(e.message || e) }), TYPES['.json']);
      }
    });
    return;
  }
  send(res, 404, 'yok');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n${PORT} portu dolu — editör zaten açık olabilir: http://127.0.0.1:${PORT}`);
    console.error('Başka bir port için:  RIG_PORT=8124 npm run rig\n');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nKukla editörü hazır:  http://127.0.0.1:${PORT}\n`);
  console.log('Kaydet dediğinde data/rigArchetypes.json üstüne yazılır.');
  console.log('Kapatmak için Ctrl+C.\n');
});
