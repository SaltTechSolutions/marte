#!/usr/bin/env node
/**
 * GymEntra'ya devredilecek çıktıyı üretir — `npm run export`.
 *
 * Uygulamanın ihtiyacı olan şey motor, denetim kuralları, ŞEMA DOĞRULAMASI ve
 * veri. Editör, sürükleme çözücüsü ve testler burada kalır; uygulamaya
 * taşınmaz.
 *
 * Çıktı `dist/` altına yazılır ve başına "üretilmiştir, elle düzenleme"
 * başlığı konur. Uygulama tarafında bunlar `src/vendor/rig/` içine
 * kopyalanır; böylece iki projede iki ayrı motor gelişmez — tek yön vardır,
 * simülatörden uygulamaya.
 *
 * Dosyalar ELLE kopyalandığı için kopyalama atomik değil: birini eski
 * üretimden almak sessiz bir hata. `manifest.json` bunu görünür kılıyor —
 * her dosyanın sha256'sı, üretimin sürümü, tarihi ve git commit'i orada.
 * Uygulama açılışta manifesti okuyup karışık sürümü yakalayabilir.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSchema } from './schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** Git bilgisi yoksa üretim yine çalışır; damga "unknown" olur. */
const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const commit = git('rev-parse', '--short', 'HEAD') || 'unknown';
const dirty = git('status', '--porcelain') !== '';
const generated = new Date().toISOString();

const BANNER = `// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v${pkg.version} (${commit}${dirty ? '+kirli' : ''}), ${generated}
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.
`;

/**
 * Devir sözleşmesi. Yeni bir dosya eklemek tek satır; manifest ve doğrulama
 * kendiliğinden kapsar.
 *
 * `banner: true` olanlar TypeScript kaynağı ve başlarına üretim damgası
 * konur; JSON'a yorum konamadığı için veri dosyaları olduğu gibi kopyalanır ve
 * bütünlükleri yalnızca manifestten doğrulanır.
 */
const CONTRACT = [
  { out: 'rig.ts', src: 'src/rig.ts', banner: true, what: 'motor' },
  { out: 'rigAudit.ts', src: 'src/rigAudit.ts', banner: true, what: 'denetim kuralları' },
  { out: 'rigSchema.ts', src: 'src/rigSchema.ts', banner: true, what: 'veri biçim doğrulaması' },
  { out: 'muscles.ts', src: 'src/muscles.ts', banner: true, what: 'kanonik kas sözlüğü' },
  { out: 'rigArchetypes.json', src: 'data/rigArchetypes.json', banner: false, what: 'kare verisi' },
  { out: 'exercises.json', src: 'data/exercises.json', banner: false, what: 'hareket kataloğu' },
  { out: 'rigMuscles.json', src: 'data/rigMuscles.json', banner: false, what: 'hareket başına kaslar' },
  { out: 'anatomy.json', src: 'data/anatomy.json', banner: false, what: 'kas haritası yolları' },
  { out: 'bodyParts.json', src: 'data/bodyParts.json', banner: false, what: 'uzuv siluet parçaları' },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

// Doğrulama ÜRETİM ZAMANINDA. Uygulama runtime'da hiçbir şey kontrol etmiyor
// ve kas verisini kinematik olmadan yükleyebiliyor; ayrı dosya seçiminin tek
// gerekçesi böyle korunuyor. Kurallar `src/rigSchema.ts`'te — editörün
// kaydetme anında okuduğu yerin aynısı.
const bundleErrors = loadSchema().validateBundle({
  archetypes: readJson('data/rigArchetypes.json'),
  exercises: readJson('data/exercises.json'),
  muscles: readJson('data/rigMuscles.json'),
  anatomy: readJson('data/anatomy.json'),
  bodyParts: readJson('data/bodyParts.json'),
});
if (bundleErrors.length) {
  console.error(`✗ devir paketi geçersiz, hiçbir şey yazılmadı:\n  ${bundleErrors.join('\n  ')}`);
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });

const files = {};
for (const f of CONTRACT) {
  const src = readFileSync(join(ROOT, f.src));
  const out = f.banner ? Buffer.from(BANNER + '\n' + src.toString('utf8'), 'utf8') : src;
  writeFileSync(join(DIST, f.out), out);
  files[f.out] = { sha256: sha256(out), bytes: out.length, from: f.src, what: f.what };
}

const archetypes = readJson('data/rigArchetypes.json');
const muscles = readJson('data/rigMuscles.json');
const authored = Object.values(muscles).filter((m) => m.status === 'authored').length;
const manifest = {
  name: pkg.name,
  version: pkg.version,
  generated,
  source: { commit, dirty },
  counts: {
    arketip: Object.keys(archetypes).length,
    hareket: Object.keys(readJson('data/exercises.json')).length,
    kasVerisiYazilan: authored,
    kasVerisiBekleyen: Object.keys(muscles).length - authored,
  },
  files,
};
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Yazdığını hemen geri okuyup doğrula: yarım yazılmış bir dosya manifestte
// doğru görünüp diskte bozuk olursa hata uygulamada patlar, burada değil.
const bad = Object.entries(files).filter(([name, meta]) => sha256(readFileSync(join(DIST, name))) !== meta.sha256);
if (bad.length) {
  console.error(`✗ doğrulama başarısız: ${bad.map(([n]) => n).join(', ')}`);
  process.exit(1);
}

const list = CONTRACT.map((f) => f.out).join(', ');
console.log(`✓ dist/ hazır: ${list}, manifest.json
  ${manifest.counts.arketip} arketip · ${manifest.counts.hareket} hareket · kas verisi ${manifest.counts.kasVerisiYazilan} yazılı / ${manifest.counts.kasVerisiBekleyen} bekliyor
  sürüm ${pkg.version} · ${commit}${dirty ? ' · KİRLİ ÇALIŞMA AĞACI' : ''}
${dirty ? '\n  Uyarı: commit edilmemiş değişikliklerle üretildi; manifest bunu kaydetti.\n' : ''}
Uygulamaya almak için:
  cp dist/*.ts dist/*.json <gymentra-mobile>/src/vendor/rig/

Uygulama açılışta manifest.json'daki sha256'ları doğrulayarak karışık sürüm
kopyalamayı yakalayabilir.
`);
