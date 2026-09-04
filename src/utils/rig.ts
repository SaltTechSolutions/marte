/**
 * Eklemli kukla — ileri kinematik + kollar için ters kinematik.
 *
 * Önceki motor her kareyi eklem KOORDİNATI olarak tutuyordu ve iki kare
 * arasında noktaları doğrudan taşıyordu. Bunun iki kusuru vardı: uzuvlar
 * bükülmek yerine kendi etraflarında dönüyordu, ve ara karelerde segment
 * boyları değiştiği için gövde lastik gibi uzuyordu.
 *
 * Burada kareler AÇI olarak yazılıyor, boylar sabit (`B`). Geçiş eklem-yerel
 * uzayda yapılıyor: kalça, diz, omuz, dirsek açıları gövdeye GÖRE geçiş
 * yapar, yani sırt açısı değişirken uzuvlar gövdeyle birlikte döner. Ayakta
 * yapılan hareketlerde zincir ayak tabanına köklenir, kalça yüksekliği
 * açılardan hesaplanır — çömelirken figür yere gömülmez.
 */

export type Vec = [number, number];

/** Segment boyları. Tek doğruluk kaynağı: hiçbir kare boy yazmaz. */
export const B = {
  shin: 100,
  thigh: 105,
  lumbar: 55,
  thorax: 85,
  neck: 24,
  upper: 78,
  fore: 68,
  foot: 46,
  headR: 27,
} as const;

export const GROUND = 560;
export const ANKLE_X = 210;
export const CENTER_X = 210;

/** Dünya açıları: 0 = yukarı, saat yönünde artar. */
export const rad = (d: number): number => (d * Math.PI) / 180;
export const D = (d: number): Vec => [Math.sin(rad(d)), -Math.cos(rad(d))];
export const add = (p: Vec, v: Vec, s: number): Vec => [p[0] + v[0] * s, p[1] + v[1] * s];
export const sub = (p: Vec, v: Vec, s: number): Vec => [p[0] - v[0] * s, p[1] - v[1] * s];
export const lerpP = (a: Vec, b: Vec, u: number): Vec => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** İki nokta arasındaki dünya açısı (derece), `D` ile aynı eksende. */
export const angleOf = (a: Vec, b: Vec): number => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;

export interface RigPose {
  shinA: number;
  thighA: number;
  torso: number;
  thoraxA: number;
  neckA: number;
  upperA: number;
  foreA: number;
  hx: number;
  hy: number;
}

export interface RigKeyframe {
  t: number;
  tr: string;
  p: Partial<RigPose>;
}

export type RigMode = 'stand' | 'quad' | 'bench';
export type RigArm = 'angles' | 'ik' | 'floor';
export type RigBar = 'back' | 'hands' | null;

export interface RigExercise {
  mode: RigMode;
  /** `ik`: eller hedefe gider, `floor`: eller yere basar, `angles`: açıyla çizilir. */
  arm: RigArm;
  bar: RigBar;
  /** Dirseğin büküleceği yön (+1 / -1). */
  bend: number;
  /** Bir tekrarın süresi (ms). */
  dur: number;
  kf: RigKeyframe[];
}

const ZERO: RigPose = { shinA: 180, thighA: 180, torso: 0, thoraxA: 0, neckA: 0, upperA: 180, foreA: 180, hx: 0, hy: 0 };

/** Yumuşak geçiş (smoothstep). Uçlarda hız sıfır, ortada en hızlı. */
export const ease = (u: number): number => u * u * (3 - 2 * u);

const full = (p: Partial<RigPose>): RigPose => ({ ...ZERO, ...p });

interface LocalPose {
  torso: number;
  thoraxA: number;
  neckA: number;
  thighA: number;
  shinA: number;
  upperA: number;
  foreA: number;
  hx: number;
  hy: number;
}

/**
 * Dünya açılarını eklem-yerel açılara çevirir.
 *
 * Kareler dünya uzayında yazılıyor çünkü "kaval kemiği dikey" demek insan
 * için kolay. Ama ara kareler yerel uzayda hesaplanmalı, yoksa gövde öne
 * eğilirken bacak yerinde kalıyormuş gibi görünür.
 */
