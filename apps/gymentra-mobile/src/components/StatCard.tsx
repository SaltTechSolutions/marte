import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Card } from './Card';
import { Text } from './Text';

export interface Stat {
  value: string | number;
  label: string;
  /** Colours the value when it is the thing that needs attention. */
  tone?: 'warn' | 'danger';
}

/**
 * A small-caps heading over a row of evenly divided figures.
 *
 * The second card family in the app, after `InfoCard`. Seven screens were
 * building this by hand — trainer's workload, member's attendance and
 * workout summary, the admin dashboard's tallies — and had drifted in the
 * same way the info rows had: the divider was redrawn at each call site, the
 * value used `h3` in one place and `body` in another.
 *
 * A missing figure is rendered as an en dash rather than 0: "no data yet"
 * and "zero" are different answers and a gym owner reads them differently.
 */
export function StatCard({
  label,
  stats,
  footnote,
}: {
  label?: string;
  stats: Stat[];
  /** One quiet line under the figures — "son gelişin", "ortalama süre". */
  footnote?: string;
}) {
  const { colors, spacing } = useAppTheme();

  return (
    <Card style={{ gap: label ? spacing.sm : 0 }}>
      {label ? (
        <Text variant="label" tone="sub">
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        {stats.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <View style={{ width: 1, backgroundColor: colors.line }} />}
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text variant="h3" style={s.tone ? { color: colors[s.tone] } : undefined}>
                {s.value === '' || s.value === null || s.value === undefined ? '–' : s.value}
              </Text>
              <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                {s.label}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      {footnote ? (
        <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}
