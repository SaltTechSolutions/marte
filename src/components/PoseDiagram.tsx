import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Rect } from 'react-native-svg';

import { PoseArchetype, PoseFace, PoseFrame } from '@/data/exerciseLibrary';
import { mix } from '@/theme/deriveColor';
import { useAppTheme } from '@/theme/ThemeContext';
import { DrawFrame, easeInOutCubic, facing, interpolate, mirrorX, repPhase } from '@/utils/pose';

import { Text } from './Text';

/**
 * One resolved frame of a movement as a jointed figure (PER-19).
 *
 * Two things the first version could not say. It drew ONE leg and ONE arm,
 * so a lunge's trailing leg had to be faked with a rectangle prop and a
 * bird-dog looked like someone lying down; and its head was a plain disc, so
 * nothing told you which way the body faced. The far limbs now draw behind
 * the torso, faded; the near limbs draw over a halo in the card colour so the
 * two never merge where they cross; a face wedge and eye point the way the
 * toes do (up, when lying); the chest side of the torso bows slightly.
 *
 * Still deliberately coarse — eight near joints and five far ones. It answers
 * "which way does my body fold, where is the weight, which leg is which", not
 * exact angles the data cannot promise.
 */
export function PoseFigure({
  frame,
  arrow,
  height = 132,
  view = 'side',
  face,
}: {
  frame: DrawFrame;
  arrow?: PoseFrame['arrow'];
  height?: number;
  view?: 'side' | 'front';
  face?: PoseFace;
}) {
  const { colors } = useAppTheme();
  const near = mix(colors.surf2, colors.txt, 0.55);
  const far = mix(colors.surf2, colors.txt, 0.14);
  const halo = colors.bg1;
  const propFill = mix(colors.surf2, colors.txt, 0.08);
  const outline = mix(colors.surf2, colors.txt, 0.3);
  const f = frame;
  const look = view === 'front' ? 'front' : facing(f, face);
  const [fx, fy] = look === 'front' ? [0, 0] : look;

  const seg = (a: [number, number], b: [number, number], w: number, stroke: string, key: string) => (
    <Line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={w} strokeLinecap="round" />
  );
  // In the front view the other side is this side mirrored across the body's
  // centre and drawn in the SAME passes as the near limbs — same halo, same
  // colour, same layer. Drawing it earlier put it under the near limb's halo
  // and it read as the leg standing behind, which a front view never has.
  const mirrored: [[number, number], [number, number], number, string][] =
    view === 'front'
      ? [
          [f.hip, mirrorX(f.knee, f.hip[0]), 21, 'mThigh'], [mirrorX(f.knee, f.hip[0]), mirrorX(f.ankle, f.hip[0]), 17, 'mShin'],
          [mirrorX(f.ankle, f.hip[0]), mirrorX(f.toe, f.hip[0]), 11, 'mFoot'],
          [f.shoulder, mirrorX(f.elbow, f.shoulder[0]), 15, 'mUpperArm'], [mirrorX(f.elbow, f.shoulder[0]), mirrorX(f.wrist, f.shoulder[0]), 13, 'mForearm'],
        ]
      : [];
  const nearSegs: [[number, number], [number, number], number, string][] = [
    ...mirrored,
    [f.shoulder, f.hip, 30, 'torso'], [f.hip, f.knee, 21, 'thigh'], [f.knee, f.ankle, 17, 'shin'], [f.ankle, f.toe, 11, 'foot'],
    [f.head, f.shoulder, 13, 'neck'], [f.shoulder, f.elbow, 15, 'upperArm'], [f.elbow, f.wrist, 13, 'forearm'],
  ];
  const mid: [number, number] = [(f.shoulder[0] + f.hip[0]) / 2, (f.shoulder[1] + f.hip[1]) / 2];
  const chest = `M${f.shoulder[0]},${f.shoulder[1]} Q${mid[0] + fx * 11},${mid[1] + fy * 11} ${f.hip[0]},${f.hip[1]}`;
  const [hx, hy] = f.head;
  const r = 15;
  const wedge = [
    [hx + fx * (r + 7), hy + fy * (r + 7)],
    [hx + fx * r * 0.55 - fy * 7, hy + fy * r * 0.55 + fx * 7],
    [hx + fx * r * 0.55 + fy * 7, hy + fy * r * 0.55 - fx * 7],
  ].map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');

  const arrowHead = () => {
    if (!arrow) return null;
    const [x1, y1, x2, y2] = arrow;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const s = 8;
    const pts = [[x2, y2], [x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45)], [x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45)]]
      .map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    return (
      <>
        <Line x1={x1} y1={y1} x2={x2 - 6 * Math.cos(a)} y2={y2 - 6 * Math.sin(a)} stroke={colors.p} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6 4" />
        <Polygon points={pts} fill={colors.p} />
      </>
    );
  };

  return (
    <Svg viewBox="0 0 320 220" width="100%" height={height}>
      {(f.props ?? []).map((p, i) => (
        <Rect key={`prop${i}`} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 3} fill={propFill} stroke={outline} />
      ))}
      <Line x1={16} y1={207} x2={304} y2={207} stroke={outline} strokeWidth={2} />
      <Ellipse cx={view === 'front' ? f.hip[0] : (f.ankle[0] + f.toe[0]) / 2} cy={208} rx={34} ry={4} fill={outline} opacity={0.35} />

      {view === 'front' ? (
        f.bar && <Circle cx={mirrorX(f.bar, f.shoulder[0])[0]} cy={f.bar[1]} r={12} fill={colors.bg1} stroke={colors.p} strokeWidth={3} />
      ) : (
        <>
          {seg(f.hip, f.farKnee, 17, far, 'farThigh')}
          {seg(f.farKnee, f.farAnkle, 14, far, 'farShin')}
          {seg(f.farAnkle, f.farToe, 9, far, 'farFoot')}
          {seg(f.shoulder, f.farElbow, 12, far, 'farUpperArm')}
          {seg(f.farElbow, f.farWrist, 10, far, 'farForearm')}
        </>
      )}

      {f.bar && (
        <>
          <Circle cx={f.bar[0]} cy={f.bar[1]} r={view === 'front' ? 12 : 21} fill={colors.bg1} stroke={colors.p} strokeWidth={3} />
          <Circle cx={f.bar[0]} cy={f.bar[1]} r={view === 'front' ? 3 : 5} fill={colors.p} />
        </>
      )}

      {/* near limbs — halo first so they stay separate from the far ones */}
      {nearSegs.map(([a, b, w, k]) => seg(a, b, w + 4, halo, `halo-${k}`))}
      <Circle cx={hx} cy={hy} r={r + 2} fill={halo} />
      {nearSegs.map(([a, b, w, k]) => seg(a, b, w, near, k))}
      <Path d={chest} stroke={near} strokeWidth={30} fill="none" strokeLinecap="round" />
      <Circle cx={hx} cy={hy} r={r} fill={near} />
      {look === 'front' ? (
        <>
          {/* the face as a glyph — two eyes, a nose, a mouth — so "toward you" cannot be misread */}
          <Circle cx={hx - 5} cy={hy - 3} r={2} fill={colors.bg1} />
          <Circle cx={hx + 5} cy={hy - 3} r={2} fill={colors.bg1} />
          <Line x1={hx} y1={hy - 1} x2={hx} y2={hy + 4} stroke={colors.bg1} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={hx - 4} y1={hy + 8} x2={hx + 4} y2={hy + 8} stroke={colors.bg1} strokeWidth={1.6} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Polygon points={wedge} fill={near} strokeLinejoin="round" />
          <Circle cx={hx + fx * 6 - fy * 4} cy={hy + fy * 6 + fx * 4} r={2.2} fill={colors.bg1} />
        </>
      )}
      {[f.hip, f.knee, f.elbow, ...(view === 'front' ? [mirrorX(f.knee, f.hip[0]), mirrorX(f.elbow, f.shoulder[0])] : [])].map((j, i) => (
        <Circle key={`j${i}`} cx={j[0]} cy={j[1]} r={3.2} fill={colors.p} />
      ))}

      {arrowHead()}
    </Svg>
  );
}