export const toLocal = (p: RigPose): LocalPose => ({
  torso: p.torso,
  thoraxA: p.thoraxA - p.torso,
  neckA: p.neckA - p.thoraxA,
  thighA: p.thighA - p.torso,
  shinA: p.shinA - p.thighA,
  upperA: p.upperA - p.thoraxA,
  foreA: p.foreA - p.upperA,
  hx: p.hx,
  hy: p.hy,
});

export const toWorld = (l: LocalPose): RigPose => {
  const torso = l.torso;
  const thoraxA = torso + l.thoraxA;
  return {
    torso,
    thoraxA,
    neckA: thoraxA + l.neckA,
    thighA: torso + l.thighA,
    shinA: torso + l.thighA + l.shinA,
    upperA: thoraxA + l.upperA,
    foreA: thoraxA + l.upperA + l.foreA,
    hx: l.hx,
    hy: l.hy,
  };
};

/**
 * İki eklemli zincir için ters kinematik: omuz `S`'den hedefe `T` uzanan
 * kolun dirsek ve el konumu. `bend` dirseğin hangi tarafa büküleceğini
 * seçer — bench press'te aşağı, omuz press'te yukarı.
 *
 * Hedef erişilemeyecek kadar uzak ya da yakınsa mesafe kırpılır: kol
 * kopmaz, sadece tam açılır veya tam katlanır.
 */
export function ik(S: Vec, T: Vec, L1: number, L2: number, bend: number): { elbow: Vec; hand: Vec } {
  const dx = T[0] - S[0];
  const dy = T[1] - S[1];
  const lo = Math.abs(L1 - L2) + 3;
  const hi = L1 + L2 - 3;
  const dist = Math.min(hi, Math.max(lo, Math.hypot(dx, dy)));
  const base = Math.atan2(dx, -dy);
  const c = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const th = base + bend * Math.acos(Math.min(1, Math.max(-1, c)));
  const elbow: Vec = [S[0] + Math.sin(th) * L1, S[1] - Math.cos(th) * L1];
  const fd = Math.atan2(T[0] - elbow[0], -(T[1] - elbow[1]));
  return { elbow, hand: [elbow[0] + Math.sin(fd) * L2, elbow[1] - Math.cos(fd) * L2] };
}

/** `t` (0..1) anındaki poz ve o anın evre adı. */
export function poseAt(ex: RigExercise, t: number): { p: RigPose; phase: RigKeyframe } {
  const kf = ex.kf;
  let i = 0;
  while (i < kf.length - 2 && t > kf[i + 1].t) i++;
  const a = kf[i];
  const b = kf[i + 1] || kf[i];
  const span = Math.max(0.0001, b.t - a.t);
  const u = ease(Math.min(1, Math.max(0, (t - a.t) / span)));
  const la = toLocal(full(a.p));
  const lb = toLocal(full(b.p));
  const l = {} as LocalPose;
  (Object.keys(la) as (keyof LocalPose)[]).forEach((k) => {
    l[k] = la[k] + (lb[k] - la[k]) * u;
  });
  return { p: toWorld(l), phase: u < 0.5 ? a : b };
}

export interface Skeleton {
  pelvis: Vec;
  knee: Vec;
  ankle: Vec;
  hipF: Vec;
  kneeF: Vec;
  ankleF: Vec;
  lumbar: Vec;
  thorax: Vec;
  neck: Vec;
  head: Vec;
  sh: Vec;
  elbow: Vec;
  hand: Vec;
  shF: Vec;
  elbowF: Vec;
  handF: Vec;
  bar: Vec | null;
}

/**
 * Açılardan iskeleti çözer.
 *
 * Ayakta yapılan hareketlerde zincir AYAK BİLEĞİNDEN yukarı kurulur, yani
 * ayak yere sabit; diğer modlarda kalçadan aşağı kurulur. Uzaktaki uzuvlar
 * (`...F`) yakınına göre birkaç derece kaydırılır — iki bacak üst üste
 * binip tek bacak gibi görünmesin diye.
 */
