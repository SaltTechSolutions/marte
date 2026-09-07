import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Skeleton } from './Skeleton';

/**
 * Placeholder rows shaped like the real ones, so the screen keeps its layout
 * while data lands instead of collapsing to nothing and jumping.
 *
 * A skeleton is only honest while something is actually in flight — never
 * render it as a stand-in for an empty list.
 */
export function ListSkeleton({ rows = 4, avatar = true }: { rows?: number; avatar?: boolean }) {
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
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            padding: 13,
            borderBottomWidth: i === rows - 1 ? 0 : 1,
            borderBottomColor: colors.line,
          }}>
          {avatar ? <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} /> : null}
          <View style={{ flex: 1, gap: 6 }}>
            {/* Staggered widths — uniform bars read as a loading bug, not as text. */}
            <Skeleton style={{ height: 11, width: `${62 - (i % 3) * 12}%`, borderRadius: 6 }} />
            <Skeleton style={{ height: 9, width: `${44 - (i % 2) * 10}%`, borderRadius: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
