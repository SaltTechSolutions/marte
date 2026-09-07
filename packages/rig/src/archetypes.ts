import { RigExercise } from './rig';
import { assertArchetypes } from './rigSchema';

import data from '../data/rigArchetypes.json';

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
