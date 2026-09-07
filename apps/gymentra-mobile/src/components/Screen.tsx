import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeContext';

/** A standalone screen owns all four edges — including the bottom, where the
 *  home indicator and Android's gesture bar live. Surfaces that already draw
 *  something over the bottom inset (a tab bar) pass their own `edges`. */
const ALL_EDGES: readonly Edge[] = ['top', 'left', 'right', 'bottom'];

/**
 * Full-screen gradient background (bg0 -> bg1) matching the design's phone frames.
 *
 * Do not nest one inside another: `SafeAreaView` has no idea an ancestor
 * already consumed the inset, so a nested Screen pads the notch twice.
 */
export function Screen({
  children,
  style,
  edges = ALL_EDGES,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: readonly Edge[];
}) {
  const { colors } = useAppTheme();
  return (
    <LinearGradient colors={[colors.bg0, colors.bg1]} style={[styles.fill, style]}>
      <SafeAreaView style={styles.fill} edges={edges}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
