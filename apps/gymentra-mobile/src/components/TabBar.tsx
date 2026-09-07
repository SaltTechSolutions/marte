import { Ionicons } from '@expo/vector-icons';
import { Href, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

export interface TabItem {
  href: Href;
  /** Ionicons outline glyph name, e.g. "home-outline" — the filled variant is used when active. */
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

function activeGlyph(name: string): keyof typeof Ionicons.glyphMap {
  // Ionicons ships filled/outline pairs as "<name>" / "<name>-outline".
  return name.replace(/-outline$/, '') as keyof typeof Ionicons.glyphMap;
}

const isIOS = Platform.OS === 'ios';

/**
 * Fully custom bottom tab bar (not expo-router's NativeTabs) so it can read
 * theme tokens directly and be hidden entirely in workout mode. Max 5 items
 * per the one-handed-reach / two-tap-rule brief.
 *
 * Custom means the platform conventions have to be rebuilt by hand, and the
 * two platforms disagree about what a selected tab looks like:
 *
 * - iOS tints the glyph and its label and leaves it at that.
 * - Material 3 puts a filled "pill" behind the glyph — the tint alone is not
 *   the Android selected state, and on Android the tint-only version read as
 *   an unfinished iOS bar.
 *
 * Metrics differ too: Material's label is smaller and sits tighter under a
 * larger glyph.
 */
export function TabBar({ items }: { items: TabItem[] }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  // Pick the single longest-matching href so a parent tab (e.g. "/member")
  // doesn't also light up while a nested route ("/member/card") is active.
  const activeHref = items
    .map((i) => String(i.href))
    .filter((href) => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];

  // Was a hardcoded 18. That is too little under an iPhone home indicator
  // (34pt) and too much on hardware with no bottom inset at all — the tab
  // bar's own breathing room is the 10, the rest belongs to the system.
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.line,
        paddingTop: isIOS ? 10 : 12,
        paddingBottom: bottomPad,
        backgroundColor: colors.bg1,
      }}>
      {items.map((item) => {
        const active = String(item.href) === activeHref;
        return (
          <Pressable
            key={String(item.href)}
            // replace, not push: tabs are peers, not a stack. Pushing meant
            // every tab visit stacked up, so Android's back button walked
            // backwards through tab history instead of leaving the app.
            onPress={() => router.replace(item.href)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            style={{ alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center', gap: isIOS ? 2 : 3 }}>
            <View
              style={{
                // The M3 selection indicator. On iOS it collapses to a plain
                // wrapper — no pill, no extra padding.
                paddingHorizontal: isIOS ? 0 : 18,
                paddingVertical: isIOS ? 0 : 4,
                borderRadius: 16,
                backgroundColor: !isIOS && active ? colors.surf2 : 'transparent',
              }}>
              <Ionicons
                name={active ? activeGlyph(item.icon) : item.icon}
                size={isIOS ? 23 : 24}
                color={active ? colors.p : colors.sub}
              />
            </View>
            <Text
              variant="label"
              weight={!isIOS && active ? '700' : undefined}
              style={{ color: active ? colors.p : colors.sub, fontSize: isIOS ? undefined : 12 }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
