import React from 'react';
import RNQRCode from 'react-native-qrcode-svg';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

/** White card + primary-colored ring, matching the design's QR member card. */
export function QRCode({ value, size = 168 }: { value: string; size?: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 22,
        padding: 16,
        shadowColor: colors.p,
        borderWidth: 6,
        borderColor: colors.p,
      }}>
      <RNQRCode value={value} size={size} backgroundColor="#FFFFFF" color="#111111" />
    </View>
  );
}
