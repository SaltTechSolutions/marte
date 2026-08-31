import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';
import { hapticSelection } from '@/utils/haptics';

import { Text } from './Text';

/** Minutes since midnight ⇄ "HH:MM". */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Zero-typing time input, in the same shape as `Stepper`.
 *
 * The class form used to offer four fixed times, so 07:15 or 20:00 simply
 * could not be entered. Widening that to every half hour turned it into a
 * 33-chip wall — the same mistake as the payment screen's member picker.
 * A stepper stays one control regardless of range, and matches the pattern
 * already used for weight and reps.
 *
 * Wraps at midnight rather than clamping: stepping back from 00:00 to reach
 * a late class is a normal thing to do, and a dead button would just look
 * broken.
 */
export function TimeStepper({
  value,
  onChange,
  step = 15,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  step?: number;
}) {
  const { colors, radius } = useAppTheme();

  const bump = (delta: number) => {
    hapticSelection();
    onChange(toHHMM(toMinutes(value) + delta));
  };

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
        accessibilityRole="button"
        accessibilityLabel={`${step} dakika geri`}
        style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surf, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="h3" weight="900">
          −
        </Text>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="h2" weight="900">
          {value}
        </Text>
        <Text variant="label" tone="sub">
          başlangıç · ±{step} dk
        </Text>
      </View>
      <Pressable
        onPress={() => bump(step)}
        accessibilityRole="button"
        accessibilityLabel={`${step} dakika ileri`}
        style={{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="h3" weight="900" tone="onp">
          +
        </Text>
      </Pressable>
    </View>
  );
}
