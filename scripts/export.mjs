#!/usr/bin/env node
/**
 * GymEntra'ya devredilecek çıktıyı üretir — `npm run export`.
 *
 * Uygulamanın ihtiyacı olan şey bu üç dosya: motor, denetim ve veri. Editör,
 * sürükleme çözücüsü ve testler burada kalır; uygulamaya taşınmaz.
 *
 * Çıktı `dist/` altına yazılır ve başına "üretilmiştir, elle düzenleme"
 * başlığı konur. Uygulama tarafında bunlar `src/vendor/rig/` içine
 * kopyalanır; böylece iki projede iki ayrı motor gelişmez — tek yön vardır,
 * simülatörden uygulamaya.
 */

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const BANNER = `// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru (npm run export). Değişiklik orada yapılır,
// buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı motor doğurur.
`;

mkdirSync(DIST, { recursive: true });

for (const name of ['rig.ts', 'rigAudit.ts']) {
  const src = readFileSync(join(ROOT, 'src', name), 'utf8');
  writeFileSync(join(DIST, name), BANNER + '\n' + src);
}
copyFileSync(join(ROOT, 'data/rigArchetypes.json'), join(DIST, 'rigArchetypes.json'));

const count = Object.keys(JSON.parse(readFileSync(join(DIST, 'rigArchetypes.json'), 'utf8'))).length;
console.log(`✓ dist/ hazır: rig.ts, rigAudit.ts, rigArchetypes.json (${count} arketip)

Uygulamaya almak için:
  cp dist/rig.ts dist/rigAudit.ts <gymentra-mobile>/src/vendor/rig/
  cp dist/rigArchetypes.json      <gymentra-mobile>/src/vendor/rig/
`);
