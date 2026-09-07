import React, { useEffect, useState } from 'react';
import { Animated, ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

/** Shimmering skeleton block — primary surfaces never show a bare spinner. */
export function Skeleton({ style }: { style: ViewStyle }) {
  const { colors, radius } = useAppTheme();
  const [opacity] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: colors.surf2, borderRadius: radius.md, opacity },
        style,
      ]}
    />
  );
}
