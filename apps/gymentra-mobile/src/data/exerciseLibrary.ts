// GENERATED — do not hand-edit. Rebuild with
// `backend/scripts/build_exercise_library.py` (source data lives beside it).
//
// The exercise visualiser (PER-19): 45 canonical movements distilled from the
// ~146 lines across the 14 program templates (machine and cable moves were
// dropped on 3 Sep 2026 — barbell, dumbbell, bench, band and bodyweight only), each with a muscle-activation
// map and start/end pose frames. Ported from the Claude Design canvas
// "Exercise Library.dc.html", which was itself built against this app's own
// theme tokens.
//
// IMPORTANT — pose frames are ARCHETYPE-DERIVED approximations. Three of them
// (bench press, squat, deadlift) were authored joint-by-joint in the design
// file; the rest reuse a movement-pattern archetype with the same joint model.
// Every entry carries `poseReviewed: false` until a certified trainer has
// checked it, and the detail screen says so on screen. Same discipline as the
// PER-18 template content: generated is a starting point, not an authority.

/** The 39 muscle regions the anatomy SVG can shade, with their Turkish labels. */
export const MUSCLE_LABELS: Record<string, string> = {
  sterno: 'Boyun ön',
  trapFront: 'Trapez (üst-ön)',
  deltFront: 'Ön omuz',
  pecClav: 'Göğüs (üst)',
  pecSternal: 'Göğüs (orta-alt)',
  serratus: 'Serratus',
  biceps: 'Biceps',
  brachialis: 'Brachialis',
  forearmFlex: 'Ön kol bükücüler',
  absUpper: 'Karın (üst)',
  absMid: 'Karın (orta)',
  absLower: 'Karın (alt)',
  oblique: 'Yan karın',
  quadRF: 'Ön bacak (orta)',
  quadVL: 'Ön bacak (dış)',
  quadVM: 'Ön bacak (iç)',
  adductors: 'İç bacak',
  sartorius: 'Sartorius',
  tibialis: 'Ön incik',
  peroneus: 'Dış incik',
  trapUpper: 'Trapez (üst)',
  trapMid: 'Trapez (orta)',
  trapLower: 'Trapez (alt)',
  deltPost: 'Arka omuz',
  infra: 'Infraspinatus',
  teres: 'Teres major',
  lat: 'Kanat kası (lat)',
  erector: 'Bel dikleştirici',
  triLat: 'Triceps (yan baş)',
  triLong: 'Triceps (uzun baş)',
  forearmExt: 'Ön kol açıcılar',
  gluteMax: 'Kalça',
  gluteMed: 'Yan kalça',
  hamBF: 'Arka bacak (dış)',
  hamST: 'Arka bacak (iç)',
  addMagnus: 'İç bacak (arka)',
  gastroLat: 'Baldır (dış baş)',
  gastroMed: 'Baldır (iç baş)',
  soleus: 'Soleus',
};

export type MuscleId = keyof typeof MUSCLE_LABELS;
export type Activation = 'primary' | 'secondary';

// --- Anatomy: one body half; the map mirrors it to draw the other side. ---
export const FRONT_PATHS: { d: string; muscle: string | null }[] = [
  { d: 'M100 8 C88 8 80 18 80 32 C80 46 88 58 100 58 Z', muscle: null },
  { d: 'M100 52 L88 56 C86 62 86 70 84 74 L100 74 Z', muscle: null },
  { d: 'M100 74 L70 74 C54 77 42 87 40 100 C39 113 45 125 49 136 C53 148 56 159 58 171 C60 185 62 197 62 209 C62 221 64 231 66 239 L100 239 Z', muscle: null },
  { d: 'M41 86 C32 92 27 108 25 126 C24 142 26 154 28 164 L42 165 C41 150 42 130 45 114 C47 102 50 92 52 86 Z', muscle: null },
  { d: 'M28 166 C25 182 23 205 22 224 C21 234 21 240 22 246 L36 246 C36 232 38 210 40 192 C41 180 42 172 42 166 Z', muscle: null },
  { d: 'M22 248 C20 260 21 272 25 276 C30 280 35 276 36 268 C37 260 36 252 36 248 Z', muscle: null },
  { d: 'M66 240 C61 262 60 288 63 308 C65 320 67 328 69 336 L96 336 C97 320 98 296 98 274 C98 258 99 248 99 240 Z', muscle: null },
  { d: 'M69 336 L96 336 L95 353 L71 353 Z', muscle: null },
  { d: 'M71 352 C69 372 71 392 74 408 L92 408 C93 390 94 370 94 352 Z', muscle: null },
  { d: 'M74 408 C73 416 72 424 74 428 L96 428 C98 424 97 416 95 408 Z', muscle: null },
  { d: 'M80 338 C76 340 75 348 79 350 C86 351 92 348 91 341 C89 337 84 337 80 338 Z', muscle: null },
  { d: 'M96 58 C92 62 89 68 87 74 L93 76 C95 70 98 64 100 60 Z', muscle: 'sterno' },
  { d: 'M100 76 L82 76 C70 79 58 84 50 90 L62 96 C72 90 86 88 100 88 Z', muscle: 'trapFront' },
  { d: 'M52 84 C42 88 36 100 35 116 C41 120 48 119 52 114 C54 102 58 92 64 88 Z', muscle: 'deltFront' },
  { d: 'M100 90 L66 92 C62 96 60 102 60 108 L100 106 Z', muscle: 'pecClav' },
  { d: 'M100 108 L60 110 C60 120 64 130 72 136 C82 140 94 138 100 134 Z', muscle: 'pecSternal' },
  { d: 'M62 138 C58 146 56 154 56 162 L66 160 C68 152 70 146 72 140 Z', muscle: 'serratus' },
  { d: 'M46 116 C42 128 41 142 42 156 C47 160 52 158 54 152 C54 138 54 126 54 118 Z', muscle: 'biceps' },
  { d: 'M33 120 C31 134 32 148 34 158 L41 157 C40 143 40 128 42 118 Z', muscle: 'brachialis' },
  { d: 'M29 168 C26 184 24 202 24 218 L34 218 C35 202 37 184 40 170 Z', muscle: 'forearmFlex' },
  { d: 'M100 138 L78 140 C78 150 79 158 80 166 L100 164 Z', muscle: 'absUpper' },
  { d: 'M100 168 L80 170 C81 180 82 188 83 196 L100 194 Z', muscle: 'absMid' },
  { d: 'M100 198 L83 200 C84 210 86 220 88 228 L100 226 Z', muscle: 'absLower' },
  { d: 'M76 142 C70 152 66 166 64 180 C63 192 64 202 66 210 L78 200 C77 188 77 172 78 158 Z', muscle: 'oblique' },
  { d: 'M68 246 C63 266 62 288 65 306 L76 304 C75 284 76 264 78 248 Z', muscle: 'quadVL' },
  { d: 'M80 246 C79 268 79 292 82 312 L91 310 C92 290 92 266 93 246 Z', muscle: 'quadRF' },
  { d: 'M93 296 C94 310 95 322 97 332 L86 334 C84 322 83 310 83 298 Z', muscle: 'quadVM' },
  { d: 'M96 242 C98 258 98 274 97 288 L90 286 C91 270 92 254 92 242 Z', muscle: 'adductors' },
  { d: 'M70 244 C74 262 82 286 90 306 L94 302 C86 282 78 260 75 243 Z', muscle: 'sartorius' },
  { d: 'M78 356 C76 374 77 392 79 406 L87 405 C86 390 86 372 87 356 Z', muscle: 'tibialis' },
  { d: 'M88 358 C89 374 90 390 91 404 L94 402 C93 386 93 370 93 358 Z', muscle: 'peroneus' },
];

export const BACK_PATHS: { d: string; muscle: string | null }[] = [
  { d: 'M100 8 C88 8 80 18 80 32 C80 46 88 58 100 58 Z', muscle: null },
  { d: 'M100 52 L88 56 C86 62 86 70 84 74 L100 74 Z', muscle: null },
  { d: 'M100 74 L70 74 C54 77 42 87 40 100 C39 113 45 125 49 136 C53 148 56 159 58 171 C60 185 62 197 62 209 C62 221 64 231 66 239 L100 239 Z', muscle: null },
  { d: 'M41 86 C32 92 27 108 25 126 C24 142 26 154 28 164 L42 165 C41 150 42 130 45 114 C47 102 50 92 52 86 Z', muscle: null },
  { d: 'M28 166 C25 182 23 205 22 224 C21 234 21 240 22 246 L36 246 C36 232 38 210 40 192 C41 180 42 172 42 166 Z', muscle: null },
  { d: 'M22 248 C20 260 21 272 25 276 C30 280 35 276 36 268 C37 260 36 252 36 248 Z', muscle: null },
  { d: 'M66 240 C61 262 60 288 63 308 C65 320 67 328 69 336 L96 336 C97 320 98 296 98 274 C98 258 99 248 99 240 Z', muscle: null },
  { d: 'M69 336 L96 336 L95 353 L71 353 Z', muscle: null },
  { d: 'M71 352 C69 372 71 392 74 408 L92 408 C93 390 94 370 94 352 Z', muscle: null },
  { d: 'M74 408 C73 416 72 424 74 428 L96 428 C98 424 97 416 95 408 Z', muscle: null },
  { d: 'M100 74 L84 76 C70 80 58 86 50 92 L64 98 C74 92 86 90 100 90 Z', muscle: 'trapUpper' },
  { d: 'M100 92 L62 100 C66 110 72 118 80 124 L100 122 Z', muscle: 'trapMid' },
  { d: 'M100 124 L80 126 C84 138 90 148 96 156 L100 154 Z', muscle: 'trapLower' },
  { d: 'M50 90 C42 94 36 104 35 118 C41 122 48 121 52 116 C54 104 58 96 64 92 Z', muscle: 'deltPost' },
  { d: 'M66 100 C62 108 60 116 60 124 L70 122 C71 114 73 106 76 102 Z', muscle: 'infra' },
  { d: 'M60 126 C58 132 57 138 58 144 L68 140 C68 134 69 128 70 124 Z', muscle: 'teres' },
  { d: 'M78 126 C68 132 60 142 57 156 C55 168 57 180 62 190 L76 182 C73 170 74 154 80 142 Z', muscle: 'lat' },
  { d: 'M100 128 L88 132 C86 148 86 166 88 182 C90 194 93 204 96 212 L100 210 Z', muscle: 'erector' },
  { d: 'M34 118 C31 132 31 146 33 158 L41 157 C40 143 40 128 42 116 Z', muscle: 'triLat' },
  { d: 'M44 114 C42 128 42 144 43 157 L52 155 C52 140 53 126 54 116 Z', muscle: 'triLong' },
  { d: 'M27 168 C24 184 23 202 23 218 L34 218 C35 202 37 184 40 170 Z', muscle: 'forearmExt' },
  { d: 'M74 206 C68 208 63 214 62 222 L72 226 C74 218 78 212 82 208 Z', muscle: 'gluteMed' },
  { d: 'M100 214 L76 212 C68 216 63 226 63 236 C64 246 70 252 80 252 C90 251 97 244 100 236 Z', muscle: 'gluteMax' },
  { d: 'M66 256 C62 274 62 294 65 312 L76 310 C75 292 76 272 78 256 Z', muscle: 'hamBF' },
  { d: 'M84 256 C83 276 84 296 87 312 L96 310 C96 290 96 270 96 256 Z', muscle: 'hamST' },
  { d: 'M97 252 C98 266 98 278 97 288 L90 286 C91 272 92 260 92 252 Z', muscle: 'addMagnus' },
  { d: 'M76 354 C75 370 76 384 78 394 L86 393 C86 378 86 364 87 354 Z', muscle: 'gastroLat' },
  { d: 'M88 354 C89 370 90 384 90 394 L97 392 C97 378 96 364 95 354 Z', muscle: 'gastroMed' },
  { d: 'M78 396 C79 404 80 410 82 414 L94 412 C95 406 96 400 96 396 Z', muscle: 'soleus' },
  { d: 'M83 416 C84 422 85 426 86 428 L93 427 C93 422 93 418 93 416 Z', muscle: null },
];

export interface PoseFrame {
  head: [number, number];
  shoulder: [number, number];
  elbow: [number, number];
  wrist: [number, number];
  hip: [number, number];
  knee: [number, number];
  ankle: [number, number];
  toe: [number, number];
  /**
   * The far-side limb, drawn behind the torso, only where it does something
   * different from the near one (a lunge's trailing leg, bird-dog's planted
   * leg and reaching arm). Absent means "same as the near limb" and the
   * renderer draws a faded copy — right for squats, hinges and presses.
   */
  farKnee?: [number, number];
  farAnkle?: [number, number];
  farToe?: [number, number];
  farElbow?: [number, number];
  farWrist?: [number, number];
  /** Loaded implement (bar/dumbbell/handle). Absent for bodyweight moves. */
  bar?: [number, number];
  /** [x1,y1,x2,y2] motion hint, drawn dashed on the start frame only. */
  arrow?: [number, number, number, number];
  /** Bench, box, machine pad — drawn behind the figure. */
  props?: { x: number; y: number; w: number; h: number; r?: number }[];
}

