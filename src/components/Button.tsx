import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'pulse';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  icon?: string;
  leftIcon?: React.ReactNode; // for brand marks (e.g. Google's "G") that a text icon can't render
  style?: ViewStyle;
  critical?: boolean; // 56pt touch target for the single most important action on screen
  compact?: boolean; // inline pill usage (list-row actions) — still >=44pt min tap target
}

/** Primary/secondary/ghost/pulse-gradient buttons — 48dp min, 56dp for critical actions. */
export function Button({ label, onPress, variant = 'primary', disabled, icon, leftIcon, style, critical, compact }: Props) {
  const { colors, radius } = useAppTheme();
  const height = critical ? 56 : compact ? 44 : 48;

  if (variant === 'pulse') {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={[{ opacity: disabled ? 0.5 : 1 }, style]}>
        <LinearGradient
          colors={[colors.g1, colors.g2, colors.g3]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={[styles.base, { height, borderRadius: radius.md }]}>
          <Text variant="body" weight="900" tone="onp">
            {icon ? `${icon} ` : ''}
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  const bg = variant === 'primary' ? colors.p : 'transparent';
  const borderColor = variant === 'secondary' ? colors.p : variant === 'ghost' ? colors.line : 'transparent';
  const textTone = variant === 'primary' ? 'onp' : variant === 'secondary' ? 'primary' : 'sub';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        {
          height,
          borderRadius: radius.md,
          backgroundColor: bg,
          borderWidth: variant === 'primary' ? 0 : 1.5,
          borderColor,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}>
      <View style={styles.content}>
        {leftIcon}
        <Text variant="body" weight="900" tone={variant === 'primary' ? 'onp' : textTone === 'primary' ? 'primary' : 'sub'}>
          {icon ? `${icon} ` : ''}
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
