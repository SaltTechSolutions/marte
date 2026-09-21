import React from 'react';
import { TextInput, TextInputProps } from 'react-native';

import { fieldBorderColor } from '@/theme/fieldBorder';
import { useAppTheme } from '@/theme/ThemeContext';

export function TextField(props: TextInputProps) {
  const { colors, radius } = useAppTheme();
  return (
    <TextInput
      placeholderTextColor={colors.sub}
      {...props}
      style={[
        {
          backgroundColor: colors.surf,
          borderWidth: 1,
          // `line` is a divider hairline (~1.3:1); an input outline owes 3:1.
          borderColor: fieldBorderColor(colors),
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 13,
          fontFamily: 'Inter',
          fontSize: 15,
          color: colors.txt,
          minHeight: 48,
        },
        props.style,
      ]}
    />
  );
}
