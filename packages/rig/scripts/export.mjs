#!/usr/bin/env node
/**
 * GymEntra'ya devredilecek çıktıyı üretir — `npm run export`.
 *
 * Uygulamanın ihtiyacı olan şey motor, denetim kuralları, ŞEMA DOĞRULAMASI ve
 * veri. Editör, sürükleme çözücüsü ve testler burada kalır; uygulamaya
 * taşınmaz. Tek yön vardır: simülatörden uygulamaya.
 *
 * İki çıktı yeri var:
 *
 * 1. `dist/` — her zaman yazılır, gözden geçirilebilir bir üretim kopyası.
 * 2. Hedef uygulama — yalnızca yol verilmişse (`--to`, `GYMENTRA_DIR` ya da
 *    `.export-target`). Dosyalar uygulamanın gerçekten ithal ettiği yerlere
 *    yazılır (`src/utils/`, `src/data/`), yoksa export tiyatro olurdu:
 *    kimsenin okumadığı bir dizine yazmak bir sonraki build'i değiştirmez.
 *
 * Hedefe yazmanın iki koruması var:
 *
 * - **Kimlik.** Hedefin `package.json` adı `gymentra-mobile` değilse durulur.
 *   Yanlış dizine dokuz dosya yazmak sessiz ve geri alması zor bir hata.
 * - **Drift.** Hedefteki dosyalar ÜRETİLMİŞ dosyalar; orada yapılan bir
 *   düzenleme bir sonraki export'ta kaybolurdu. Her export hedefe bir alındı
 *   bırakıyor (`src/data/rigManifest.json`, dosya başına sha256) ve bir
 *   sonraki export hedefteki hâli o alındıyla karşılaştırıyor. Tutmuyorsa
 *   HİÇBİR ŞEY yazılmıyor ve hangi dosya olduğu söyleniyor. Bilerek ezmek
 *   için `--force`; ne yazılacağını görmek için `--dry`.
 *
 * Alındı aynı zamanda uygulamanın runtime'da okuyabileceği manifest: karışık
 * sürüm (bir dosyayı eski üretimden almak) orada görünür hâle geliyor.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSchema } from './schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const argv = process.argv.slice(2);
const has = (n) => argv.includes(n);
const val = (n) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const DRY = has('--dry');
const FORCE = has('--force');

/**
 * Hedef uygulama dizini. Sırayla: `--to`, `GYMENTRA_DIR`, `.export-target`.
 * Hiçbiri yoksa yalnızca `dist/` üretilir — yol makineye özel olduğu için
 * depoya yazılmıyor, `.export-target` gitignore'da.
 */
const TARGET = val('--to') || process.env.GYMENTRA_DIR || (() => {
  try { return readFileSync(join(ROOT, '.export-target'), 'utf8').trim(); } catch { return ''; }
})();

/** Hedefin gerçekten o uygulama olduğunu doğrulamak için. */
const APP_NAME = 'gymentra-mobile';
/** Hedefteki alındı: bir önceki export'un ne yazdığı. Drift bununla ölçülüyor. */
const RECEIPT = 'src/data/rigManifest.json';

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

