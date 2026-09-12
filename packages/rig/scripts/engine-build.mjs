/**
 * Motorun tarayıcı derlemesi — editör sunucusu ve inceleme sayfası paylaşıyor.
 *
 * İkisi de `src/rig.ts`, `rigEdit.ts`, `rigAudit.ts` ve `muscles.ts` dosyalarının
 * DERLENMİŞ HÂLİNİ çalıştırmak zorunda; ayrı yazılsalardı biri bayatlar ve
 * "editörde düzgün, sayfada bozuk" ayrımı geri gelirdi. Motor kopyalanmıyor,
 * derleniyor: bu deponun temel kuralı.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, '.editor-build');

/**
 * `src/` altındaki en yeni değişiklik zamanı — tazelik kararının tek girdisi.
 *
 * Tek tek dosya saymak yerine klasörün tamamı: derlemeye giren dosya listesi
 * değiştiğinde (yeni bir modül eklendiğinde) burayı güncellemeyi unutmak,
 * tam da bu mekanizmanın önlemesi gereken sessiz bayatlamayı geri getirirdi.
 */
const sourceMtime = () => {
  const dir = join(ROOT, 'src');
  return Math.max(...readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => statSync(join(dir, f)).mtimeMs));
};

/** Son derlemenin okuduğu kaynak damgası; hiç derlenmediyse -1. */
let builtFrom = -1;

/** Derleme kaynaktan geri mi kaldı? */
export const isEngineStale = () => sourceMtime() > builtFrom;

/**
 * Kaynak son derlemeden sonra değiştiyse yeniden derler; derlediyse `true`.
 *
 * Sunucu açıkken kaynak değişiyor — başka bir dalda çalışmak, `git pull`, ya
 * da editörün kendi oturumunda motoru düzenlemek. Eskiden derleme YALNIZ
 * açılışta yapılıyordu ve sonuç sessiz değildi: şema bayatlayınca kaydetme
 * "bilinmeyen alan" diye reddediyordu, yani kullanıcı kendi yazdığı geçerli
 * veriyi diske yazamıyordu. Damga derlemeden ÖNCE okunuyor ki derleme
 * sürerken yapılan bir düzenleme bir sonraki çağrıda yine yakalansın.
 */
export function ensureEngine() {
  if (!isEngineStale()) return false;
  buildEngine();
  return true;
}

/** Motoru tarayıcı modülüne derle. Çağıran her açılışta güncel kodu alır. */
export function buildEngine() {
  const stamp = sourceMtime();
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
  builtFrom = stamp;
  console.log('✓ motor derlendi →', OUT);
}
