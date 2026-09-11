/**
 * `src/rigSchema.ts`'i Node'un çalıştırabileceği biçime derleyip döndürür.
 *
 * Tarayıcı derlemesi (`.editor-build/`) uzantısız ES modülü üretiyor
 * (`./rig`), Node bunu çözemiyor. Bu yüzden aynı kaynağın bir de CommonJS
 * derlemesi alınıyor. Kuralları elle kopyalamak alternatif değildi: editörün
 * testlerin reddettiği veriyi diske yazabilmesinin sebebi tam olarak buydu.
 *
 * Hem `editor.mjs` (kaydetme anı) hem `export.mjs` (devir anı) buradan
 * okuyor — doğrulama üretim zamanında yapılıyor, uygulama runtime'da hiçbir
 * şey kontrol etmiyor.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadSchema(outRoot = join(ROOT, '.editor-build')) {
  const dir = join(outRoot, 'cjs');
  mkdirSync(dir, { recursive: true });
  // package.json'da "type": "module" var; bu klasör onun dışında kalmalı.
  writeFileSync(join(dir, 'package.json'), '{ "type": "commonjs" }\n');
  const cfg = join(outRoot, 'tsconfig.schema.json');
  writeFileSync(
    cfg,
    JSON.stringify(
      {
        compilerOptions: {
          target: 'es2020',
          module: 'commonjs',
          moduleResolution: 'node',
          outDir: './cjs',
          skipLibCheck: true,
          esModuleInterop: true,
        },
        files: ['../src/rigSchema.ts'],
      },
      null,
      2,
    ),
  );
  const res = spawnSync('npx', ['tsc', '-p', cfg], { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(res.stdout || res.stderr);
    throw new Error('şema doğrulaması derlenemedi');
  }
  return createRequire(import.meta.url)(join(dir, 'rigSchema.js'));
}
