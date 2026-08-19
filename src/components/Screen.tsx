import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeContext';

/** Full-screen gradient background (bg0 -> bg1) matching the design's phone frames. */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useAppTheme();
  return (
    <LinearGradient colors={[colors.bg0, colors.bg1]} style={[styles.fill, style]}>
      <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
