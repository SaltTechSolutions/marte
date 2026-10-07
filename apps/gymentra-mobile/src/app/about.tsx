import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import rigAnatomy from '@/data/rigAnatomy.json';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

/**
 * Third-party artwork the app ships, with its licence text.
 *
 * The muscle map is drawn from MuscleMap's paths (MIT), most of which come
 * from react-native-body-highlighter (MIT). MIT asks for the notice to travel
 * with the software; the text already rides inside `rigAnatomy.json`, this
 * screen makes it visible. The texts are read from that file, not copied
 * here, so a re-import in packages/rig can never leave a stale notice behind.
 */
const CREDITS: { name: string; url: string }[] = [
  { name: 'MuscleMap', url: 'github.com/melihcolpan/MuscleMap' },
  { name: 'react-native-body-highlighter', url: 'github.com/HichamELBSI/react-native-body-highlighter' },
];

/** Shared by every role: reached from the legal links at the foot of each settings screen. */
export default function About() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const licenses = (rigAnatomy as { licenses: string[] }).licenses;
  const version = Constants.expoConfig?.version;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <Pressable
          onPress={() => safeBack(router, '/')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
        </Pressable>
        <Text variant="h3" style={{ flex: 1 }}>
          Hakkında
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
        <Card style={{ gap: 4 }}>
          <Text variant="h3">GymEntra</Text>
          {version ? (
            <Text tone="sub">Sürüm {version}</Text>
          ) : null}
          <Text tone="sub">SaltTechSolutions</Text>
        </Card>

        <Text variant="label" tone="sub" style={{ marginTop: spacing.sm }}>
          AÇIK KAYNAK LİSANSLARI
        </Text>
        <Text tone="sub">
          Hareket ekranındaki kas haritası çizimleri aşağıdaki açık kaynak projelerden uyarlanmıştır.
        </Text>

        {CREDITS.map((c, i) => (
          <Card key={c.name} style={{ gap: 6 }}>
            <Text weight="700">{c.name}</Text>
            <Text variant="label" tone="sub">
              {c.url}
            </Text>
            {licenses[i] ? (
              <Text variant="label" tone="sub" style={{ lineHeight: 17, marginTop: 4 }}>
                {licenses[i].trim()}
              </Text>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}
