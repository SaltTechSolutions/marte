import { exerciseByName } from './exerciseLibrary';
import { ProgramDay, ProgramExercise, ProgramTemplate, TemplateExercise } from './types';

/**
 * Şablondan programa kopyalama (PER-18).
 *
 * Şablon ATANMAZ, kopyalanır. Üyeye giden şey bir `Program`'dır ve antrenör
 * onu serbestçe düzenler; şablonun sonradan değişmesi atanmış programı
 * etkilemez. Canlı bir bağ olsaydı, kanıt güncellendiğinde antrenörün
 * üstünde çalıştığı programın altından veri çekilirdi.
 *
 * Saf fonksiyon: kimlik üretimi dışarıdan geliyor, çünkü Firestore kimliği
 * ağ değil ama `db` istiyor ve bu dosya test edilebilir kalmalı.
 */
export function daysFromTemplate(template: ProgramTemplate, newId: () => string): ProgramDay[] {
  return template.days.map((day) => ({
    id: newId(),
    name: day.name,
    exercises: day.exercises.map((e) => exerciseFromTemplate(e, newId())),
  }));
}

function exerciseFromTemplate(e: TemplateExercise, id: string): ProgramExercise {
  const library = exerciseByName(e.name);
  return {
    id,
    name: e.name,
    sets: e.sets,
    // `reps` alanı modelde zorunlu: süreli hareketin tekrarı yok, 0 yazılıyor
    // ve okuyan taraf `type`'a bakıyor. Süreyi tekrara çevirmek "3×30 plank"ı
    // "30 tekrar" diye gösterirdi.
    reps: e.reps ?? 0,
    // Şablon ağırlık söylemez — ilk seansta antrenör belirler.
    targetWeightKg: e.targetWeightKg ?? 0,
    type: e.type,
    restSeconds: e.restSeconds,
    ...(e.durationSeconds !== undefined ? { durationSeconds: e.durationSeconds } : {}),
    ...(e.cue ? { cue: e.cue } : {}),
    // İsim bağı kopabilir (antrenör satırı düzenler), kimlik bağı kopmaz.
    // Kardiyo blokları ve devreler tek hareket değil; onlarda bağ YOK.
    ...(library ? { libraryId: library.id } : {}),
  };
}

/**
 * Bir satırın ekranda nasıl okunacağı: "4×8", "3×30 sn".
 *
 * Tek yerde, çünkü kurucu, üyenin program listesi ve antrenman ekranı aynı
 * satırı üç ayrı yerde biçimliyordu ve süreli hareket üçünde de "×0" çıkıyordu.
 */
export function formatDose(
  // `reps` OPSİYONEL: şablon satırında süreli hareketin tekrarı yok
  // (`TemplateExercise.reps?`), kopyalanmış programda ise hep dolu. İki tipi
  // de aynı biçimlendirici yazsın diye imza gevşek, çıktı korumalı.
  e: Pick<ProgramExercise, 'sets' | 'type' | 'durationSeconds'> & { reps?: number },
): string {
  if (e.type === 'time' && e.durationSeconds) return `${e.sets}×${e.durationSeconds} sn`;
  return e.reps === undefined ? `${e.sets} set` : `${e.sets}×${e.reps}`;
}
