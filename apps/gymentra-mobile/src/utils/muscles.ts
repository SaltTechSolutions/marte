// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 — hangi üretimden geldiği manifest.json'da
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

/**
 * Kasın HAREKET FİGÜRÜNDE nerede durduğu.
 *
 * Kas haritası önden/arkadan ayrı bir çizim; figür ise yandan görünen,
 * kemik başına parçalardan kurulu bir siluet. Bu tablo ikisini bağlıyor:
 * her kas, bir uzuv parçasının ön (+X) ya da arka (−X) yarısında, kemik
 * boyunca `u0..u1` aralığında (0 = kemiğin baş eklemi) duran bir bant.
 *
 * Parçaların yerel uzayı `bodyParts.json`'daki: kemik (0,0) → (0,len),
 * +X figürün baktığı yön. Kemik baş eklemleri: uyluk kalça, baldır diz,
 * üst kol omuz, ön kol dirsek, bel leğen, göğüs bel, boyun göğüs üstü.
 *
 * Yandan bakışın sınırı bilerek kabul edildi: iç/dış ayrımı (quadVL ↔
 * quadVM, hamBF ↔ hamST) bu görünümde AYNI banda düşer. O ayrımı kas
 * haritası taşıyor; figürün işi hangi BÖLGENİN çalıştığını hareketin
 * üstünde göstermek. Yan bölgeler (oblik, serratus, kalça yanı) en yakın
 * yüze konuldu.
 */
export type FigurePart = 'thigh' | 'shin' | 'upper' | 'fore' | 'lumbar' | 'thorax' | 'neck';

export interface MusclePatch {
  part: FigurePart;
  side: 'front' | 'back';
  u0: number;
  u1: number;
}

const P = (part: FigurePart, side: 'front' | 'back', u0: number, u1: number): MusclePatch => ({ part, side, u0, u1 });

export const MUSCLE_PATCHES: Record<MuscleId, MusclePatch[]> = {
  sterno: [P('neck', 'front', 0, 1)],
  trapFront: [P('neck', 'back', 0, 0.8)],
  trapUpper: [P('neck', 'back', 0, 1), P('thorax', 'back', 0.8, 1)],
  trapMid: [P('thorax', 'back', 0.55, 0.88)],
  trapLower: [P('thorax', 'back', 0.3, 0.65)],
  deltFront: [P('upper', 'front', 0, 0.38)],
  deltPost: [P('upper', 'back', 0, 0.38)],
  infra: [P('thorax', 'back', 0.6, 0.85)],
  teres: [P('thorax', 'back', 0.5, 0.72)],
  pecClav: [P('thorax', 'front', 0.75, 1)],
  pecSternal: [P('thorax', 'front', 0.48, 0.85)],
  serratus: [P('thorax', 'front', 0.3, 0.55)],
  biceps: [P('upper', 'front', 0.3, 0.92)],
  brachialis: [P('upper', 'front', 0.55, 0.98)],
  forearmFlex: [P('fore', 'front', 0, 0.7)],
  forearmExt: [P('fore', 'back', 0, 0.7)],
  absUpper: [P('thorax', 'front', 0, 0.48)],
  absMid: [P('lumbar', 'front', 0.45, 1)],
  absLower: [P('lumbar', 'front', 0, 0.55)],
  oblique: [P('lumbar', 'front', 0.15, 0.9), P('thorax', 'front', 0, 0.25)],
  quadRF: [P('thigh', 'front', 0.05, 0.9)],
  quadVL: [P('thigh', 'front', 0.2, 0.95)],
  quadVM: [P('thigh', 'front', 0.45, 0.95)],
  sartorius: [P('thigh', 'front', 0, 0.75)],
  adductors: [P('thigh', 'front', 0, 0.45)],
  addMagnus: [P('thigh', 'back', 0.15, 0.65)],
  tibialis: [P('shin', 'front', 0.05, 0.75)],
  peroneus: [P('shin', 'front', 0.1, 0.7)],
  lat: [P('thorax', 'back', 0.12, 0.75)],
  erector: [P('lumbar', 'back', 0, 1), P('thorax', 'back', 0, 0.45)],
  triLat: [P('upper', 'back', 0.3, 0.9)],
  triLong: [P('upper', 'back', 0.2, 0.95)],
  gluteMax: [P('thigh', 'back', 0, 0.3), P('lumbar', 'back', 0, 0.2)],
  gluteMed: [P('thigh', 'back', 0, 0.16)],
  hamBF: [P('thigh', 'back', 0.25, 0.95)],
  hamST: [P('thigh', 'back', 0.25, 0.95)],
  gastroLat: [P('shin', 'back', 0.05, 0.5)],
  gastroMed: [P('shin', 'back', 0.05, 0.55)],
  soleus: [P('shin', 'back', 0.35, 0.85)],
};

