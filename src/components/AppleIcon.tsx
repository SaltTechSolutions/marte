import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeContext';

/**
 * Apple's mark for "Sign in with Apple".
 *
 * Apple's guidelines require the logo to match the button's label colour and
 * to keep its proportions, so this takes no colour prop — it reads the same
 * `colors.txt` the secondary Button's label uses, which keeps the pair in
 * step when the tenant switches theme.
 *
 * Sized slightly larger than GoogleIcon on purpose: the Apple mark's glyph
 * is optically smaller at the same box size, so matching the numbers would
 * make it look shrunken next to Google's.
 */
export function AppleIcon({ size = 20 }: { size?: number }) {
  const { colors } = useAppTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={colors.txt}
        d="M17.05 12.53c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.73-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.34-3.53z"
      />
      <Path
        fill={colors.txt}
        d="M14.88 5.98c.61-.74 1.02-1.77.91-2.79-.88.04-1.94.59-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.58-1.23z"
      />
    </Svg>
  );
}
