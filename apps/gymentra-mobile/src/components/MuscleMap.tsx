import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { Activation, BACK_PATHS, FRONT_PATHS, MUSCLE_LABELS, MuscleId } from '@/data/exerciseLibrary';
import { mix } from '@/theme/deriveColor';
import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

/**
 * Front/back anatomy chart with the worked muscles shaded (PER-19).
 *
 * The SVG describes ONE half of the body; the other half is the same paths
 * drawn again through a mirroring transform. That is not a size trick — it
 * keeps left and right guaranteed symmetrical, so a shading fix can never
 * land on one side only.
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
  const paths = view === 'front' ? FRONT_PATHS : BACK_PATHS;

  // Secondary sits between the accent and the card surface: present enough to
  // read as "this works too", quiet enough that primary still wins the eye.
  const secondaryColor = useMemo(() => mix(colors.p, colors.surf, 0.52), [colors.p, colors.surf]);
  const restingColor = useMemo(() => mix(colors.surf2, colors.txt, 0.14), [colors.surf2, colors.txt]);
  // NOT `colors.line`: that token is an rgba() string and `mix` reads hex.
  const outline = useMemo(() => mix(colors.surf2, colors.txt, 0.34), [colors.surf2, colors.txt]);

  const fillFor = (muscle: string | null) => {
    if (!muscle) return restingColor;
    const level = activation[muscle as MuscleId];
    if (level === 'primary') return colors.p;
    if (level === 'secondary') return secondaryColor;
    return restingColor;
  };

  const half = paths.map((p, i) => (
    <Path key={i} d={p.d} fill={fillFor(p.muscle)} stroke={outline} strokeWidth={0.7} />
  ));

  // The drawing is 200 wide by up to 460 tall (the bottom ~20 units are the old
  // caption's strip, kept so no limb is cropped without a device to check). It used to be laid out in a
  // size x size*1.68 box, which `meet` shrank to 72% and left empty margins to
  // either side; the box now follows the drawing, at the same drawn scale. The
  // caption moved out of the SVG: at that scale its 11pt text drew at ~8pt.
  const scale = (size * 1.68) / 460;

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
      <Svg viewBox="0 0 200 460" width={200 * scale} height={460 * scale}>
        <G>{half}</G>
        <G transform="translate(200,0) scale(-1,1)">{half}</G>
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