// Damga ÜRETİM ZAMANI ya da COMMIT TAŞIMIYOR, yalnızca sürüm: ikisi de
// banner'a girdiğinde kaynak hiç değişmese bile her export dört .ts dosyasını
// bayt düzeyinde değiştiriyordu: zaman her çalıştırmada, commit her commit'te.
// Hedefin git diff'i böyle her seferinde kirleniyor, "değişti/aynı" raporu
// anlamsızlaşıyordu. İkisi de manifest.json'da duruyor — banner yalnızca
// "bu üretilmiş bir dosya" demek zorunda.
const BANNER = `// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v${pkg.version} — hangi üretimden geldiği manifest.json'da
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
  { out: 'rig.ts', src: 'src/rig.ts', banner: true, what: 'motor', to: 'src/utils/rig.ts' },
  { out: 'rigAudit.ts', src: 'src/rigAudit.ts', banner: true, what: 'denetim kuralları', to: 'src/utils/rigAudit.ts' },
  { out: 'rigSchema.ts', src: 'src/rigSchema.ts', banner: true, what: 'veri biçim doğrulaması', to: 'src/utils/rigSchema.ts' },
  { out: 'muscles.ts', src: 'src/muscles.ts', banner: true, what: 'kanonik kas sözlüğü', to: 'src/utils/muscles.ts' },
  { out: 'rigArchetypes.json', src: 'data/rigArchetypes.json', banner: false, what: 'kare verisi', to: 'src/data/rigArchetypes.json' },
  { out: 'exercises.json', src: 'data/exercises.json', banner: false, what: 'hareket kataloğu', to: 'src/data/rigExercises.json' },
  { out: 'rigMuscles.json', src: 'data/rigMuscles.json', banner: false, what: 'hareket başına kaslar', to: 'src/data/rigMuscles.json' },
  { out: 'anatomy.json', src: 'data/anatomy.json', banner: false, what: 'kas haritası yolları', to: 'src/data/rigAnatomy.json' },
  { out: 'bodyParts.json', src: 'data/bodyParts.json', banner: false, what: 'uzuv siluet parçaları', to: 'src/data/rigBodyParts.json' },
  { out: 'programmes.json', src: 'data/programmes.json', banner: false, what: 'hazır paket programlar', to: 'src/data/rigProgrammes.json' },
  // Kare verisini TİPLEYEN ve YÜKLEME ANINDA DOĞRULAYAN sarmalayıcı.
  // Uygulamanın kendi kopyası `as unknown as` ile geçiyordu: derleyiciye söz
  // veriyor ama JSON elle de düzenlenebiliyor ve yanlış bir `mode` motorun
  // içinde patlıyordu. Şema artık devrediliyor, doğrulama da devredilebilir.
  { out: 'archetypes.ts', src: 'src/archetypes.ts', banner: true, what: 'doğrulayan kare verisi sarmalayıcısı', to: 'src/data/rigArchetypes.ts' },
  // Devredilen KODUN testleri de devrediliyor. Uygulama bunların 34 satır
  // geride kalmış elle kopyalarını taşıyordu ve her motor değişikliğinde
  // kırılıyorlardı. `rigEdit` (sürükleme çözücüsü) ve `normalize-part`
  // testleri BURADA KALIYOR — o kod devredilmiyor, testi de gitmemeli.
  { out: 'rig.test.ts', src: 'tests/rig.test.ts', banner: true, what: 'motor testleri', to: 'src/utils/rig.test.ts' },
  { out: 'rigAudit.test.ts', src: 'tests/rigAudit.test.ts', banner: true, what: 'denetim testleri', to: 'src/utils/rigAudit.test.ts' },
  { out: 'rigSchema.test.ts', src: 'tests/rigSchema.test.ts', banner: true, what: 'şema testleri', to: 'src/utils/rigSchema.test.ts' },
];

/**
 * Modül yolu çevirisi.
 *
 * İki depo dosyaları farklı yerlere koyuyor: burada `src/rig.ts` ve
 * `tests/rig.test.ts`, uygulamada ikisi de `src/utils/` altında, veri
 * `src/data/` altında. Göreli yollar (`'../src/rig'`, `'./rig'`) bu yüzden
 * taşınamıyor — üstelik `archetypes.ts` burada `'./rig'` diyor ama uygulamada
 * `src/data/`'ya gidiyor, yani `'./rig'` orada YANLIŞ dosyayı arardı.
 *
 * Hepsi uygulamanın `@/` takma adına çevriliyor: konumdan bağımsız, tek biçim.
 * Anahtar SON parça, çünkü aynı modüle `'./rig'` ve `'../src/rig'` diye iki
 * ayrı yerden geliniyor.
 */
const REWRITE = {
  rig: '@/utils/rig',
  rigAudit: '@/utils/rigAudit',
  rigSchema: '@/utils/rigSchema',
  muscles: '@/utils/muscles',
  archetypes: '@/data/rigArchetypes',
  'rigArchetypes.json': '@/data/rigArchetypes.json',
  'exercises.json': '@/data/rigExercises.json',
  'rigMuscles.json': '@/data/rigMuscles.json',
  'anatomy.json': '@/data/rigAnatomy.json',
  'bodyParts.json': '@/data/rigBodyParts.json',
  'programmes.json': '@/data/rigProgrammes.json',
};

/** `from './rig'` → `from '@/utils/rig'`. Yalnızca depo içi göreli yollar. */
const rewriteImports = (src, file) => {
  const miss = [];
  const out = src.replace(/(from\s+)'(\.\.?\/[^']+)'/g, (all, kw, spec) => {
    const last = spec.split('/').pop();
    if (REWRITE[last]) return `${kw}'${REWRITE[last]}'`;
    miss.push(spec);
    return all;
  });
  // Çevrilemeyen göreli yol sessizce gitmesin: uygulamada derlenmez ve hata
  // orada, bizim göremediğimiz yerde çıkar.
  if (miss.length) {
    console.error(`✗ ${file}: bu göreli yolların hedef karşılığı yok — ${[...new Set(miss)].join(', ')}`);
    process.exit(1);
  }
  return out;
};

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
  programmes: readJson('data/programmes.json'),
});
if (bundleErrors.length) {
  console.error(`✗ devir paketi geçersiz, hiçbir şey yazılmadı:\n  ${bundleErrors.join('\n  ')}`);
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });

const files = {};
/** Üretilen baytlar. dist'e ve hedefe AYNI tampon yazılıyor; alındıdaki
 *  sha256 bu yüzden hedefteki dosyayla birebir karşılaştırılabiliyor. */
const outputs = {};
for (const f of CONTRACT) {
  const src = readFileSync(join(ROOT, f.src));
  const out = f.banner ? Buffer.from(BANNER + '\n' + rewriteImports(src.toString('utf8'), f.src), 'utf8') : src;
  writeFileSync(join(DIST, f.out), out);
  outputs[f.out] = out;
  files[f.out] = { sha256: sha256(out), bytes: out.length, from: f.src, what: f.what, to: f.to };
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
const manifestJson = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync(join(DIST, 'manifest.json'), manifestJson);

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
  sürüm ${pkg.version} · ${commit}${dirty ? ' · KİRLİ ÇALIŞMA AĞACI' : ''}${dirty ? '\n\n  Uyarı: commit edilmemiş değişikliklerle üretildi; manifest bunu kaydetti.' : ''}`);

