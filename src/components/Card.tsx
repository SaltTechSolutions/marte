import React from 'react';
import { View, ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

export function Card({
  children,
  style,
  raised,
  outlineColor,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  raised?: boolean;
  outlineColor?: string;
}) {
  const { colors, radius } = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: raised ? colors.surf2 : colors.surf,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: outlineColor ?? colors.line,
          padding: 16,
        },
        style,
      ]}>
      {children}
    </View>
  );
}
