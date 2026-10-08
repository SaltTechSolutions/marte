import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import { Activation, MUSCLE_LABELS, MuscleId } from '@/data/exerciseLibrary';
import rigAnatomy from '@/data/rigAnatomy.json';
import { mix } from '@/theme/deriveColor';
import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

type AnatomyPath = { d: string; muscles: string[]; clip?: number[] };
const ANATOMY = rigAnatomy as unknown as Record<'front' | 'back', { viewBox: string; paths: AnatomyPath[] }>;

/**
 * Front/back anatomy chart with the worked muscles shaded (PER-19).
 *
 * Paths come from packages/rig (`scripts/import-musclemap.mjs`): MuscleMap's
 * male body, MIT-licensed, most of it from react-native-body-highlighter (MIT).
 * Both licence texts travel inside `rigAnatomy.json` (`licenses`). Each path
 * draws both body halves explicitly; one path may carry several muscles, and a
 * path with `clip` is drawn only inside that horizontal band (chest, trapezius
 * and biceps are split that way). A path with no muscles is silhouette.
 *
 * Colours come from the tenant's own palette rather than the design file's
 * hardcoded green: a gym on the orange theme gets an orange activation map.
 *
 * The resting fill is `surf2` lifted towards the text colour. Plain `surf2`
 * sits only a few points off the card behind it, so on a dark theme the body
 * outline all but vanished and the shaded muscles floated with nothing to be
 * read against.
 */
export function MuscleMap({
  view,
  activation,
  size = 196,
}: {
  view: 'front' | 'back';
  activation: Partial<Record<MuscleId, Activation>>;
  size?: number;
}) {
  const { colors } = useAppTheme();
  const { viewBox, paths } = ANATOMY[view];
  const [vx, vy, vw, vh] = viewBox.split(' ').map(Number);
  const clipBase = `mm${view}`;

  // Secondary sits between the accent and the card surface: present enough to
  // read as "this works too", quiet enough that primary still wins the eye.
  const secondaryColor = useMemo(() => mix(colors.p, colors.surf, 0.52), [colors.p, colors.surf]);
  const restingColor = useMemo(() => mix(colors.surf2, colors.txt, 0.14), [colors.surf2, colors.txt]);
  // NOT `colors.line`: that token is an rgba() string and `mix` reads hex.
  const outline = useMemo(() => mix(colors.surf2, colors.txt, 0.34), [colors.surf2, colors.txt]);

  // The strongest level among a path's muscles wins.
  const fillFor = (muscles: string[]) => {
    const levels = muscles.map((m) => activation[m as MuscleId]);
    if (levels.includes('primary')) return colors.p;
    if (levels.includes('secondary')) return secondaryColor;
    return restingColor;
  };

  const clips: React.ReactElement[] = [];
  const body = paths.map((p, i) => {
    let clipPath: string | undefined;
    if (p.clip) {
      const id = `${clipBase}${i}`;
      clips.push(
        <ClipPath key={id} id={id}>
          <Rect x={vx} y={p.clip[0]} width={vw} height={p.clip[1] - p.clip[0]} />
        </ClipPath>,
      );
      clipPath = `url(#${id})`;
    }
    // Stroke is in drawing units: the drawing is ~727 wide, so 2 ≈ the old 0.7 on a 200-wide one.
    return <Path key={i} d={p.d} fill={fillFor(p.muscles)} stroke={outline} strokeWidth={2} clipPath={clipPath} />;
  });

  // Same drawn height as before (size × 1.68); width follows the drawing.
  const height = size * 1.68;
  const width = (height * vw) / vh;

  // The picture carries nothing a screen reader can use, so say which muscles
  // are shaded (the same words the "Kaslar" page lists).
  const named = (level: Activation) =>
    (Object.keys(activation) as MuscleId[])
      .filter((m) => activation[m] === level)
      .map((m) => MUSCLE_LABELS[m] ?? m)
      .join(', ');
  const primary = named('primary');
  const secondary = named('secondary');
  const caption = view === 'front' ? 'ÖN · ANTERIOR' : 'ARKA · POSTERIOR';
  const spoken = `${view === 'front' ? 'Ön' : 'Arka'} görünüm. ${
    primary ? `Ana çalışan kaslar: ${primary}. ` : ''
  }${secondary ? `Yardımcı kaslar: ${secondary}.` : ''}`.trim();

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={spoken} style={{ alignItems: 'center', gap: 4 }}>
      <Svg viewBox={`${vx} ${vy} ${vw} ${vh}`} width={width} height={height}>
        {clips.length > 0 && <Defs>{clips}</Defs>}
        <G>{body}</G>
      </Svg>
      <Text variant="label" weight="700" tone="sub">
        {caption}
      </Text>
    </View>
  );
}

/**
 * Primer / sekonder / pasif key. The map is three shades of one hue and
 * nothing on it says which shade means what, so the chart is guesswork
 * without this row.
 */
export function MuscleMapLegend() {
  const { colors } = useAppTheme();
  const secondaryColor = mix(colors.p, colors.surf, 0.52);
  const restingColor = mix(colors.surf2, colors.txt, 0.14);
  const item = (color: string, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: color }} />
      <Text variant="label" tone="sub">
        {label}
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 14, justifyContent: 'center', paddingTop: 6 }}>
      {item(colors.p, 'Primer')}
      {item(secondaryColor, 'Sekonder')}
      {item(restingColor, 'Pasif')}
    </View>
  );
}
