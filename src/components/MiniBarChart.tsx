import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

const MIN_BAR_PERCENT = 18;

/**
 * Trend chart — last bar highlighted with the pulse gradient (design pattern).
 * Values are normalized across their own min/max range, so a series like
 * 68→65.5 kg reads as a visible decline instead of eight identical bars.
 */
export function MiniBarChart({ values, height = 64 }: { values: number[]; height?: number }) {
  const { colors } = useAppTheme();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height }}>
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        // A flat series (span 0) would divide by zero — show all bars full instead.
        const ratio = span === 0 ? 1 : (v - min) / span;
        const barHeight = `${MIN_BAR_PERCENT + ratio * (100 - MIN_BAR_PERCENT)}%` as const;
        if (isLast) {
          return (
            <LinearGradient
              key={i}
              colors={[colors.g2, colors.g1]}
              style={{ flex: 1, height: barHeight, borderRadius: 4 }}
            />
          );
        }
        return (
          <View key={i} style={{ flex: 1, height: barHeight, borderRadius: 4, backgroundColor: colors.surf2 }} />
        );
      })}
    </View>
  );
}
