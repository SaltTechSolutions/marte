import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Button } from './Button';
import { Text } from './Text';

/**
 * The empty state is the most instructive moment a screen has, and it was
 * being spent on a single line of grey text. Say what the list is, why it is
 * empty, and — when there is one — offer the action that fills it.
 *
 * `action` is deliberately optional: an empty list the viewer cannot do
 * anything about (a member with no payments recorded yet) should not grow a
 * button that only leads somewhere irrelevant.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, spacing } = useAppTheme();

  return (
    <View style={{ alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, gap: 10 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.surf2,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={icon} size={28} color={colors.sub} />
      </View>
      <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {description ? (
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" compact onPress={onAction} style={{ marginTop: 4 }} />
      ) : null}
    </View>
  );
}