export function skeleton(ex: RigExercise, p: RigPose): Skeleton {
  let pelvis: Vec;
  let ankle: Vec;
  let knee: Vec;
  if (ex.mode === 'stand') {
    ankle = [ANKLE_X, GROUND - 12];
    knee = sub(ankle, D(p.shinA), B.shin);
    pelvis = sub(knee, D(p.thighA), B.thigh);
  } else {
    pelvis = ex.mode === 'quad' ? [150, GROUND - 119] : [150, 430];
    knee = add(pelvis, D(p.thighA), B.thigh);
    ankle = add(knee, D(p.shinA), B.shin);
  }
  const hipF: Vec = [pelvis[0] - 18, pelvis[1] + 3];
  const kneeF = add(hipF, D(p.thighA + 7), B.thigh);
  const ankleF = add(kneeF, D(p.shinA - 5), B.shin);

  const lumbar = add(pelvis, D(p.torso), B.lumbar);
  const thorax = add(lumbar, D(p.thoraxA), B.thorax);
  const neck = add(thorax, D(p.neckA), B.neck);
  const head = add(neck, D(p.neckA), 28);

  const sh = add(thorax, D(p.thoraxA + 118), 14);
  const shF: Vec = [sh[0] - 16, sh[1] + 5];
  let elbow: Vec;
  let hand: Vec;
  let elbowF: Vec;
  let handF: Vec;
  if (ex.arm === 'ik' || ex.arm === 'floor') {
    const T: Vec = ex.arm === 'floor' ? [sh[0] + p.hx, GROUND - 12] : [sh[0] + p.hx, sh[1] + p.hy];
    const a1 = ik(sh, T, B.upper, B.fore, ex.bend);
    const a2 = ik(shF, [T[0] - 11, T[1] + 4], B.upper, B.fore, ex.bend);
    elbow = a1.elbow;
    hand = a1.hand;
    elbowF = a2.elbow;
    handF = a2.hand;
  } else {
    elbow = add(sh, D(p.upperA), B.upper);
    hand = add(elbow, D(p.foreA), B.fore);
    elbowF = add(shF, D(p.upperA - 5), B.upper);
    handF = add(elbowF, D(p.foreA + 2), B.fore);
  }

  const bar: Vec | null =
    ex.bar === 'back' ? add(thorax, D(p.thoraxA + 201), 18) : ex.bar === 'hands' ? [hand[0], hand[1]] : null;
  // Bar taşıyan hareketlerde kadraj barın da ağırlığını sayar, yoksa figür
  // tepe noktasında çerçevenin dışına taşıyor.
  const anchor = bar ? (bar[0] + pelvis[0] * 1.4) / 2.4 : pelvis[0];
  const dx = CENTER_X - anchor;
  const S: Skeleton = {
    pelvis, knee, ankle, hipF, kneeF, ankleF, lumbar, thorax, neck, head,
    sh, elbow, hand, shF, elbowF, handF, bar,
  };
  (Object.keys(S) as (keyof Skeleton)[]).forEach((k) => {
    const v = S[k];
    if (v) (S[k] as Vec) = [v[0] + dx, v[1]];
  });
  return S;
}

export interface FrontSide {
  hip: Vec;
  knee: Vec;
  ankle: Vec;
  sh: Vec;
  elbow: Vec;
  hand: Vec;
}

export interface FrontPoints {
  cx: number;
  L: FrontSide;
  R: FrontSide;
  pelvis: Vec;
  lumbar: Vec;
  thorax: Vec;
  neck: Vec;
  head: Vec;
  barY: number | null;
}

export const FX = 210;

/**
 * Önden görünüm, çözülmüş YAN iskeletin dikey seviyelerini okur; burada
 * yalnızca yanal açıklık (omuz/kalça genişliği, dizin dışa çıkması, tutuş)
 * yazılır. Böylece çömelme derinliği iki görünümde birebir aynı kalıyor ve
 * önden bakışta bir bacak önde bir bacak geride olmuyor.
 */
