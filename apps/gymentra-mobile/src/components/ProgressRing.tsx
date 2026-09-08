import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

/** Conic-style progress ring built from an SVG stroked circle (goal-progress indicator). */
export function ProgressRing({
  percent,
  size = 76,
  label,
  sublabel,
}: {
  percent: number; // 0-100
  size?: number;
  label: string;
  sublabel: string;
}) {
  const { colors } = useAppTheme();
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - percent / 100);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surf2} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.pText}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Text variant="h3" weight="900">
        {label}
      </Text>
      <Text variant="label" tone="sub">
        {sublabel}
      </Text>
    </View>
  );
}
