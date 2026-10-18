import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';
import { memberMark } from '@/utils/avatars';

import { AvatarGlyph } from './AvatarGlyph';
import { Text } from './Text';

/**
 * A person's mark: the avatar they picked, their initials when they have not (PER-20). Circle, unlike the gym's
 * square logo — people are round, brands are square. There are no photos of people anywhere (18 Oct 2026).
 */
export function MemberAvatar({ name, avatarId, size = 34 }: { name: string; avatarId?: string | null; size?: number }) {
  const { colors } = useAppTheme();
  const mark = memberMark(name, avatarId);
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      accessibilityLabel={name}>
      {mark.kind === 'avatar' ? (
        <AvatarGlyph id={mark.avatar.id} size={size} />
      ) : (
        <Text weight="900" style={{ color: colors.pText, fontSize: Math.round(size * 0.38) }}>
          {mark.initials}
        </Text>
      )}
    </View>
  );
}
