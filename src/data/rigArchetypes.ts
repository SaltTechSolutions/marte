import { RigExercise } from '@/utils/rig';

/**
 * Her hareketin açı kareleri (bkz. src/utils/rig.ts).
 *
 * Açılar dünya uzayında, derece: 0 = yukarı, saat yönünde artar. Figür +x
 * yönüne bakar. `thighA` kalçadan dize, `shinA` dizden ayak bileğine,
 * `torso` kalçadan bele, `upperA` omuzdan dirseğe, `foreA` dirsekten bileğe.
 * `...F` uzak taraf; yazılmazsa yakın taraftan birkaç derece kaydırılır.
 *
 * ELLE yazıldı. Bir dönem bunlar eski koordinat karelerinden otomatik
 * çevrildi: açılar doğru çıkıyordu ama hareketin NE olduğu bilinmediği için
 * tek bacaklı işler iki bacakla, asılmalar yerde, sırtüstü hareketler ayakta
 * yapılıyordu. Her arketip artık hareketin kendi mekaniğine göre yazılı;
 * ölçüler rig.test.ts'te denetleniyor (ayak yerde mi, eklem zeminin altına
 * geçiyor mu, diz insan aralığında bükülüyor mu).
 */
export const RIG_ARCHETYPES: Record<string, RigExercise> = {
  // --- Çömelme kalıbı ---------------------------------------------------
  squat: {
    mode: 'stand', arm: 'angles', bar: 'back', bend: 1, dur: 3600,
    kf: [
      { t: 0, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 1, neckA: 3, upperA: 213, foreA: 332 } },
      { t: 0.42, tr: 'Alt nokta', p: { shinA: 203, thighA: 100, torso: 40, thoraxA: 36, neckA: 24, upperA: 213, foreA: 332 } },
      { t: 0.55, tr: 'Alt nokta', p: { shinA: 203, thighA: 100, torso: 40, thoraxA: 36, neckA: 24, upperA: 213, foreA: 332 } },
      { t: 1, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 1, neckA: 3, upperA: 213, foreA: 332 } },
    ],
  },
  // Ağırlık göğüste: gövde squat'tan dik, derinlik biraz daha az.
  squat_goblet: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3600,
    kf: [
      { t: 0, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 6, thoraxA: 3, neckA: 3, upperA: 205, foreA: 62 } },
      { t: 0.42, tr: 'Alt nokta', p: { shinA: 202, thighA: 99, torso: 28, thoraxA: 24, neckA: 14, upperA: 205, foreA: 62 } },
      { t: 0.55, tr: 'Alt nokta', p: { shinA: 202, thighA: 99, torso: 28, thoraxA: 24, neckA: 14, upperA: 205, foreA: 62 } },
      { t: 1, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 6, thoraxA: 3, neckA: 3, upperA: 205, foreA: 62 } },
    ],
  },
  bulgarian_split_squat: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3800, prop: 'bench',
    kf: [
      { t: 0, tr: 'Üst', p: { shinA: 180, thighA: 178, torso: 10, thoraxA: 6, neckA: 4, upperA: 186, foreA: 184, thighF: 230, shinF: 240 } },
      { t: 0.45, tr: 'Alt', p: { shinA: 194, thighA: 120, torso: 20, thoraxA: 14, neckA: 8, upperA: 186, foreA: 184, thighF: 245, shinF: 260 } },
      { t: 0.57, tr: 'Alt', p: { shinA: 194, thighA: 120, torso: 20, thoraxA: 14, neckA: 8, upperA: 186, foreA: 184, thighF: 245, shinF: 260 } },
      { t: 1, tr: 'Üst', p: { shinA: 180, thighA: 178, torso: 10, thoraxA: 6, neckA: 4, upperA: 186, foreA: 184, thighF: 230, shinF: 240 } },
    ],
  },
  // Geri hamle: ön diz ~90°, arka diz yere yaklaşır, arka topuk havada.
  unilateral_lunge: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3800,
    kf: [
      { t: 0, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 3, neckA: 3, upperA: 182, foreA: 180, thighF: 190, shinF: 178 } },
      { t: 0.45, tr: 'Alt', p: { shinA: 190, thighA: 95, torso: 8, thoraxA: 5, neckA: 4, upperA: 182, foreA: 180, thighF: 212, shinF: 297 } },
      { t: 0.57, tr: 'Alt', p: { shinA: 190, thighA: 95, torso: 8, thoraxA: 5, neckA: 4, upperA: 182, foreA: 180, thighF: 212, shinF: 297 } },
      { t: 1, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 3, neckA: 3, upperA: 182, foreA: 180, thighF: 190, shinF: 178 } },
    ],
  },
  // Ayak basamakta (ankleLift), diğer bacak yerden kalkıp diz yukarı gelir.
  step_up: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3600, prop: 'box',
    kf: [
      { t: 0, tr: 'Başlangıç', p: { ankleLift: 92, shinA: 200, thighA: 100, torso: 22, thoraxA: 16, neckA: 8, upperA: 184, foreA: 182, thighF: 215, shinF: 200 } },
      { t: 0.45, tr: 'Yukarı', p: { ankleLift: 92, shinA: 178, thighA: 183, torso: 8, thoraxA: 4, neckA: 3, upperA: 184, foreA: 182, thighF: 60, shinF: 150 } },
      { t: 0.57, tr: 'Yukarı', p: { ankleLift: 92, shinA: 178, thighA: 183, torso: 8, thoraxA: 4, neckA: 3, upperA: 184, foreA: 182, thighF: 60, shinF: 150 } },
      { t: 1, tr: 'Başlangıç', p: { ankleLift: 92, shinA: 200, thighA: 100, torso: 22, thoraxA: 16, neckA: 8, upperA: 184, foreA: 182, thighF: 215, shinF: 200 } },
    ],
  },

  // --- Kalça menteşesi --------------------------------------------------
  hinge: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3800,
    kf: [
      { t: 0, tr: 'Kurulum', p: { shinA: 198, thighA: 118, torso: 72, thoraxA: 68, neckA: 54, upperA: 181, foreA: 180 } },
      { t: 0.12, tr: 'Kasılma', p: { shinA: 197, thighA: 120, torso: 70, thoraxA: 66, neckA: 52, upperA: 181, foreA: 180 } },
      { t: 0.5, tr: 'Kilit', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 182 } },
      { t: 0.62, tr: 'Kilit', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 182 } },
      { t: 1, tr: 'İniş', p: { shinA: 198, thighA: 118, torso: 72, thoraxA: 68, neckA: 54, upperA: 181, foreA: 180 } },
    ],
  },
  // Romen: diz açısı neredeyse sabit, hareketin tamamı kalçadan. Kollar
  // dünyaya göre dik sarkar — ağırlık bacağın önünden aşağı iner.
  hip_hinge_dumbbell: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3800,
    kf: [
      { t: 0, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 3, neckA: 3, upperA: 180, foreA: 180 } },
      { t: 0.45, tr: 'Alt', p: { shinA: 186, thighA: 163, torso: 74, thoraxA: 70, neckA: 56, upperA: 180, foreA: 180 } },
      { t: 0.57, tr: 'Alt', p: { shinA: 186, thighA: 163, torso: 74, thoraxA: 70, neckA: 56, upperA: 180, foreA: 180 } },
      { t: 1, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 3, neckA: 3, upperA: 180, foreA: 180 } },
    ],
  },
  // Sırt sehpada, ayaklar yerde: kalça yerden yukarı, dizler ~90°'de sabit.
  hip_thrust: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0, tr: 'Alt', p: { shinA: 172, thighA: 62, torso: 296, thoraxA: 292, neckA: 286, upperA: 250, foreA: 248 } },
      { t: 0.42, tr: 'Kilit', p: { shinA: 178, thighA: 92, torso: 285, thoraxA: 282, neckA: 278, upperA: 250, foreA: 248 } },
      { t: 0.56, tr: 'Kilit', p: { shinA: 178, thighA: 92, torso: 285, thoraxA: 282, neckA: 278, upperA: 250, foreA: 248 } },
      { t: 1, tr: 'Alt', p: { shinA: 172, thighA: 62, torso: 296, thoraxA: 292, neckA: 286, upperA: 250, foreA: 248 } },
    ],
  },
  // Omuzlar yerde: kalça kalkarken omuz yerde kalır, gövde açısı buna göre açılır.
  glute_bridge: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0, tr: 'Alt', p: { shinA: 170, thighA: 50, torso: 272, thoraxA: 270, neckA: 268, upperA: 250, foreA: 250 } },
      { t: 0.42, tr: 'Kilit', p: { shinA: 178, thighA: 88, torso: 240, thoraxA: 246, neckA: 252, upperA: 250, foreA: 250 } },
      { t: 0.56, tr: 'Kilit', p: { shinA: 178, thighA: 88, torso: 240, thoraxA: 246, neckA: 252, upperA: 250, foreA: 250 } },
      { t: 1, tr: 'Alt', p: { shinA: 170, thighA: 50, torso: 272, thoraxA: 270, neckA: 268, upperA: 250, foreA: 250 } },
    ],
  },
  calf_raise: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 2600,
    kf: [
      { t: 0, tr: 'Topuk yerde', p: { ankleLift: 0, shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 180, foreA: 180 } },
      { t: 0.4, tr: 'Tepe', p: { ankleLift: 42, shinA: 174, thighA: 181, torso: 4, thoraxA: 2, neckA: 2, upperA: 180, foreA: 180 } },
      { t: 0.55, tr: 'Tepe', p: { ankleLift: 42, shinA: 174, thighA: 181, torso: 4, thoraxA: 2, neckA: 2, upperA: 180, foreA: 180 } },
      { t: 1, tr: 'Topuk yerde', p: { ankleLift: 0, shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 180, foreA: 180 } },
    ],
  },

  // --- İtiş --------------------------------------------------------------
  bench_press: {
    mode: 'bench', arm: 'ik', bar: 'hands', bend: -1, dur: 3400, prop: 'bench',
    kf: [
      { t: 0, tr: 'Göğüste', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 96, hx: -46, hy: -58 } },
      { t: 0.45, tr: 'Kilit', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 94, hx: -34, hy: -148 } },
      { t: 0.58, tr: 'Kilit', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 94, hx: -34, hy: -148 } },
      { t: 1, tr: 'Göğüste', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 96, hx: -46, hy: -58 } },
    ],
  },
  incline_press: {
    mode: 'bench', arm: 'ik', bar: 'hands', bend: -1, dur: 3400, prop: 'bench',
    kf: [
      { t: 0, tr: 'Göğüste', p: { thighA: 250, shinA: 150, torso: 68, thoraxA: 72, neckA: 76, hx: -40, hy: -52 } },
      { t: 0.45, tr: 'Kilit', p: { thighA: 250, shinA: 150, torso: 68, thoraxA: 72, neckA: 74, hx: -26, hy: -134 } },
      { t: 0.58, tr: 'Kilit', p: { thighA: 250, shinA: 150, torso: 68, thoraxA: 72, neckA: 74, hx: -26, hy: -134 } },
      { t: 1, tr: 'Göğüste', p: { thighA: 250, shinA: 150, torso: 68, thoraxA: 72, neckA: 76, hx: -40, hy: -52 } },
    ],
  },
  seated_overhead_press: {
    mode: 'stand', arm: 'ik', bar: 'hands', bend: 1, dur: 3200,
    kf: [
      { t: 0, tr: 'Omuzda', p: { shinA: 176, thighA: 184, torso: 6, thoraxA: 3, neckA: 8, hx: 26, hy: -4 } },
      { t: 0.22, tr: 'İtiş', p: { shinA: 178, thighA: 183, torso: 4, thoraxA: 2, neckA: 2, hx: 12, hy: -72 } },
      { t: 0.45, tr: 'Tepe', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: -2, hx: 0, hy: -142 } },
      { t: 0.58, tr: 'Tepe', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: -2, hx: 0, hy: -142 } },
      { t: 0.8, tr: 'İniş', p: { shinA: 178, thighA: 183, torso: 4, thoraxA: 2, neckA: 2, hx: 12, hy: -72 } },
      { t: 1, tr: 'Omuzda', p: { shinA: 176, thighA: 184, torso: 6, thoraxA: 3, neckA: 8, hx: 26, hy: -4 } },
    ],
  },

  // --- Çekiş -------------------------------------------------------------
  // Menteşede kürek: gövde sabit ~65°, hareket yalnızca kollardan.
  standing_row_hinged: {
    mode: 'stand', arm: 'ik', bar: 'hands', bend: 1, dur: 3200,
    kf: [
      { t: 0, tr: 'Uzanma', p: { shinA: 188, thighA: 150, torso: 66, thoraxA: 62, neckA: 50, hx: 6, hy: 96 } },
      { t: 0.42, tr: 'Çekiş', p: { shinA: 188, thighA: 150, torso: 64, thoraxA: 60, neckA: 48, hx: -8, hy: 34 } },
      { t: 0.56, tr: 'Çekiş', p: { shinA: 188, thighA: 150, torso: 64, thoraxA: 60, neckA: 48, hx: -8, hy: 34 } },
      { t: 1, tr: 'Uzanma', p: { shinA: 188, thighA: 150, torso: 66, thoraxA: 62, neckA: 50, hx: 6, hy: 96 } },
    ],
  },
  chest_supported_row: {
    mode: 'bench', arm: 'ik', bar: null, bend: 1, dur: 3200, prop: 'bench',
    kf: [
      { t: 0, tr: 'Uzanma', p: { thighA: 250, shinA: 150, torso: 66, thoraxA: 70, neckA: 74, hx: 14, hy: 104 } },
      { t: 0.42, tr: 'Çekiş', p: { thighA: 250, shinA: 150, torso: 66, thoraxA: 70, neckA: 74, hx: -4, hy: 40 } },
      { t: 0.56, tr: 'Çekiş', p: { thighA: 250, shinA: 150, torso: 66, thoraxA: 70, neckA: 74, hx: -4, hy: 40 } },
      { t: 1, tr: 'Uzanma', p: { thighA: 250, shinA: 150, torso: 66, thoraxA: 70, neckA: 74, hx: 14, hy: 104 } },
    ],
  },
  // Barda asılı: eller bara sabit, gövde YUKARI gelir. Zincir elden aşağı kurulur.
  pullup: {
    mode: 'hang', arm: 'angles', bar: null, bend: 1, dur: 3600, prop: 'bar',
    kf: [
      { t: 0, tr: 'Asılı', p: { upperA: 6, foreA: 4, torso: 2, thoraxA: 2, neckA: 4, thighA: 184, shinA: 212 } },
      { t: 0.42, tr: 'Tepe', p: { upperA: 118, foreA: 8, torso: 352, thoraxA: 354, neckA: 358, thighA: 196, shinA: 226 } },
      { t: 0.55, tr: 'Tepe', p: { upperA: 118, foreA: 8, torso: 352, thoraxA: 354, neckA: 358, thighA: 196, shinA: 226 } },
      { t: 1, tr: 'Asılı', p: { upperA: 6, foreA: 4, torso: 2, thoraxA: 2, neckA: 4, thighA: 184, shinA: 212 } },
    ],
  },
  hanging_knee_raise: {
    mode: 'hang', arm: 'angles', bar: null, bend: 1, dur: 3400, prop: 'bar',
    kf: [
      { t: 0, tr: 'Asılı', p: { upperA: 5, foreA: 3, torso: 2, thoraxA: 2, neckA: 3, thighA: 186, shinA: 214 } },
      { t: 0.42, tr: 'Diz yukarı', p: { upperA: 5, foreA: 3, torso: 6, thoraxA: 4, neckA: 4, thighA: 96, shinA: 152 } },
      { t: 0.55, tr: 'Diz yukarı', p: { upperA: 5, foreA: 3, torso: 6, thoraxA: 4, neckA: 4, thighA: 96, shinA: 152 } },
      { t: 1, tr: 'Asılı', p: { upperA: 5, foreA: 3, torso: 2, thoraxA: 2, neckA: 3, thighA: 186, shinA: 214 } },
    ],
  },
  // Dirsek gövdeye sabit, yalnızca ön kol döner.
  standing_arm_isolation: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3000,
    kf: [
      { t: 0, tr: 'Açık', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 178 } },
      { t: 0.42, tr: 'Bükülü', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 40 } },
      { t: 0.55, tr: 'Bükülü', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 40 } },
      { t: 1, tr: 'Açık', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 178 } },
    ],
  },

  // --- Yanal düzlem: önden okunur ---------------------------------------
  lateral_raise_front: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3200, view: 'front',
    kf: [
      { t: 0, tr: 'Yanda', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: 1, upperA: 176, foreA: 176, hxF: 44 } },
      { t: 0.42, tr: 'Omuz hizası', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: 1, upperA: 92, foreA: 92, hxF: 138 } },
      { t: 0.55, tr: 'Omuz hizası', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: 1, upperA: 92, foreA: 92, hxF: 138 } },
      { t: 1, tr: 'Yanda', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: 1, upperA: 176, foreA: 176, hxF: 44 } },
    ],
  },
  arm_circles_front: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 4200, view: 'front',
    kf: [
      { t: 0, tr: 'Aşağı', p: { shinA: 178, thighA: 182, torso: 2, upperA: 178, foreA: 178, hxF: 42 } },
      { t: 0.25, tr: 'Yanda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 92, foreA: 92, hxF: 132 } },
      { t: 0.5, tr: 'Tepede', p: { shinA: 178, thighA: 182, torso: 2, upperA: 8, foreA: 8, hxF: 64 } },
      { t: 0.75, tr: 'Yanda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 92, foreA: 92, hxF: 132 } },
      { t: 1, tr: 'Aşağı', p: { shinA: 178, thighA: 182, torso: 2, upperA: 178, foreA: 178, hxF: 42 } },
    ],
  },
  band_pull_apart_front: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3200, view: 'front',
    kf: [
      { t: 0, tr: 'Kapalı', p: { shinA: 178, thighA: 182, torso: 2, upperA: 94, foreA: 92, hxF: 56 } },
      { t: 0.42, tr: 'Açık', p: { shinA: 178, thighA: 182, torso: 2, upperA: 92, foreA: 92, hxF: 142 } },
      { t: 0.55, tr: 'Açık', p: { shinA: 178, thighA: 182, torso: 2, upperA: 92, foreA: 92, hxF: 142 } },
      { t: 1, tr: 'Kapalı', p: { shinA: 178, thighA: 182, torso: 2, upperA: 94, foreA: 92, hxF: 56 } },
    ],
  },
  band_ext_rotation_front: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3200, view: 'front',
    kf: [
      { t: 0, tr: 'İçeride', p: { shinA: 178, thighA: 182, torso: 2, upperA: 176, foreA: 96, hxF: 28 } },
      { t: 0.42, tr: 'Dışarıda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 176, foreA: 96, hxF: 78 } },
      { t: 0.55, tr: 'Dışarıda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 176, foreA: 96, hxF: 78 } },
      { t: 1, tr: 'İçeride', p: { shinA: 178, thighA: 182, torso: 2, upperA: 176, foreA: 96, hxF: 28 } },
    ],
  },
  shrug_front: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 2800, view: 'front',
    kf: [
      { t: 0, tr: 'Aşağıda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 180, foreA: 180, hxF: 52, shLift: 0 } },
      { t: 0.4, tr: 'Yukarıda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 180, foreA: 180, hxF: 52, shLift: 16 } },
      { t: 0.55, tr: 'Yukarıda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 180, foreA: 180, hxF: 52, shLift: 16 } },
      { t: 1, tr: 'Aşağıda', p: { shinA: 178, thighA: 182, torso: 2, upperA: 180, foreA: 180, hxF: 52, shLift: 0 } },
    ],
  },
  // Menteşede, kollar yanlara açılır — yanal düzlem, önden okunur.
  hinged_fly: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3400, view: 'front',
    kf: [
      { t: 0, tr: 'Aşağıda', p: { shinA: 188, thighA: 152, torso: 70, thoraxA: 66, neckA: 54, upperA: 176, foreA: 174, hxF: 46 } },
      { t: 0.42, tr: 'Açık', p: { shinA: 188, thighA: 152, torso: 70, thoraxA: 66, neckA: 54, upperA: 116, foreA: 112, hxF: 150 } },
      { t: 0.55, tr: 'Açık', p: { shinA: 188, thighA: 152, torso: 70, thoraxA: 66, neckA: 54, upperA: 116, foreA: 112, hxF: 150 } },
      { t: 1, tr: 'Aşağıda', p: { shinA: 188, thighA: 152, torso: 70, thoraxA: 66, neckA: 54, upperA: 176, foreA: 174, hxF: 46 } },
    ],
  },

  // --- Gövde / denge -----------------------------------------------------
  // Yüksek plank: eller ve ayak uçları yerde, gövde tek çizgi.
  plank_prone: {
    mode: 'quad', arm: 'floor', bar: null, bend: 1, dur: 5000,
    kf: [
      { t: 0, tr: 'Duruş', p: { thighA: 239, shinA: 239, torso: 74, thoraxA: 74, neckA: 78, hx: 0 } },
      { t: 0.5, tr: 'Duruş', p: { thighA: 239, shinA: 239, torso: 75, thoraxA: 75, neckA: 80, hx: 0 } },
      { t: 1, tr: 'Duruş', p: { thighA: 239, shinA: 239, torso: 74, thoraxA: 74, neckA: 78, hx: 0 } },
    ],
  },
  // Yan plank yandan bakışta düz bir gövde çizgisi olarak okunur; tek kol
  // destekte, bacaklar üst üste (uzak taraf yakınla aynı açıda).
  side_plank: {
    mode: 'quad', arm: 'floor', bar: null, bend: 1, dur: 5000,
    kf: [
      { t: 0, tr: 'Duruş', p: { thighA: 239, shinA: 239, torso: 74, thoraxA: 74, neckA: 74, hx: -6, thighF: 239, shinF: 239 } },
      { t: 0.5, tr: 'Duruş', p: { thighA: 240, shinA: 240, torso: 75, thoraxA: 75, neckA: 75, hx: -6, thighF: 240, shinF: 240 } },
      { t: 1, tr: 'Duruş', p: { thighA: 239, shinA: 239, torso: 74, thoraxA: 74, neckA: 74, hx: -6, thighF: 239, shinF: 239 } },
    ],
  },
  quadruped_spine: {
    mode: 'quad', arm: 'floor', bar: null, bend: 1, dur: 5200,
    kf: [
      { t: 0, tr: 'Nötr', p: { thighA: 180, shinA: 268, torso: 76, thoraxA: 76, neckA: 84, hx: 24 } },
      { t: 0.24, tr: 'Kedi', p: { thighA: 180, shinA: 268, torso: 60, thoraxA: 92, neckA: 128, hx: 20 } },
      { t: 0.38, tr: 'Kedi', p: { thighA: 180, shinA: 268, torso: 60, thoraxA: 92, neckA: 128, hx: 20 } },
      { t: 0.72, tr: 'İnek', p: { thighA: 180, shinA: 268, torso: 92, thoraxA: 60, neckA: 44, hx: 28 } },
      { t: 0.86, tr: 'İnek', p: { thighA: 180, shinA: 268, torso: 92, thoraxA: 60, neckA: 44, hx: 28 } },
      { t: 1, tr: 'Nötr', p: { thighA: 180, shinA: 268, torso: 76, thoraxA: 76, neckA: 84, hx: 24 } },
    ],
  },
  // Çapraz kol ve bacak uzanır; diğer diz ve el yerde kalır.
  bird_dog: {
    mode: 'quad', arm: 'angles', bar: null, bend: 1, dur: 4600,
    kf: [
      { t: 0, tr: 'Dört ayak', p: { thighA: 180, shinA: 268, torso: 76, thoraxA: 76, neckA: 84, upperA: 172, foreA: 176, thighF: 180, shinF: 268, upperF: 172, foreF: 176 } },
      { t: 0.42, tr: 'Uzanma', p: { thighA: 180, shinA: 268, torso: 78, thoraxA: 78, neckA: 76, upperA: 66, foreA: 68, thighF: 266, shinF: 262, upperF: 172, foreF: 176 } },
      { t: 0.58, tr: 'Uzanma', p: { thighA: 180, shinA: 268, torso: 78, thoraxA: 78, neckA: 76, upperA: 66, foreA: 68, thighF: 266, shinF: 262, upperF: 172, foreF: 176 } },
      { t: 1, tr: 'Dört ayak', p: { thighA: 180, shinA: 268, torso: 76, thoraxA: 76, neckA: 84, upperA: 172, foreA: 176, thighF: 180, shinF: 268, upperF: 172, foreF: 176 } },
    ],
  },
  // Diz üstünde, tekerlek öne gider: gövde yere paralelleşir, bel çökmez.
  rollout: {
    mode: 'quad', arm: 'floor', bar: null, bend: 1, dur: 4200,
    kf: [
      { t: 0, tr: 'Diz üstü', p: { thighA: 200, shinA: 268, torso: 62, thoraxA: 62, neckA: 66, hx: 10 } },
      { t: 0.45, tr: 'Uzanma', p: { thighA: 200, shinA: 268, torso: 86, thoraxA: 84, neckA: 80, hx: 120 } },
      { t: 0.58, tr: 'Uzanma', p: { thighA: 200, shinA: 268, torso: 86, thoraxA: 84, neckA: 80, hx: 120 } },
      { t: 1, tr: 'Diz üstü', p: { thighA: 200, shinA: 268, torso: 62, thoraxA: 62, neckA: 66, hx: 10 } },
    ],
  },
  // Sırtüstü, kollar ve bacaklar havada; çapraz uzanır, bel yerde kalır.
  floor_core_supine: {
    mode: 'supine', arm: 'angles', bar: null, bend: 1, dur: 4200,
    kf: [
      { t: 0, tr: 'Masa üstü', p: { torso: 88, thoraxA: 90, neckA: 90, thighA: 10, shinA: 100, upperA: 2, foreA: -2, thighF: 14, shinF: 104, upperF: 2, foreF: -2 } },
      { t: 0.42, tr: 'Uzanma', p: { torso: 88, thoraxA: 90, neckA: 90, thighA: 10, shinA: 100, upperA: -44, foreA: -46, thighF: 66, shinF: 92, upperF: 2, foreF: -2 } },
      { t: 0.56, tr: 'Uzanma', p: { torso: 88, thoraxA: 90, neckA: 90, thighA: 10, shinA: 100, upperA: -44, foreA: -46, thighF: 66, shinF: 92, upperF: 2, foreF: -2 } },
      { t: 1, tr: 'Masa üstü', p: { torso: 88, thoraxA: 90, neckA: 90, thighA: 10, shinA: 100, upperA: 2, foreA: 358, thighF: 14, shinF: 104, upperF: 2, foreF: -2 } },
    ],
  },
  // Mekik: kalça yerde kalır, yalnızca üst sırt yerden kalkar.
  curl_up_supine: {
    mode: 'supine', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0, tr: 'Yerde', p: { torso: 88, thoraxA: 90, neckA: 92, thighA: 45, shinA: 140, upperA: 282, foreA: 330 } },
      { t: 0.42, tr: 'Kalkış', p: { torso: 86, thoraxA: 58, neckA: 62, thighA: 45, shinA: 140, upperA: 282, foreA: 330 } },
      { t: 0.56, tr: 'Kalkış', p: { torso: 86, thoraxA: 58, neckA: 62, thighA: 45, shinA: 140, upperA: 282, foreA: 330 } },
      { t: 1, tr: 'Yerde', p: { torso: 88, thoraxA: 90, neckA: 92, thighA: 45, shinA: 140, upperA: 282, foreA: 330 } },
    ],
  },
  // Pallof: eller göğüsten öne uzanır, gövde dönmeye direnir (açı sabit).
  anti_rotation_standing: {
    mode: 'stand', arm: 'ik', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0, tr: 'Göğüste', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, hx: 22, hy: 40 } },
      { t: 0.42, tr: 'İleride', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, hx: 96, hy: 24 } },
      { t: 0.58, tr: 'İleride', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, hx: 96, hy: 24 } },
      { t: 1, tr: 'Göğüste', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, hx: 22, hy: 40 } },
    ],
  },
  // Taşıma: yük yanda, gövde dik, adımla hafif salınım.
  carry: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3600,
    kf: [
      { t: 0, tr: 'Adım', p: { shinA: 178, thighA: 186, torso: 3, thoraxA: 2, neckA: 2, upperA: 180, foreA: 180, thighF: 172, shinF: 186 } },
      { t: 0.5, tr: 'Adım', p: { shinA: 178, thighA: 174, torso: 3, thoraxA: 2, neckA: 2, upperA: 180, foreA: 180, thighF: 190, shinF: 170 } },
      { t: 1, tr: 'Adım', p: { shinA: 178, thighA: 186, torso: 3, thoraxA: 2, neckA: 2, upperA: 180, foreA: 180, thighF: 172, shinF: 186 } },
    ],
  },
  // Yalnızca boyun: çene içeri, gövde kımıldamaz.
  chin_tuck_side: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3000,
    kf: [
      { t: 0, tr: 'Nötr', p: { shinA: 178, thighA: 182, torso: 3, thoraxA: 2, neckA: 8, upperA: 180, foreA: 180 } },
      { t: 0.42, tr: 'Çene içeri', p: { shinA: 178, thighA: 182, torso: 3, thoraxA: 2, neckA: 30, upperA: 180, foreA: 180 } },
      { t: 0.58, tr: 'Çene içeri', p: { shinA: 178, thighA: 182, torso: 3, thoraxA: 2, neckA: 30, upperA: 180, foreA: 180 } },
      { t: 1, tr: 'Nötr', p: { shinA: 178, thighA: 182, torso: 3, thoraxA: 2, neckA: 8, upperA: 180, foreA: 180 } },
    ],
  },
};