const REP_MS = 1500;
const HOLD_MS = 220;
/** ~30 fps is plenty for a 20-primitive SVG and keeps the JS thread quiet. */
const FRAME_MS = 33;

/**
 * The movement, played.
 *
 * A small ping-pong engine: `requestAnimationFrame`, eased interpolation
 * between the two authored frames, a beat of stillness at each end. State
 * updates are throttled to ~30 fps and the loop stops whenever the screen
 * loses focus, so nothing runs while the phone sits on the bench.
 *
 * Dragging the track scrubs and pauses; Başlangıç / Bitiş jump to the ends
 * — the two frames the trainer authored are still one tap away. With the
 * OS "reduce motion" setting on, it opens paused on the start frame and the
 * play button still works: the person chose less motion, not none.
 */
export function PoseMotion({ pose, showArrow = true }: { pose: PoseArchetype; showArrow?: boolean }) {
  const { start, end, view, face } = pose;
  const { colors, radius } = useAppTheme();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [trackW, setTrackW] = useState(1);
  const originRef = useRef(0);
  const lastPaintRef = useRef(0);
  const isHold = end === null;

  useEffect(() => {
    if (isHold) return;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!cancelled && !reduce) setPlaying(true);
    });
    return () => { cancelled = true; };
  }, [isHold]);

  useFocusEffect(
    useCallback(() => {
      if (!playing || isHold) return undefined;
      let raf = 0;
      originRef.current = performance.now() - HOLD_MS - t * REP_MS;
      const tick = (now: number) => {
        if (now - lastPaintRef.current >= FRAME_MS) {
          lastPaintRef.current = now;
          setT(repPhase(now - originRef.current, REP_MS, HOLD_MS));
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
      // `t` is intentionally not a dependency: the loop owns it while playing.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, isHold]),
  );

  const scrubTo = (x: number) => {
    setPlaying(false);
    setT(Math.min(1, Math.max(0, x / trackW)));
  };
  const frame = interpolate(start, end, easeInOutCubic(t));

  return (
    <View style={{ backgroundColor: colors.bg1, borderRadius: radius.md, padding: 8, gap: 6 }}>
      <PoseFigure frame={frame} arrow={showArrow && t < 0.02 ? start.arrow : undefined} view={view} face={face} />
      {isHold ? (
        <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
          İzometrik hareket — pozisyonu koru, tekrar yok.
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={() => setPlaying((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Durdur' : 'Oynat'}
            hitSlop={6}
            style={{ minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="helper" weight="900" tone="onp">
              {playing ? '❚❚' : '▶'}
            </Text>
          </Pressable>
          <View
            onLayout={(e: LayoutChangeEvent) => setTrackW(Math.max(1, e.nativeEvent.layout.width))}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(e) => scrubTo(e.nativeEvent.locationX)}
            onResponderMove={(e) => scrubTo(e.nativeEvent.locationX)}
            accessibilityRole="adjustable"
            accessibilityLabel="Kare"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(t * 100) }}
            style={{ flex: 1, height: 44, justifyContent: 'center' }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surf2 }}>
              <View style={{ width: `${t * 100}%`, height: 6, borderRadius: 3, backgroundColor: colors.p }} />
            </View>
            <View style={{ position: 'absolute', left: Math.max(0, t * trackW - 9), width: 18, height: 18, borderRadius: 9, backgroundColor: colors.p, borderWidth: 3, borderColor: colors.bg1 }} />
          </View>
          <Pressable onPress={() => { setPlaying(false); setT(0); }} hitSlop={8} accessibilityRole="button">
            <Text variant="label" weight="700" style={{ color: t < 0.02 ? colors.p : colors.sub }}>
              Başlangıç
            </Text>
          </Pressable>
          <Pressable onPress={() => { setPlaying(false); setT(1); }} hitSlop={8} accessibilityRole="button">
            <Text variant="label" weight="700" style={{ color: t > 0.98 ? colors.p : colors.sub }}>
              Bitiş
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
