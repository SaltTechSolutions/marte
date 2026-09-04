import { RigExercise } from '@/utils/rig';

import data from './rigArchetypes.json';

/**
 * Her hareketin açı kareleri (bkz. src/utils/rig.ts).
 *
 * Veri `rigArchetypes.json` içinde ve **düzenleyicisi var**: `npm run rig`
 * yerel bir editör açıyor — hareketi seç, kareyi seç, figürün eklemini
 * sürükle, ekipmanı değiştir, denetim uyarılarını canlı gör, kaydet. Bu dosya
 * yalnızca o JSON'a tip veriyor.
 *
 * Neden JSON: kareler elle yazılan sayılardan ibaret ve tek gerçek doğrulama
 * yolu figüre bakmak. TypeScript içinde tutulunca her düzeltme "sayıyı
 * değiştir, derle, önizleme üret, bak" turuna dönüyordu; editör aynı motoru
 * tarayıcıda çalıştırıp turu tek adıma indiriyor.
 *
 * Açılar dünya uzayında, derece: 0 = yukarı, saat yönünde artar. Figür +x
 * yönüne bakar. `thighA` kalçadan dize, `shinA` dizden ayak bileğine, `torso`
 * kalçadan bele, `upperA` omuzdan dirseğe, `foreA` dirsekten bileğe. `...F`
 * uzak taraf; yazılmazsa yakın taraftan birkaç derece kaydırılır.
 *
 * Mekanik doğruluk `rigAudit.ts`'teki kurallarla korunuyor — aynı kurallar hem
 * testlerde hem editörde çalışıyor.
 */
export const RIG_ARCHETYPES: Record<string, RigExercise> = data as unknown as Record<string, RigExercise>;
