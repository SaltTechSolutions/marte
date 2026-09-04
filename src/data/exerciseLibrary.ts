// GENERATED — do not hand-edit. Rebuild with
// `marte06/scripts/build_exercise_library.py` (source data lives beside it).
//
// The exercise visualiser (PER-19): 38 canonical movements distilled from the
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

/** Start/end frames. `end: null` means an isometric hold — one frame only. */
export interface PoseArchetype {
  start: PoseFrame;
  end: PoseFrame | null;
}

export const POSE_ARCHETYPES: Record<string, PoseArchetype> = {
  squat: {
    start: { head: [150, 46], shoulder: [150, 70], elbow: [134, 96], wrist: [138, 68], hip: [152, 134], knee: [152, 172], ankle: [150, 206], toe: [174, 206], bar: [146, 66], arrow: [196, 112, 180, 158] },
    end: { head: [144, 76], shoulder: [146, 100], elbow: [128, 124], wrist: [132, 98], hip: [130, 166], knee: [170, 176], ankle: [150, 206], toe: [174, 206], bar: [142, 96] },
  },
  squat_goblet: {
    start: { head: [150, 46], shoulder: [150, 70], elbow: [144, 100], wrist: [150, 120], hip: [152, 134], knee: [152, 172], ankle: [150, 206], toe: [174, 206], bar: [150, 122], arrow: [196, 112, 180, 158] },
    end: { head: [144, 76], shoulder: [146, 100], elbow: [140, 128], wrist: [146, 148], hip: [130, 166], knee: [170, 176], ankle: [150, 206], toe: [174, 206], bar: [146, 150] },
  },
  hinge: {
    start: { head: [128, 96], shoulder: [144, 112], elbow: [150, 146], wrist: [152, 180], hip: [178, 142], knee: [156, 172], ankle: [150, 206], toe: [174, 206], bar: [152, 182], arrow: [204, 172, 204, 118] },
    end: { head: [150, 46], shoulder: [150, 70], elbow: [150, 104], wrist: [152, 140], hip: [152, 136], knee: [152, 172], ankle: [150, 206], toe: [174, 206], bar: [152, 142] },
  },
  hip_hinge_dumbbell: {
    start: { head: [150, 46], shoulder: [150, 70], elbow: [150, 102], wrist: [152, 138], hip: [152, 136], knee: [152, 172], ankle: [150, 206], toe: [174, 206], bar: [152, 140] },
    end: { head: [130, 94], shoulder: [144, 110], elbow: [150, 142], wrist: [152, 172], hip: [176, 140], knee: [156, 172], ankle: [150, 206], toe: [174, 206], bar: [152, 174], arrow: [204, 168, 204, 118] },
  },
  hip_thrust: {
    start: { head: [70, 150], shoulder: [92, 152], elbow: [92, 176], wrist: [92, 196], hip: [132, 180], knee: [168, 180], ankle: [168, 206], toe: [190, 206], bar: [150, 168], props: [{ x: 56, y: 150, w: 16, h: 42 }] },
    end: { head: [70, 150], shoulder: [92, 150], elbow: [92, 174], wrist: [92, 194], hip: [132, 140], knee: [168, 168], ankle: [168, 206], toe: [190, 206], bar: [150, 132], arrow: [150, 168, 150, 140], props: [{ x: 56, y: 150, w: 16, h: 42 }] },
  },
  bench_press: {
    start: { head: [100, 138], shoulder: [120, 144], elbow: [120, 116], wrist: [118, 90], hip: [198, 148], knee: [230, 172], ankle: [230, 204], toe: [248, 204], bar: [118, 90], arrow: [152, 96, 152, 126], props: [{ x: 70, y: 150, w: 180, h: 14, r: 5 }, { x: 88, y: 164, w: 12, h: 42 }, { x: 220, y: 164, w: 12, h: 42 }] },
    end: { head: [100, 138], shoulder: [120, 144], elbow: [138, 120], wrist: [118, 124], hip: [198, 148], knee: [230, 172], ankle: [230, 204], toe: [248, 204], bar: [118, 124], props: [{ x: 70, y: 150, w: 180, h: 14, r: 5 }, { x: 88, y: 164, w: 12, h: 42 }, { x: 220, y: 164, w: 12, h: 42 }] },
  },
  incline_press: {
    start: { head: [86, 120], shoulder: [108, 132], elbow: [112, 104], wrist: [110, 78], hip: [176, 158], knee: [214, 178], ankle: [218, 204], toe: [238, 204], bar: [110, 78], arrow: [146, 86, 146, 116], props: [{ x: 60, y: 90, w: 40, h: 110, r: 8 }, { x: 74, y: 160, w: 140, h: 14, r: 5 }, { x: 200, y: 174, w: 12, h: 34 }] },
    end: { head: [86, 120], shoulder: [108, 132], elbow: [128, 108], wrist: [110, 110], hip: [176, 158], knee: [214, 178], ankle: [218, 204], toe: [238, 204], bar: [110, 110], props: [{ x: 60, y: 90, w: 40, h: 110, r: 8 }, { x: 74, y: 160, w: 140, h: 14, r: 5 }, { x: 200, y: 174, w: 12, h: 34 }] },
  },
  seated_overhead_press: {
    start: { head: [150, 58], shoulder: [150, 84], elbow: [132, 90], wrist: [130, 64], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [172, 206], bar: [130, 64], arrow: [178, 96, 178, 66], props: [{ x: 140, y: 150, w: 22, h: 58, r: 6 }] },
    end: { head: [150, 58], shoulder: [150, 84], elbow: [144, 54], wrist: [150, 28], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [172, 206], bar: [150, 28], props: [{ x: 140, y: 150, w: 22, h: 58, r: 6 }] },
  },
  standing_row_hinged: {
    start: { head: [128, 96], shoulder: [144, 112], elbow: [150, 146], wrist: [152, 178], hip: [178, 142], knee: [156, 172], ankle: [150, 206], toe: [174, 206], bar: [152, 180] },
    end: { head: [128, 96], shoulder: [144, 112], elbow: [168, 120], wrist: [176, 142], hip: [178, 142], knee: [156, 172], ankle: [150, 206], toe: [174, 206], bar: [176, 144], arrow: [204, 182, 204, 150] },
  },
  pullup: {
    start: { head: [152, 74], shoulder: [150, 100], elbow: [138, 68], wrist: [126, 36], hip: [150, 160], knee: [148, 186], ankle: [176, 176], toe: [192, 172], bar: [126, 34] },
    end: { head: [152, 52], shoulder: [150, 78], elbow: [140, 58], wrist: [126, 36], hip: [150, 138], knee: [148, 164], ankle: [176, 154], toe: [192, 150], bar: [126, 34], arrow: [196, 110, 196, 84] },
  },
  unilateral_lunge: {
    start: { head: [150, 46], shoulder: [150, 70], elbow: [136, 96], wrist: [140, 120], hip: [152, 134], knee: [152, 172], ankle: [150, 206], toe: [174, 206], bar: [140, 122] },
    end: { head: [144, 70], shoulder: [146, 94], elbow: [132, 118], wrist: [136, 142], hip: [142, 152], knee: [176, 178], ankle: [176, 206], toe: [198, 206], farKnee: [104, 186], farAnkle: [84, 196], farToe: [102, 206], bar: [136, 144] },
  },
  step_up: {
    start: { head: [110, 66], shoulder: [112, 90], elbow: [100, 116], wrist: [104, 140], hip: [114, 150], knee: [114, 182], ankle: [114, 206], toe: [136, 206], bar: [104, 142], props: [{ x: 150, y: 174, w: 70, h: 32, r: 4 }] },
    end: { head: [176, 52], shoulder: [178, 76], elbow: [166, 102], wrist: [170, 126], hip: [180, 136], knee: [188, 166], ankle: [188, 174], toe: [210, 174], farKnee: [152, 178], farAnkle: [132, 206], farToe: [154, 206], bar: [170, 128], props: [{ x: 150, y: 174, w: 70, h: 32, r: 4 }] },
  },
  calf_raise: {
    start: { head: [150, 58], shoulder: [150, 84], elbow: [142, 110], wrist: [144, 136], hip: [150, 150], knee: [150, 182], ankle: [148, 200], toe: [170, 206] },
    end: { head: [150, 50], shoulder: [150, 76], elbow: [142, 102], wrist: [144, 128], hip: [150, 142], knee: [150, 174], ankle: [148, 192], toe: [168, 198], arrow: [110, 180, 110, 158] },
  },
  plank_prone: {
    start: { head: [262, 150], shoulder: [228, 152], elbow: [210, 178], wrist: [210, 198], hip: [150, 150], knee: [90, 150], ankle: [46, 150], toe: [46, 168] },
    end: null,
  },
  side_plank: {
    start: { head: [254, 120], shoulder: [224, 128], elbow: [210, 158], wrist: [210, 180], hip: [150, 142], knee: [90, 150], ankle: [46, 156], toe: [46, 174] },
    end: null,
  },
  floor_core_supine: {
    start: { head: [248, 168], shoulder: [220, 168], elbow: [200, 146], wrist: [200, 118], hip: [150, 168], knee: [110, 150], ankle: [80, 168], toe: [60, 168] },
    end: { head: [248, 168], shoulder: [220, 168], elbow: [236, 148], wrist: [248, 124], hip: [150, 168], knee: [150, 168], ankle: [176, 180], toe: [196, 182], farKnee: [110, 150], farAnkle: [80, 168], farToe: [60, 168], farElbow: [200, 146], farWrist: [200, 118], arrow: [130, 132, 158, 150] },
  },
  bird_dog: {
    start: { head: [244, 134], shoulder: [216, 140], elbow: [216, 172], wrist: [216, 204], hip: [150, 140], knee: [150, 174], ankle: [150, 204], toe: [132, 206] },
    end: { head: [248, 128], shoulder: [218, 138], elbow: [218, 170], wrist: [218, 204], hip: [150, 140], knee: [104, 130], ankle: [68, 122], toe: [52, 120], farKnee: [150, 174], farAnkle: [150, 204], farToe: [132, 206], farElbow: [256, 120], farWrist: [292, 106], arrow: [92, 152, 64, 136] },
  },
  quadruped_spine: {
    start: { head: [248, 120], shoulder: [216, 138], elbow: [216, 172], wrist: [216, 204], hip: [150, 148], knee: [150, 174], ankle: [150, 204], toe: [132, 206] },
    end: { head: [242, 148], shoulder: [214, 142], elbow: [214, 174], wrist: [214, 204], hip: [150, 126], knee: [150, 166], ankle: [150, 204], toe: [132, 206], arrow: [180, 108, 180, 130] },
  },
  hinged_fly: {
    start: { head: [128, 96], shoulder: [144, 112], elbow: [148, 144], wrist: [150, 176], hip: [178, 142], knee: [156, 172], ankle: [150, 206], toe: [174, 206], bar: [150, 178] },
    end: { head: [128, 96], shoulder: [144, 112], elbow: [160, 126], wrist: [178, 110], hip: [178, 142], knee: [156, 172], ankle: [150, 206], toe: [174, 206], bar: [180, 108], arrow: [200, 168, 204, 124] },
  },
  mobility_bodyweight: {
    start: { head: [150, 58], shoulder: [150, 84], elbow: [122, 96], wrist: [98, 96], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206] },
    end: { head: [150, 58], shoulder: [150, 84], elbow: [178, 96], wrist: [202, 96], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206], arrow: [130, 60, 170, 60] },
  },
  anti_rotation_standing: {
    start: { head: [150, 58], shoulder: [150, 84], elbow: [132, 96], wrist: [112, 96], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206], bar: [112, 96], arrow: [70, 96, 110, 96] },
    end: { head: [150, 58], shoulder: [150, 84], elbow: [150, 96], wrist: [178, 96], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206], bar: [178, 96] },
  },
  carry: {
    start: { head: [120, 58], shoulder: [120, 84], elbow: [110, 110], wrist: [108, 140], hip: [120, 150], knee: [110, 182], ankle: [104, 206], toe: [126, 206], farKnee: [132, 182], farAnkle: [140, 206], farToe: [162, 206], bar: [108, 142] },
    end: { head: [190, 58], shoulder: [190, 84], elbow: [180, 110], wrist: [178, 140], hip: [190, 150], knee: [204, 182], ankle: [210, 206], toe: [232, 206], farKnee: [178, 182], farAnkle: [170, 206], farToe: [192, 206], bar: [178, 142], arrow: [150, 60, 180, 60] },
  },
  standing_arm_isolation: {
    start: { head: [150, 58], shoulder: [150, 84], elbow: [146, 110], wrist: [148, 138], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206], bar: [148, 140] },
    end: { head: [150, 58], shoulder: [150, 84], elbow: [146, 110], wrist: [130, 86], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206], bar: [130, 86], arrow: [112, 120, 112, 92] },
  },
  rollout: {
    start: { head: [214, 140], shoulder: [192, 148], elbow: [178, 168], wrist: [176, 188], hip: [150, 150], knee: [110, 182], ankle: [100, 192], toe: [118, 196] },
    end: { head: [286, 166], shoulder: [254, 168], elbow: [228, 178], wrist: [210, 186], hip: [150, 150], knee: [110, 182], ankle: [100, 192], toe: [118, 196], arrow: [300, 150, 270, 158] },
  },
  mobility_generic: {
    start: { head: [150, 58], shoulder: [150, 84], elbow: [122, 96], wrist: [98, 96], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206], bar: [98, 96] },
    end: { head: [150, 58], shoulder: [150, 84], elbow: [178, 96], wrist: [202, 96], hip: [150, 150], knee: [150, 182], ankle: [150, 206], toe: [170, 206], bar: [202, 96], arrow: [130, 60, 170, 60] },
  },
};

