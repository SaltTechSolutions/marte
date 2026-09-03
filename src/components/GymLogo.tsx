import { Image } from 'expo-image';
import React, { useState } from 'react';
import { View } from 'react-native';

import { onColorFor } from '@/theme/contrast';
import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

/**
 * The gym's mark, everywhere the gym's identity is shown.
 *
 * Until this existed the uploaded logo was drawn in exactly one place — the
 * owner's own settings screen, on the upload button. Every other surface
 * showed a coloured square with the first letter of the name, so the only
 * thing telling a member "this is my gym's app" was the accent colour. The
 * owner uploaded a logo and never saw it again.
 *
 * `expo-image` rather than React Native's `Image` for one reason: it caches
 * to disk. The member card has to work with no network (it is the thing held
 * up at the door), and a logo that vanished offline would make the card look
 * broken at the one moment it matters.
 *
 * With no logo — or a logo that fails to load — it draws the letter avatar
 * every screen drew before, so a gym that never uploads one looks exactly as
 * it did. Rounded square, not a circle: brand marks are square, and a circle
 * crops the corners off most of them.
 *
 * `logoUrl` / `name` overrides exist for the one screen that shows a gym the
 * viewer has not joined yet (the join-by-code confirmation), where the theme
 * still belongs to whatever came before.
 */
export function GymLogo({
  size,
  radius,
  logoUrl,
  name,
}: {
  size: number;
  radius?: number;
  logoUrl?: string | null;
  name?: string;
}) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const url = logoUrl === undefined ? theme.logoUrl : logoUrl;
  const label = (name ?? theme.tenantName).trim();
  const r = radius ?? Math.round(size / 4);

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: theme.colors.surf2 }}
        contentFit="cover"
        cachePolicy="disk"
        transition={120}
        onError={() => setFailed(true)}
        accessibilityLabel={`${label} logosu`}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: theme.colors.p,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityLabel={label}>
      <Text weight="900" style={{ color: onColorFor(theme.colors.p), fontSize: Math.round(size * 0.45) }}>
        {label[0]?.toUpperCase() ?? 'G'}
      </Text>
    </View>
  );
}
