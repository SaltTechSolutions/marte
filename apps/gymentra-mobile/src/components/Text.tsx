import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'callout' | 'helper' | 'label';
type Tone = 'primary' | 'sub' | 'onp' | 'ok' | 'warn' | 'danger' | 'inherit';

interface Props extends TextProps {
  variant?: Variant;
  tone?: Tone;
  weight?: TextStyle['fontWeight'];
}

/** Design-token-driven text component. All type styling flows through theme.type. */
export function Text({ variant = 'body', tone = 'primary', weight, style, ...rest }: Props) {
  const { colors, type } = useAppTheme();
  const toneColor =
    tone === 'primary'
      ? colors.txt
      : tone === 'sub'
        ? colors.sub
        : tone === 'onp'
          ? colors.onp
          : tone === 'inherit'
            ? undefined
            : colors[tone];

  return (
    <RNText
      style={[
        { fontFamily: 'Inter', color: toneColor },
        type[variant],
        weight ? { fontWeight: weight } : null,
        style,
      ]}
      {...rest}
    />
  );
}
