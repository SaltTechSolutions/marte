import React, { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';

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
  const text = message ?? 'Bağlantını kontrol edip tekrar dene.';

  // The banner appears on its own when a listener drops; nothing moves focus
  // to it, so without this a screen-reader user never learns the data is stale.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Veriler yüklenemedi. ${text}`);
  }, [text]);

  return (
    <View
      accessibilityLiveRegion="polite"
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
        {text}
      </Text>
      {onRetry && <Button label="Tekrar dene" variant="secondary" compact onPress={onRetry} />}
    </View>
  );
}