/** Which way the head looks when the toes cannot say (lying, quadruped, side plank). */
export type PoseFace = 'left' | 'right' | 'up' | 'down' | 'front';

/**
 * Start/end frames. `end: null` means an isometric hold — one frame only.
 *
 * `view: 'front'` draws the same joints mirrored across the body's centre
 * line — both arms, both legs, symmetric — for moves that only read from the
 * front (a lateral raise seen from the side is a forward raise). `face`
 * overrides the derived facing for the few frames where nothing in the
 * skeleton says which way the eyes point.
 */
export interface PoseArchetype {
  start: PoseFrame;
  end: PoseFrame | null;
  view?: 'side' | 'front';
  face?: PoseFace;
}

export const POSE_ARCHETYPES: Record<string, PoseArchetype> = {
  squat: {
    start: { head: [150.0, 46.0], shoulder: [150.0, 70.0], elbow: [134.0, 96.0], wrist: [138.0, 68.0], hip: [152.0, 134.0], knee: [152.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [146.0, 66.0], arrow: [196, 112, 180, 158] },
    end: { head: [144.2, 80.0], shoulder: [145.2, 104.0], elbow: [125.3, 127.1], wrist: [131.6, 99.5], hip: [132.5, 166.8], knee: [168.9, 177.7], ankle: [150, 206], toe: [174.0, 206.0], bar: [141.6, 97.5] },
  },
  squat_goblet: {
    start: { head: [150.0, 46.0], shoulder: [150.0, 70.0], elbow: [144.0, 100.0], wrist: [150.0, 120.0], hip: [152.0, 134.0], knee: [152.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [150.0, 122.0], arrow: [196, 112, 180, 158] },
    end: { head: [144.2, 80.0], shoulder: [145.2, 104.0], elbow: [138.7, 133.9], wrist: [148.3, 152.4], hip: [132.5, 166.8], knee: [168.9, 177.7], ankle: [150, 206], toe: [174.0, 206.0], bar: [148.3, 154.4] },
  },
  hinge: {
    start: { head: [128.0, 96.0], shoulder: [144.0, 112.0], elbow: [150.0, 146.0], wrist: [152.0, 180.0], hip: [178.0, 142.0], knee: [156.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [152.0, 182.0], arrow: [204, 172, 204, 118] },
    end: { head: [150.3, 66.4], shoulder: [150.6, 89.0], elbow: [149.2, 123.5], wrist: [154.9, 157.1], hip: [152.0, 134.3], knee: [152.0, 171.5], ankle: [150, 206], toe: [174.0, 206.0], bar: [154.9, 159.1] },
  },
  hip_hinge_dumbbell: {
    start: { head: [150.0, 46.0], shoulder: [150.0, 70.0], elbow: [150.0, 102.0], wrist: [152.0, 138.0], hip: [152.0, 136.0], knee: [152.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [152.0, 140.0] },
    end: { head: [151.5, 86.2], shoulder: [128.9, 94.4], elbow: [141.9, 123.7], wrist: [149.3, 159.0], hip: [174.8, 141.9], knee: [155.9, 172.5], ankle: [150, 206], toe: [174.0, 206.0], bar: [149.3, 161.0], arrow: [204, 168, 204, 118] },
  },
  hip_thrust: {
    start: { head: [70.0, 150.0], shoulder: [92.0, 152.0], elbow: [92.0, 176.0], wrist: [92.0, 196.0], hip: [132.0, 180.0], knee: [168.0, 180.0], ankle: [168, 206], toe: [190.0, 206.0], bar: [150, 168], props: [{ x: 56, y: 150, w: 16, h: 42 }] },
    end: { head: [73.1, 150.0], shoulder: [95.2, 150.2], elbow: [92.0, 174.0], wrist: [92.0, 194.0], hip: [143.9, 153.2], knee: [168.0, 180.0], ankle: [168, 206], toe: [190.0, 206.0], bar: [150, 132], arrow: [150, 168, 150, 140], props: [{ x: 56, y: 150, w: 16, h: 42 }] },
    face: 'up',
  },
  bench_press: {
    start: { head: [100.0, 138.0], shoulder: [120, 144], elbow: [120.0, 116.0], wrist: [118.0, 90.0], hip: [198.0, 148.0], knee: [230.0, 172.0], ankle: [230.0, 204.0], toe: [248.0, 204.0], bar: [118.0, 90.0], arrow: [152, 96, 152, 126], props: [{ x: 70, y: 150, w: 180, h: 14, r: 5 }, { x: 88, y: 164, w: 12, h: 42 }, { x: 220, y: 164, w: 12, h: 42 }] },
    end: { head: [100.0, 138.0], shoulder: [120, 144], elbow: [136.8, 121.6], wrist: [110.9, 124.9], hip: [198.0, 148.0], knee: [230.0, 172.0], ankle: [230.0, 204.0], toe: [248.0, 204.0], bar: [110.9, 124.9], props: [{ x: 70, y: 150, w: 180, h: 14, r: 5 }, { x: 88, y: 164, w: 12, h: 42 }, { x: 220, y: 164, w: 12, h: 42 }] },
  },
  incline_press: {
    start: { head: [86.0, 120.0], shoulder: [108, 132], elbow: [112.0, 104.0], wrist: [110.0, 78.0], hip: [176.0, 158.0], knee: [214.0, 178.0], ankle: [218.0, 204.0], toe: [238.0, 204.0], bar: [110.0, 78.0], arrow: [146, 86, 146, 116], props: [{ x: 60, y: 90, w: 40, h: 110, r: 8 }, { x: 74, y: 160, w: 140, h: 14, r: 5 }, { x: 200, y: 174, w: 12, h: 34 }] },
    end: { head: [86.0, 120.0], shoulder: [108, 132], elbow: [126.1, 110.3], wrist: [100.0, 109.8], hip: [176.0, 158.0], knee: [214.0, 178.0], ankle: [218.0, 204.0], toe: [238.0, 204.0], bar: [100.0, 109.8], props: [{ x: 60, y: 90, w: 40, h: 110, r: 8 }, { x: 74, y: 160, w: 140, h: 14, r: 5 }, { x: 200, y: 174, w: 12, h: 34 }] },
  },
  seated_overhead_press: {
    start: { head: [150.0, 58.0], shoulder: [150.0, 84.0], elbow: [132.0, 90.0], wrist: [130.0, 64.0], hip: [150, 150], knee: [150.0, 182.0], ankle: [150.0, 206.0], toe: [172.0, 206.0], bar: [130.0, 64.0], arrow: [178, 96, 178, 66], props: [{ x: 140, y: 150, w: 22, h: 58, r: 6 }] },
    end: { head: [150.0, 58.0], shoulder: [150.0, 84.0], elbow: [146.3, 65.4], wrist: [148.9, 39.4], hip: [150, 150], knee: [150.0, 182.0], ankle: [150.0, 206.0], toe: [172.0, 206.0], bar: [148.9, 39.4], props: [{ x: 140, y: 150, w: 22, h: 58, r: 6 }] },
    view: 'front',
  },
  standing_row_hinged: {
    start: { head: [128.0, 96.0], shoulder: [144.0, 112.0], elbow: [150.0, 146.0], wrist: [152.0, 178.0], hip: [178.0, 142.0], knee: [156.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [152.0, 180.0] },
    end: { head: [128.0, 96.0], shoulder: [144.0, 112.0], elbow: [176.8, 122.9], wrist: [175.5, 154.9], hip: [178.0, 142.0], knee: [156.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [175.5, 156.9], arrow: [204, 182, 204, 150] },
  },
  unilateral_lunge: {
    start: { head: [150.0, 46.0], shoulder: [150.0, 70.0], elbow: [136.0, 96.0], wrist: [140.0, 120.0], hip: [152.0, 134.0], knee: [152.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [140.0, 122.0] },
    end: { head: [143.4, 64.9], shoulder: [146.3, 88.7], elbow: [133.3, 115.2], wrist: [135.7, 139.4], hip: [143.2, 152.7], knee: [176.0, 171.9], ankle: [176, 206], toe: [200.0, 206.0], farKnee: [114.2, 177.3], farAnkle: [85.2, 195.2], farToe: [105.4, 208.2], bar: [135.7, 141.4] },
  },
  step_up: {
    start: { head: [110.0, 66.0], shoulder: [112.0, 90.0], elbow: [100.0, 116.0], wrist: [104.0, 140.0], hip: [114.0, 150.0], knee: [114.0, 182.0], ankle: [114, 206], toe: [136.0, 206.0], bar: [104.0, 142.0], props: [{ x: 150, y: 174, w: 70, h: 32, r: 4 }] },
    end: { head: [171.8, 39.9], shoulder: [179.7, 62.7], elbow: [170.3, 89.7], wrist: [170.1, 114.0], hip: [172.1, 122.2], knee: [188.0, 150.0], ankle: [188, 174], toe: [210.0, 174.0], farKnee: [161.3, 152.3], farAnkle: [149.8, 173.4], farToe: [152.6, 195.2], bar: [170.1, 116.0], props: [{ x: 150, y: 174, w: 70, h: 32, r: 4 }] },
  },
  calf_raise: {
    start: { head: [150.0, 58.0], shoulder: [150.0, 84.0], elbow: [142.0, 110.0], wrist: [144.0, 136.0], hip: [150.0, 150.0], knee: [150.0, 182.0], ankle: [148, 200], toe: [170.0, 206.0] },
    end: { head: [150.0, 50.0], shoulder: [150.0, 76.0], elbow: [142.0, 102.0], wrist: [144.0, 128.0], hip: [150.0, 142.0], knee: [150.0, 174.0], ankle: [148, 192], toe: [169.8, 198.6], arrow: [110, 180, 110, 158] },
  },
  plank_prone: {
    start: { head: [262.0, 144.0], shoulder: [230.0, 152.0], elbow: [214.0, 178.0], wrist: [212.0, 204.0], hip: [168, 164], knee: [132.0, 174.0], ankle: [100.0, 186.0], toe: [86.0, 206.0] },
    end: null,
  },
  side_plank: {
    start: { head: [256.0, 116.0], shoulder: [226.0, 132.0], elbow: [214.0, 166.0], wrist: [214.0, 204.0], hip: [166, 158], knee: [130.0, 172.0], ankle: [98.0, 188.0], toe: [84.0, 206.0] },
    end: null,
    face: 'front',
  },
  bird_dog: {
    start: { head: [244.0, 134.0], shoulder: [216.0, 140.0], elbow: [216.0, 172.0], wrist: [216.0, 204.0], hip: [150, 140], knee: [150.0, 174.0], ankle: [150.0, 204.0], toe: [132.0, 206.0] },
    end: { head: [243.3, 129.5], shoulder: [216.0, 138.1], elbow: [218.0, 170.0], wrist: [218.0, 202.0], hip: [150, 140], knee: [116.8, 132.8], ankle: [87.5, 126.3], toe: [69.7, 123.1], farKnee: [150.0, 174.0], farAnkle: [150.0, 204.0], farToe: [132.0, 206.0], farElbow: [245.2, 124.9], farWrist: [274.9, 112.9], arrow: [92, 152, 64, 136] },
  },
  quadruped_spine: {
    start: { head: [248.0, 120.0], shoulder: [216.0, 138.0], elbow: [216.0, 172.0], wrist: [216.0, 204.0], hip: [150, 148], knee: [150.0, 174.0], ankle: [150.0, 204.0], toe: [132.0, 206.0] },
    end: { head: [250.7, 149.9], shoulder: [214.8, 142.2], elbow: [213.9, 176.2], wrist: [214.0, 208.2], hip: [150, 126], knee: [150.0, 152.0], ankle: [150.0, 182.0], toe: [139.1, 196.5], arrow: [180, 108, 180, 130] },
  },
  hinged_fly: {
    start: { head: [128.0, 96.0], shoulder: [144.0, 112.0], elbow: [148.0, 144.0], wrist: [150.0, 176.0], hip: [178.0, 142.0], knee: [156.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [150.0, 178.0] },
    end: { head: [128.0, 96.0], shoulder: [144.0, 112.0], elbow: [168.3, 133.2], wrist: [180.7, 103.6], hip: [178.0, 142.0], knee: [156.0, 172.0], ankle: [150, 206], toe: [174.0, 206.0], bar: [182.7, 101.6], arrow: [200, 168, 204, 124] },
  },
  anti_rotation_standing: {
    start: { head: [150.0, 58.0], shoulder: [150.0, 84.0], elbow: [132.0, 96.0], wrist: [112.0, 96.0], hip: [150.0, 150.0], knee: [150.0, 182.0], ankle: [150, 206], toe: [170.0, 206.0], bar: [112.0, 96.0], arrow: [70, 96, 110, 96] },
    end: { head: [150.0, 58.0], shoulder: [150.0, 84.0], elbow: [150.0, 105.6], wrist: [168.9, 99.1], hip: [150.0, 150.0], knee: [150.0, 182.0], ankle: [150, 206], toe: [170.0, 206.0], bar: [168.9, 99.1] },
  },
  carry: {
    start: { head: [120.0, 58.0], shoulder: [120.0, 84.0], elbow: [110.0, 110.0], wrist: [108.0, 140.0], hip: [120.0, 150.0], knee: [110.0, 182.0], ankle: [104, 206], toe: [126.0, 206.0], farKnee: [131.8, 181.4], farAnkle: [139.6, 204.9], farToe: [161.6, 206.0], bar: [108.0, 142.0] },
    end: { head: [190.0, 59.3], shoulder: [190.0, 85.3], elbow: [179.5, 111.1], wrist: [177.9, 141.1], hip: [190.6, 151.3], knee: [204.0, 182.0], ankle: [210, 206], toe: [232.0, 206.0], farKnee: [177.9, 182.3], farAnkle: [170.1, 205.8], farToe: [192.1, 206.0], bar: [177.9, 143.1], arrow: [150, 60, 180, 60] },
  },
  standing_arm_isolation: {
    start: { head: [150.0, 58.0], shoulder: [150.0, 84.0], elbow: [146.0, 110.0], wrist: [148.0, 138.0], hip: [150.0, 150.0], knee: [150.0, 182.0], ankle: [150, 206], toe: [170.0, 206.0], bar: [148.0, 140.0] },
    end: { head: [150.0, 58.0], shoulder: [150.0, 84.0], elbow: [146.0, 110.0], wrist: [130.4, 86.6], hip: [150.0, 150.0], knee: [150.0, 182.0], ankle: [150, 206], toe: [170.0, 206.0], bar: [130.4, 86.6], arrow: [112, 120, 112, 92] },
  },
  rollout: {
    start: { head: [204.0, 116.0], shoulder: [180.0, 132.0], elbow: [196.0, 160.0], wrist: [204.0, 194.0], hip: [128, 170], knee: [110.0, 204.0], ankle: [76.0, 204.0], toe: [58.0, 204.0], bar: [212.0, 200.0] },
    end: { head: [235.3, 166.3], shoulder: [208.8, 177.8], elbow: [238.6, 190.2], wrist: [270.8, 203.7], hip: [146, 192], knee: [109.5, 204.2], ankle: [75.5, 204.0], toe: [57.5, 204.0], bar: [278.8, 205.7], arrow: [230, 150, 260, 166] },
  },
  bulgarian_split_squat: {
    start: { head: [142.0, 50.0], shoulder: [144.0, 74.0], elbow: [130.0, 100.0], wrist: [134.0, 124.0], hip: [146.0, 138.0], knee: [150.0, 174.0], ankle: [150, 206], toe: [174.0, 206.0], farKnee: [116.4, 158.8], farAnkle: [84.7, 163.0], farToe: [60.9, 165.9], bar: [134.0, 126.0], props: [{ x: 28, y: 168, w: 44, h: 38, r: 4 }] },
    end: { head: [140.1, 72.8], shoulder: [142.0, 96.8], elbow: [127.7, 122.6], wrist: [132.1, 146.5], hip: [144.3, 160.8], knee: [177.4, 175.4], ankle: [168, 206], toe: [192.0, 206.0], farKnee: [114.5, 181.3], farAnkle: [83.8, 172.3], farToe: [59.9, 169.7], bar: [132.1, 148.5], arrow: [200, 118, 190, 160], props: [{ x: 28, y: 168, w: 44, h: 38, r: 4 }] },
  },
  glute_bridge: {
    start: { head: [236.0, 194.0], shoulder: [210.0, 194.0], elbow: [212.0, 202.0], wrist: [196.0, 204.0], hip: [150.0, 194.0], knee: [110.0, 168.0], ankle: [92, 206], toe: [74.0, 206.0] },
    end: { head: [229.0, 192.9], shoulder: [203.3, 188.9], elbow: [207.9, 195.8], wrist: [194.6, 204.9], hip: [155.3, 152.9], knee: [110.0, 168.0], ankle: [92, 206], toe: [74.0, 206.0], arrow: [148, 190, 142, 162] },
    face: 'up',
  },
  chin_tuck_side: {
    start: { head: [160.0, 60.0], shoulder: [150.0, 84.0], elbow: [146.0, 110.0], wrist: [148.0, 138.0], hip: [150.0, 150.0], knee: [150.0, 182.0], ankle: [150, 206], toe: [170.0, 206.0] },
    end: { head: [146.0, 58.3], shoulder: [150.0, 84.0], elbow: [146.0, 110.0], wrist: [148.0, 138.0], hip: [150.0, 150.0], knee: [150.0, 182.0], ankle: [150, 206], toe: [170.0, 206.0], arrow: [188, 60, 166, 60] },
  },
  arm_circles_front: {
    start: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [176.0, 102.0], wrist: [194.0, 126.0], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0] },
    end: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [181.6, 62.2], wrist: [195.2, 35.5], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], arrow: [214, 110, 214, 60] },
    view: 'front',
  },
  lateral_raise_front: {
    start: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [170.0, 106.0], wrist: [176.0, 132.0], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [176.0, 134.0] },
    end: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [183.9, 83.7], wrist: [210.4, 80.4], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [210.4, 80.4], arrow: [204, 126, 214, 94] },
    view: 'front',
  },
  shrug_front: {
    start: { head: [150.0, 52.0], shoulder: [150, 82], elbow: [172.0, 112.0], wrist: [176.0, 140.0], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [176.0, 142.0] },
    end: { head: [150.0, 42.0], shoulder: [150, 72], elbow: [172.0, 102.0], wrist: [176.0, 130.0], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [176.0, 132.0], arrow: [200, 96, 200, 76] },
    view: 'front',
  },
  hanging_knee_raise: {
    start: { head: [150.0, 66.0], shoulder: [150.0, 92.0], elbow: [178.0, 62.0], wrist: [186, 34], hip: [150.0, 150.0], knee: [158.0, 182.0], ankle: [160.0, 206.0], toe: [168.0, 206.0], bar: [186, 32] },
    end: { head: [150.0, 66.0], shoulder: [150.0, 92.0], elbow: [178.0, 62.0], wrist: [186, 34], hip: [150.0, 150.0], knee: [173.3, 126.7], ankle: [166.6, 149.8], toe: [166.4, 157.8], bar: [186, 32], arrow: [196, 176, 196, 146] },
    view: 'front',
  },
  curl_up_supine: {
    start: { head: [248.0, 194.0], shoulder: [220.0, 194.0], elbow: [232.0, 200.0], wrist: [210.0, 202.0], hip: [150, 194], knee: [118.0, 164.0], ankle: [90.0, 194.0], toe: [72.0, 194.0] },
    end: { head: [247.0, 179.5], shoulder: [219.3, 183.8], elbow: [229.0, 193.1], wrist: [209.0, 202.5], hip: [150, 194], knee: [118.0, 164.0], ankle: [90.0, 194.0], toe: [72.0, 194.0], arrow: [262, 206, 258, 182] },
    face: 'up',
  },
  band_pull_apart_front: {
    start: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [164.0, 82.0], wrist: [168.0, 86.0], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [168.0, 86.0] },
    end: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [164.5, 79.6], wrist: [170.2, 79.8], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [170.2, 79.8], arrow: [182, 104, 214, 104] },
    view: 'front',
  },
  band_ext_rotation_front: {
    start: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [170.0, 112.0], wrist: [148.0, 116.0], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [148.0, 116.0] },
    end: { head: [150.0, 52.0], shoulder: [150.0, 78.0], elbow: [170.0, 112.0], wrist: [192.3, 110.4], hip: [150.0, 146.0], knee: [158.0, 178.0], ankle: [160, 206], toe: [168.0, 206.0], bar: [192.3, 110.4], arrow: [160, 130, 196, 128] },
    view: 'front',
  },
};

