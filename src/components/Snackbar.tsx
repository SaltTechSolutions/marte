import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

/** Undo-preferred feedback for destructive/reversible actions (cancel booking, reject request). */
export function Snackbar({
  message,
  actionLabel = 'Geri Al',
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, radius } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.surf2,
        borderRadius: radius.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}>
      <Text variant="helper" tone="sub" style={{ flex: 1 }}>
        ↩ {message}
      </Text>
      {onAction && (
        <Pressable onPress={onAction}>
          <Text variant="helper" weight="700" style={{ color: colors.p }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
