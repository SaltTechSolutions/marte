import { Program, ProgramDay, ProgramExercise, WorkoutLog } from './types';

/**
 * Programın günleri (PER-17).
 *
 * Tek günlü programlar `days` yazmaz: eski programların hepsi öyle ve
 * antrenörlerin çoğu tek liste yazmaya devam edecek. Okuma tarafı ikisini
 * ayırt etmek zorunda kalmasın diye tek günlü program da tek elemanlı bir
 * gün listesi olarak görünür.
 */
export function programDays(program: Program): ProgramDay[] {
  if (program.days?.length) return program.days;
  return [{ id: 'gun-1', name: program.name, exercises: program.exercises }];
}

export const isMultiDay = (program: Program): boolean => (program.days?.length ?? 0) > 1;

/** Programın bütün egzersizleri — çok günlüde günlerin toplamı. */
export const allProgramExercises = (program: Program): ProgramExercise[] =>
  programDays(program).flatMap((d) => d.exercises);

/**
 * Liste ekranlarındaki tek satırlık özet.
 *
 * `program.exercises` çok günlü programda yalnızca ilk günün aynası; onu
 * saymak "14 egzersizlik Push/Pull/Legs" programını "5 egzersiz" gösteriyordu.
 */
export function programSummary(program: Program): string {
  const total = allProgramExercises(program).length;
  const days = programDays(program).length;
  const label = total === 0 ? 'Henüz egzersiz eklenmedi' : `${total} egzersiz`;
  return days > 1 ? `${days} gün · ${label}` : label;
}

/**
 * Bugün hangi gün çalışılmalı.
 *
 * Son tamamlanan antrenmanın gününden SONRAKİ gün. Push/Pull/Legs'te sıradaki
 * günü kendi hesaplamak üyenin işi değil; yanlış hatırlarsa aynı bölgeyi iki
 * gün üst üste çalışır. Hiç kayıt yoksa ilk gün.
 *
 * Öneri, kilit değil: seçim ekranda değiştirilebiliyor.
 */
export function suggestedDayId(days: ProgramDay[], lastCompletedDayId?: string | null): string | null {
  if (days.length === 0) return null;
  if (!lastCompletedDayId) return days[0].id;
  const i = days.findIndex((d) => d.id === lastCompletedDayId);
  if (i < 0) return days[0].id;
  return days[(i + 1) % days.length].id;
}

/** En son tamamlanmış antrenmanın günü — `suggestedDayId`'nin girdisi. */
export function lastCompletedDayId(logs: WorkoutLog[]): string | null {
  const done = logs.filter((l) => l.completedAt).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return done[0]?.dayId ?? null;
}

export interface LastTime {
  weightKg: number;
  setsCompleted: number;
  at: Date;
}

/**
 * "Geçen sefer" (PER-17).
 *
 * Antrenman ekranındaki ağırlık, programın hedefiyle açılıyordu — yani
 * antrenörün haftalar önce yazdığı sayıyla. Üyenin gerçekte kaldırdığı
 * ağırlık başka bir yerde durmuyordu ve her set için yeniden hatırlanması
 * gerekiyordu.
 *
 * Eşleşme önce kütüphane kimliğinden, sonra isimden: eski kayıtlarda kimlik
 * yok, ve antrenör ismi düzenlediyse kimlik hâlâ tutuyor.
 *
 * Yalnızca gerçekten YAPILMIŞ setler sayılır: sıfır setle biten bir kayıt
 * "geçen sefer 80 kg" demek için gerekçe değil.
 */
export function lastTimeFor(
  logs: WorkoutLog[],
  exercise: Pick<ProgramExercise, 'name'> & { libraryId?: string },
  excludeLogId?: string,
): LastTime | null {
  const matches = logs
    .filter((l) => l.completedAt && l.id !== excludeLogId)
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  for (const log of matches) {
    const hit = log.exerciseLogs.find((e) =>
      exercise.libraryId && e.libraryId ? e.libraryId === exercise.libraryId : e.name === exercise.name,
    );
    if (hit && hit.setsCompleted > 0) {
      return { weightKg: hit.weightKg, setsCompleted: hit.setsCompleted, at: log.startedAt };
    }
  }
  return null;
}

/** "80 kg × 3 set" — ekranlarda tek biçim. */
export function formatLastTime(last: LastTime): string {
  const kg = Number.isInteger(last.weightKg) ? String(last.weightKg) : last.weightKg.toFixed(1);
  return `${kg} kg × ${last.setsCompleted} set`;
}
