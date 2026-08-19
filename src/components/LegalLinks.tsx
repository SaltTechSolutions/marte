import * as Linking from 'expo-linking';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

const SITE = 'https://gymentra.salt-tech-apps.com';

/**
 * Both stores expect the privacy policy and terms to be reachable from
 * inside the app, not only from the store listing. Rendered at the bottom
 * of the per-role settings/profile screens.
 */
export function LegalLinks() {
  const { colors, spacing } = useAppTheme();

  const open = (path: string) => {
    Linking.openURL(`${SITE}${path}`).catch(() => {
      // Opening an external browser can fail (no handler, user cancelled).
      // Nothing actionable for the user here — the links are also in the
      // store listing — so fail quietly rather than throwing.
    });
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
      <Pressable onPress={() => open('/privacy/')} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" tone="sub">
          Gizlilik Politikası
        </Text>
      </Pressable>
      <Text variant="label" style={{ color: colors.line }}>
        |
      </Text>
      <Pressable onPress={() => open('/terms/')} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" tone="sub">
          Kullanım Şartları
        </Text>
      </Pressable>
    </View>
  );
}