export interface Exercise {
  id: string;
  tr: string;
  /**
   * The other name the movement goes by on the gym floor — the English one
   * when `tr` is Turkish, the Turkish one when `tr` is a loanword. Absent
   * where there is genuinely no counterpart in use (goblet squat, plank,
   * bird-dog, Pallof press): a name nobody says is worse than none.
   *
   * Both names are searched and both are shown, so a trainer finds the
   * movement by whichever one they learned.
   */
  trAlt?: string;
  en: string;
  /** BAŞLANGIÇ | ORTA | ORTA-İLERİ | İLERİ */
  difficulty: string;
  equipTr: string;
  equipEn: string;
  primary: MuscleId[];
  secondary: MuscleId[];
  /**
   * Which rig archetype draws this movement — the key is looked up in
   * `RIG_ARCHETYPES` (src/data/rigArchetypes.ts), NOT in `POSE_ARCHETYPES`
   * below. `exercise-detail.tsx` reads the rig table and renders `RigFigure`
   * with the result; a key missing there is a crash, which is what
   * `exerciseLibrary.test.ts` guards.
   */
  archetype: string;
  setsHint: string;
  restHint: string;
  /** [Turkish, English] pairs. */
  steps: [string, string][];
  /** False until a certified trainer has checked the pose frames. */
  poseReviewed: boolean;
}

