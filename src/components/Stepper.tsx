import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

/** Zero-typing numeric input — used for weight/reps/measurements everywhere. */
export function Stepper({
  value,
  unit,
  step = 2.5,
  onChange,
  decimals = 1,
}: {
  value: number;
  unit: string;
  step?: number;
  onChange: (v: number) => void;
  decimals?: number;
}) {
  const { colors, radius } = useAppTheme();

  const bump = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    onChange(Math.max(0, Math.round((value + delta) * 10) / 10));
  };

  const label = decimals > 0 ? value.toFixed(decimals).replace('.', ',') : String(value);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surf2,
        borderRadius: radius.lg,
        padding: 10,
      }}>
      <Pressable
        onPress={() => bump(-step)}
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.surf,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text variant="h3" weight="900">
          −
        </Text>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="h2" weight="900">
          {label}
        </Text>
        <Text variant="label" tone="sub">
          {unit} · ±{step}
        </Text>
      </View>
      <Pressable
        onPress={() => bump(step)}
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.p,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text variant="h3" weight="900" tone="onp">
          +
        </Text>
      </Pressable>
    </View>
  );
}
