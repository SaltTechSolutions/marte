import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';
import { hapticSelection } from '@/utils/haptics';

import { Text } from './Text';

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Leading glyph — for chips that act rather than filter (e.g. a sort toggle). */
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors, radius } = useAppTheme();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={() => { hapticSelection(); onPress?.(); }}
      style={{
        backgroundColor: selected ? colors.p : colors.surf2,
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 8,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
      }}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.onp : colors.txt} /> : null}
      <Text variant="helper" weight="600" tone={selected ? 'onp' : 'primary'}>
        {label}
      </Text>
    </Wrapper>
  );
}