export function frontPoints(ex: RigExercise, p: RigPose, S: Skeleton, grip = 66, bulge = 7): FrontPoints {
  const kneeFlex = Math.abs(p.shinA - p.thighA);
  const ab = 4 + kneeFlex * 0.16;
  const shDx = 44;
  const hipDx = 23;
  const footDx = 31;
  const shY = S.thorax[1] + 6;
  const mk = (sgn: number): FrontSide => {
    const shX = FX + sgn * shDx;
    const handX = FX + sgn * grip;
    return {
      hip: [FX + sgn * hipDx, S.pelvis[1]],
      knee: [FX + sgn * (footDx + ab), S.knee[1]],
      ankle: [FX + sgn * footDx, S.ankle[1]],
      sh: [shX, shY],
      elbow: [shX + (handX - shX) * 0.45 + sgn * bulge, S.elbow[1]],
      hand: [handX, S.hand[1]],
    };
  };
  const F: FrontPoints = {
    cx: FX,
    L: mk(-1),
    R: mk(1),
    pelvis: [FX, S.pelvis[1]],
    lumbar: [FX, S.lumbar[1]],
    thorax: [FX, S.thorax[1]],
    neck: [FX, S.neck[1]],
    head: [FX, S.head[1]],
    barY: null,
  };
  F.barY = ex.bar === 'back' ? S.thorax[1] + 4 : ex.bar === 'hands' ? F.R.hand[1] : null;
  return F;
}

/**
 * Tüm tekrar boyunca figürün kapladığı alan.
 *
 * Kare başına yeniden hesaplanan bir viewBox figürü hareket boyunca
 * zıplatır; bu yüzden 25 örnek karenin birleşimi alınıp hareket süresince
 * SABİT tutuluyor.
 */
export function boundsFor(ex: RigExercise, view: 'side' | 'front'): string {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  const eat = (q: Vec | null, r: number) => {
    if (!q) return;
    x0 = Math.min(x0, q[0] - r);
    x1 = Math.max(x1, q[0] + r);
    y0 = Math.min(y0, q[1] - r);
    y1 = Math.max(y1, q[1] + r);
  };
  for (let i = 0; i <= 24; i++) {
    const { p } = poseAt(ex, i / 24);
    const S = skeleton(ex, p);
    if (view === 'front') {
      const F = frontPoints(ex, p, S);
      [F.pelvis, F.lumbar, F.thorax, F.neck].forEach((q) => eat(q, 46));
      eat(F.head, 34);
      [F.L, F.R].forEach((side) => (Object.keys(side) as (keyof FrontSide)[]).forEach((k) => eat(side[k], 24)));
      if (F.barY !== null) {
        eat([FX - 152, F.barY], 26);
        eat([FX + 152, F.barY], 26);
      }
    } else {
      (Object.keys(S) as (keyof Skeleton)[]).forEach((k) => eat(S[k], k === 'bar' ? 54 : k === 'head' ? 34 : 24));
      if (ex.mode === 'bench') x1 = Math.max(x1, S.pelvis[0] + 270);
    }
  }
  y1 = Math.max(y1, GROUND + 20);
  x0 -= 14;
  x1 += 14;
  y0 -= 14;
  return `${x0.toFixed(1)} ${y0.toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}`;
}

/**
 * İki uçtaki kalınlığı farklı olabilen kapsül gövde.
 *
 * Uzuvlar tek kalınlıkta çubuk değil: kas kütlesi uyluğun ve baldırın üst
 * üçte birinde, pazunun ortasında toplanır. Çizim bu yüzden her uzvu iki
 * kapsülden kuruyor.
 */
export function capsule(a: Vec, b: Vec, wa: number, wb: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const ra = wa / 2;
  const rb = wb / 2;
  return (
    `M ${a[0] + nx * ra} ${a[1] + ny * ra} L ${b[0] + nx * rb} ${b[1] + ny * rb} ` +
    `A ${rb} ${rb} 0 0 0 ${b[0] - nx * rb} ${b[1] - ny * rb} L ${a[0] - nx * ra} ${a[1] - ny * ra} ` +
    `A ${ra} ${ra} 0 0 0 ${a[0] + nx * ra} ${a[1] + ny * ra} Z`
  );
}

/** Ayak: topuk yerde, parmak ucu yere değer. */
export function footPath(ankle: Vec, dir: number): string {
  const d = D(dir);
  const heel = add(ankle, d, -16);
  const toe = add(ankle, d, B.foot - 16);
  const sx = d[0] < 0 ? -1 : 1;
  return `M ${heel[0]} ${ankle[1] - 6} L ${toe[0]} ${Math.min(GROUND - 6, toe[1])} L ${toe[0] + 6 * sx} ${GROUND} L ${heel[0] - 4 * sx} ${GROUND} Z`;
}

export const footDirFor = (mode: RigMode): number => (mode === 'bench' ? 268 : mode === 'quad' ? 250 : 92);
