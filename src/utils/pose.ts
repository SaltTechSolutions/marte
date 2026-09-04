import { PoseFrame } from '@/data/exerciseLibrary';

export type Pt = [number, number];

/** Slow at the turnarounds, fast through the middle — how a rep actually moves. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** The far-side joint: its own data when the frame has it, else the near joint nudged back. */
export function farJoint(f: PoseFrame, key: 'knee' | 'ankle' | 'toe' | 'elbow' | 'wrist'): Pt {
  const own = f[`far${key[0].toUpperCase()}${key.slice(1)}` as keyof PoseFrame] as Pt | undefined;
  return own ?? [f[key][0] - 4, f[key][1]];
}

/** A fully resolved frame: every near and far joint present, ready to draw. */
export interface DrawFrame {
  head: Pt; shoulder: Pt; elbow: Pt; wrist: Pt; hip: Pt; knee: Pt; ankle: Pt; toe: Pt;
  farKnee: Pt; farAnkle: Pt; farToe: Pt; farElbow: Pt; farWrist: Pt;
  bar?: Pt;
  props?: PoseFrame['props'];
}

const NEAR = ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'toe'] as const;
const FAR = ['knee', 'ankle', 'toe', 'elbow', 'wrist'] as const;

/** Frame between `a` and `b` at `t` ∈ [0,1]; `b` null means a hold (isometric). */
export function interpolate(a: PoseFrame, b: PoseFrame | null, t: number): DrawFrame {
  const to = b ?? a;
  const out = {} as DrawFrame;
  for (const k of NEAR) out[k] = lerpPt(a[k], to[k], t);
  for (const k of FAR) {
    const fk = `far${k[0].toUpperCase()}${k.slice(1)}` as 'farKnee' | 'farAnkle' | 'farToe' | 'farElbow' | 'farWrist';
    out[fk] = lerpPt(farJoint(a, k), farJoint(to, k), t);
  }
  if (a.bar && to.bar) out.bar = lerpPt(a.bar, to.bar, t);
  out.props = a.props;
  return out;
}

export type Facing = Pt | 'front';

/**
 * Which way the head looks.
 *
 * Upright figures look the way the toes point. A horizontal figure is prone
 * or supine: with the hands on the floor (wrist below the shoulder) it is
 * prone and looks the way the head lies from the hip — cat-cow, plank,
 * bird-dog, rollout; with the hands in the air it is supine and looks up —
 * bench press, dead bug. The first version derived everything from the
 * toes, which put every quadruped face on backwards. `override` is for the
 * few frames the skeleton cannot decide (hip thrust: arms down but supine).
 */
export function facing(
  f: { head: Pt; shoulder: Pt; hip: Pt; wrist: Pt; ankle: Pt; toe: Pt },
  override?: 'left' | 'right' | 'up' | 'down' | 'front',
): Facing {
  if (override === 'front') return 'front';
  if (override === 'up') return [0, -1];
  if (override === 'down') return [0, 1];
  if (override === 'left') return [-1, 0];
  if (override === 'right') return [1, 0];
  const horizontal = Math.abs(f.shoulder[1] - f.hip[1]) < Math.abs(f.shoulder[0] - f.hip[0]);
  if (!horizontal) return [Math.sign(f.toe[0] - f.ankle[0]) || 1, 0];
  const handsOnFloor = f.wrist[1] > f.shoulder[1];
  if (!handsOnFloor) return [0, -1];
  return [Math.sign(f.head[0] - f.hip[0]) || 1, 0];
}

/** Mirror a point across a vertical line — the front view draws the second limb this way. */
export function mirrorX(p: Pt, cx: number): Pt {
  return [2 * cx - p[0], p[1]];
}

/**
 * Where a ping-pong rep is at `elapsedMs`: 0 → 1 → 0 with a short hold at each
 * end, so the turnaround reads as a pause rather than a bounce.
 */
export function repPhase(elapsedMs: number, repMs: number, holdMs: number): number {
  const cycle = 2 * (repMs + holdMs);
  const x = ((elapsedMs % cycle) + cycle) % cycle;
  if (x < holdMs) return 0;
  if (x < holdMs + repMs) return (x - holdMs) / repMs;
  if (x < 2 * holdMs + repMs) return 1;
  return 1 - (x - 2 * holdMs - repMs) / repMs;
}
