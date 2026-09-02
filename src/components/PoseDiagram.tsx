import React from 'react';
import Svg, { Circle, Line, Polygon, Rect } from 'react-native-svg';

import { PoseFrame } from '@/data/exerciseLibrary';
import { mix } from '@/theme/deriveColor';
import { useAppTheme } from '@/theme/ThemeContext';

/**
 * One frame of a movement, drawn as a jointed figure (PER-19).
 *
 * A pose is eight joint coordinates plus an optional implement — deliberately
 * coarse. It answers "which way does my body fold, and where does the weight
 * sit" and nothing finer; a figure detailed enough to imply exact joint angles
 * would be making promises the data cannot keep. Photographs or video replace
 * this later.
 *
 * The floor line and the props (bench, box, machine pad) are drawn first so
 * the body always sits in front of them.
 */
export function PoseDiagram({ pose, showArrow = false }: { pose: PoseFrame; showArrow?: boolean }) {
  const { colors } = useAppTheme();
  // Lifted well off `surf2`: the figure is a flat silhouette with no outline
  // or shading, so on a dark card the raw token left it barely visible.
  const limb = mix(colors.surf2, colors.txt, 0.24);
  const propFill = mix(colors.surf2, colors.txt, 0.08);

  const seg = (a: [number, number], b: [number, number], w: number, key: string) => (
    <Line
      key={key}
      x1={a[0]}
      y1={a[1]}
      x2={b[0]}
      y2={b[1]}
      stroke={limb}
      strokeWidth={w}
      strokeLinecap="round"
    />
  );

  const arrowHead = () => {
    if (!showArrow || !pose.arrow) return null;
    const [x1, y1, x2, y2] = pose.arrow;
    const a = Math.atan2(y2 - y1, x2 - x1);
    const s = 8;
    const points = [
      [x2, y2],
      [x2 - s * Math.cos(a - 0.45), y2 - s * Math.sin(a - 0.45)],
      [x2 - s * Math.cos(a + 0.45), y2 - s * Math.sin(a + 0.45)],
    ]
      .map((p) => p.map((n) => n.toFixed(1)).join(','))
      .join(' ');
    return (
      <>
        <Line
          x1={x1}
          y1={y1}
          x2={x2 - 6 * Math.cos(a)}
          y2={y2 - 6 * Math.sin(a)}
          stroke={colors.p}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="6 4"
        />
        <Polygon points={points} fill={colors.p} />
      </>
    );
  };

  return (
    <Svg viewBox="0 0 320 220" width="100%" height={120}>
      {(pose.props ?? []).map((r, i) => (
        <Rect
          key={`prop${i}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          rx={r.r ?? 3}
          fill={propFill}
          stroke={mix(colors.line, colors.txt, 0.2)}
        />
      ))}
      <Line x1={16} y1={207} x2={304} y2={207} stroke={mix(colors.line, colors.txt, 0.3)} strokeWidth={2} />

      {pose.bar && (
        <>
          <Circle cx={pose.bar[0]} cy={pose.bar[1]} r={21} fill={colors.bg1} stroke={colors.p} strokeWidth={3} />
          <Circle cx={pose.bar[0]} cy={pose.bar[1]} r={6} fill={colors.p} />
        </>
      )}

      {seg(pose.shoulder, pose.hip, 30, 'torso')}
      {seg(pose.hip, pose.knee, 21, 'thigh')}
      {seg(pose.knee, pose.ankle, 17, 'shin')}
      {seg(pose.ankle, pose.toe, 11, 'foot')}
      {seg(pose.head, pose.shoulder, 13, 'neck')}
      <Circle cx={pose.head[0]} cy={pose.head[1]} r={15} fill={limb} />
      {seg(pose.shoulder, pose.elbow, 15, 'upperArm')}
      {seg(pose.elbow, pose.wrist, 13, 'forearm')}

      {arrowHead()}
    </Svg>
  );
}
