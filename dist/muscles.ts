// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 (7a7e46d+kirli), 2026-09-06T13:22:27.435Z
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.

/**
 * Kas bölgesi sözlüğü.
 *
 * Bu liste UYGULAMANIN listesi. GymEntra'nın `exerciseLibrary.ts`'indeki
 * `MUSCLE_LABELS` 39 bölgesiyle birebir aynı ve Türkçe etiketleri de oradan
 * geliyor; kas haritasını çizen SVG tam olarak bu kimlikleri boyuyor.
 *
 * Kendi sözlüğümüzü yazmak denenmişti ve yanlıştı: dışarıdan bir çizim
 * kütüphanesinin (Muscle-Map) 36 grubu alınmıştı, oysa uygulama o kütüphaneyi
 * kullanmıyor. Veriyi çizmeyen bir sözlüğe bağlamak, ilk render denemesinde
 * çöpe giden bir eşleme katmanı üretirdi.
 *
 * `group` bizim eklediğimiz tek şey: 39 bölge bir çipe sığmaz, "Sırt · Biceps"
 * sığar. Anatomik üst-alt ilişkisi değil ARAYÜZ gruplaması.
 */
export interface MuscleRegion {
  /** Arayüzde görünen Türkçe ad. Kaynak: uygulamanın MUSCLE_LABELS'ı. */
  label: string;
  /** Özet gösterim için kaba grup. */
  group: string;
}

export const MUSCLES: Record<string, MuscleRegion> = {
  // Boyun
  sterno: { label: 'Boyun ön', group: 'Boyun' },
  // Trapez
  trapFront: { label: 'Trapez (üst-ön)', group: 'Trapez' },
  trapUpper: { label: 'Trapez (üst)', group: 'Trapez' },
  trapMid: { label: 'Trapez (orta)', group: 'Trapez' },
  trapLower: { label: 'Trapez (alt)', group: 'Trapez' },
  // Omuz
  deltFront: { label: 'Ön omuz', group: 'Omuz' },
  deltPost: { label: 'Arka omuz', group: 'Omuz' },
  infra: { label: 'Infraspinatus', group: 'Omuz' },
  teres: { label: 'Teres major', group: 'Omuz' },
  // Göğüs
  pecClav: { label: 'Göğüs (üst)', group: 'Göğüs' },
  pecSternal: { label: 'Göğüs (orta-alt)', group: 'Göğüs' },
  serratus: { label: 'Serratus', group: 'Göğüs' },
  // Biceps
  biceps: { label: 'Biceps', group: 'Biceps' },
  brachialis: { label: 'Brachialis', group: 'Biceps' },
  // Ön kol
  forearmFlex: { label: 'Ön kol bükücüler', group: 'Ön kol' },
  forearmExt: { label: 'Ön kol açıcılar', group: 'Ön kol' },
  // Karın
  absUpper: { label: 'Karın (üst)', group: 'Karın' },
  absMid: { label: 'Karın (orta)', group: 'Karın' },
  absLower: { label: 'Karın (alt)', group: 'Karın' },
  // Yan karın
  oblique: { label: 'Yan karın', group: 'Yan karın' },
  // Ön bacak
  quadRF: { label: 'Ön bacak (orta)', group: 'Ön bacak' },
  quadVL: { label: 'Ön bacak (dış)', group: 'Ön bacak' },
  quadVM: { label: 'Ön bacak (iç)', group: 'Ön bacak' },
  sartorius: { label: 'Sartorius', group: 'Ön bacak' },
  // İç bacak
  adductors: { label: 'İç bacak', group: 'İç bacak' },
  addMagnus: { label: 'İç bacak (arka)', group: 'İç bacak' },
  // İncik
  tibialis: { label: 'Ön incik', group: 'İncik' },
  peroneus: { label: 'Dış incik', group: 'İncik' },
  // Sırt
  lat: { label: 'Kanat kası (lat)', group: 'Sırt' },
  // Bel
  erector: { label: 'Bel dikleştirici', group: 'Bel' },
  // Triceps
  triLat: { label: 'Triceps (yan baş)', group: 'Triceps' },
  triLong: { label: 'Triceps (uzun baş)', group: 'Triceps' },
  // Kalça
  gluteMax: { label: 'Kalça', group: 'Kalça' },
  gluteMed: { label: 'Yan kalça', group: 'Kalça' },
  // Arka bacak
  hamBF: { label: 'Arka bacak (dış)', group: 'Arka bacak' },
  hamST: { label: 'Arka bacak (iç)', group: 'Arka bacak' },
  // Baldır
  gastroLat: { label: 'Baldır (dış baş)', group: 'Baldır' },
  gastroMed: { label: 'Baldır (iç baş)', group: 'Baldır' },
  soleus: { label: 'Soleus', group: 'Baldır' },
};

export type MuscleId = keyof typeof MUSCLES;

/** Kas kimliklerini kaba gruplarına indirger; sıra korunur, tekrar atılır. */
export const groupsOf = (ids: string[]): string[] => {
  const out: string[] = [];
  ids.forEach((id) => {
    const g = MUSCLES[id]?.group;
    if (g && !out.includes(g)) out.push(g);
  });
  return out;
};

/** Etiketleri okunur biçimde birleştirir. */
export const labelsOf = (ids: string[]): string[] => ids.map((id) => MUSCLES[id]?.label ?? id);
