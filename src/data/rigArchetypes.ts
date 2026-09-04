// ÜRETİLMİŞ DOSYA — elle düzenleme. Kaynak: marte06/scripts/build_rig_archetypes.py
//
// Eklemli kuklanın (src/utils/rig.ts) her arketip için açı kareleri. Beş
// hareket Motion Rig tasarımında elle yazıldı; kalanlar eski koordinat
// karelerinden açıya çevrildi.

import { RigExercise } from '@/utils/rig';

export const RIG_ARCHETYPES: Record<string, RigExercise> = {
  squat: {
    mode: 'stand', arm: 'angles', bar: 'back', bend: 1, dur: 3600,
    kf: [
      { t: 0.0, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 1, neckA: 3, upperA: 213, foreA: 332 } },
      { t: 0.42, tr: 'Alt nokta', p: { shinA: 203, thighA: 100, torso: 40, thoraxA: 36, neckA: 24, upperA: 213, foreA: 332 } },
      { t: 0.55, tr: 'Alt nokta', p: { shinA: 203, thighA: 100, torso: 40, thoraxA: 36, neckA: 24, upperA: 213, foreA: 332 } },
      { t: 1.0, tr: 'Ayakta', p: { shinA: 178, thighA: 183, torso: 5, thoraxA: 1, neckA: 3, upperA: 213, foreA: 332 } },
    ],
  },
  squat_goblet: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -1.8, thoraxA: -1.8, neckA: 0.0, thighA: 180.0, shinA: -176.6, upperA: -168.7, foreA: 163.3 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 11.4, thoraxA: 11.4, neckA: -2.4, thighA: 106.7, shinA: -146.3, upperA: -167.7, foreA: 152.6 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 11.4, thoraxA: 11.4, neckA: -2.4, thighA: 106.7, shinA: -146.3, upperA: -167.7, foreA: 152.6 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -1.8, thoraxA: -1.8, neckA: 0.0, thighA: 180.0, shinA: -176.6, upperA: -168.7, foreA: 163.3 } },
    ],
  },
  hinge: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3800,
    kf: [
      { t: 0.0, tr: 'Kurulum', p: { shinA: 198, thighA: 118, torso: 72, thoraxA: 68, neckA: 54, upperA: 181, foreA: 180 } },
      { t: 0.12, tr: 'Kasilma', p: { shinA: 197, thighA: 120, torso: 70, thoraxA: 66, neckA: 52, upperA: 181, foreA: 180 } },
      { t: 0.5, tr: 'Kilit', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 182 } },
      { t: 0.62, tr: 'Kilit', p: { shinA: 178, thighA: 182, torso: 4, thoraxA: 2, neckA: 2, upperA: 184, foreA: 182 } },
      { t: 1.0, tr: 'Inis', p: { shinA: 198, thighA: 118, torso: 72, thoraxA: 68, neckA: 54, upperA: 181, foreA: 180 } },
    ],
  },
  hip_hinge_dumbbell: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -1.7, thoraxA: -1.7, neckA: 0.0, thighA: 180.0, shinA: -176.6, upperA: 180.0, foreA: 176.8 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -44.0, thoraxA: -44.0, neckA: 70.1, thighA: -148.3, shinA: -170.0, upperA: 156.1, foreA: 168.2 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -44.0, thoraxA: -44.0, neckA: 70.1, thighA: -148.3, shinA: -170.0, upperA: 156.1, foreA: 168.2 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -1.7, thoraxA: -1.7, neckA: 0.0, thighA: 180.0, shinA: -176.6, upperA: 180.0, foreA: 176.8 } },
    ],
  },
  hip_thrust: {
    mode: 'quad', arm: 'angles', bar: 'back', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -55.0, thoraxA: -55.0, neckA: -84.8, thighA: 90.0, shinA: 180.0, upperA: 180.0, foreA: 180.0 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -86.5, thoraxA: -86.5, neckA: -89.5, thighA: 138.0, shinA: 180.0, upperA: -172.3, foreA: 180.0 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -86.5, thoraxA: -86.5, neckA: -89.5, thighA: 138.0, shinA: 180.0, upperA: -172.3, foreA: 180.0 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -55.0, thoraxA: -55.0, neckA: -84.8, thighA: 90.0, shinA: 180.0, upperA: 180.0, foreA: 180.0 } },
    ],
  },
  bench_press: {
    mode: 'bench', arm: 'ik', bar: 'hands', bend: -1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Goguste', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 96, hx: -46, hy: -58 } },
      { t: 0.45, tr: 'Kilit', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 94, hx: -34, hy: -148 } },
      { t: 0.58, tr: 'Kilit', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 94, hx: -34, hy: -148 } },
      { t: 1.0, tr: 'Goguste', p: { thighA: 250, shinA: 150, torso: 88, thoraxA: 92, neckA: 96, hx: -46, hy: -58 } },
    ],
  },
  incline_press: {
    mode: 'bench', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -69.1, thoraxA: -69.1, neckA: -61.4, thighA: 117.8, shinA: 171.3, upperA: 8.1, foreA: -4.4 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -69.1, thoraxA: -69.1, neckA: -61.4, thighA: 117.8, shinA: 171.3, upperA: 39.8, foreA: -88.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -69.1, thoraxA: -69.1, neckA: -61.4, thighA: 117.8, shinA: 171.3, upperA: 39.8, foreA: -88.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -69.1, thoraxA: -69.1, neckA: -61.4, thighA: 117.8, shinA: 171.3, upperA: 8.1, foreA: -4.4 } },
    ],
  },
  seated_overhead_press: {
    mode: 'stand', arm: 'ik', bar: 'hands', bend: 1, dur: 3200,
    kf: [
      { t: 0.0, tr: 'Omuzda', p: { shinA: 176, thighA: 184, torso: 6, thoraxA: 3, neckA: 8, hx: 26, hy: -4 } },
      { t: 0.22, tr: 'Itis', p: { shinA: 178, thighA: 183, torso: 4, thoraxA: 2, neckA: 2, hx: 12, hy: -72 } },
      { t: 0.45, tr: 'Tepe', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: -2, hx: 0, hy: -142 } },
      { t: 0.58, tr: 'Tepe', p: { shinA: 178, thighA: 182, torso: 2, thoraxA: 1, neckA: -2, hx: 0, hy: -142 } },
      { t: 0.8, tr: 'Inis', p: { shinA: 178, thighA: 183, torso: 4, thoraxA: 2, neckA: 2, hx: 12, hy: -72 } },
      { t: 1.0, tr: 'Omuzda', p: { shinA: 176, thighA: 184, torso: 6, thoraxA: 3, neckA: 8, hx: 26, hy: -4 } },
    ],
  },
  standing_row_hinged: {
    mode: 'quad', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 170.0, foreA: 176.4 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 108.4, foreA: -177.7 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 108.4, foreA: -177.7 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 170.0, foreA: 176.4 } },
    ],
  },
  pullup: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 165.1, shinA: 172.9, upperA: 40.9, foreA: 16.4 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -8.5, thoraxA: -8.5, neckA: 16.1, thighA: 164.3, shinA: 174.7, upperA: 66.9, foreA: 14.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -8.5, thoraxA: -8.5, neckA: 16.1, thighA: 164.3, shinA: 174.7, upperA: 66.9, foreA: 14.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 165.1, shinA: 172.9, upperA: 40.9, foreA: 16.4 } },
    ],
  },
  unilateral_lunge: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -1.8, thoraxA: -1.8, neckA: 0.0, thighA: 180.0, shinA: -176.6, upperA: -151.7, foreA: 170.5 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 2.8, thoraxA: 2.8, neckA: -6.9, thighA: 120.3, shinA: 180.0, upperA: -153.9, foreA: 174.3 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 2.8, thoraxA: 2.8, neckA: -6.9, thighA: 120.3, shinA: 180.0, upperA: -153.9, foreA: 174.3 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -1.8, thoraxA: -1.8, neckA: 0.0, thighA: 180.0, shinA: -176.6, upperA: -151.7, foreA: 170.5 } },
    ],
  },
  step_up: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -1.9, thoraxA: -1.9, neckA: -4.8, thighA: 180.0, shinA: 180.0, upperA: -155.2, foreA: 170.5 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 7.3, thoraxA: 7.3, neckA: -19.1, thighA: 150.2, shinA: 180.0, upperA: -160.8, foreA: -179.5 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 7.3, thoraxA: 7.3, neckA: -19.1, thighA: 150.2, shinA: 180.0, upperA: -160.8, foreA: -179.5 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -1.9, thoraxA: -1.9, neckA: -4.8, thighA: 180.0, shinA: 180.0, upperA: -155.2, foreA: 170.5 } },
    ],
  },
  calf_raise: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: -173.7, upperA: -162.9, foreA: 175.6 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: -173.7, upperA: -162.9, foreA: 175.6 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: -173.7, upperA: -162.9, foreA: 175.6 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: -173.7, upperA: -162.9, foreA: 175.6 } },
    ],
  },
  plank_prone: {
    mode: 'quad', arm: 'angles', bar: null, bend: 1, dur: 4000,
    kf: [
      { t: 0.0, tr: 'Duruş', p: { torso: 79.0, thoraxA: 79.0, neckA: 76.0, thighA: -105.5, shinA: -110.6, upperA: -148.4, foreA: -175.6 } },
      { t: 1.0, tr: 'Duruş', p: { torso: 79.0, thoraxA: 79.0, neckA: 76.0, thighA: -105.5, shinA: -110.6, upperA: -148.4, foreA: -175.6 } },
    ],
  },
  side_plank: {
    mode: 'quad', arm: 'angles', bar: null, bend: 1, dur: 4000,
    kf: [
      { t: 0.0, tr: 'Duruş', p: { torso: 66.6, thoraxA: 66.6, neckA: 61.9, thighA: -111.3, shinA: -116.6, upperA: -160.6, foreA: 180.0 } },
      { t: 1.0, tr: 'Duruş', p: { torso: 66.6, thoraxA: 66.6, neckA: 61.9, thighA: -111.3, shinA: -116.6, upperA: -160.6, foreA: 180.0 } },
    ],
  },
  floor_core_supine: {
    mode: 'bench', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -36.9, shinA: -118.1, upperA: -42.3, foreA: 0.0 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -87.0, shinA: -90.2, upperA: 38.7, foreA: 24.3 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -87.0, shinA: -90.2, upperA: 38.7, foreA: 24.3 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -36.9, shinA: -118.1, upperA: -42.3, foreA: 0.0 } },
    ],
  },
  bird_dog: {
    mode: 'quad', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 77.9, thighA: 180.0, shinA: 180.0, upperA: 180.0, foreA: 180.0 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 88.4, thoraxA: 88.4, neckA: 72.5, thighA: -77.8, shinA: -77.5, upperA: 176.4, foreA: 180.0 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 88.4, thoraxA: 88.4, neckA: 72.5, thighA: -77.8, shinA: -77.5, upperA: 176.4, foreA: 180.0 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 77.9, thighA: 180.0, shinA: 180.0, upperA: 180.0, foreA: 180.0 } },
    ],
  },
  quadruped_spine: {
    mode: 'quad', arm: 'floor', bar: null, bend: 1, dur: 5200,
    kf: [
      { t: 0.0, tr: 'Notr', p: { thighA: 180, shinA: 268, torso: 76, thoraxA: 76, neckA: 84, hx: 24 } },
      { t: 0.24, tr: 'Kedi', p: { thighA: 180, shinA: 268, torso: 60, thoraxA: 92, neckA: 128, hx: 20 } },
      { t: 0.38, tr: 'Kedi', p: { thighA: 180, shinA: 268, torso: 60, thoraxA: 92, neckA: 128, hx: 20 } },
      { t: 0.72, tr: 'Inek', p: { thighA: 180, shinA: 268, torso: 92, thoraxA: 60, neckA: 44, hx: 28 } },
      { t: 0.86, tr: 'Inek', p: { thighA: 180, shinA: 268, torso: 92, thoraxA: 60, neckA: 44, hx: 28 } },
      { t: 1.0, tr: 'Notr', p: { thighA: 180, shinA: 268, torso: 76, thoraxA: 76, neckA: 84, hx: 24 } },
    ],
  },
  hinged_fly: {
    mode: 'quad', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 172.9, foreA: 176.4 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 131.1, foreA: 22.7 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 131.1, foreA: 22.7 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -48.6, thoraxA: -48.6, neckA: -45.0, thighA: -143.7, shinA: -170.0, upperA: 172.9, foreA: 176.4 } },
    ],
  },
  anti_rotation_standing: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: -123.7, foreA: -90.0 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: 180.0, foreA: 71.0 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: 180.0, foreA: 71.0 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: -123.7, foreA: -90.0 } },
    ],
  },
  carry: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: -162.6, shinA: -166.0, upperA: -159.0, foreA: -176.2 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -0.5, thoraxA: -0.5, neckA: 0.0, thighA: 156.4, shinA: 166.0, upperA: -157.9, foreA: -176.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -0.5, thoraxA: -0.5, neckA: 0.0, thighA: 156.4, shinA: 166.0, upperA: -157.9, foreA: -176.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: -162.6, shinA: -166.0, upperA: -159.0, foreA: -176.2 } },
    ],
  },
  standing_arm_isolation: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: 175.9 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: -33.7 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: -33.7 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: 175.9 } },
    ],
  },
  rollout: {
    mode: 'quad', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 53.8, thoraxA: 53.8, neckA: 56.3, thighA: -152.1, shinA: -90.0, upperA: 150.3, foreA: 166.8 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 77.3, thoraxA: 77.3, neckA: 66.5, thighA: -108.5, shinA: -89.7, upperA: 112.6, foreA: 112.7 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 77.3, thoraxA: 77.3, neckA: 66.5, thighA: -108.5, shinA: -89.7, upperA: 112.6, foreA: 112.7 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 53.8, thoraxA: 53.8, neckA: 56.3, thighA: -152.1, shinA: -90.0, upperA: 150.3, foreA: 166.8 } },
    ],
  },
  bulgarian_split_squat: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: -1.8, thoraxA: -1.8, neckA: -4.8, thighA: 173.7, shinA: 180.0, upperA: -151.7, foreA: 170.5 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: -2.1, thoraxA: -2.1, neckA: -4.5, thighA: 113.8, shinA: -162.9, upperA: -151.0, foreA: 169.6 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: -2.1, thoraxA: -2.1, neckA: -4.5, thighA: 113.8, shinA: -162.9, upperA: -151.0, foreA: 169.6 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: -1.8, thoraxA: -1.8, neckA: -4.8, thighA: 173.7, shinA: 180.0, upperA: -151.7, foreA: 170.5 } },
    ],
  },
  glute_bridge: {
    mode: 'quad', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -57.0, shinA: -154.7, upperA: 166.0, foreA: -97.1 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 126.9, thoraxA: 126.9, neckA: 98.8, thighA: -108.4, shinA: -154.7, upperA: 146.3, foreA: -124.4 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 126.9, thoraxA: 126.9, neckA: 98.8, thighA: -108.4, shinA: -154.7, upperA: 146.3, foreA: -124.4 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -57.0, shinA: -154.7, upperA: 166.0, foreA: -97.1 } },
    ],
  },
  chest_supported_row: {
    mode: 'quad', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 59.0, thoraxA: 59.0, neckA: 55.3, thighA: -150.9, shinA: -165.1, upperA: -162.6, foreA: -172.9 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 59.0, thoraxA: 59.0, neckA: 55.3, thighA: -150.9, shinA: -165.1, upperA: 162.8, foreA: -22.4 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 59.0, thoraxA: 59.0, neckA: 55.3, thighA: -150.9, shinA: -165.1, upperA: 162.8, foreA: -22.4 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 59.0, thoraxA: 59.0, neckA: 55.3, thighA: -150.9, shinA: -165.1, upperA: -162.6, foreA: -172.9 } },
    ],
  },
  chin_tuck_side: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 22.6, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: 175.9 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: -8.8, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: 175.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: -8.8, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: 175.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 22.6, thighA: 180.0, shinA: 180.0, upperA: -171.3, foreA: 175.9 } },
    ],
  },
  arm_circles_front: {
    mode: 'stand', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 132.7, foreA: 143.1 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 63.4, foreA: 27.0 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 63.4, foreA: 27.0 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 132.7, foreA: 143.1 } },
    ],
  },
  lateral_raise_front: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 144.5, foreA: 167.0 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 99.5, foreA: 82.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 99.5, foreA: 82.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 144.5, foreA: 167.0 } },
    ],
  },
  shrug_front: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 143.7, foreA: 171.9 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 143.7, foreA: 171.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 143.7, foreA: 171.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 143.7, foreA: 171.9 } },
    ],
  },
  hanging_knee_raise: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.2, upperA: 43.0, foreA: 15.9 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 45.0, shinA: -163.8, upperA: 43.0, foreA: 15.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 45.0, shinA: -163.8, upperA: 43.0, foreA: 15.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.2, upperA: 43.0, foreA: 15.9 } },
    ],
  },
  curl_up_supine: {
    mode: 'quad', arm: 'angles', bar: null, bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -46.8, shinA: -137.0, upperA: 116.6, foreA: -95.2 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 81.6, thoraxA: 81.6, neckA: 81.2, thighA: -46.8, shinA: -137.0, upperA: 133.8, foreA: -115.2 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 81.6, thoraxA: 81.6, neckA: 81.2, thighA: -46.8, shinA: -137.0, upperA: 133.8, foreA: -115.2 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 90.0, thoraxA: 90.0, neckA: 90.0, thighA: -46.8, shinA: -137.0, upperA: 116.6, foreA: -95.2 } },
    ],
  },
  band_pull_apart_front: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 105.9, foreA: 135.0 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 96.3, foreA: 92.0 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 96.3, foreA: 92.0 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 105.9, foreA: 135.0 } },
    ],
  },
  band_ext_rotation_front: {
    mode: 'stand', arm: 'angles', bar: 'hands', bend: 1, dur: 3400,
    kf: [
      { t: 0.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 149.5, foreA: -100.3 } },
      { t: 0.42, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 149.5, foreA: 85.9 } },
      { t: 0.55, tr: 'Bitiş', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 149.5, foreA: 85.9 } },
      { t: 1.0, tr: 'Başlangıç', p: { torso: 0.0, thoraxA: 0.0, neckA: 0.0, thighA: 166.0, shinA: 175.9, upperA: 149.5, foreA: -100.3 } },
    ],
  },
};
