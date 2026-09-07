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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'src/data/rigArchetypes.json');
const OUT = join(ROOT, '.rig-editor');
const PORT = Number(process.env.RIG_PORT || 8123);

/** Motoru tarayıcı modülüne derle. Editör her açılışta güncel kodu alır. */
function buildEngine() {
  mkdirSync(OUT, { recursive: true });
  const res = spawnSync(
    'npx',
    [
      'tsc',
      'src/utils/rig.ts',
      'src/utils/rigEdit.ts',
      '--target', 'es2020',
      '--module', 'es2020',
      '--moduleResolution', 'bundler',
      '--outDir', OUT,
      '--skipLibCheck',
      '--ignoreConfig',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    console.error(res.stdout || res.stderr);
    throw new Error('motor derlenemedi');
  }
  // rigAudit yalnızca rig.ts'e bağlı; ayrı derlenmesi `@/` yollarından kaçınır.
  const audit = spawnSync(
    'npx',
    ['tsc', 'src/utils/rigAudit.ts', '--target', 'es2020', '--module', 'es2020', '--outDir', OUT, '--skipLibCheck', '--ignoreConfig'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (audit.status !== 0) {
    console.error(audit.stdout || audit.stderr);
    throw new Error('denetim derlenemedi');
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

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, readFileSync(join(ROOT, 'tools/rig-editor/index.html')), TYPES['.html']);
  }
  if (req.method === 'GET' && url.pathname === '/editor.js') {
    return send(res, 200, readFileSync(join(ROOT, 'tools/rig-editor/editor.js')), TYPES['.js']);
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
    // Arketip anahtarları (`hip_hinge_dumbbell`) insanın kafasındaki isim
    // değil. Kütüphaneden Türkçe adları okuyup listede onları gösteriyoruz.
    try {
      const lib = readFileSync(join(ROOT, 'src/data/exerciseLibrary.ts'), 'utf8');
      const names = {};
      const re = /tr: '((?:[^'\\]|\\.)*)',[\s\S]*?archetype: '(\w+)'/g;
      let m;
      while ((m = re.exec(lib))) {
        const tr = m[1].replace(/\\'/g, "'");
        (names[m[2]] ||= []).push(tr);
      }
      return send(res, 200, JSON.stringify(names), TYPES['.json']);
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
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('nesne bekleniyor');
        const count = Object.keys(parsed).length;
        if (count === 0) throw new Error('boş veri — kayıt reddedildi');
        writeFileSync(DATA, JSON.stringify(parsed, null, 2) + '\n');
        console.log(`✓ kaydedildi: ${count} arketip → src/data/rigArchetypes.json`);
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
  console.log('Kaydet dediğinde src/data/rigArchetypes.json üstüne yazılır.');
  console.log('Kapatmak için Ctrl+C.\n');
});