/* --- hedefe yazma -------------------------------------------------------- */

if (!TARGET) {
  console.log(`
Hedefe otomatik yazma kapalı; yalnızca dist/ üretildi. Açmak için biri:
  npm run export -- --to /yol/gymentra-mobile
  GYMENTRA_DIR=/yol/gymentra-mobile npm run export
  echo /yol/gymentra-mobile > .export-target
`);
  process.exit(0);
}

// Yanlış dizine yazmak sessiz ve geri alınması zor bir hata: hedefin gerçekten
// o uygulama olduğunu package.json'dan doğruluyoruz.
let targetPkg;
try {
  targetPkg = JSON.parse(readFileSync(join(TARGET, 'package.json'), 'utf8'));
} catch {
  console.error(`✗ hedefte package.json okunamadı: ${TARGET}`);
  process.exit(1);
}
if (targetPkg.name !== APP_NAME) {
  console.error(`✗ hedef "${targetPkg.name}", beklenen "${APP_NAME}" — yanlış dizine yazmamak için durdum:\n  ${TARGET}`);
  process.exit(1);
}

/**
 * Drift koruması.
 *
 * Hedefteki dosyalar ÜRETİLMİŞ dosyalar; orada yapılan bir düzenleme bir
 * sonraki export'ta sessizce kaybolur. Bunu görünür kılmak için her export
 * hedefe bir alındı bırakıyor (`rigManifest.json`) ve bir sonraki export
 * hedefteki dosyaların sha256'sını o alındıyla karşılaştırıyor. Tutmuyorsa
 * dosya export dışında değişmiş demektir ve hiçbir şey yazılmıyor.
 *
 * dist'e ve hedefe aynı tampon yazıldığı için karşılaştırma birebir; damga
 * satırı da tampona dahil olduğundan ayrıca ayıklamak gerekmiyor.
 */
