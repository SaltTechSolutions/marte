import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

/** A single grouped row with a bottom separator — for high-density lists (design pattern). */
export function ListRow({
  children,
  onPress,
  last,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const { colors } = useAppTheme();
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 9,
        paddingHorizontal: 12,
        minHeight: 44,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.line,
      }}>
      {children}
    </Wrapper>
  );
}

export function ListGroup({ children }: { children: React.ReactNode }) {
  const { colors, radius } = useAppTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surf,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}>
      {children}
    </View>
  );
}
