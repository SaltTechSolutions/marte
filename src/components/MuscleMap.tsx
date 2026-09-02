import React, { useMemo } from 'react';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

import { Activation, BACK_PATHS, FRONT_PATHS, MuscleId } from '@/data/exerciseLibrary';
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

  const fillFor = (muscle: string | null) => {
    if (!muscle) return restingColor;
    const level = activation[muscle as MuscleId];
    if (level === 'primary') return colors.p;
    if (level === 'secondary') return secondaryColor;
    return restingColor;
  };

  const half = paths.map((p, i) => (
    <Path key={i} d={p.d} fill={fillFor(p.muscle)} stroke={mix(colors.line, colors.txt, 0.25)} strokeWidth={0.7} />
  ));

  return (
    <Svg viewBox="0 0 200 460" width={size} height={size * 1.68}>
      <G>{half}</G>
      <G transform="translate(200,0) scale(-1,1)">{half}</G>
      <SvgText
        x={100}
        y={452}
        textAnchor="middle"
        fill={colors.sub}
        fontSize={11}
        fontFamily="Inter"
        fontWeight="700">
        {view === 'front' ? 'ÖN · ANTERIOR' : 'ARKA · POSTERIOR'}
      </SvgText>
    </Svg>
  );
}

/** Primer / sekonder / pasif key — the map is unreadable without it. */
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

