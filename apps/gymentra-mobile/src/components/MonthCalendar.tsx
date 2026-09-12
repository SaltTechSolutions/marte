import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';
import { hapticSelection } from '@/utils/haptics';

import { Text } from './Text';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Stable key for "which day is this", used to tally per-day markers. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Monday-first cells for the month, padded with nulls so each row is 7 wide. */
function monthCells(anchor: Date): (Date | null)[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sunday
  const leading = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = Array(leading).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Month grid with day selection — shared by the trainer's PT calendar and the
 * member's class schedule.
 *
 * Extracted rather than copied: the two screens ask the same question ("what
 * is on, and when?") and duplicated date maths would drift apart the first
 * time one of them was fixed.
 */
export function MonthCalendar({
  selectedDate,
  onSelectDate,
  monthAnchor,
  onChangeMonth,
  /** Day key → number of items on that day; drives the dot markers. */
  countsByDay,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  monthAnchor: Date;
  onChangeMonth: (d: Date) => void;
  countsByDay: Map<string, number>;
}) {
  const { colors, radius } = useAppTheme();
  const cells = useMemo(() => monthCells(monthAnchor), [monthAnchor]);
  const today = startOfDay(new Date());

  const shiftMonth = (delta: number) =>
    onChangeMonth(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + delta, 1));

  return (
    <View
      style={{
        backgroundColor: colors.surf,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.lg,
        padding: 10,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" weight="900" tone="sub">
            ‹
          </Text>
        </Pressable>
        <Text variant="helper" weight="700">
          {monthAnchor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" weight="900" tone="sub">
            ›
          </Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={{ flex: 1, alignItems: 'center', paddingBottom: 4 }}>
            <Text variant="label" tone="sub">
              {w}
            </Text>
          </View>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {cells.slice(row * 7, row * 7 + 7).map((d, i) => {
            if (!d) return <View key={`empty-${i}`} style={{ flex: 1, height: 42 }} />;
            const selected = isSameDay(d, selectedDate);
            const isToday = isSameDay(d, today);
            const count = countsByDay.get(dayKey(d)) ?? 0;
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => { hapticSelection(); onSelectDate(d); }}
                style={{ flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? colors.p : 'transparent',
                    borderWidth: !selected && isToday ? 1.5 : 0,
                    borderColor: colors.p,
                  }}>
                  <Text
                    variant="helper"
                    weight={selected || isToday ? '900' : '500'}
                    style={{ color: selected ? colors.onp : isToday ? colors.pText : colors.txt }}>
                    {d.getDate()}
                  </Text>
                </View>
                <View
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 2,
                    marginTop: 1,
                    backgroundColor: count > 0 ? (selected ? colors.p : colors.g2) : 'transparent',
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
