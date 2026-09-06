/**
 * Kanonik kas grubu sözlüğü.
 *
 * Bu liste BİZE ait. Bugün `Muscle-Map-for-React-Native`'in 36 slug'ıyla
 * birebir örtüşüyor, ama örtüşme bir tesadüf değil bir SEÇİM: aynı isimleri
 * kullanmak eşlemeyi bugün bedava kılıyor. Renderer değiştiği gün değişecek
 * olan `rendererSlug()`; 34 hareketlik kas verisi değil. İş verisini bir çizim
 * kütüphanesinin sözlüğüne çivilemek, o kütüphaneyi bıraktığın gün veriyi
 * yeniden yazmak demekti.
 *
 * `trainable: false` olanlar çizimde bölge olarak var ama çalıştırılabilir kas
 * grubu değil; şema onları hareket verisinde reddediyor. "Baş" birincil kas
 * olamaz.
 */
export interface MuscleGroup {
  /** Arayüzde görünen Türkçe ad. */
  label: string;
  /** Hareket verisinde kullanılabilir mi? */
  trainable: boolean;
  /** Daha kaba bir gruba toplanabiliyorsa üstü. Arayüz isterse özet gösterir. */
  parent?: string;
}

export const MUSCLES: Record<string, MuscleGroup> = {
  // Göğüs
  chest: { label: 'Göğüs', trainable: true },
  'upper-chest': { label: 'Üst göğüs', trainable: true, parent: 'chest' },
  'lower-chest': { label: 'Alt göğüs', trainable: true, parent: 'chest' },

  // Sırt
  'upper-back': { label: 'Üst sırt', trainable: true },
  'lower-back': { label: 'Bel', trainable: true },
  rhomboids: { label: 'Romboid', trainable: true },
  trapezius: { label: 'Trapez', trainable: true },
  'upper-trapezius': { label: 'Üst trapez', trainable: true, parent: 'trapezius' },
  'lower-trapezius': { label: 'Alt trapez', trainable: true, parent: 'trapezius' },

  // Omuz
  deltoids: { label: 'Omuz', trainable: true },
  'front-deltoid': { label: 'Ön omuz', trainable: true, parent: 'deltoids' },
  'rear-deltoid': { label: 'Arka omuz', trainable: true, parent: 'deltoids' },
  'rotator-cuff': { label: 'Rotator manşet', trainable: true },

  // Kol
  biceps: { label: 'Biceps', trainable: true },
  triceps: { label: 'Triceps', trainable: true },
  forearm: { label: 'Ön kol', trainable: true },

  // Gövde
  abs: { label: 'Karın', trainable: true },
  'upper-abs': { label: 'Üst karın', trainable: true, parent: 'abs' },
  'lower-abs': { label: 'Alt karın', trainable: true, parent: 'abs' },
  obliques: { label: 'Yan karın', trainable: true },
  serratus: { label: 'Serratus', trainable: true },

  // Kalça ve bacak
  gluteal: { label: 'Kalça', trainable: true },
  'hip-flexors': { label: 'Kalça fleksörleri', trainable: true },
  quadriceps: { label: 'Ön bacak', trainable: true },
  'inner-quad': { label: 'İç ön bacak', trainable: true, parent: 'quadriceps' },
  'outer-quad': { label: 'Dış ön bacak', trainable: true, parent: 'quadriceps' },
  hamstring: { label: 'Arka bacak', trainable: true },
  adductors: { label: 'İç bacak', trainable: true },
  calves: { label: 'Baldır', trainable: true },
  tibialis: { label: 'Ön baldır', trainable: true },
  neck: { label: 'Boyun', trainable: true },

  // Çizimde bölge olarak var, kas grubu değil.
  head: { label: 'Baş', trainable: false },
  hands: { label: 'Eller', trainable: false },
  feet: { label: 'Ayaklar', trainable: false },
  knees: { label: 'Dizler', trainable: false },
  ankles: { label: 'Ayak bilekleri', trainable: false },
};

/** Hareket verisinde kullanılabilecek kas kimlikleri. */
export const TRAINABLE = Object.keys(MUSCLES).filter((k) => MUSCLES[k].trainable);

/**
 * Kanonik kimliği çizim kütüphanesinin slug'ına çevirir.
 *
 * Bugün birebir. Bu fonksiyon var olduğu için renderer değiştiğinde
 * dokunulacak yer BURASI oluyor, `rigMuscles.json`'daki 34 kayıt değil.
 * Kütüphanenin bilmediği bir kimlik `null` döner; arayüz o kası çizmez ama
 * metin listesinde göstermeye devam eder.
 */
export const rendererSlug = (id: string): string | null => (MUSCLES[id] ? id : null);

/** Alt grubu daha kaba üstüne toplar; üstü yoksa kendisi. */
export const coarse = (id: string): string => MUSCLES[id]?.parent ?? id;
