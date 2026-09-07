import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Button } from './Button';
import { Text } from './Text';

/**
 * Shown when a live subscription drops (permission denied, offline, index
 * missing). Without it the screen just sits on its empty state and the user
 * can't tell "nothing here yet" from "this is broken".
 */
export function ErrorNotice({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { colors, spacing, radius } = useAppTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 8,
        padding: spacing.lg,
        backgroundColor: colors.surf,
        borderWidth: 1,
        borderColor: colors.danger,
        borderRadius: radius.md,
      }}>
      <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
        Veriler yüklenemedi
      </Text>
      <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
        {message ?? 'Bağlantını kontrol edip tekrar dene.'}
      </Text>
      {onRetry && <Button label="Tekrar dene" variant="secondary" compact onPress={onRetry} />}
    </View>
  );
}
