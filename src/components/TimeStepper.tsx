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
 * Wraps at midnight when unbounded: stepping back from 00:00 to reach a late
 * class is a normal thing to do, and a dead button would just look broken.
 * Given `min`/`max` it clamps instead — used where the range is a real rule
 * (a trainer's hours inside the gym's), not merely a convenience.
 */
export function TimeStepper({
  value,
  onChange,
  step = 15,
  min,
  max,
  hint,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  step?: number;
  /** "HH:MM" floor. Given together with `max`, the stepper clamps instead of
   *  wrapping — a bounded range that wrapped would jump the far end. */
  min?: string;
  /** "HH:MM" ceiling. */
  max?: string;
  /** Replaces the default "başlangıç · ±N dk" line under the value. */
  hint?: string;
}) {
  const { colors, radius } = useAppTheme();

  const current = toMinutes(value);
  const lo = min !== undefined ? toMinutes(min) : undefined;
  const hi = max !== undefined ? toMinutes(max) : undefined;
  const atMin = lo !== undefined && current <= lo;
  const atMax = hi !== undefined && current >= hi;

  const bump = (delta: number) => {
    // Unbounded: wrap. Bounded: clamp, and refuse the step at the edge so the
    // value never silently rolls past a limit that is a real rule.
    if (lo === undefined && hi === undefined) {
      hapticSelection();
      onChange(toHHMM(current + delta));
      return;
    }
    const next = current + delta;
    if ((lo !== undefined && next < lo) || (hi !== undefined && next > hi)) return;
    hapticSelection();
    onChange(toHHMM(next));
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
        disabled={atMin}
        accessibilityRole="button"
        accessibilityState={{ disabled: atMin }}
        accessibilityLabel={`${step} dakika geri`}
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.surf,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: atMin ? 0.35 : 1,
        }}>
        <Text variant="h3" weight="900">
          −
        </Text>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="h2" weight="900">
          {value}
        </Text>
        <Text variant="label" tone="sub">
          {hint ?? `başlangıç · ±${step} dk`}
        </Text>
      </View>
      <Pressable
        onPress={() => bump(step)}
        disabled={atMax}
        accessibilityRole="button"
        accessibilityState={{ disabled: atMax }}
        accessibilityLabel={`${step} dakika ileri`}
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.p,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: atMax ? 0.35 : 1,
        }}>
        <Text variant="h3" weight="900" tone="onp">
          +
        </Text>
      </Pressable>
    </View>
  );
}