export interface Exercise {
  id: string;
  tr: string;
  en: string;
  /** BAŞLANGIÇ | ORTA | ORTA-İLERİ | İLERİ */
  difficulty: string;
  equipTr: string;
  equipEn: string;
  primary: MuscleId[];
  secondary: MuscleId[];
  archetype: keyof typeof POSE_ARCHETYPES;
  setsHint: string;
  restHint: string;
  /** [Turkish, English] pairs. */
  steps: [string, string][];
  /** False until a certified trainer has checked the pose frames. */
  poseReviewed: boolean;
}

export const EXERCISES: Exercise[] = [
  {
    id: 'arm-circles', tr: 'Kol çevirme', en: 'Arm circles',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok', equipEn: 'None',
    primary: [],
    secondary: [],
    archetype: 'mobility_bodyweight',
    setsHint: '', restHint: '',
    steps: [
      ['Kolları yana aç, küçük daireler çiz, gitgide büyüt.', 'Extend arms out, small circles growing larger.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'cat-cow', tr: 'Kedi-deve', en: 'Cat-cow',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['erector'],
    secondary: ['absMid'],
    archetype: 'quadruped_spine',
    setsHint: '', restHint: '',
    steps: [
      ['Emekleme pozisyonunda, nefes verirken sırtı yuvarla, nefes alırken kavis ver.', 'On all fours, round the spine on exhale, arch on inhale.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'band-pull-apart', tr: 'Bant pull-apart', en: 'Band pull-apart',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Direnç bandı', equipEn: 'Resistance band',
    primary: ['deltPost', 'trapMid'],
    secondary: ['infra'],
    archetype: 'mobility_generic',
    setsHint: '', restHint: '',
    steps: [
      ['Bandı iki elle omuz genişliğinde tut, kürek kemiklerini sıkarak yanlara çek.', 'Hold band shoulder-width, pull apart squeezing shoulder blades.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'band-external-rotation', tr: 'Bant ile dış rotasyon', en: 'Band external rotation',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Direnç bandı', equipEn: 'Resistance band',
    primary: ['infra', 'teres'],
    secondary: ['deltPost'],
    archetype: 'mobility_generic',
    setsHint: '', restHint: '',
    steps: [
      ['Dirsek gövdeye yapışık 90°, ön kolu dışarı döndür.', 'Elbow pinned to side at 90°, rotate forearm outward.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'chin-tuck', tr: 'Çene içeri çekme', en: 'Chin tuck',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok', equipEn: 'None',
    primary: ['sterno'],
    secondary: [],
    archetype: 'mobility_bodyweight',
    setsHint: '', restHint: '',
    steps: [
      ['Başı geriye kaydır, 5 sn tut, çeneyi kaldırma.', 'Glide head straight back, hold 5s, don\'t lift the chin.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'worlds-greatest-stretch', tr: 'Lunge + gövde rotasyonu', en: 'World\'s greatest stretch',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok', equipEn: 'None',
    primary: ['adductors', 'oblique'],
    secondary: ['gluteMax'],
    archetype: 'unilateral_lunge',
    setsHint: '', restHint: '',
    steps: [
      ['Uzun adımla çök, ön diz 90°, göğsü o taraf dizin üstüne döndürerek aç.', 'Long-step lunge, front knee 90°, rotate chest open over the front knee.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'goblet-squat', tr: 'Goblet squat', en: 'Goblet squat',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell/Kettlebell', equipEn: 'Dumbbell or kettlebell',
    primary: ['quadRF', 'quadVL', 'quadVM', 'gluteMax'],
    secondary: ['adductors', 'erector'],
    archetype: 'squat_goblet',
    setsHint: '3×10', restHint: '60-90 sn',
    steps: [
      ['Dumbbell\'ı göğüs önünde iki elle tut.', 'Hold the dumbbell at chest height with both hands.'],
      ['Kalçayı geriye-aşağı götürerek in, dizler ayak ucu yönünde.', 'Sit hips back and down, knees tracking over toes.'],
      ['Topuklardan iterek kalk.', 'Drive up through the heels.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'back-squat', tr: 'Back squat', en: 'Barbell back squat',
    difficulty: 'ORTA-İLERİ', equipTr: 'Squat rack + Bar', equipEn: 'Squat rack, barbell',
    primary: ['quadRF', 'quadVL', 'quadVM', 'gluteMax', 'erector', 'adductors'],
    secondary: ['hamBF', 'hamST', 'gastroMed', 'absMid', 'trapUpper'],
    archetype: 'squat',
    setsHint: '4×5-8', restHint: '120-180 sn',
    steps: [
      ['Barı üst trapezin üstüne yerleştir.', 'Rack the bar on the upper traps.'],
      ['Kalçayı geriye-aşağı götürerek in, uyluk en az paralel.', 'Sit back and down until thighs are at least parallel.'],
      ['Topuklardan iterek kalk, dizler içe düşmesin.', 'Drive through the heels, knees track out.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'front-hack-squat', tr: 'Front squat', en: 'Front squat',
    difficulty: 'ORTA', equipTr: 'Squat rack', equipEn: 'Squat rack',
    primary: ['quadRF', 'quadVL', 'quadVM'],
    secondary: ['gluteMax', 'adductors', 'absMid'],
    archetype: 'squat_goblet',
    setsHint: '3×8-10', restHint: '90-120 sn',
    steps: [
      ['Bar ön omuzlarda ya da makinede sırt sabit.', 'Bar racked on front shoulders, or back braced on the machine.'],
      ['Diklemesine in, göğüs yukarıda kalsın.', 'Descend vertically, chest stays up.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'rdl', tr: 'Romanian deadlift', en: 'Romanian deadlift',
    difficulty: 'ORTA', equipTr: 'Bar veya dumbbell', equipEn: 'Barbell or dumbbell',
    primary: ['hamBF', 'hamST', 'gluteMax', 'erector'],
    secondary: ['addMagnus', 'forearmFlex'],
    archetype: 'hip_hinge_dumbbell',
    setsHint: '3×8-10', restHint: '90-120 sn',
    steps: [
      ['Kalçayı geriye it, bar/dumbbell bacağa yakın kalsın.', 'Push hips back, keep the weight close to the legs.'],
      ['Hamstring gerginliğini hissedince kalçayı öne sıkarak kalk.', 'Feel the hamstring stretch, then drive hips forward to stand.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'deadlift', tr: 'Deadlift', en: 'Conventional deadlift',
    difficulty: 'İLERİ', equipTr: 'Bar + Plakalar', equipEn: 'Barbell and plates',
    primary: ['erector', 'gluteMax', 'hamBF', 'hamST', 'lat', 'trapMid', 'trapUpper'],
    secondary: ['quadRF', 'forearmFlex', 'absMid'],
    archetype: 'hinge',
    setsHint: '3×4-6', restHint: '150-240 sn',
    steps: [
      ['Bar orta ayak hizasında, kalçayı geriye it, sırt düz.', 'Bar over mid-foot, hinge hips back, neutral spine.'],
      ['Yerden iterek barı bacak hattına yakın tutup kalk.', 'Push the floor away, drag the bar close, stand tall.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'hip-thrust', tr: 'Hip thrust', en: 'Hip thrust',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Bar veya makine', equipEn: 'Barbell or machine',
    primary: ['gluteMax'],
    secondary: ['hamBF', 'hamST', 'absMid'],
    archetype: 'hip_thrust',
    setsHint: '3×10-12', restHint: '90-120 sn',
    steps: [
      ['Üst sırt sedyeye yaslı, kalçayı yukarı it.', 'Upper back braced on the bench, drive hips upward.'],
      ['Üstte kalçayı 1 sn sık, çene içeride.', 'Squeeze glutes 1s at the top, chin tucked.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'bulgarian-split-squat', tr: 'Bulgarian split squat', en: 'Bulgarian split squat',
    difficulty: 'ORTA', equipTr: 'Bench + dumbbell', equipEn: 'Bench and dumbbells',
    primary: ['quadRF', 'quadVL', 'gluteMax'],
    secondary: ['adductors'],
    archetype: 'unilateral_lunge',
    setsHint: '3×8', restHint: '90 sn',
    steps: [
      ['Arka ayak arkadaki banka yerleştir.', 'Rear foot elevated on a bench behind you.'],
      ['Ön dizle in, topuktan iterek kalk.', 'Descend on the front leg, drive up through that heel.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'walking-lunge', tr: 'Walking lunge', en: 'Walking lunge',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell (opsiyonel)', equipEn: 'Dumbbells (optional)',
    primary: ['quadRF', 'quadVL', 'gluteMax'],
    secondary: ['adductors', 'hamBF'],
    archetype: 'unilateral_lunge',
    setsHint: '3×10/bacak', restHint: '60-90 sn',
    steps: [
      ['Uzun adım at, ön diz 90° olana kadar in.', 'Step forward, lower until the front knee is ~90°.'],
      ['Arka ayağı öne getirerek bir sonraki adıma geç.', 'Bring the rear foot forward into the next step.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'reverse-lunge', tr: 'Reverse lunge', en: 'Reverse lunge',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok / hafif dumbbell', equipEn: 'None or light dumbbells',
    primary: ['quadRF', 'gluteMax'],
    secondary: ['adductors'],
    archetype: 'unilateral_lunge',
    setsHint: '2-3×8/bacak', restHint: '60-90 sn',
    steps: [
      ['Bir adım geriye çık, ön dizle in.', 'Step one leg back, lower on the front leg.'],
      ['Ön topuktan iterek başlangıca dön.', 'Drive through the front heel back to start.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'step-up', tr: 'Step-up', en: 'Step-up',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Kutu/bench', equipEn: 'Box or bench',
    primary: ['quadRF', 'gluteMax'],
    secondary: ['hamBF'],
    archetype: 'step_up',
    setsHint: '3×10/bacak', restHint: '60-90 sn',
    steps: [
      ['Bir ayağı kutuya koy, o bacakla it.', 'Place one foot on the box, drive through that leg.'],
      ['Üstte dikleş, kontrollü in.', 'Stand tall at the top, step down with control.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'calf-raise', tr: 'Calf raise', en: 'Calf raise',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Yok / makine', equipEn: 'Bodyweight or machine',
    primary: ['gastroLat', 'gastroMed', 'soleus'],
    secondary: [],
    archetype: 'calf_raise',
    setsHint: '3×15', restHint: '45-60 sn',
    steps: [
      ['Topuğu tam indir, sonra parmak ucunda yüksel.', 'Lower the heel fully, then rise onto the toes.'],
      ['Üstte 1 sn tut.', 'Hold 1s at the top.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'bench-press', tr: 'Bench press', en: 'Barbell bench press',
    difficulty: 'ORTA', equipTr: 'Bench + Bar', equipEn: 'Flat bench, barbell',
    primary: ['pecSternal', 'pecClav', 'deltFront', 'triLat', 'triLong'],
    secondary: ['serratus', 'trapMid', 'absUpper', 'lat'],
    archetype: 'bench_press',
    setsHint: '4×8-10', restHint: '90-120 sn',
    steps: [
      ['Kürek kemiklerini sık ve aşağı bastır.', 'Retract and depress the shoulder blades.'],
      ['Barı göğsün alt kısmına indir, dirsekler ~45°.', 'Lower to the lower chest, elbows ~45°.'],
      ['Göğüsten iterek kilitle.', 'Press up and lock out.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'incline-press', tr: 'Incline dumbbell pres', en: 'Incline dumbbell press',
    difficulty: 'ORTA', equipTr: 'Bank (30°) + dumbbell', equipEn: 'Incline bench, dumbbells',
    primary: ['pecClav', 'deltFront', 'triLat'],
    secondary: ['serratus'],
    archetype: 'incline_press',
    setsHint: '3×10-12', restHint: '75-90 sn',
    steps: [
      ['Bank 30°, dumbbell\'lar göğüs hizasında.', 'Bench at 30°, dumbbells at chest height.'],
      ['Yukarı it, tam kilitleme yapma.', 'Press up without fully locking the elbows.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'shoulder-press', tr: 'Omuz pres', en: 'Overhead press',
    difficulty: 'ORTA', equipTr: 'Bar/dumbbell/makine', equipEn: 'Barbell, dumbbells, or machine',
    primary: ['deltFront', 'triLat', 'triLong'],
    secondary: ['trapUpper', 'absUpper'],
    archetype: 'seated_overhead_press',
    setsHint: '3×8-10', restHint: '90-120 sn',
    steps: [
      ['Ağırlığı omuz hizasında tut, karnı sık.', 'Hold the weight at shoulder height, brace the core.'],
      ['Baş üstüne it, kilitle.', 'Press overhead to lockout.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'barbell-row', tr: 'Barbell row', en: 'Barbell row',
    difficulty: 'ORTA', equipTr: 'Bar', equipEn: 'Barbell',
    primary: ['lat', 'trapMid', 'deltPost', 'biceps'],
    secondary: ['erector', 'forearmFlex'],
    archetype: 'standing_row_hinged',
    setsHint: '3-4×6-8', restHint: '120-150 sn',
    steps: [
      ['Gövde ~45° öne eğik, sırt düz.', 'Torso hinged ~45°, spine neutral.'],
      ['Barı karın altına çek, kürek kemiklerini sık.', 'Pull the bar to the lower belly, squeeze the shoulder blades.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'single-arm-row', tr: 'Tek kol dumbbell row', en: 'Single-arm dumbbell row',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Bank + dumbbell', equipEn: 'Bench, dumbbell',
    primary: ['lat', 'trapMid', 'biceps'],
    secondary: ['deltPost'],
    archetype: 'standing_row_hinged',
    setsHint: '3×10-12/kol', restHint: '60-90 sn',
    steps: [
      ['Bir el ve diz bankta, sırt düz.', 'One hand and knee on the bench, flat back.'],
      ['Dumbbell\'ı kalçaya doğru çek.', 'Row the dumbbell toward the hip.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'chest-supported-row', tr: 'Chest-supported row', en: 'Chest-supported row',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Eğimli bank + dumbbell', equipEn: 'Incline bench, dumbbells',
    primary: ['lat', 'trapMid', 'deltPost'],
    secondary: ['biceps'],
    archetype: 'standing_row_hinged',
    setsHint: '3×10-12', restHint: '75-90 sn',
    steps: [
      ['Göğüs eğimli banka yaslı — bel devre dışı.', 'Chest braced on the incline bench — no low-back strain.'],
      ['Dirsekleri gövdeye yakın çekerek kürek kemiklerini sık.', 'Row with elbows close to the body, squeeze shoulder blades.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'pullup', tr: 'Barfiks', en: 'Pull-up',
    difficulty: 'İLERİ', equipTr: 'Barfiks barı', equipEn: 'Pull-up bar',
    primary: ['lat', 'biceps', 'trapLower'],
    secondary: ['deltPost', 'forearmFlex'],
    archetype: 'pullup',
    setsHint: '3×max', restHint: '90-120 sn',
    steps: [
      ['Omuzlar aşağı-geri, çeneyi bara kadar çek.', 'Shoulders down and back, pull chin to the bar.'],
      ['Kontrollü in.', 'Lower with control.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'reverse-fly', tr: 'Dumbbell reverse fly', en: 'Dumbbell reverse fly',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell', equipEn: 'Dumbbells',
    primary: ['deltPost', 'trapMid'],
    secondary: ['infra'],
    archetype: 'hinged_fly',
    setsHint: '3×12-15', restHint: '45-60 sn',
    steps: [
      ['Öne eğil, kolları yana açarak kaldır.', 'Hinge forward, raise arms out to the sides.'],
      ['Kürek kemiklerini sıkarak üstte tut.', 'Squeeze shoulder blades at the top.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'lateral-raise', tr: 'Lateral raise', en: 'Lateral raise',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell', equipEn: 'Dumbbells',
    primary: ['deltFront'],
    secondary: ['deltPost'],
    archetype: 'standing_arm_isolation',
    setsHint: '3×12-15', restHint: '45-60 sn',
    steps: [
      ['Kolları omuz hizasına kadar yana kaldır.', 'Raise arms out to shoulder height.'],
      ['Kontrollü indir.', 'Lower with control.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'biceps-curl', tr: 'Biceps curl', en: 'Biceps curl',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell/bar', equipEn: 'Dumbbells or barbell',
    primary: ['biceps', 'brachialis'],
    secondary: ['forearmFlex'],
    archetype: 'standing_arm_isolation',
    setsHint: '3×12', restHint: '45-60 sn',
    steps: [
      ['Dirsekleri gövdeye sabitle, ağırlığı kaldır.', 'Pin elbows to the sides, curl the weight up.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'shrug', tr: 'Omuz silkme', en: 'Shrug',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Dumbbell/bar', equipEn: 'Dumbbells or barbell',
    primary: ['trapUpper'],
    secondary: [],
    archetype: 'standing_arm_isolation',
    setsHint: '3×12', restHint: '45-60 sn',
    steps: [
      ['Omuzları kulağa doğru kaldır, 1 sn tut.', 'Shrug shoulders toward the ears, hold 1s.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'plank', tr: 'Plank', en: 'Plank',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['absMid', 'absUpper'],
    secondary: ['oblique', 'gluteMax'],
    archetype: 'plank_prone',
    setsHint: '3×30 sn', restHint: '30-45 sn',
    steps: [
      ['Dirsekler omuz altında, gövde düz bir çizgi.', 'Elbows under shoulders, body in a straight line.'],
      ['Kalçayı sık, nefes al.', 'Brace the glutes, breathe.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'side-plank', tr: 'Side plank', en: 'Side plank',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['oblique'],
    secondary: ['gluteMed'],
    archetype: 'side_plank',
    setsHint: '3×20-30 sn/taraf', restHint: '30 sn',
    steps: [
      ['Dirsek omuz altında, kalça, omuz, diz bir çizgide.', 'Elbow under shoulder, hip-shoulder-knee in one line.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'dead-bug', tr: 'Ölü böcek', en: 'Dead bug',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['absMid', 'absLower'],
    secondary: ['oblique'],
    archetype: 'floor_core_supine',
    setsHint: '3×8/taraf', restHint: '30-45 sn',
    steps: [
      ['Sırtüstü, kollar tavana, dizler 90°.', 'Lie on back, arms toward ceiling, knees at 90°.'],
      ['Karşı kol ve bacağı uzat, bel yere yapışık kalsın.', 'Extend opposite arm and leg, keep the low back flat.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'bird-dog', tr: 'Bird-dog', en: 'Bird-dog',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['erector', 'gluteMax'],
    secondary: ['absMid'],
    archetype: 'bird_dog',
    setsHint: '3×6/taraf', restHint: '30-45 sn',
    steps: [
      ['Emekleme pozisyonunda, karşı kol ve bacağı uzat.', 'On all fours, extend opposite arm and leg.'],
      ['Bel düz kalsın, 5 sn tut.', 'Keep the spine neutral, hold 5s.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'mcgill-curl-up', tr: 'McGill curl-up', en: 'McGill curl-up',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['absUpper'],
    secondary: [],
    archetype: 'floor_core_supine',
    setsHint: '3×8', restHint: '30 sn',
    steps: [
      ['Eller belin altında, bir diz bükük.', 'Hands under the low back, one knee bent.'],
      ['Baş ve omuzları 2-3 cm kaldır, 8 sn tut.', 'Lift head and shoulders 2-3cm, hold 8s.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'pallof-press', tr: 'Pallof pres', en: 'Pallof press',
    difficulty: 'ORTA', equipTr: 'Kablo/bant', equipEn: 'Cable or band',
    primary: ['oblique', 'absMid'],
    secondary: [],
    archetype: 'anti_rotation_standing',
    setsHint: '3×12/taraf', restHint: '45 sn',
    steps: [
      ['Kabloyu göğüs önünde tut, öne uzat.', 'Hold the cable at chest, press straight out.'],
      ['Gövde dönmesin.', 'Resist rotation.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'ab-wheel-rollout', tr: 'Ab wheel rollout', en: 'Ab wheel rollout',
    difficulty: 'ORTA', equipTr: 'Ab wheel', equipEn: 'Ab wheel',
    primary: ['absMid', 'absUpper'],
    secondary: ['lat'],
    archetype: 'rollout',
    setsHint: '3×8', restHint: '60 sn',
    steps: [
      ['Dizden başla, bel çökmeden ileri yuvarla.', 'Start kneeling, roll forward without the low back sagging.'],
      ['Kalçayı sıkarak geri çek.', 'Squeeze glutes to pull back.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'hanging-knee-raise', tr: 'Asılı diz çekme', en: 'Hanging knee raise',
    difficulty: 'ORTA', equipTr: 'Barfiks barı', equipEn: 'Pull-up bar',
    primary: ['absLower', 'absMid'],
    secondary: ['forearmFlex'],
    archetype: 'pullup',
    setsHint: '3×10-12', restHint: '45-60 sn',
    steps: [
      ['Barda asıl, sallanmadan dizleri göğse çek.', 'Hang from the bar, raise knees to chest without swinging.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'suitcase-carry', tr: 'Suitcase carry', en: 'Suitcase carry',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Kettlebell/dumbbell', equipEn: 'Kettlebell or dumbbell',
    primary: ['oblique', 'absMid'],
    secondary: ['forearmFlex', 'trapUpper'],
    archetype: 'carry',
    setsHint: '3×30 sn/kol', restHint: '45 sn',
    steps: [
      ['Tek elde ağırlıkla dik dur, yana eğilmeden yürü.', 'Stand tall with weight in one hand, walk without leaning.'],
    ],
    poseReviewed: false,
  },
  {
    id: 'glute-bridge', tr: 'Kalça köprüsü', en: 'Glute bridge',
    difficulty: 'BAŞLANGIÇ', equipTr: 'Mat', equipEn: 'Mat',
    primary: ['gluteMax'],
    secondary: ['hamBF', 'absMid'],
    archetype: 'hip_thrust',
    setsHint: '3×12-15', restHint: '30-45 sn',
    steps: [
      ['Sırtüstü, dizler bükük, ayaklar yerde.', 'Lie on back, knees bent, feet flat.'],
      ['Kalçayı yukarı it, üstte 1-2 sn sık.', 'Drive hips up, squeeze 1-2s at the top.'],
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
  'Bench press': 'bench-press',
  'Bench press (bar veya dumbbell)': 'bench-press',
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
  'Göğüs pres (makine veya dumbbell)': null,
  'Göğüs pres (makine)': null,
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
  'Lat pulldown': null,
  'Lat pulldown (geniş)': null,
  'Lat pulldown (nötr tutuş)': null,
  'Lat pulldown veya barfiks': null,
  'Lateral raise': 'lateral-raise',
  'Leg curl': null,
  'Leg extension': null,
  'Leg press': null,
  'Lunge + gövde rotasyonu (world\'s greatest stretch)': 'worlds-greatest-stretch',
  'McGill curl-up': 'mcgill-curl-up',
  'Omuz pres (makine veya dumbbell)': 'shoulder-press',
  'Omuz silkme (shrug)': 'shrug',
  'Oturarak kürek': null,
  'Oturarak kürek (seated row)': null,
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
  'Vücut ağırlığıyla squat': 'goblet-squat',
  'Walking lunge': 'walking-lunge',
  'Weighted barfiks veya ağır lat pulldown': 'pullup',
  'Yan yatarak bacak kaldırma / bantlı yan adım': null,
  'Yerinde hafif koşu / ip atlama': null,
  'Yerinde yürüyüş / hafif zıplama': null,
  'Yüz çekişi': null,
  'Yüz çekişi (face pull)': null,
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
 * the template seed writes), then a loose contains-match so a trainer who
 * typed "Bench press (geniş tutuş)" by hand still lands on the right page.
 */
export function exerciseByName(name: string | undefined): Exercise | null {
  if (!name) return null;
  const exact = NAME_TO_EXERCISE[name];
  if (exact !== undefined) return exact ? (BY_ID.get(exact) ?? null) : null;
  const needle = name.toLocaleLowerCase('tr');
  const hit = EXERCISES.find(
    (e) => needle.includes(e.tr.toLocaleLowerCase('tr')) || needle.includes(e.en.toLocaleLowerCase('tr')),
  );
  return hit ?? null;
}