/**
 * Motorun tarayıcı derlemesi — editör sunucusu ve inceleme sayfası paylaşıyor.
 *
 * İkisi de `src/rig.ts`, `rigEdit.ts`, `rigAudit.ts` ve `muscles.ts` dosyalarının
 * DERLENMİŞ HÂLİNİ çalıştırmak zorunda; ayrı yazılsalardı biri bayatlar ve
 * "editörde düzgün, sayfada bozuk" ayrımı geri gelirdi. Motor kopyalanmıyor,
 * derleniyor: bu deponun temel kuralı.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, '.editor-build');

/** Motoru tarayıcı modülüne derle. Çağıran her açılışta güncel kodu alır. */
export function buildEngine() {
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
