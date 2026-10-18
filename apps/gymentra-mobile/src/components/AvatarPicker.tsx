import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';
import { pickerOptions, type PickerOption } from '@/utils/avatars';
import { hapticSelection } from '@/utils/haptics';

import { AvatarGlyph } from './AvatarGlyph';
import { Text } from './Text';

const GLYPH = 72;
const RING = 3;
const COLUMNS = 3;

/**
 * Choose one of the 12 predefined avatars (3 columns x 4 rows), or go back to showing initials. A radio group:
 * exactly one option is always selected. The selection is a brand-coloured ring AND a check mark, never colour
 * alone. It does not save anything: the screen decides when `onChange` is written.
 */
export function AvatarPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const { colors, radius, spacing } = useAppTheme();
  const { avatars, clear } = pickerOptions(value);

  const choose = (option: PickerOption) => {
    if (disabled || option.selected) return;
    hapticSelection();
    onChange(option.id);
  };

  const check = (
    <View
      style={{
        position: 'absolute',
        top: -2,
        right: -2,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.p,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Ionicons name="checkmark" size={15} color={colors.onp} />
    </View>
  );

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Avatar seç" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {avatars.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => choose(o)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: o.selected, disabled: !!disabled }}
            style={{ width: `${100 / COLUMNS}%`, minHeight: 48, alignItems: 'center', paddingVertical: 8, gap: 6, opacity: disabled ? 0.6 : 1 }}>
            <View
              style={{
                width: GLYPH + 2 * (RING + 2),
                height: GLYPH + 2 * (RING + 2),
                borderRadius: radius.pill,
                borderWidth: RING,
                borderColor: o.selected ? colors.p : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <AvatarGlyph id={o.id} size={GLYPH} />
              {o.selected ? check : null}
            </View>
            <Text variant="label" weight={o.selected ? '700' : '500'} numberOfLines={1}>
              {o.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={() => choose(clear)}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityLabel={clear.label}
        accessibilityState={{ checked: clear.selected, disabled: !!disabled }}
        style={{
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: radius.pill,
          borderWidth: clear.selected ? RING : 1,
          borderColor: clear.selected ? colors.p : colors.line,
          opacity: disabled ? 0.6 : 1,
        }}>
        {clear.selected ? <Ionicons name="checkmark" size={18} color={colors.pText} /> : null}
        <Text variant="helper" weight="700">
          {clear.name}
        </Text>
      </Pressable>
    </View>
  );
}
