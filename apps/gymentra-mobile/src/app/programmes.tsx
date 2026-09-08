import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ListGroup, ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import {
  PROGRAMME_IDS,
  Programme,
  programmeById,
  programmeSummary,
  goalLabel,
  levelLabel,
} from '@/data/programmes';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

/**
 * Hazır programlar listesi.
 *
 * Bir antrenörün yazdığı program değil, kütüphaneden seçilen bir başlangıç
 * yapısı. Ayrımı ekranda söylüyoruz: üyenin kendi programı varsa ona uyması
 * gerekiyor, buradaki liste onun yerine geçmiyor.
 */
export default function Programmes() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();

  const open = (id: string) => router.push({ pathname: '/programme-detail', params: { programmeId: id } });

  const row = (id: string, p: Programme, last: boolean) => (
    <ListRow key={id} last={last} onPress={() => open(id)}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="helper" weight="700" numberOfLines={1}>
          {p.name}
        </Text>
        <Text variant="label" tone="sub" numberOfLines={1}>
          {goalLabel(p)} · {levelLabel(p)} · {programmeSummary(p)}
        </Text>
      </View>
      <Text tone="sub">›</Text>
    </ListRow>
  );

  return (
    <Screen>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}>
        <Pressable
          onPress={() => safeBack(router, '/')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surf2,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
        </Pressable>
        <Text variant="h3" style={{ flex: 1 }}>
          Hazır programlar
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          gap: spacing.sm,
          paddingBottom: spacing.lg,
        }}>
        <View
          style={{
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: 6,
          }}>
          <Text variant="label" weight="700">
            Bunlar başlangıç yapıları
          </Text>
          <Text variant="label" tone="sub">
            Antrenörün sana yazdığı bir program varsa ona uy — o programı yazan kişi seni tanıyor. Her programın
            içinde ne yaptığı kadar NE YAPMADIĞI da yazıyor; seçmeden önce onu oku.
          </Text>
        </View>

        <ListGroup>
          {PROGRAMME_IDS.map((id, i) => {
            const p = programmeById(id);
            return p ? row(id, p, i === PROGRAMME_IDS.length - 1) : null;
          })}
        </ListGroup>
      </ScrollView>
    </Screen>
  );
}
