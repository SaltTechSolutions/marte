import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Card } from './Card';
import { Text } from './Text';

/** The one leading-slot size every card shares. Kept here rather than at each
 *  call site — that is how three cards ended up 38pt and one 34pt. */
const LEAD = 38;

/**
 * The standard card row: a leading visual, a title/subtitle stack, and an
 * optional trailing affordance.
 *
 * Six cards on the member's home screen were doing this by hand and had
 * drifted apart — gaps of 10, 12 and 14, three different leading elements,
 * and a chevron that was sometimes a `›` glyph and sometimes nothing. The
 * layout is identical in every case, so it belongs in one place.
 *
 * `lead` accepts a node for the cases that genuinely differ (a progress ring,
 * a time badge); pass `icon` for the common circular-icon case and the
 * circle is drawn consistently.
 */
export function InfoCard({
  icon,
  initials,
  lead,
  label,
  title,
  subtitle,
  subtitleTone,
  trailing,
  onPress,
  outlined,
  children,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  /** Initials avatar for people — same circle as `icon`, drawn once here. */
  initials?: string;
  lead?: React.ReactNode;
  /** Small caps heading above the row, e.g. "PAKETİM". */
  label?: string;
  title: string;
  subtitle?: string;
  /** Warning/danger colouring for the subtitle when it carries the urgency. */
  subtitleTone?: 'sub' | 'warn' | 'danger';
  /** Right-hand side: omit for none, `true` for the standard chevron. */
  trailing?: React.ReactNode | true;
  onPress?: () => void;
  outlined?: boolean;
  /** Extra content below the row — pills, stats, actions. */
  children?: React.ReactNode;
}) {
  const { colors, spacing } = useAppTheme();

  const circle = {
    width: LEAD,
    height: LEAD,
    borderRadius: LEAD / 2,
    backgroundColor: colors.surf2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const leading =
    lead ??
    (initials ? (
      <View style={circle}>
        <Text variant="helper" weight="900" style={{ color: colors.pText }}>
          {initials}
        </Text>
      </View>
    ) : icon ? (
      <View
        style={circle}>
        <Ionicons name={icon} size={19} color={colors.pText} />
      </View>
    ) : null);

  const body = (
    <Card style={{ gap: label || children ? spacing.sm : 0 }} outlineColor={outlined ? colors.p : undefined}>
      {label ? (
        <Text variant="label" tone="sub">
          {label}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {leading}
        <View style={{ flex: 1 }}>
          <Text variant="helper" weight="700" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              variant="label"
              tone={subtitleTone === 'sub' || !subtitleTone ? 'sub' : undefined}
              style={subtitleTone && subtitleTone !== 'sub' ? { color: colors[subtitleTone] } : undefined}
              numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing === true ? <Text tone="sub">›</Text> : trailing}
      </View>

      {children}
    </Card>
  );

  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}
