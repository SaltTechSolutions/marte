import { Image } from 'expo-image';
import React, { useState } from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * A person's mark: their photo when they added one, their initials when not
 * (PER-20). Circle, unlike the gym's square logo — people are round, brands
 * are square. `expo-image` for the disk cache: the roster scrolls past the
 * same faces many times a day.
 */
export function MemberAvatar({ name, photoUrl, size = 34 }: { name: string; photoUrl?: string | null; size?: number }) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surf2 }}
        contentFit="cover"
        cachePolicy="disk"
        transition={120}
        onError={() => setFailed(true)}
        accessibilityLabel={name}
      />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={name}>
      <Text weight="900" style={{ color: colors.pText, fontSize: Math.round(size * 0.38) }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}
