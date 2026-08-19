import { Ionicons } from '@expo/vector-icons';
import { Href, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

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

/**
 * Fully custom bottom tab bar (not expo-router's NativeTabs) so it can read
 * theme tokens directly and be hidden entirely in workout mode. Max 5 items
 * per the one-handed-reach / two-tap-rule brief.
 */
export function TabBar({ items }: { items: TabItem[] }) {
  const { colors } = useAppTheme();
  const pathname = usePathname();
  const router = useRouter();

  // Pick the single longest-matching href so a parent tab (e.g. "/member")
  // doesn't also light up while a nested route ("/member/card") is active.
  const activeHref = items
    .map((i) => String(i.href))
    .filter((href) => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 10,
        paddingBottom: 18,
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
            style={{ alignItems: 'center', minWidth: 44, minHeight: 44, justifyContent: 'center', gap: 2 }}>
            <Ionicons
              name={active ? activeGlyph(item.icon) : item.icon}
              size={23}
              color={active ? colors.p : colors.sub}
            />
            <Text variant="label" style={{ color: active ? colors.p : colors.sub }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
