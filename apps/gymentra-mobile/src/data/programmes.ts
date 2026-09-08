import data from '@/data/rigProgrammes.json';
import rawMuscles from '@/data/rigMuscles.json';
import rawExercises from '@/data/rigExercises.json';
import { Programme, ProgrammeDay, assertProgrammes } from '@/utils/rigSchema';

/**
 * Hazır programlar.
 *
 * Doğruluk kaynağı `packages/rig/data/programmes.json`; buraya dışa aktarma
 * kopyalıyor. UI'da "paket" DEMİYORUZ: uygulamada paket zaten üyelik paketi
 * anlamında kullanılıyor (`member/package-offer`), ikisi karışır.
 *
 * Yükleme anında doğrulanıyor — bkz. `assertProgrammes`. Doğrulamanın
 * yakaladığı şeyler biçimden ibaret değil: sınırı yazılmamış bir paket,
 * kataloğda olmayan bir harekete atıf, ve adı büyüme vaat edip hedef kasa
 * yeterli hacim vermeyen bir program da buradan geçemiyor.
 */
const file = assertProgrammes(data, Object.keys(rawExercises), rawMuscles);

export type { Programme, ProgrammeDay };

export const PROGRAMMES: Record<string, Programme> = file.programmes;

export const PROGRAMME_IDS: string[] = Object.keys(PROGRAMMES);

export const programmeById = (id: string): Programme | undefined => PROGRAMMES[id];

const GOAL_LABEL: Record<Programme['goal'], string> = {
  guc: 'Güç',
  hipertrofi: 'Kas büyümesi',
  dayaniklilik: 'Dayanıklılık',
  hareketlilik: 'Hareketlilik',
};

const LEVEL_LABEL: Record<Programme['level'], string> = {
  baslangic: 'Başlangıç',
  orta: 'Orta',
  ileri: 'İleri',
};

export const goalLabel = (p: Programme): string => GOAL_LABEL[p.goal];
export const levelLabel = (p: Programme): string => LEVEL_LABEL[p.level];

/** "12 hafta · haftada 3 · 50 dk" — liste satırındaki tek biçim. */
export const programmeSummary = (p: Programme): string =>
  `${p.weeks} hafta · haftada ${p.sessionsPerWeek} · ${p.minutes} dk`;

/** Programın bütün çalışma setleri; ısınma sayılmaz. */
export const workingSets = (p: Programme): number =>
  p.days.reduce((t, d) => t + d.exercises.reduce((n, x) => n + x.sets, 0), 0) *
  (p.sessionsPerWeek / p.days.length);
