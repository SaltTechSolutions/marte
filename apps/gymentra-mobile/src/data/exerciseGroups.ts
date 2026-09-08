/**
 * Hareketlerin raflara dizilişi (PER-19).
 *
 * Elle yazılıyor, üretilmiyor: gruplama hareketin bir özelliği değil, bir
 * antrenörün nasıl aradığına dair editoryal bir karar ("çekiş lazım"). Hem
 * kütüphane ekranı hem programı kuran seçici okuyor, o yüzden ikisinin de
 * içinde durmuyor.
 *
 * BURADA OLMAYAN BİR KİMLİK YAZILAMAZ. Bir zamanlar 12 kimlik burada
 * duruyordu ama hiçbir harekete karşılık gelmiyordu (`leg-press`,
 * `face-pull`, `dead-bug`, ...); ekran onları sessizce eliyordu, yani raf
 * boş kalıyordu ve kimse fark etmiyordu. Gerçek boşluk dolduranlar eklendi
 * (`pullup`, `lat-pulldown`, `leg-curl`), geri kalanlar var olan bir
 * hareketin ekipman türevi olduğu için silindi. `exerciseGroups.test.ts`
 * artık bunu bekliyor.
 */
export const LIBRARY_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: 'ALT VÜCUT',
    ids: [
      'goblet-squat', 'back-squat', 'front-hack-squat', 'rdl', 'deadlift',
      'hip-thrust', 'bulgarian-split-squat', 'walking-lunge', 'reverse-lunge', 'step-up',
      'leg-curl', 'calf-raise',
    ],
  },
  { label: 'İTİŞ', ids: ['bench-press', 'incline-press', 'shoulder-press'] },
  {
    label: 'ÇEKİŞ',
    ids: ['pullup', 'lat-pulldown', 'barbell-row', 'single-arm-row', 'reverse-fly'],
  },
  { label: 'KOL · OMUZ', ids: ['lateral-raise', 'biceps-curl', 'triceps-extension', 'shrug'] },
  {
    label: 'CORE',
    ids: [
      'plank', 'side-plank', 'bird-dog', 'pallof-press',
      'ab-wheel-rollout', 'hanging-knee-raise', 'suitcase-carry', 'glute-bridge',
    ],
  },
  {
    label: 'ISINMA',
    ids: ['arm-circles', 'cat-cow', 'band-pull-apart', 'band-external-rotation', 'chin-tuck', 'worlds-greatest-stretch'],
  },
];
