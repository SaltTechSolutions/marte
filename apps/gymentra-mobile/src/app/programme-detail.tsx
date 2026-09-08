import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { exerciseById } from '@/data/exerciseLibrary';
import { goalLabel, levelLabel, programmeById, programmeSummary } from '@/data/programmes';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

/**
 * Bir hazır programın içeriği.
 *
 * SINIRLAR listenin ALTINDA değil ÜSTÜNDE, günlerin önünde duruyor. Ne
 * yapmadığını hareketleri gördükten sonra okumak, kararı verdikten sonra
 * okumak demek — o noktada uyarı bilgi değil, kendini aklama oluyor.
 */
export default function ProgrammeDetail() {
  const router = useRouter();
  const { programmeId } = useLocalSearchParams<{ programmeId?: string }>();
  const { colors, spacing, radius } = useAppTheme();
  const p = programmeId ? programmeById(programmeId) : undefined;

  const card = (children: React.ReactNode, tint?: string) => (
    <View
      style={{
        backgroundColor: colors.surf,
        borderWidth: 1,
        borderColor: tint ?? colors.line,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: 8,
      }}>
      {children}
    </View>
  );

  if (!p) {
    return (
      <Screen>
        <View style={{ padding: spacing.md }}>
          <EmptyState
            icon="help-circle-outline"
            title="Program bulunamadı"
            description="Bu program kaldırılmış olabilir."
            actionLabel="Listeye dön"
            onAction={() => safeBack(router, '/programmes')}
          />
        </View>
      </Screen>
    );
  }

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
          onPress={() => safeBack(router, '/programmes')}
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
        <Text variant="h3" style={{ flex: 1 }} numberOfLines={1}>
          {p.name}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.md,
          paddingTop: spacing.sm,
          gap: spacing.sm,
          paddingBottom: spacing.lg,
        }}>
        {card(
          <>
            <Text variant="label" tone="sub">
              {goalLabel(p)} · {levelLabel(p)} · {programmeSummary(p)}
            </Text>
            <Text variant="body">{p.promise}</Text>
            <Text variant="label" tone="sub">
              Ekipman: {p.equipment.join(', ')}
            </Text>
          </>,
        )}

        {/* Sınırlar — karardan ÖNCE, günlerden önce. */}
        {card(
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warn} />
              <Text variant="label" weight="700" style={{ color: colors.warn }}>
                Bu program neyi yapmaz
              </Text>
            </View>
            {p.limits.map((l) => (
              <Text key={l} variant="label" tone="sub">
                • {l}
              </Text>
            ))}
          </>,
          colors.warn,
        )}

        {card(
          <>
            <Text variant="label" weight="700">
              Nasıl ilerlenir
            </Text>
            <Text variant="label" tone="sub">
              {p.progression}
            </Text>
          </>,
        )}

        {p.days.map((d) => (
          <View key={d.id} style={{ gap: 6 }}>
            <Text variant="label" weight="700" style={{ paddingHorizontal: 4 }}>
              {d.name}
            </Text>
            {d.warmup && d.warmup.length > 0 ? (
              <Text variant="label" tone="sub" style={{ paddingHorizontal: 4 }}>
                Isınma: {d.warmup.map((w) => exerciseById(w)?.tr ?? w).join(' · ')}
              </Text>
            ) : null}
            <ListGroup>
              {d.exercises.map((x, i) => {
                const ex = exerciseById(x.id);
                return (
                  <ListRow
                    key={`${d.id}-${x.id}-${i}`}
                    last={i === d.exercises.length - 1}
                    onPress={ex ? () => router.push({ pathname: '/exercise-detail', params: { exerciseId: x.id } }) : undefined}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text variant="helper" weight="700" numberOfLines={1}>
                        {ex?.tr ?? x.id}
                      </Text>
                      <Text variant="label" tone="sub" numberOfLines={2}>
                        {x.sets} × {x.reps} · {x.restSec} sn ara{x.note ? ` — ${x.note}` : ''}
                      </Text>
                    </View>
                    {ex ? <Text tone="sub">›</Text> : null}
                  </ListRow>
                );
              })}
            </ListGroup>
          </View>
        ))}

        {card(
          <>
            <Text variant="label" weight="700">
              Neye dayanıyor
            </Text>
            {p.evidence.map((e) => (
              <View key={e.claim} style={{ gap: 2 }}>
                <Text variant="label">• {e.claim}</Text>
                <Text variant="label" tone="sub" style={{ paddingLeft: 10 }}>
                  {e.basis}
                </Text>
              </View>
            ))}
            {!p.reviewed ? (
              <Text variant="label" tone="sub">
                Bu içerik henüz bir uzman tarafından kontrol edilmedi.
              </Text>
            ) : null}
          </>,
        )}
      </ScrollView>
    </Screen>
  );
}