export const EXERCISES: Exercise[] = [
  {
    id: 'arm-circles', tr: 'Kollarla daire çizme', trAlt: 'Arm circles', en: 'Arm circles',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok', equipEn: 'None',
    primary: [],
    secondary: [],
    archetype: 'arm_circles_front',
    setsHint: '', restHint: '',
    steps: [
      ['Ayaklarını kalça genişliğinde aç; dik dur ve kollarını rahat bir yükseklikte yanlara uzat.', 'Stand tall with your feet hip-width apart and your arms extended out to the sides at a comfortable height.'],
      ['Omuzlarını zorlamadan küçük daireler çiz; dirseklerini hafif yumuşak tut.', 'Draw small circles without straining your shoulders; keep your elbows softly bent.'],
      ['Ağrısız aralıkta daireleri yavaşça büyüt; belini geriye yaylandırma.', 'Slowly widen the circles within a pain-free range; do not arch your lower back.'],
      ['Yönü değiştirerek tekrarla; sıkışma veya ağrı hissedersen daireyi küçült ya da dur.', 'Repeat in the other direction; make the circles smaller or stop if you feel pinching or pain.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'cat-cow', tr: 'Dört ayak üzerinde sırtı yuvarlama ve açma', trAlt: 'Cat-cow', en: 'Cat-cow',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['erector'],
    secondary: ['absMid'],
    archetype: 'quadruped_spine',
    setsHint: '', restHint: '',
    steps: [
      ['Ellerini omuzlarının, dizlerini kalçalarının altına yerleştir.', 'Place your hands under your shoulders and your knees under your hips.'],
      ['Nefes verirken sırtını yavaşça tavana doğru yuvarla; başının doğal olarak aşağı gelmesine izin ver.', 'As you exhale, slowly round your back towards the ceiling and let your head drop naturally.'],
      ['Nefes alırken göğsünü öne açıp leğen kemiğini hafifçe öne döndür; belini ve boynunu aşırı çukurlaştırma.', 'As you inhale, open your chest forward and tilt your pelvis slightly forward; do not over-arch your lower back or neck.'],
      ['İki yön arasında yumuşak geçiş yap; ağrısız aralıkta hareket et ve uç pozisyonları zorlama.', 'Move smoothly between the two directions; stay in a pain-free range and do not force the end positions.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'band-pull-apart', tr: 'Lastikle kolları iki yana açma', en: 'Band pull-apart',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Direnç bandı', equipEn: 'Resistance band',
    primary: ['deltPost', 'trapMid'],
    secondary: ['infra'],
    archetype: 'band_pull_apart_front',
    setsHint: '', restHint: '',
    steps: [
      ['Lastiğin sağlamlığını kontrol et; iki elinle göğüs önünde, dirseklerin hafif bükülü olacak şekilde tut.', 'Check that the band is sound; hold it with both hands in front of your chest, elbows slightly bent.'],
      ['Karnını sık ve boynunu rahat bırak; ellerini iki yana açarak lastiği göğsüne yaklaştır.', 'Brace your core and relax your neck; open your hands out to the sides, bringing the band towards your chest.'],
      ['Kürek kemiklerinin kontrollü biçimde yaklaşmasına izin ver; omuzlarını kulaklarına kaldırma ve belini geriye atma.', 'Let your shoulder blades draw together under control; do not shrug towards your ears or lean back.'],
      ['Lastiğin seni aniden çekmesine izin vermeden başlangıca dön; omuzda ağrı varsa aralığı veya direnci azalt.', 'Return to the start without letting the band snap you back; reduce the range or the resistance if your shoulder hurts.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'band-external-rotation', tr: 'Lastikle omuzu dışa döndürme', trAlt: 'Band external rotation', en: 'Band external rotation',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Direnç bandı', equipEn: 'Resistance band',
    primary: ['infra', 'teres'],
    secondary: ['deltPost'],
    archetype: 'band_ext_rotation_front',
    setsHint: '', restHint: '',
    steps: [
      ['Sağlam bir dirsek yüksekliği bağlantısına lastiği sabitle; bağlantı noktası çalışan kolunun karşı tarafında kalsın.', 'Anchor the band to something solid at elbow height, with the anchor point on the opposite side from your working arm.'],
      ['Dirseğini yaklaşık dik açıyla büküp yanına al; gerekirse dirsekle gövde arasına küçük havlu koy.', 'Bend your elbow to about a right angle and keep it at your side; place a small towel between elbow and ribs if needed.'],
      ['Bileğini düz ve dirseğini yerinde tutarak elini karından dış yana doğru aç; gövdeni döndürme.', 'Keeping your wrist straight and your elbow in place, rotate your hand outward away from your stomach; do not twist your torso.'],
      ['Omuzu zorlamayan aralıkta durup yavaşça geri dön; hafif direnç kullan ve iki tarafı çalıştır.', 'Stop within a range that does not strain the shoulder and return slowly; use light resistance and work both sides.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'chin-tuck', tr: 'Çeneyi geriye çekme', trAlt: 'Chin tuck', en: 'Chin tuck',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok', equipEn: 'None',
    primary: ['sterno'],
    secondary: [],
    archetype: 'chin_tuck_side',
    setsHint: '', restHint: '',
    steps: [
      ['Otururken veya ayakta gövdeni dik tut; gözlerin karşıya baksın.', 'Sit or stand with your torso upright and your eyes looking straight ahead.'],
      ['Çeneni aşağı düşürmeden başını hafifçe geriye kaydır; küçük bir gıdı oluşturduğunu düşün.', 'Glide your head slightly backwards without dropping your chin; think of making a small double chin.'],
      ['Omuzlarını ve çeneni gevşek tutarak birkaç saniye bekle; nefes almayı sürdür.', 'Hold for a few seconds with your shoulders and jaw relaxed; keep breathing.'],
      ['Başlangıca dön; boyun ağrısı, baş dönmesi veya kola yayılan belirti oluşursa dur.', 'Return to the start; stop if you get neck pain, dizziness or symptoms travelling down your arm.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'worlds-greatest-stretch', tr: 'Derin hamlede gövde döndürerek esneme', trAlt: 'World\'s greatest stretch', en: 'World\'s greatest stretch',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok', equipEn: 'None',
    primary: ['adductors', 'oblique'],
    secondary: ['gluteMax'],
    archetype: 'unilateral_lunge',
    setsHint: '', restHint: '',
    steps: [
      ['Bir ayağını öne alıp derin hamleye yerleş; arka dizini rahatlık için minder üzerine indirebilirsin.', 'Step one foot forward into a deep lunge; you may rest your back knee on a pad for comfort.'],
      ['Öndeki ayağının karşı tarafındaki elini yere veya bir yükseltiye koy; ön ayağın tüm tabanı destekli kalsın.', 'Place the hand opposite your front foot on the floor or on a block; keep the whole sole of the front foot supported.'],
      ['Ön bacak tarafındaki kolunu yukarı açarken göğsünü o tarafa döndür; kalçanı mümkün olduğunca sabit tut ve beli zorla burma.', 'Open the arm on the front-leg side upward and rotate your chest that way; keep your hips as steady as you can and do not wrench your lower back.'],
      ['Kolunu kontrollü indir; ağrısız aralıkta tekrarlayıp taraf değiştir, dirseği yere değdirmek veya kolu tam dikleştirmek için zorlama.', 'Lower the arm under control; repeat within a pain-free range and switch sides — do not force the elbow to the floor or the arm fully vertical.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'goblet-squat', tr: 'Göğüste tek ağırlıkla squat', en: 'Goblet squat',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell/Kettlebell', equipEn: 'Dumbbell or kettlebell',
    primary: ['quadRF', 'quadVL', 'quadVM', 'gluteMax'],
    secondary: ['adductors', 'erector'],
    archetype: 'squat_goblet',
    setsHint: '3×10', restHint: '60-90 sn',
    steps: [
      ['Ağırlığı göğsüne yakın iki elle güvenle tut; ayaklarını rahat çömelebileceğin genişlikte aç.', 'Hold the weight securely with both hands close to your chest; set your feet at a width you can squat comfortably from.'],
      ['Karnını sık; kalça ve dizlerini birlikte bükerek aralarına doğru çömel.', 'Brace your core; squat down between your legs by bending your hips and knees together.'],
      ['Topuklarını yerde, dizlerini ayak yönünde tut; sırt ve denge kontrolünün korunduğu derinlikte dur.', 'Keep your heels down and your knees tracking over your feet; stop at the depth where you keep control of your back and balance.'],
      ['Tüm tabanınla yeri itip kalk; ağırlığı gövdenden uzaklaştırma ve dipte zıplama.', 'Push the floor away through your whole foot to stand; do not let the weight drift away from your body or bounce at the bottom.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'back-squat', tr: 'Halter sırtta squat', en: 'Barbell back squat',
    difficulty: 'ORTA-İLERİ', equipTr: 'Squat rack + Bar', equipEn: 'Squat rack, barbell',
    primary: ['quadRF', 'quadVL', 'quadVM', 'gluteMax', 'erector', 'adductors'],
    secondary: ['hamBF', 'hamST', 'gastroMed', 'absMid', 'trapUpper'],
    archetype: 'squat',
    setsHint: '4×5-8', restHint: '120-180 sn',
    steps: [
      ['Güvenlik kolları ayarlı bir squat istasyonu kullan; barı boyun omurlarına değil üst sırt kaslarına yerleştir ve iki elle kavra.', 'Use a squat station with the safety arms set; rack the bar on your upper back muscles — never on your neck vertebrae — and grip it with both hands.'],
      ['Barı askıdan alıp kısa adımlarla yerleş; ayaklarını rahat bir genişlikte aç ve karnını sık.', 'Lift the bar off the hooks and walk back with short steps; set your feet at a comfortable width and brace your core.'],
      ['Dizlerini ayak parmaklarınla aynı yönde tutarak kalça ve dizlerinden çömel; topuklarını yerde tut.', 'Squat by bending at the hips and knees, keeping your knees tracking in line with your toes and your heels down.'],
      ['Dengeni ve bel konumunu koruyabildiğin derinlikten tüm tabanınla iterek kalk; kontrolü kaybettiğin ağırlığı kullanma.', 'Stand up by driving through your whole foot from the depth at which you can keep your balance and back position; do not use a weight you cannot control.'],
      ['Tam dik durduktan sonra askıya yaklaş ve barın iki tarafta da yerine oturduğunu kontrol et.', 'Once fully upright, walk back to the rack and check the bar has seated on both hooks.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'front-hack-squat', tr: 'Halter önde squat', trAlt: 'Ön squat', en: 'Front squat',
    difficulty: 'ORTA', equipTr: 'Squat rack', equipEn: 'Squat rack',
    primary: ['quadRF', 'quadVL', 'quadVM'],
    secondary: ['gluteMax', 'adductors', 'absMid'],
    archetype: 'squat_goblet',
    setsHint: '3×8-10', restHint: '90-120 sn',
    steps: [
      ['Güvenlik destekli istasyonda hafif halteri ön omuzlarına yerleştir; barın yükünü yalnızca bileklerinde taşıma.', 'At a station with safety supports, rack a light barbell on your front shoulders; do not let your wrists alone carry the load.'],
      ['Dirseklerini öne ve rahatça yukarı yönelt; barın omuz desteğini koruyarak askıdan çık.', 'Point your elbows forward and comfortably up; unrack the bar keeping it supported on your shoulders.'],
      ['Ayak tabanların yerdeyken kalça ve dizlerini birlikte bük; dizlerin ayaklarınla aynı yönde ilerlesin.', 'With your feet flat, bend your hips and knees together; let your knees travel in line with your feet.'],
      ['Bar öne yuvarlanmadan ve bel kontrolün bozulmadan inebildiğin noktadan ayağa kalk; bitirince barı güvenle askıya koy.', 'Stand up from the depth you can reach without the bar rolling forward or your back position breaking down; rack the bar safely when you finish.'],
      ['Bu adımlar halter önde squat içindir; kızaklı squat makinesi veya göğüste tek ağırlık tutulan squatyle aynı değildir.', 'These steps are for a front-racked barbell squat; they are not the same as a hack squat machine or a squat holding a single weight at the chest.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'rdl', tr: 'Dambılla Romen kaldırışı', trAlt: 'Romen deadlift', en: 'Romanian deadlift',
    difficulty: 'ORTA', equipTr: 'Bar veya dumbbell', equipEn: 'Barbell or dumbbell',
    primary: ['hamBF', 'hamST', 'gluteMax', 'erector'],
    secondary: ['addMagnus', 'forearmFlex'],
    archetype: 'hip_hinge_dumbbell',
    setsHint: '3×8-10', restHint: '90-120 sn',
    steps: [
      ['Dambılları uyluklarının önünde tut; ayaklarını kalça genişliğinde aç ve dizlerini hafif bük.', 'Hold the dumbbells in front of your thighs; set your feet hip-width apart and bend your knees slightly.'],
      ['Karnını sık, kalçanı geriye gönder ve sırtının doğal konumunu koruyarak öne eğil.', 'Brace your core, push your hips back and hinge forward keeping the natural position of your back.'],
      ['Dambılları bacaklarına yakın indir; arka bacağında gerilme hissedip bel konumunu koruyabildiğin yerde dur.', 'Lower the dumbbells close to your legs; stop where you feel a stretch in your hamstrings and can still hold your back position.'],
      ['Ayaklarınla yeri itip kalçanı öne getirerek dikleş; tepede geriye yaslanma ve hareketi squatye dönüştürme.', 'Push the floor away and bring your hips forward to stand tall; do not lean back at the top or turn the movement into a squat.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'deadlift', tr: 'Halteri yerden kaldırma', trAlt: 'Ölü kaldırış', en: 'Conventional deadlift',
    difficulty: 'İLERİ', equipTr: 'Bar + Plakalar', equipEn: 'Barbell and plates',
    primary: ['erector', 'gluteMax', 'hamBF', 'hamST', 'lat', 'trapMid', 'trapUpper'],
    secondary: ['quadRF', 'forearmFlex', 'absMid'],
    archetype: 'hinge',
    setsHint: '3×4-6', restHint: '150-240 sn',
    steps: [
      ['Ayaklarını kalça genişliğinde, barı ayak ortanın üzerinde konumlandır; kalçanı geriye gönderip dizlerini bükerek barı bacaklarının dışından kavra.', 'Set your feet hip-width apart with the bar over mid-foot; push your hips back, bend your knees and grip the bar just outside your legs.'],
      ['Karnını sık, sırtının doğal eğrilerini koru ve barı kaval kemiğine yakın tut; kolların düz kalsın.', 'Brace your core, keep the natural curves of your back and keep the bar close to your shins; keep your arms straight.'],
      ['Yeri ayaklarınla iterek ayağa kalk; kalça ve omuzların uyumlu yükselsin, barı aniden çekiştirme.', 'Push the floor away with your feet to stand up; let your hips and shoulders rise together and do not jerk the bar.'],
      ['Dik durduğunda kalçanı aşırı öne itme; barı bacaklarına yakın tutarak önce kalçadan eğil, ardından dizlerini büküp yere bırak.', 'At the top do not thrust your hips forward excessively; keep the bar close to your legs, hinge at the hips first, then bend your knees to set it down.'],
      ['Yere uzanırken bel konumunu koruyamıyorsan yükü güvenli bir yükseltiye al ve daha hafif ağırlık kullan.', 'If you cannot hold your back position while reaching the floor, raise the load onto a safe block and use a lighter weight.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'hip-thrust', tr: 'Sırt destekli kalça yükseltme', trAlt: 'Kalça itişi', en: 'Hip thrust',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Bar veya makine', equipEn: 'Barbell or machine',
    primary: ['gluteMax'],
    secondary: ['hamBF', 'hamST', 'absMid'],
    archetype: 'hip_thrust',
    setsHint: '3×10-12', restHint: '90-120 sn',
    steps: [
      ['Kaymayan sehpaya üst sırtını, kürek kemiklerinin alt kenarı civarından daya; ayaklarını yere bas.', 'Rest your upper back against a non-slip bench, roughly at the lower edge of your shoulder blades; plant your feet on the floor.'],
      ['Ağırlık kullanıyorsan kalça kıvrımına koruyucu pedle yerleştir ve ellerinle dengede tut; boynuna yük verme.', 'If you use a weight, place it in your hip crease with a protective pad and steady it with your hands; do not load your neck.'],
      ['Karnını sıkıp ayaklarınla yeri iterek kalçanı kaldır; tepede gövde ve uyluklar yaklaşık aynı çizgide olsun.', 'Brace your core and push the floor away with your feet to lift your hips; at the top your torso and thighs should be roughly in line.'],
      ['Belini aşırı açmadan kalça kaslarını sık; kalçanı kontrollü indir ve ayaklarının kaymasına izin verme.', 'Squeeze your glutes without over-extending your lower back; lower your hips under control and do not let your feet slide.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'bulgarian-split-squat', tr: 'Arka ayak yükseltide tek bacak ağırlıklı squat', en: 'Bulgarian split squat',
    difficulty: 'ORTA', equipTr: 'Bench + dumbbell', equipEn: 'Bench and dumbbells',
    primary: ['quadRF', 'quadVL', 'gluteMax'],
    secondary: ['adductors'],
    archetype: 'bulgarian_split_squat',
    setsHint: '3×8', restHint: '90 sn',
    steps: [
      ['Arkanda kaymayan, çok yüksek olmayan bir sehpa seç; arka ayağının üstünü üzerine yerleştir.', 'Choose a stable bench behind you that is not too high; rest the top of your back foot on it.'],
      ['Ön ayağını yeterince ileri al; ayaklarını ip üzerinde gibi aynı çizgiye değil kalça genişliğine yakın yerleştir.', 'Place your front foot far enough forward; keep your feet about hip-width apart rather than in line as if on a tightrope.'],
      ['Ön dizini ayak yönünde bükerek aşağı in; ön tabanın yerde kalsın ve arkadaki kalçayı zorlayacak kadar derine gitme.', 'Lower down bending your front knee in line with your foot; keep the front sole on the floor and do not go so deep that it strains the rear hip.'],
      ['Öndeki ayağınla yeri iterek kalk; dengede zorlanırsan sabit bir yerden destek al ve sonra taraf değiştir.', 'Push the floor away with your front foot to stand; hold on to something fixed if your balance is challenged, then switch sides.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'walking-lunge', tr: 'Yürüyerek öne hamle', trAlt: 'Yürüyen hamle', en: 'Walking lunge',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell (opsiyonel)', equipEn: 'Dumbbells (optional)',
    primary: ['quadRF', 'quadVL', 'gluteMax'],
    secondary: ['adductors', 'hamBF'],
    archetype: 'unilateral_lunge',
    setsHint: '3×10/bacak', restHint: '60-90 sn',
    steps: [
      ['Önünde yeterli boş alan bırak ve ayaklarını kalça genişliğinde aç.', 'Leave enough clear space in front of you and set your feet hip-width apart.'],
      ['Bir ayağınla ileri adım atıp iki dizini bükerek alçal; öndeki tabanın yere bassın ve dizin ayak yönünde kalsın.', 'Step forward with one foot and lower by bending both knees; keep the front sole flat on the floor and the knee tracking over the foot.'],
      ['Arka dizini yere çarptırmadan dur; ön ayağınla itip yükselirken arka bacağını öne getir.', 'Stop before your back knee hits the floor; push off the front foot and bring your back leg through as you rise.'],
      ['Diğer bacakla yeni bir öne hamle yap; denge için adımlar arasında ayaklarını yan yana getirerek kısa duraklayabilirsin.', 'Take a new forward lunge with the other leg; you may pause briefly with your feet side by side between steps for balance.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'reverse-lunge', tr: 'Geriye adımlı hamle', trAlt: 'Geriye hamle', en: 'Reverse lunge',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok / hafif dumbbell', equipEn: 'None or light dumbbells',
    primary: ['quadRF', 'gluteMax'],
    secondary: ['adductors'],
    archetype: 'unilateral_lunge',
    setsHint: '2-3×8/bacak', restHint: '60-90 sn',
    steps: [
      ['Ayaklarını kalça genişliğinde aç; dik ve dengeli dur.', 'Set your feet hip-width apart; stand tall and balanced.'],
      ['Bir ayağınla kontrollü biçimde geriye adım at; öndeki ayağının tüm tabanı yerde kalsın.', 'Step backwards with one foot under control; keep the whole sole of your front foot on the floor.'],
      ['İki dizini büküp arka dizini zemine yaklaştır; ön dizini ayak yönünde tut ve yere çarpma.', 'Bend both knees and bring your back knee towards the floor; keep the front knee in line with the foot and do not hit the floor.'],
      ['Öndeki ayağınla yeri iterek gerideki ayağını başlangıca getir; taraf değiştir, gerekirse sabit destek kullan.', 'Push the floor away with your front foot to bring the back foot to the start; switch sides and use a fixed support if needed.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'step-up', tr: 'Basamağa çıkma', trAlt: 'Basamak çıkma', en: 'Step-up',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Kutu/bench', equipEn: 'Box or bench',
    primary: ['quadRF', 'gluteMax'],
    secondary: ['hamBF'],
    archetype: 'step_up',
    setsHint: '3×10/bacak', restHint: '60-90 sn',
    steps: [
      ['Kaymayan ve dengeni koruyabileceğin yükseklikte bir basamak seç; bir ayağının tamamını üzerine koy.', 'Choose a non-slip step at a height where you can stay balanced; place one whole foot on it.'],
      ['Gövdeni hafif öne alıp basamaktaki ayağınla it; yerdeki bacakla sıçrayarak hız alma.', 'Lean your torso slightly forward and drive through the foot on the step; do not gain momentum by hopping off the floor with the other leg.'],
      ['Basamaktaki kalça ve dizini açarak yüksel; dizin içe çökmesin ve dengeyi koru.', 'Rise by extending the hip and knee on the step; do not let the knee collapse inward and keep your balance.'],
      ['Aynı bacakla inişi kontrol ederek diğer ayağını yavaşça yere koy; tekrarlardan sonra taraf değiştir.', 'Control the descent with the same leg and place the other foot slowly on the floor; switch sides after your reps.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'calf-raise', tr: 'Ayakta topuk yükseltme', trAlt: 'Topuk yükseltme', en: 'Calf raise',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok / makine', equipEn: 'Bodyweight or machine',
    primary: ['gastroLat', 'gastroMed', 'soleus'],
    secondary: [],
    archetype: 'calf_raise',
    setsHint: '3×15', restHint: '45-60 sn',
    steps: [
      ['Ayaklarını kalça genişliğinde aç; denge için sabit bir yüzeye hafifçe tutun.', 'Set your feet hip-width apart; hold a stable surface lightly for balance.'],
      ['Dizlerini zorla kilitlemeden, ayaklarının ön kısmına basarak topuklarını yavaşça yükselt.', 'Without forcing your knees into lockout, slowly raise your heels by pressing through the balls of your feet.'],
      ['Ayak bileklerini yana yatırmadan kısa süre tepede dur; parmak uçlarında zıplama.', 'Pause briefly at the top without rolling your ankles outward; do not bounce on your toes.'],
      ['Topuklarını kontrollü indir; başlangıçta düz zemini kullan ve rahat hareket aralığında kal.', 'Lower your heels under control; start on flat ground and stay in a comfortable range of motion.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'bench-press', tr: 'Düz sehpada halterle göğüs itiş', trAlt: 'Göğüs presi', en: 'Barbell bench press',
    difficulty: 'ORTA', equipTr: 'Bench + Bar', equipEn: 'Flat bench, barbell',
    primary: ['pecSternal', 'pecClav', 'deltFront', 'triLat', 'triLong'],
    secondary: ['serratus', 'trapMid', 'absUpper', 'lat'],
    archetype: 'bench_press',
    setsHint: '4×8-10', restHint: '90-120 sn',
    steps: [
      ['Güvenlik desteklerini ayarla veya yardımcı kullan; ayaklarını yere bas, kalçanı ve üst sırtını sehpaya yerleştir.', 'Set the safety supports or use a spotter; plant your feet on the floor and settle your hips and upper back on the bench.'],
      ['Barı başparmakların etrafına kapanacak şekilde kavra; bileklerini ön kolların üzerinde dengeli tut.', 'Grip the bar with your thumbs wrapped around it; keep your wrists balanced over your forearms.'],
      ['Barı kontrollü biçimde orta-alt göğse yaklaştır; dirseklerini omuz hizasında tamamen yana açma ve barı göğüsten sektirme.', 'Bring the bar under control towards your mid-to-lower chest; do not flare your elbows fully out to shoulder level and do not bounce the bar off your chest.'],
      ['Ayakların sabitken barı yukarı it; kalçanı kaldırma, omuz ağrısı oluşturan derinliğe inme.', 'With your feet planted, press the bar up; do not lift your hips and do not lower to a depth that causes shoulder pain.'],
      ['Set sonunda barı askının iki tarafına güvenle yerleştir.', 'At the end of the set, seat the bar safely on both sides of the rack.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'incline-press', tr: 'Eğimli sehpada dambılla göğüs itiş', trAlt: 'Eğik sehpada dumbbell pres', en: 'Incline dumbbell press',
    difficulty: 'ORTA', equipTr: 'Bank (30°) + dumbbell', equipEn: 'Incline bench, dumbbells',
    primary: ['pecClav', 'deltFront', 'triLat'],
    secondary: ['serratus'],
    archetype: 'incline_press',
    setsHint: '3×10-12', restHint: '75-90 sn',
    steps: [
      ['Sehpayı yaklaşık 15–30 derece eğime ayarla; ayaklarını yere, kalçanı ve üst sırtını sehpaya yerleştir.', 'Set the bench to roughly 15–30 degrees; plant your feet on the floor and settle your hips and upper back on the bench.'],
      ['Dambılları göğüs yanlarında dengeli tut; bileklerin ön kollarının üzerinde, dirseklerin gövdene rahat bir açıda olsun.', 'Hold the dumbbells balanced beside your chest; keep your wrists over your forearms and your elbows at a comfortable angle to your body.'],
      ['Ağırlıkları kontrollü biçimde yukarı it; tepede birbirine çarpma ve belini aşırı yaylandırma.', 'Press the weights up under control; do not clash them together at the top and do not over-arch your lower back.'],
      ['Omuzlarının rahat ettiği derinliğe yavaşça indir; set sonunda dambılları güvenle bırakabileceğin ağırlık seç.', 'Lower slowly to a depth your shoulders are comfortable with; choose a weight you can set down safely at the end of the set.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'shoulder-press', tr: 'Oturarak baş üstüne omuz itiş', trAlt: 'Shoulder press', en: 'Overhead press',
    difficulty: 'ORTA', equipTr: 'Bar/dumbbell/makine', equipEn: 'Barbell, dumbbells, or machine',
    primary: ['deltFront', 'triLat', 'triLong'],
    secondary: ['trapUpper', 'absUpper'],
    archetype: 'seated_overhead_press',
    setsHint: '3×8-10', restHint: '90-120 sn',
    steps: [
      ['Dik veya hafif geriye eğimli sırt desteğine otur; ayaklarını yere bas ve dambılları omuz hizasına getir.', 'Sit against an upright or slightly reclined back support; plant your feet and bring the dumbbells to shoulder height.'],
      ['Bileklerini ön kolların üzerinde tut; dirseklerin gövdenin biraz önünde ve rahat bir açıklıkta olsun.', 'Keep your wrists over your forearms; keep your elbows slightly in front of your body and comfortably open.'],
      ['Karnını sıkıp ağırlıkları baş üstüne it; başını öne uzatma ve belinden geriye yatma.', 'Brace your core and press the weights overhead; do not push your head forward or lean back from the lower back.'],
      ['Omuzlarının ağrısız aralığında kontrollü indir; başlangıç ve bitişte ağırlıkları güvenle taşıyabileceğin yük seç.', 'Lower under control within a pain-free shoulder range; choose a load you can handle safely at both the start and the finish.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'barbell-row', tr: 'Öne eğilerek halterle kürek çekiş', trAlt: 'Barbell kürek çekme', en: 'Barbell row',
    difficulty: 'ORTA', equipTr: 'Bar', equipEn: 'Barbell',
    primary: ['lat', 'trapMid', 'deltPost', 'biceps'],
    secondary: ['erector', 'forearmFlex'],
    archetype: 'standing_row_hinged',
    setsHint: '3-4×6-8', restHint: '120-150 sn',
    steps: [
      ['Halteri omuz genişliğine yakın üstten tutuşla kavra; dizlerini hafif bük ve kalçanı geriye göndererek eğil.', 'Grip the barbell overhand at about shoulder width; bend your knees slightly and hinge forward by pushing your hips back.'],
      ['Belinin doğal konumunu koru, karnını sık ve barı kollarının altında serbestçe tut.', 'Keep the natural position of your lower back, brace your core and let the bar hang freely under your arms.'],
      ['Barı alt kaburgalarına doğru çek; dirseklerini geriye götürürken gövdeni kaldırıp savurma.', 'Pull the bar towards your lower ribs; draw your elbows back without heaving your torso up.'],
      ['Kollarını kontrollü uzat; kürek kemiklerinin doğal hareketine izin verirken bel konumunu koru.', 'Extend your arms under control; allow your shoulder blades to move naturally while keeping your back position.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'single-arm-row', tr: 'Destekli tek kolla dambıl kürek çekiş', trAlt: 'Tek kol kürek çekme', en: 'Single-arm dumbbell row',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Bank + dumbbell', equipEn: 'Bench, dumbbell',
    primary: ['lat', 'trapMid', 'biceps'],
    secondary: ['deltPost'],
    archetype: 'standing_row_hinged',
    setsHint: '3×10-12/kol', restHint: '60-90 sn',
    steps: [
      ['Bir elini sağlam sehpaya koy; ayaklarını dengeli açıp kalçadan öne eğil ve diğer elinde dambılı tut.', 'Place one hand on a solid bench; set your feet in a balanced stance, hinge forward from the hips and hold a dumbbell in the other hand.'],
      ['Karnını sık; başını ve sırtını aynı çizgide, omuzlarını yere dönük tut.', 'Brace your core; keep your head and back in line and your shoulders facing the floor.'],
      ['Dirseğini kalçana doğru geriye götürerek dambılı gövdenin yanına çek; gövdeni yana çevirme.', 'Draw your elbow back towards your hip to pull the dumbbell alongside your body; do not rotate your torso.'],
      ['Kolu yavaşça uzat; omzu aşağı sarkıtarak zorlamadan kontrollü tekrarla ve taraf değiştir.', 'Extend the arm slowly; repeat under control without letting the shoulder sag, then switch sides.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'reverse-fly', tr: 'Öne eğilerek dambılla arka omuz açış', trAlt: 'Arka omuz açış', en: 'Dumbbell reverse fly',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell', equipEn: 'Dumbbells',
    primary: ['deltPost', 'trapMid'],
    secondary: ['infra'],
    archetype: 'hinged_fly',
    setsHint: '3×12-15', restHint: '45-60 sn',
    steps: [
      ['Hafif dambılları tut; dizlerini az bük ve kalçadan eğilerek sırtını rahat, sabit bir konuma getir.', 'Hold light dumbbells; bend your knees a little and hinge from the hips into a comfortable, steady back position.'],
      ['Kollarını aşağı sarkıt; dirseklerini hafif bük ve boynunu sırtınla aynı çizgide tut.', 'Let your arms hang down; keep your elbows slightly bent and your neck in line with your back.'],
      ['Kollarını iki yana aç; ağırlıkları omuz kontrolünü koruduğun yüksekliğe kadar kaldır.', 'Open your arms out to the sides; raise the weights to the height at which you keep control of your shoulders.'],
      ['Yavaşça indir; gövdeni yukarı kaldırarak hız alma veya omuzlarını aşırı geriye zorlama.', 'Lower slowly; do not gain momentum by lifting your torso and do not force your shoulders too far back.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'lateral-raise', tr: 'Dambılla yana omuz açış', trAlt: 'Yana açış', en: 'Lateral raise',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell', equipEn: 'Dumbbells',
    primary: ['deltFront'],
    secondary: ['deltPost'],
    archetype: 'lateral_raise_front',
    setsHint: '3×12-15', restHint: '45-60 sn',
    steps: [
      ['Hafif dambılları yanında tut; ayaklarını dengeli aç ve gövdeni dik tut.', 'Hold light dumbbells at your sides; set your feet in a balanced stance and stand tall.'],
      ['Dirseklerini hafif bükerek kollarını yanlara, gövdenin biraz önünden kaldır.', 'With your elbows slightly bent, raise your arms out to the sides, slightly in front of your body.'],
      ['Omuz hizasına kadar veya daha düşük ağrısız aralıkta ilerle; ellerini su döker gibi içe çevirme.', 'Go to shoulder height, or lower if that is your pain-free range; do not turn your hands in as if pouring water.'],
      ['Savurmadan yavaşça indir; omuzlarını aşırı silkme ve belinden hız alma.', 'Lower slowly without swinging; do not shrug heavily or gain momentum from your lower back.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'biceps-curl', tr: 'Ağırlıkla ön kol bükme', trAlt: 'Kol bükme', en: 'Biceps curl',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell/bar', equipEn: 'Dumbbells or barbell',
    primary: ['biceps', 'brachialis'],
    secondary: ['forearmFlex'],
    archetype: 'standing_arm_isolation',
    setsHint: '3×12', restHint: '45-60 sn',
    steps: [
      ['Dambılları yanlarında, avuçların öne bakacak şekilde tut; ayaklarını rahatça aç.', 'Hold the dumbbells at your sides with your palms facing forward; set your feet comfortably apart.'],
      ['Üst kollarını gövde yanında tutarak dirseklerini bük ve ağırlıkları omuzlarına doğru kaldır.', 'Keeping your upper arms at your sides, bend your elbows and lift the weights towards your shoulders.'],
      ['Bileklerini düz tut; belinden hız alma ve dirseklerini belirgin biçimde öne kaçırma.', 'Keep your wrists straight; do not gain momentum from your lower back or let your elbows drift noticeably forward.'],
      ['Dirseklerini kontrollü açarak başlangıca dön; ağırlıkları aşağı bırakma.', 'Open your elbows under control to return to the start; do not drop the weights.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'shrug', tr: 'Ağırlıkla omuz yükseltme', trAlt: 'Shrug', en: 'Shrug',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell/bar', equipEn: 'Dumbbells or barbell',
    primary: ['trapUpper'],
    secondary: [],
    archetype: 'shrug_front',
    setsHint: '3×12', restHint: '45-60 sn',
    steps: [
      ['Dambılları yanında tut ve ayaklarını dengeli aç; başını dik, kollarını uzun tut.', 'Hold the dumbbells at your sides with your feet in a balanced stance; keep your head up and your arms long.'],
      ['Dirseklerini bükmeden omuzlarını yavaşça kulaklarına doğru yükselt.', 'Without bending your elbows, slowly raise your shoulders towards your ears.'],
      ['Boynunu öne uzatmadan kısa süre dur; omuzlarını öne-arkaya yuvarlama.', 'Pause briefly without craning your neck forward; do not roll your shoulders back and forth.'],
      ['Ağırlıkları savurmadan omuzlarını yavaşça indir; tutuşunu veya boyun konumunu bozan yük kullanma.', 'Lower your shoulders slowly without swinging the weights; do not use a load that breaks your grip or your neck position.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'plank', tr: 'Eller üzerinde düz gövde duruşu', en: 'Plank',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['absMid', 'absUpper'],
    secondary: ['oblique', 'gluteMax'],
    archetype: 'plank_prone',
    setsHint: '3×30 sn', restHint: '30-45 sn',
    steps: [
      ['Ellerini omuzlarının altına koy ve bacaklarını geriye uzat; ayak uçlarından destek al.', 'Place your hands under your shoulders and extend your legs back; support yourself on your toes.'],
      ['Yeri ellerinle it; karnını ve kalçanı hafifçe sıkarak başını gövdenle aynı çizgide tut.', 'Push the floor away with your hands; gently brace your core and glutes and keep your head in line with your body.'],
      ['Belini çökertmeden veya kalçanı aşırı kaldırmadan normal nefes alarak duruşu koru.', 'Hold the position breathing normally, without letting your lower back sag or your hips pike up.'],
      ['Duruş bozulmadan dizlerini yere indir; zorlanırsan başlangıçta diz destekli uygula.', 'Lower your knees to the floor before your position breaks down; start with the knee-supported version if it is hard.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'side-plank', tr: 'Ön kol üzerinde yan gövde duruşu', trAlt: 'Yan plank', en: 'Side plank',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['oblique'],
    secondary: ['gluteMed'],
    archetype: 'side_plank',
    setsHint: '3×20-30 sn/taraf', restHint: '30 sn',
    steps: [
      ['Yan yat; dirseğini omzunun altına koy ve ön kolunu yere yerleştir.', 'Lie on your side; place your elbow under your shoulder and your forearm on the floor.'],
      ['Bacaklarını uzat; ayaklarını üst üste veya denge için hafif şaşırtmalı yerleştir.', 'Extend your legs; stack your feet, or stagger them slightly for balance.'],
      ['Yeri ön kolunla itip kalçanı kaldır; baş, gövde ve bacaklarını aynı çizgide tut, göğsünü yere döndürme.', 'Push the floor away with your forearm and lift your hips; keep your head, torso and legs in line and do not let your chest rotate towards the floor.'],
      ['Nefes alarak kısa süre koru, sonra kontrollü in ve taraf değiştir; zorlanırsan dizler bükülü destekli sürümü kullan.', 'Hold briefly while breathing, then lower under control and switch sides; use the bent-knee version if it is hard.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'bird-dog', tr: 'Dört ayak üzerinde çapraz kol ve bacak uzatma', en: 'Bird-dog',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['erector', 'gluteMax'],
    secondary: ['absMid'],
    archetype: 'bird_dog',
    setsHint: '3×6/taraf', restHint: '30-45 sn',
    steps: [
      ['Ellerini omuzlarının, dizlerini kalçalarının altına yerleştir; boynunu sırtınla aynı çizgide tut.', 'Place your hands under your shoulders and your knees under your hips; keep your neck in line with your back.'],
      ['Karnını hafifçe sık; bir kolunu öne, karşı bacağını geriye doğru uzat.', 'Gently brace your core; extend one arm forward and the opposite leg back.'],
      ['Kalçanı yana çevirmeden ve belini çukurlaştırmadan, en fazla gövde hizasına kadar uzan.', 'Reach no higher than body level, without rotating your hips to the side or hollowing your lower back.'],
      ['Kısa süre dengede kalıp elini ve dizini yavaşça yere getir; taraf değiştir ve normal nefes al.', 'Hold your balance briefly, then bring your hand and knee slowly back to the floor; switch sides and breathe normally.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'pallof-press', tr: 'Dönmeye direnerek öne itiş', en: 'Pallof press',
    difficulty: 'ORTA', equipTr: 'Kablo/bant', equipEn: 'Cable or band',
    primary: ['oblique', 'absMid'],
    secondary: [],
    archetype: 'anti_rotation_standing',
    setsHint: '3×12/taraf', restHint: '45 sn',
    steps: [
      ['Lastiği göğüs hizasında sağlam bir noktaya sabitle veya kabloyu bu yüksekliğe ayarla; bağlantıya yan dön.', 'Anchor a band at chest height to something solid, or set the cable to that height; stand side-on to the anchor.'],
      ['Tutacağı iki elinle göğsünde tut; ayaklarını rahatça açıp hafif direnç oluşana kadar uzaklaş.', 'Hold the handle at your chest with both hands; set your feet comfortably apart and step away until there is light tension.'],
      ['Karnını sık ve ellerini göğsünün önüne uzat; omuzlarının ve kalçanın bağlantıya dönmesine izin verme.', 'Brace your core and extend your hands out in front of your chest; do not let your shoulders or hips turn towards the anchor.'],
      ['Kısa süre bekleyip ellerini göğsüne getir; normal nefes al, ardından diğer yöne dönerek tekrarla.', 'Hold briefly and bring your hands back to your chest; breathe normally, then turn the other way and repeat.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'ab-wheel-rollout', tr: 'Diz üstünde karın tekerleğiyle öne uzanma', trAlt: 'Tekerlekle açılma', en: 'Ab wheel rollout',
    difficulty: 'ORTA', equipTr: 'Ab wheel', equipEn: 'Ab wheel',
    primary: ['absMid', 'absUpper'],
    secondary: ['lat'],
    archetype: 'rollout',
    setsHint: '3×8', restHint: '60 sn',
    steps: [
      ['Dizlerinin altına minder koy; tekerleği iki elinle omuzlarının altında tut.', 'Put a pad under your knees; hold the wheel with both hands under your shoulders.'],
      ['Karnını ve kalçanı hafifçe sık; kaburgalarını öne açmadan tekerleği yavaşça ileri yuvarla.', 'Gently brace your core and glutes; roll the wheel slowly forward without letting your ribs flare.'],
      ['Belin çukurlaşmadan ve omuzlarında ağrı oluşmadan kontrol edebildiğin noktada dur; başlangıçta kısa mesafe kullan.', 'Stop at the point you can control, before your lower back hollows or your shoulders hurt; use a short distance at first.'],
      ['Gövdeni kontrollü biçimde geri getir; kalçanı birden geriye kaçırma ve nefesini uzun süre tutma.', 'Bring your body back under control; do not snap your hips backwards and do not hold your breath for long.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'hanging-knee-raise', tr: 'Barda asılı dizleri karna çekme', trAlt: 'Hanging knee raise', en: 'Hanging knee raise',
    difficulty: 'ORTA', equipTr: 'Barfiks barı', equipEn: 'Pull-up bar',
    primary: ['absLower', 'absMid'],
    secondary: ['forearmFlex'],
    archetype: 'hanging_knee_raise',
    setsHint: '3×10-12', restHint: '45-60 sn',
    steps: [
      ['Sağlam bir barı güvenli tutuşla kavra; gerekirse basamak kullan ve ayaklarını yerden kes.', 'Grip a solid bar with a secure hold; use a step if needed and lift your feet off the floor.'],
      ['Omuzlarını kontrol altında tut, karnını sık ve sallanmayı durdur.', 'Keep your shoulders under control, brace your core and stop any swinging.'],
      ['Dizlerini bükerek karnına doğru kaldır; rahatça yapabiliyorsan leğen kemiğini hafifçe gövdene doğru yuvarla.', 'Bend your knees and lift them towards your stomach; if it is comfortable, roll your pelvis slightly towards your torso.'],
      ['Bacaklarını yavaşça indir; tutuşun veya omuz kontrolün bozulursa seti bitir ve basamağa güvenle in.', 'Lower your legs slowly; end the set if your grip or shoulder control breaks down and step down safely.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'suitcase-carry', tr: 'Tek elde ağırlıkla yürüme', trAlt: 'Tek el ağırlık taşıma', en: 'Suitcase carry',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Kettlebell/dumbbell', equipEn: 'Kettlebell or dumbbell',
    primary: ['oblique', 'absMid'],
    secondary: ['forearmFlex', 'trapUpper'],
    archetype: 'carry',
    setsHint: '3×30 sn/kol', restHint: '45 sn',
    steps: [
      ['Yolunu boşalt; bir dambılı diz ve kalçalarını bükerek güvenle kaldırıp yanında tut.', 'Clear your path; pick up one dumbbell safely by bending your knees and hips and hold it at your side.'],
      ['Başını dik, omuzlarını doğal hizada tut; karnını sık ve ağırlığın ters yönüne yatma.', 'Keep your head up and your shoulders naturally level; brace your core and do not lean away from the weight.'],
      ['Kısa, kontrollü adımlarla yürü; ağırlığı sallama ve nefesini tutma.', 'Walk with short, controlled steps; do not swing the weight and do not hold your breath.'],
      ['Gövden yana eğilmeye başlamadan dur; ağırlığı kontrollü bırak ve diğer elle tekrarla.', 'Stop before your torso starts to lean sideways; set the weight down under control and repeat with the other hand.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'glute-bridge', tr: 'Yerde kalça köprüsü', trAlt: 'Glute bridge', en: 'Glute bridge',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['gluteMax'],
    secondary: ['hamBF', 'absMid'],
    archetype: 'glute_bridge',
    setsHint: '3×12-15', restHint: '30-45 sn',
    steps: [
      ['Sırtüstü yat, dizlerini bük ve ayaklarını kalça genişliğinde yere bas; kolların yanında kalsın.', 'Lie on your back, bend your knees and plant your feet hip-width apart; keep your arms at your sides.'],
      ['Karnını hafifçe sık ve ayak tabanlarınla yeri iterek kalçanı yükselt.', 'Gently brace your core and push the floor away through your soles to lift your hips.'],
      ['Omuzların yerde kalırken kalçanı dizlerinle gövdenin aynı çizgiye geldiği kadar kaldır; boynuna yük bindirme.', 'With your shoulders staying on the floor, lift your hips until your knees and torso come into line; do not load your neck.'],
      ['Kalça kaslarını kısa süre sıkıp yavaşça yere dön; belini yaylandırma.', 'Squeeze your glutes briefly and lower slowly to the floor; do not arch your lower back.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'leg-press', tr: 'Makinede bacak itiş', trAlt: 'Bacak presi', en: 'Leg press',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Leg press makinesi', equipEn: 'Leg press machine',
    primary: ['quadRF', 'quadVL', 'quadVM', 'gluteMax'],
    secondary: ['adductors', 'hamBF', 'soleus'],
    archetype: 'leg_press_seated',
    setsHint: '3×10-12', restHint: '90-120 sn',
    steps: [
      ['Koltuğu ve güvenlik durdurucularını ayarla; ayaklarını platforma yaklaşık omuz genişliğinde yerleştir.', 'Adjust the seat and the safety stops; place your feet on the platform at roughly shoulder width.'],
      ['Platformu kontrollü itip kilidi makinenin talimatına göre aç; dizlerini sertçe kilitleme.', 'Press the platform under control and release the lock as the machine instructs; do not snap your knees into lockout.'],
      ['Dizlerini ayak yönünde bükerek platformu indir; topukların basılı, kalçan ve belin destekli kalsın.', 'Lower the platform bending your knees in line with your feet; keep your heels pressed down and your hips and back supported.'],
      ['Kalçan yuvarlanıp sehpadan ayrılmadan dur ve tüm tabanınla it; dizlerini ellerinle bastırma.', 'Stop before your hips roll off the seat and press through your whole foot; do not push on your knees with your hands.'],
      ['Bitirirken güvenlik kilidinin devreye girdiğinden emin ol; sonra platformdaki yükü bırak.', 'When you finish, make sure the safety lock has engaged, then release the load on the platform.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'leg-extension', tr: 'Oturarak makinede diz açma', trAlt: 'Ön bacak makinesi', en: 'Leg extension',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Leg extension makinesi', equipEn: 'Leg extension machine',
    primary: ['quadRF', 'quadVL', 'quadVM'],
    secondary: [],
    archetype: 'leg_extension_seated',
    setsHint: '3×12-15', restHint: '60 sn',
    steps: [
      ['Sırt desteğini ve koltuğu ayarla; dizin makinenin dönme ekseniyle hizalansın.', 'Adjust the back support and the seat so that your knee lines up with the machine\'s axis of rotation.'],
      ['Alt pedi ayaklarının üzerine değil ayak bileklerinin biraz üzerindeki kaval bölgesine yerleştir; tutacakları kavra.', 'Place the lower pad on your shin just above your ankles, not on your feet; hold the handles.'],
      ['Kalçanı ve uyluklarını koltukta tutarak dizlerini rahatça düzleştir; eklemi sertçe kilitleme.', 'Keeping your hips and thighs on the seat, straighten your knees comfortably; do not snap the joint into lockout.'],
      ['Ağırlığı yavaşça indir; ağrı hissedersen yükü veya hareket aralığını azalt.', 'Lower the weight slowly; reduce the load or the range of motion if you feel pain.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'leg-curl', tr: 'Oturarak makinede diz bükme', trAlt: 'Arka bacak makinesi', en: 'Leg curl',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Leg curl makinesi', equipEn: 'Leg curl machine',
    primary: ['hamBF', 'hamST'],
    secondary: ['gastroLat', 'gastroMed'],
    archetype: 'leg_curl_seated',
    setsHint: '3×12', restHint: '60-75 sn',
    steps: [
      ['Koltuğu diz eklemin makinenin dönme ekseniyle hizalanacak şekilde ayarla; sırtını dayanağa yerleştir.', 'Adjust the seat so your knee joint lines up with the machine\'s axis of rotation; settle your back against the support.'],
      ['Uyluk pedini sabitle; alt pedi Aşil tendonuna değil ayak bileğinin biraz üstündeki alt bacak bölümüne yerleştir.', 'Secure the thigh pad; place the lower pad on your lower leg just above the ankle, not on your Achilles tendon.'],
      ['Tutacakları kavra ve topuklarını aşağı-geriye çekerek dizlerini bük; kalçanı koltuktan kaldırma.', 'Hold the handles and bend your knees by pulling your heels down and back; do not lift your hips off the seat.'],
      ['Dizlerini kontrollü aç; ağırlıkları çarptırma ve dizde ağrı oluşturan aralığa girme.', 'Open your knees under control; do not let the weights clash and do not enter a range that causes knee pain.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'lat-pulldown', tr: 'Üst makaradan göğse çekiş', trAlt: 'Lat çekişi', en: 'Lat pulldown',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Pulldown makinesi', equipEn: 'Lat pulldown machine',
    primary: ['lat', 'trapMid'],
    secondary: ['biceps', 'brachialis', 'deltPost', 'trapLower'],
    archetype: 'lat_pulldown_seated',
    setsHint: '3×10-12', restHint: '90 sn',
    steps: [
      ['Uyluk desteğini ayarla ve ayaklarını yere bas; barı omuz genişliğinden biraz geniş, rahat bir tutuşla kavra.', 'Adjust the thigh support and plant your feet; grip the bar a little wider than shoulder width in a comfortable hold.'],
      ['Gövdeni hafif geriye eğip bu açıyı koru; boynunu öne uzatma.', 'Lean your torso back slightly and keep that angle; do not push your head forward.'],
      ['Dirseklerini aşağı götürerek barı üst göğsüne yaklaştır; belden savrulma veya barı zorla göğse bastırma.', 'Draw your elbows down to bring the bar towards your upper chest; do not heave from the lower back or force the bar onto your chest.'],
      ['Kollarını ve omuzlarını kontrollü biçimde yukarı bırak; ağırlık yığınını çarptırma.', 'Let your arms and shoulders rise under control; do not let the weight stack clash.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'seated-cable-row', tr: 'Oturarak kablolu kürek çekiş', trAlt: 'Seated cable row', en: 'Seated cable row',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Kablo kürek makinesi', equipEn: 'Seated row machine',
    primary: ['trapMid', 'lat', 'deltPost'],
    secondary: ['biceps', 'brachialis', 'erector', 'trapLower'],
    archetype: 'seated_row_cable',
    setsHint: '3×10-12', restHint: '90 sn',
    steps: [
      ['Ayaklarını desteklere bas, dizlerini hafif bük ve tutacağı kavra; sırtının doğal eğrilerini koru.', 'Plant your feet on the supports, bend your knees slightly and grip the handle; keep the natural curves of your back.'],
      ['Gövdeni dik ve sabit tutarak dirseklerini geriye götür; tutacağı üst karın bölgesine çek.', 'Keeping your torso upright and steady, draw your elbows back; pull the handle to your upper abdomen.'],
      ['Omuzlarını kulaklarından uzak tut; kürek kemiklerinin kontrollü biçimde birbirine yaklaşmasına izin ver.', 'Keep your shoulders away from your ears; let your shoulder blades draw together under control.'],
      ['Kollarını yavaşça uzat; omuzların doğal olarak öne gelebilir ancak belini yuvarlayıp ağırlığa uzanma.', 'Extend your arms slowly; your shoulders may come forward naturally, but do not round your back to reach for the weight.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'chest-supported-row', tr: 'Göğüs destekli dambılla kürek çekiş', trAlt: 'Chest-supported row', en: 'Chest-supported row',
    difficulty: 'ORTA', equipTr: 'Eğik sehpa + dumbbell', equipEn: 'Incline bench, dumbbells',
    primary: ['trapMid', 'deltPost', 'lat'],
    secondary: ['biceps', 'brachialis', 'trapLower'],
    archetype: 'standing_row_hinged',
    setsHint: '4×10', restHint: '75 sn',
    steps: [
      ['Eğimli ve sabit bir sehpaya göğsünü dayayıp ayaklarını yere bas; başını sırtınla aynı çizgide tut.', 'Rest your chest on a stable incline bench and plant your feet; keep your head in line with your back.'],
      ['Dambılları omuzlarının altında tut; göğsünün sehpayla temasını koru.', 'Hold the dumbbells under your shoulders; keep your chest in contact with the bench.'],
      ['Dirseklerini geriye götürerek ağırlıkları alt kaburga yanlarına çek; omuzlarını kulaklarına yükseltme.', 'Draw your elbows back to pull the weights to the sides of your lower ribs; do not shrug towards your ears.'],
      ['Kollarını kontrollü uzat; göğsünü sehpadan kaldırarak veya belini yaylandırarak hız alma.', 'Extend your arms under control; do not gain momentum by lifting your chest off the bench or arching your back.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'pullup', tr: 'Üstten tutuşla barfiks', trAlt: 'Pull-up', en: 'Pull-up',
    difficulty: 'İLERİ', equipTr: 'Barfiks barı', equipEn: 'Pull-up bar',
    primary: ['lat', 'trapMid'],
    secondary: ['biceps', 'brachialis', 'deltPost', 'forearmFlex'],
    archetype: 'pull_up_hang',
    setsHint: '3×AMRAP', restHint: '120 sn',
    steps: [
      ['Sağlam barı omuz genişliğinden biraz geniş, rahat üstten tutuşla kavra; gerekirse basamakla yerleş.', 'Grip a solid bar overhand, a little wider than shoulder width, in a comfortable hold; use a step to get set if needed.'],
      ['Ayaklarını yerden kes ve omuzlarını kontrollü tut; karnını sıkarak sallanmayı azalt.', 'Lift your feet off the floor and keep your shoulders under control; brace your core to reduce swinging.'],
      ['Dirseklerini aşağı-geriye çekerek gövdeni yükselt; çeneni öne uzatarak bara yetişmeye çalışma.', 'Pull your elbows down and back to raise your body; do not crane your chin forward to reach the bar.'],
      ['Kollarını kontrollü uzatarak in; kendini aşağı bırakma, gerekirse destekli barfiks makinesi kullan.', 'Lower by extending your arms under control; do not drop yourself, and use an assisted pull-up machine if needed.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'triceps-pushdown', tr: 'Üst makarada arka kol aşağı itiş', trAlt: 'Triceps itişi', en: 'Triceps pushdown',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Kablo makinesi', equipEn: 'Cable machine',
    primary: ['triLat', 'triLong'],
    secondary: ['forearmExt'],
    archetype: 'triceps_pushdown_standing',
    setsHint: '3×12-15', restHint: '45-60 sn',
    steps: [
      ['Üst makaraya halat veya kısa bar tak; ayaklarını dengeli açıp tutacağı kavra.', 'Attach a rope or a short bar to the high pulley; set your feet in a balanced stance and grip the handle.'],
      ['Dirseklerini gövdenin yanında bükülü tut; karnını sık ve bileklerini düz konumlandır.', 'Keep your elbows bent at your sides; brace your core and keep your wrists straight.'],
      ['Üst kollarını oynatmadan dirseklerini açarak tutacağı aşağı it; eklemi sertçe kilitleme.', 'Without moving your upper arms, straighten your elbows to push the handle down; do not snap the joint into lockout.'],
      ['Dirseklerini kontrollü büküp başlangıca dön; omuzlardan bastırma veya tüm vücut ağırlığınla yüklenme.', 'Bend your elbows under control to return to the start; do not press down from the shoulders or lean your whole body weight on it.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'face-pull', tr: 'Halatla yüze çekiş', trAlt: 'Face pull', en: 'Face pull',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Kablo + halat', equipEn: 'Cable, rope',
    primary: ['deltPost', 'trapMid'],
    secondary: ['infra', 'teres', 'trapLower'],
    archetype: 'face_pull_standing',
    setsHint: '3-4×15', restHint: '45-60 sn',
    steps: [
      ['Halatı yüz hizasında veya biraz üzerinde makaraya tak; iki ucunu tutup kablo gerilene kadar geri adım at.', 'Attach the rope to the pulley at face height or slightly above; hold both ends and step back until the cable is taut.'],
      ['Dengeli dur ve karnını sık; halatı burun-alın hizasına doğru çek.', 'Stand balanced and brace your core; pull the rope towards the level of your nose and forehead.'],
      ['Ellerini başının iki yanına ayırırken dirseklerini rahatça yana ve geriye götür; omuzlarını zorlayacak kadar yükseltme.', 'As you separate your hands to either side of your head, take your elbows comfortably out and back; do not raise them so high that it strains your shoulders.'],
      ['Kollarını yavaşça uzat; hafif ağırlıkla çalış ve halatı yüzüne çarptırma.', 'Extend your arms slowly; work with a light weight and do not let the rope hit your face.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'dead-bug', tr: 'Sırtüstü çapraz kol ve bacak uzatma', trAlt: 'Dead bug', en: 'Dead bug',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['absMid', 'absLower'],
    secondary: ['absUpper', 'oblique'],
    archetype: 'dead_bug_supine',
    setsHint: '3×8-10/taraf', restHint: '30-45 sn',
    steps: [
      ['Sırtüstü yat; kollarını tavana uzat, kalça ve dizlerini yaklaşık dik açıya getir.', 'Lie on your back; reach your arms towards the ceiling and bring your hips and knees to about a right angle.'],
      ['Nefes verip karnını hafifçe sık; belini rahatça zemine yaklaştır, zorla bastırma.', 'Exhale and gently brace your core; let your lower back settle comfortably towards the floor without forcing it down.'],
      ['Bir kolunu başının arkasına, karşı bacağını ileri doğru yavaşça uzat; belin yaylanmaya başlamadan dur.', 'Slowly extend one arm behind your head and the opposite leg forward; stop before your lower back starts to arch.'],
      ['Başlangıca dönüp taraf değiştir; zorlanırsan bacağını daha az uzat veya yalnızca topuğunu yere dokundur.', 'Return to the start and switch sides; if it is hard, extend the leg less far or only touch your heel to the floor.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'mcgill-curl-up', tr: 'McGill kısa gövde kaldırma', en: 'McGill curl-up',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['absUpper', 'absMid'],
    secondary: ['oblique'],
    archetype: 'curl_up_supine',
    setsHint: '5-3-1 piramit', restHint: '30 sn',
    steps: [
      ['Sırtüstü yat; bir dizini büküp ayağını yere bas, diğer bacağını uzat.', 'Lie on your back; bend one knee and plant that foot, leaving the other leg extended.'],
      ['Ellerini belinin doğal boşluğuna koy; karnını hafifçe sık ve çeneni öne uzatma.', 'Place your hands in the natural hollow of your lower back; gently brace your core and do not push your chin forward.'],
      ['Başını ve omuzlarını tek parça gibi yerden az miktarda kaldır; belindeki eğriyi koru.', 'Lift your head and shoulders off the floor a small amount as one piece; keep the curve in your lower back.'],
      ['Normal nefes alarak kısa süre tut, sonra yavaşça indir ve dinlen; bükülü bacağı değiştir.', 'Hold briefly while breathing normally, then lower slowly and rest; switch which leg is bent.'],
      ['Boynunu çekiştirme veya hareketi tam mekiğe dönüştürme; ağrı oluşursa dur.', 'Do not pull on your neck or turn this into a full sit-up; stop if you feel pain.'],
    ],
    poseReviewed: false,
  },
];

/**
 * Every exercise line that appears in the program templates, mapped to a
 * library entry — or `null` where there is deliberately nothing to show:
 * cardio blocks, one-line circuit descriptions and "the day's first movement,
 * empty bar" placeholders are programming instructions, not single movements
 * with a start and an end pose.
 */
export const NAME_TO_EXERCISE: Record<string, string | null> = {
  'Ab wheel rollout (dizden)': 'ab-wheel-rollout',
  'Ana hareketin hafif ilk seti': null,
  'Aralık: 30 sn sert / 90 sn hafif (bisiklet, kürek veya koşu bandı)': null,
  'Asılı bacak kaldırma': 'hanging-knee-raise',
  'Asılı bacak kaldırma / diz çekme': 'hanging-knee-raise',
  'Asılı diz çekme': 'hanging-knee-raise',
  'Ayak bileği duvar mobilizasyonu': null,
  'Bacak sallama (öne-arkaya, yana)': null,
  'Back squat': 'back-squat',
  'Bant dış rotasyon': 'band-external-rotation',
  'Bant ile dış rotasyon': 'band-external-rotation',
  'Bant ile omuz dış rotasyon (yoksa boş elle)': 'band-external-rotation',
  'Bant pull-apart': 'band-pull-apart',
  'Bant pull-apart (veya boş elle kürek kemiği sıkma)': 'band-pull-apart',
  'Barbell / kablo row': 'barbell-row',
  'Barbell row': 'barbell-row',
  'Barfiks': 'pullup',
  'Bench press': 'bench-press',
  'Bench press (bar veya dumbbell)': 'bench-press',
  'Biceps curl': 'biceps-curl',
  'Biceps curl + triceps pushdown (süperset)': 'biceps-curl',
  'Bird-dog': 'bird-dog',
  'Bird-dog (dirsek-diz temaslı)': 'bird-dog',
  'Bisiklet / kürek / yürüyüş bandı': null,
  'Bitiş: bisiklet / kürek': null,
  'Bitiş: yürüyüş bandı eğimli': null,
  'Bulgarian split squat': 'bulgarian-split-squat',
  'Calf raise': 'calf-raise',
  'Chest-supported dumbbell row': 'chest-supported-row',
  'Dead hang (barda asılma)': 'pullup',
  'Deadlift (trap bar tercih) ': 'deadlift',
  'Devre: goblet squat → şınav → dumbbell row → kettlebell swing → mountain climber': null,
  'Dumbbell devre: curl → lateral raise → pushdown': null,
  'Dumbbell omuz pres': 'shoulder-press',
  'Dumbbell omuz pres (oturarak)': 'shoulder-press',
  'Dumbbell reverse fly': 'reverse-fly',
  'Dumbbell reverse fly (öne eğik)': 'reverse-fly',
  'Goblet squat': 'goblet-squat',
  'Goblet squat (hafif dumbbell)': 'goblet-squat',
  'Goblet squat veya leg press': 'goblet-squat',
  'Göğüs pres (makine veya dumbbell)': 'bench-press',
  'Göğüs pres (makine)': 'bench-press',
  'Günün ilk hareketi — boş bar / hafif': null,
  'Hack squat veya front squat': 'front-hack-squat',
  'Hammer curl + overhead triceps (süperset)': 'biceps-curl',
  'Hip thrust (bar veya makine)': 'hip-thrust',
  'Incline dumbbell pres': 'incline-press',
  'Isınma: hafif kardiyo': null,
  'Kablo dış rotasyon': 'band-external-rotation',
  'Kablo kürek (chest-supported row)': 'chest-supported-row',
  'Kalça köprüsü': 'glute-bridge',
  'Kalça köprüsü (glute bridge)': 'glute-bridge',
  'Kalça köprüsü / hip thrust': 'hip-thrust',
  'Kedi-deve (cat-cow)': 'cat-cow',
  'Kettlebell deadlift (1–4. hafta) → Romanian deadlift (5. haftadan)': 'rdl',
  'Kol çevirme (öne / arkaya)': 'arm-circles',
  'Kol çevirme + kedi-deve': 'arm-circles',
  'Kol çevirme + omuz silkme': 'arm-circles',
  'Kürek / kol ergometresi / ip atlama': null,
  'Lat pulldown': 'lat-pulldown',
  'Lat pulldown (geniş)': 'lat-pulldown',
  'Lat pulldown (nötr tutuş)': 'lat-pulldown',
  'Lat pulldown veya barfiks': 'lat-pulldown',
  'Lateral raise': 'lateral-raise',
  'Leg curl': 'leg-curl',
  'Leg extension': 'leg-extension',
  'Leg press': 'leg-press',
  'Lunge + gövde rotasyonu (world\'s greatest stretch)': 'worlds-greatest-stretch',
  'McGill curl-up': 'mcgill-curl-up',
  'Omuz pres (makine veya dumbbell)': 'shoulder-press',
  'Omuz silkme (shrug)': 'shrug',
  'Oturarak kürek': 'seated-cable-row',
  'Oturarak kürek (seated row)': 'seated-cable-row',
  'Overhead press (bar)': 'shoulder-press',
  'Pallof pres': 'pallof-press',
  'Plank': 'plank',
  'Plank (dizden veya ayaktan)': 'plank',
  'Reverse lunge (geriye adım) — destekle': 'reverse-lunge',
  'Romanian deadlift': 'rdl',
  'Romanian deadlift (bar)': 'rdl',
  'Romanian deadlift (dumbbell)': 'rdl',
  'Scapular şınav / duvarda scapular kaydırma': null,
  'Side bridge (dizden)': 'side-plank',
  'Side plank': 'side-plank',
  'Side plank (ayaktan) + üst bacak kaldırma': 'side-plank',
  'Soğuma: hafif kardiyo': null,
  'Step-up (kutu)': 'step-up',
  'Suitcase carry (tek el kettlebell)': 'suitcase-carry',
  'Tek kol dumbbell row': 'single-arm-row',
  'Tempolu kardiyo (bisiklet / eliptik / yürüyüş bandı / dışarıda tempolu yürüyüş)': null,
  'Torasik açılma (foam roller üstünde)': null,
  'Torasik açılma (yan yatarak kitap açma)': null,
  'Triceps pushdown': 'triceps-pushdown',
  'Vücut ağırlığıyla squat': 'goblet-squat',
  'Walking lunge': 'walking-lunge',
  'Weighted barfiks veya ağır lat pulldown': 'pullup',
  'Yan yatarak bacak kaldırma / bantlı yan adım': null,
  'Yerinde hafif koşu / ip atlama': null,
  'Yerinde yürüyüş / hafif zıplama': null,
  'Yüz çekişi': 'face-pull',
  'Yüz çekişi (face pull)': 'face-pull',
  'Çene içeri çekme (chin tuck)': 'chin-tuck',
  'Ölü böcek': 'dead-bug',
  'Ölü böcek (dead bug)': 'dead-bug',
};

const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function exerciseById(id: string | undefined): Exercise | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/**
 * Resolve a program line to a library entry. Exact match first (that is what
 * the template seed writes), then a loose match so a trainer who typed
 * "Bench press (geniş tutuş)" by hand still lands on the right page.
 *
 * The loose match runs BOTH WAYS. It used to only ask "does the typed line
 * contain a library name", which worked while the Turkish names were short
 * gym names ("Bench press"). On 11 Sep 2026 they became descriptive phrases
 * ("Düz sehpada halterle göğüs itiş") and no hand-typed line contains one of
 * those any more — the fallback resolved nothing. Stripping the trainer's
 * parenthetical note and also asking the reverse question restores it:
 * "Bench press (geniş tutuş)" → "bench press" ⊂ "barbell bench press".
 */
export function exerciseByName(name: string | undefined): Exercise | null {
  if (!name) return null;
  const exact = NAME_TO_EXERCISE[name];
  if (exact !== undefined) return exact ? (BY_ID.get(exact) ?? null) : null;
  const needle = name.toLocaleLowerCase('tr');
  // "(geniş tutuş)", "(her iki yön)" — the note is the trainer's, not a name.
  const bare = needle.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const hit = EXERCISES.find((e) =>
    exerciseNames(e).some((raw) => {
      const n = raw.toLocaleLowerCase('tr');
      // Tek kelimelik bir giriş ("row", "pres") ondan uzun her adın içinde
      // geçer; ters yönü yalnızca iki kelimeden uzun girişlerde açıyoruz.
      return needle.includes(n) || (bare.includes(' ') && n.includes(bare));
    }),
  );
  return hit ?? null;
}

/** Every name a movement answers to — display and search both read this. */
export const exerciseNames = (e: Exercise): string[] =>
  e.trAlt ? [e.tr, e.trAlt, e.en] : [e.tr, e.en];