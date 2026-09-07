import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

type Tone = 'ok' | 'warn' | 'danger' | 'sub';

const ICONS: Record<Tone, string> = { ok: '●', warn: '⏳', danger: '●', sub: '○' };

/** Status is never conveyed by color alone — icon + label together, per the a11y brief. */
export function StatusBadge({ label, tone = 'ok' }: { label: string; tone?: Tone }) {
  const { colors, radius } = useAppTheme();
  const color = tone === 'sub' ? colors.sub : colors[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surf2,
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 7,
        alignSelf: 'flex-start',
      }}>
      <Text variant="helper" weight="600" style={{ color }}>
        {ICONS[tone]} {label}
      </Text>
    </View>
  );
}
