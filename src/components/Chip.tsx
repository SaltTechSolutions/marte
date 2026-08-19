import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors, radius } = useAppTheme();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={{
        backgroundColor: selected ? colors.p : colors.surf2,
        borderRadius: radius.pill,
        paddingHorizontal: 14,
        paddingVertical: 8,
        minHeight: 44,
        justifyContent: 'center',
      }}>
      <Text variant="helper" weight="600" tone={selected ? 'onp' : 'primary'}>
        {label}
      </Text>
    </Wrapper>
  );
}
