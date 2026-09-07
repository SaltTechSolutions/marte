// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 — hangi üretimden geldiği manifest.json'da
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.

import { RigExercise } from '@/utils/rig';
import { assertArchetypes } from '@/utils/rigSchema';

import data from '@/data/rigArchetypes.json';

/**
 * Hareketlerin açı kareleri.
 *
 * Doğruluk kaynağı `data/rigArchetypes.json`; düzenleyicisi `npm run editor`.
 *
 * Tip vermek yetmiyordu: `as unknown as` derleyiciye söz veriyor ama JSON elle
 * de düzenlenebiliyor ve yanlış bir `mode` motorun içinde `undefined.length`
 * olarak patlıyordu. Yükleme anında doğruluyoruz — hata, kaynağını söyleyen
 * tek bir satır olarak çıkıyor.
 */
export const RIG_ARCHETYPES: Record<string, RigExercise> = assertArchetypes(data);