export interface FigureTint extends MusclePatch {
  level: 'primary' | 'secondary';
}

/**
 * Bir hareketin kaslarını figür bantlarına çevirir.
 *
 * İkincil bantlar ÖNCE, birincil sonra: aynı bölgede ikisi çakışırsa
 * (ör. biceps birincil, brachialis ikincil) üstte birincil görünür.
 * Bilinmeyen kimlik sessizce atlanır — kas listesi şemayla zaten
 * doğrulanıyor, çizim onun için düşmemeli.
 */
export const figureTints = (primary: readonly string[], secondary: readonly string[] = []): FigureTint[] => {
  const of = (ids: readonly string[], level: FigureTint['level']) =>
    mergeBands(ids.flatMap((id) => MUSCLE_PATCHES[id as MuscleId] ?? [])).map((q) => ({ ...q, level }));
  return [...of(secondary.filter((id) => !primary.includes(id)), 'secondary'), ...of(primary, 'primary')];
};

/**
 * Aynı parçanın aynı yüzünde çakışan ya da değen bantları TEK bantta birleştirir.
 *
 * Squat'ta ön uyluğa beş kas düşüyor (dört quadriceps başı + adduktor); beş ayrı
 * elips üst üste binince uyluk yama yama görünüyordu. Yandan bakışta bu kaslar
 * zaten ayırt edilemiyor, figürün söylediği tek şey "ön uyluk çalışıyor".
 */
const mergeBands = (list: MusclePatch[]): MusclePatch[] => {
  const out: MusclePatch[] = [];
  [...list]
    .sort((a, b) => (a.part + a.side).localeCompare(b.part + b.side) || a.u0 - b.u0)
    .forEach((q) => {
      const last = out[out.length - 1];
      if (last && last.part === q.part && last.side === q.side && q.u0 <= last.u1) {
        last.u1 = Math.max(last.u1, q.u1);
      } else {
        out.push({ ...q });
      }
    });
  return out;
};

/**
 * Bandın dolgusu, uzvun kendi dolgusuyla accent arasında: birincil accent'e
 * yakın, ikincil yarı yolda. SAYDAMLIK DEĞİL karışım, çünkü saydam bantlar
 * üst üste bindikçe koyulaşıyor ve "iki ton" bölgeden bölgeye değişiyordu.
 * Uzak uzuvda karışım uzak dolgudan yapılıyor, yani ton kendiliğinden geri çekiliyor.
 */
export const TINT_MIX: Record<FigureTint['level'], number> = { primary: 0.78, secondary: 0.38 };

/**
 * Kemiği BAŞA doğru giden parçalar. `partTransform` yerel +Y'yi kemik yönüne
 * çeviriyor; leğenden yukarı giden bir kemikte bu 180° dönüş demek, yani bu
 * parçalarda yerel +X figürün ARKASINA düşüyor. Ölçüldü: hinge'de bel
 * kası bandı +X'e konunca göğsün altında, yere bakan yüzde çıktı.
 */
const HEADWARD: ReadonlySet<FigurePart> = new Set(['lumbar', 'thorax', 'neck']);

/**
 * Bandın parça yerel uzayındaki elipsi — kas KARNI: ortası dolu, iki ucu
 * sivrilerek biter. Dikdörtgen uzvu enine düz bir çizgiyle kesiyordu ve kas
 * değil yapıştırılmış şerit gibi okunuyordu.
 *
 * Merkez uzvun ön ya da arka yarısının ortasında, yatay yarıçap orta çizgiyi
 * biraz aşacak kadar: elips parça siluetiyle KIRPILIYOR, yani dış kenarı
 * uzvun kendi hattını izliyor, iç kenarı orta çizginin hemen ötesinde yumuşak
 * bir kavisle bitiyor.
 */
export const tintEllipse = (q: MusclePatch, len: number): { cx: number; cy: number; rx: number; ry: number } => {
  const front = q.side === 'front' !== HEADWARD.has(q.part);
  return { cx: front ? 40 : -40, cy: ((q.u0 + q.u1) / 2) * len, rx: 46, ry: Math.max(0, ((q.u1 - q.u0) / 2) * len) };
};
