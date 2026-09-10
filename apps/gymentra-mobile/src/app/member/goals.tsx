import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchProgramTemplates } from '@/data/firebase/programTemplateRepo';
import { ProgramTemplate } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/**
 * "Karnım incelsin" ekranı.
 *
 * En çok istenen şeyler — karın incelmesi, kolun kalınlaşması, kalçanın
 * gelişmesi — kullanıcının kendi diliyle burada duruyor ve her biri DÜRÜST
 * adlı bir programa çıkıyor. Ayrım tek cümlede:
 *
 *   Bölgesel YAĞ KAYBI yoktur (Vispute 2011, Kostek 2007).
 *   Bölgesel KAS GELİŞİMİ vardır.
 *
 * Bu yüzden "kol kalınlaştırma" dürüstçe hedeflenebilir ama "karın
 * inceltme" hedeflenemez; karşılığı kası çalıştırmak artı kalori açığı.
 * Şablonun `goal` alanı bu cümleyi taşıyor — metin ekranda değil VERİDE,
 * çünkü iddiayı kaynağıyla birlikte gözden geçiren şey şablon.
 *
 * Üye kendine program ATAMAZ: atama antrenörde kalır. Ekran bilgilendirir
 * ve üyeyi antrenörüyle aynı kelimeleri konuşur hâle getirir.
 */
export default function MemberGoals() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  const [templates, setTemplates] = useState<ProgramTemplate[] | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    return watchProgramTemplates(tenantId, setTemplates);
  }, [tenantId]);

  const byId = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t])), [templates]);
  const goals = useMemo(() => (templates ?? []).filter((t) => t.goal), [templates]);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl }}>
      <View style={{ gap: 4 }}>
        <Text variant="h3">Ne istiyorsun?</Text>
        <Text variant="helper" tone="sub">
          Kendi kelimelerinle seç. Her hedefin altında ne çalışacağın ve NEDEN o olduğu yazıyor —
          antrenörünle aynı şeyi konuşabilmen için.
        </Text>
      </View>

      {templates === undefined ? (
        <ListSkeleton rows={5} avatar={false} />
      ) : goals.length === 0 ? (
        <EmptyState
          icon="compass-outline"
          title="Hedef listesi henüz hazır değil"
          description="Salonun hazır programları yüklendiğinde burada göreceksin."
        />
      ) : (
        goals.map((t) => {
          const open = openId === t.id;
          const pair = t.goal?.pairsWith ? byId.get(t.goal.pairsWith) : undefined;
          return (
            <Pressable
              key={t.id}
              onPress={() => setOpenId(open ? null : t.id)}
              style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, gap: 6, minHeight: 44 }}>
              <Text variant="body" weight="900">
                {t.goal!.wants}
              </Text>
              <Text variant="label" tone="sub">
                {t.title} · {t.durationMinutes} dk · {t.weeklyFrequency}
              </Text>
              {open && (
                <View style={{ gap: 8, paddingTop: 4 }}>
                  {/* Tek cümlelik dürüstlük. Gizlenmiyor, ilk açılışta görünüyor. */}
                  <Text variant="helper" style={{ color: colors.p }}>
                    {t.goal!.because}
                  </Text>
                  <Text variant="helper" tone="sub">
                    {t.summary}
                  </Text>
                  {pair && (
                    <Text variant="helper" tone="sub">
                      Birlikte çalışır: <Text weight="700">{pair.title}</Text> — {pair.weeklyFrequency}
                    </Text>
                  )}
                  <Text variant="label" tone="sub">
                    Programı sana antrenörün atar. Bu başlığı ona söylemen yeter.
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })
      )}

      <Pressable onPress={() => router.push('/exercise-library')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="helper" weight="700" style={{ color: colors.p, textAlign: 'center' }}>
          Hareket kütüphanesine göz at
        </Text>
      </Pressable>
    </ScrollView>
  );
}
