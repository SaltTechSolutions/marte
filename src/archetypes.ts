import { RigExercise } from './rig';

import data from '../data/rigArchetypes.json';

/**
 * Hareketlerin açı kareleri.
 *
 * Doğruluk kaynağı `data/rigArchetypes.json`; düzenleyicisi `npm run editor`.
 * Bu dosya yalnızca JSON'a tip veriyor.
 */
export const RIG_ARCHETYPES: Record<string, RigExercise> = data as unknown as Record<string, RigExercise>;