let receipt = null;
try {
  receipt = JSON.parse(readFileSync(join(TARGET, RECEIPT), 'utf8'));
} catch {
  /* alındı yok: ya ilk kurulum ya da elle kopyalanmış eski bir hâl */
}

const drifted = [];
const plan = [];
for (const f of CONTRACT) {
  const dst = join(TARGET, f.to);
  let cur = null;
  try {
    cur = readFileSync(dst);
  } catch {
    plan.push({ f, state: 'yeni' });
    continue;
  }
  const curHash = sha256(cur);
  const known = receipt && receipt.files && receipt.files[f.out] && receipt.files[f.out].sha256;
  if (!known) drifted.push(`${f.to} — bu üretimin alındısı yok (elle kopyalanmış olabilir)`);
  else if (curHash !== known) drifted.push(`${f.to} — son export'tan sonra elle değişmiş`);
  plan.push({ f, state: curHash === files[f.out].sha256 ? 'aynı' : 'değişti' });
}

if (drifted.length && !FORCE) {
  console.error(`
✗ hedefte export dışında değişmiş dosyalar var — hiçbir şey yazılmadı:
  ${drifted.join('\n  ')}

Bunlar üretilmiş dosyalar: düzeltme simülatörde yapılır, buraya kopyalanır.
Hedefteki değişiklikleri BİLEREK ezmek istiyorsan:
  npm run export -- --to ${TARGET} --force
`);
  process.exit(1);
}

const changed = plan.filter((x) => x.state !== 'aynı');
if (DRY) {
  console.log(`\n— deneme (--dry), hedefe yazılmadı: ${TARGET}`);
} else {
  for (const f of CONTRACT) {
    const dst = join(TARGET, f.to);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, outputs[f.out]);
  }
  writeFileSync(join(TARGET, RECEIPT), manifestJson);
  // dist'te olduğu gibi geri okuyup doğrula: yarım yazılmış bir dosya alındıda
  // doğru görünüp diskte bozuk olursa hata uygulamada patlar, burada değil.
  const bad = CONTRACT.filter((f) => sha256(readFileSync(join(TARGET, f.to))) !== files[f.out].sha256);
  if (bad.length) {
    console.error(`✗ hedef doğrulaması başarısız: ${bad.map((f) => f.to).join(', ')}`);
    process.exit(1);
  }
  console.log(`\n✓ hedefe yazıldı: ${TARGET}${FORCE && drifted.length ? '  (--force: hedefteki ' + drifted.length + ' elle değişikliğin ÜZERİNE YAZILDI)' : ''}`);
}
for (const { f, state } of plan) console.log(`  ${state.padEnd(8)} ${f.to}`);
console.log(`  alındı   ${RECEIPT}`);
if (!changed.length) console.log('\n  Hiçbir dosya değişmedi.');

// Motora bağlı ama bizim üretmediğimiz dosyalar: motor 285 satır değiştiyse
// bunlar derlenmeyebilir. Export bunu bilemez, ama görünür kılabilir.
const managed = new Set([...CONTRACT.map((f) => f.to), RECEIPT]);
let dependents = [];
try {
  dependents = execFileSync(
    'grep',
    ['-rl', '-e', "utils/rig'", '-e', "from './rig'", '-e', 'utils/rigAudit', '-e', "from './rigAudit'", join(TARGET, 'src')],
    { encoding: 'utf8' },
  )
    .trim().split('\n').filter(Boolean)
    .map((p) => p.slice(TARGET.length + 1))
    .filter((p) => !managed.has(p));
} catch {
  /* eşleşme yoksa grep 1 ile çıkıyor */
}
if (dependents.length) {
  console.log(`
  Motora bağlı ama export'un yönetmediği dosyalar:
    ${dependents.join('\n    ')}
  Bunlar hedefin kendi dosyaları; motor değiştiğinde derleme kırılabilir.
  Hedefte tip kontrolü çalıştırmak iyi olur.`);
}
