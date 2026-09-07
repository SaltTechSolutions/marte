import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';
import { dateFromOffset } from '@/utils/time';
import { hapticSelection } from '@/utils/haptics';

import { Text } from './Text';

/** "Bugün" / "Yarın" / "Ertesi gün" for the near days, a real date after that. */
function offsetLabel(offset: number): string {
  if (offset === 0) return 'Bugün';
  if (offset === 1) return 'Yarın';
  if (offset === 2) return 'Ertesi gün';
  return dateFromOffset(offset).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

/**
 * Zero-typing date input, the same shape as `TimeStepper`.
 *
 * The class form offered three day chips, so nothing could be scheduled
 * beyond the day after tomorrow. Adding a chip per day would rebuild the
 * 33-chip wall the time picker was just rescued from; a stepper stays one
 * control however far out the admin walks.
 *
 * Unlike `TimeStepper` this one clamps instead of wrapping: a class in the
 * past cannot be booked, so `−` stops rather than quietly rolling backwards.
 * `max` clamps the other end for the same reason — the class list only
 * watches a bounded window, and a class created past its far edge would
 * exist without ever appearing in the list that created it.
 */
export function DateStepper({
  value,
  onChange,
  min = 0,
  max,
}: {
  value: number;
  onChange: (offset: number) => void;
  /** Earliest offset the admin may reach. 0 = today; no past classes. */
  min?: number;
  /** Latest offset the admin may reach. Omit for no ceiling. */
  max?: number;
}) {
  const { colors, radius } = useAppTheme();
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  const bump = (delta: number) => {
    const next = value + delta;
    if (next < min || (max !== undefined && next > max)) return;
    hapticSelection();
    onChange(next);
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
        onPress={() => bump(-1)}
        disabled={atMin}
        accessibilityRole="button"
        accessibilityState={{ disabled: atMin }}
        accessibilityLabel="Bir gün geri"
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.md,
          backgroundColor: colors.surf,
          alignItems: 'center',
          justifyContent: 'center',
          // Dimmed rather than hidden: the button staying put tells the admin
          // they have hit today, where a disappearing one just looks broken.
          opacity: atMin ? 0.35 : 1,
        }}>
        <Text variant="h3" weight="900">
          −
        </Text>
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text variant="h2" weight="900">
          {offsetLabel(value)}
        </Text>
        <Text variant="label" tone="sub">
          {dateFromOffset(value).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>
      <Pressable
        onPress={() => bump(1)}
        disabled={atMax}
        accessibilityRole="button"
        accessibilityState={{ disabled: atMax }}
        accessibilityLabel="Bir gün ileri"
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
