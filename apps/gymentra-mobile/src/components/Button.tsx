import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';
import { hapticAction, hapticSelection } from '@/utils/haptics';

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

  // Weight the feedback by consequence: a filled primary/critical button
  // commits something, a ghost one usually just backs out.
  const press = () => {
    if (variant === 'ghost') hapticSelection();
    else hapticAction();
    onPress?.();
  };

  if (variant === 'pulse') {
    return (
      <Pressable
        onPress={press}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        style={[{ opacity: disabled ? 0.5 : 1 }, style]}>
        <LinearGradient
          colors={[colors.g1, colors.g2, colors.g3]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={[styles.base, { minHeight: height, borderRadius: radius.md }]}>
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
      accessibilityRole="button"
      // `icon` is an emoji prefix drawn into the text; a screen reader would
      // read its name aloud in front of every label.
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.base,
        {
          minHeight: height,
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
  // paddingVertical only matters once a long label wraps at large text sizes; a
  // one-line label is still `minHeight` tall.
  base: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
