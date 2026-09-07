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
export function MiniBarChart({
  values,
  height = 64,
  baseline = 'range',
}: {
  values: number[];
  height?: number;
  /**
   * Where the bottom of the chart sits.
   *
   * `range` (default) normalizes across the series' own min/max — right for a
   * measurement that never goes near zero, where 68→65.5 kg is the whole
   * story and a zero-based axis would flatten it to nothing.
   *
   * `zero` is for counts and money, where zero is a real floor and the
   * distance from it is the point. Under `range` a run of six empty months
   * drew six full bars and the highlighted last one read as a good September;
   * an all-zero series has to look empty, because it is.
   */
  baseline?: 'range' | 'zero';
}) {
  const { colors } = useAppTheme();
  const max = Math.max(...values);
  const min = baseline === 'zero' ? 0 : Math.min(...values);
  const span = max - min;
  const allZero = baseline === 'zero' && max === 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height }}>
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        // A flat series (span 0) would divide by zero — show all bars full instead.
        const ratio = span === 0 ? (allZero ? 0 : 1) : (v - min) / span;
        const barHeight = `${MIN_BAR_PERCENT + ratio * (100 - MIN_BAR_PERCENT)}%` as const;
        // Hiçbir şey olmayan bir seride son çubuğu vurgulamak "burada bir şey
        // var" demek olurdu.
        if (isLast && !allZero) {
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
