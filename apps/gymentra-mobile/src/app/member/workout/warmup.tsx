import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchActiveProgramForMember } from '@/data/firebase/programRepo';
import { getProgramTemplate } from '@/data/firebase/programTemplateRepo';
import { startWorkoutLog } from '@/data/firebase/workoutLogRepo';
import { formatDose } from '@/data/programTemplate';
import { programDays } from '@/data/program';
import { Program, ProgramTemplate } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/**
 * Antrenmanın ÖN BLOĞU: ısınma.
 *
 * PER-18'in kararı şuydu — "ısınma her programın otomatik ön bloğudur,
 * 'Antrenmana başla' önce ısınmayı getirir". Karar 2 Eylül'de verildi ama
 * kodda karşılığı yoktu: `Program.warmup` yazılıyor, hiçbir ekran okumuyordu.
 * Dört ısınma şablonu (`warmup-general`, `-lower`, `-upper`, `-short`) veride
 * duruyor ve kimse görmüyordu.
 *
 * ## Isınma KAYDA GİRMİYOR
 *
 * Bilerek: ısınma bir antrenman değil hazırlık. `workout_logs`'a girseydi
 * "geçen sefer" karşılaştırması, hacim ve set sayımı ısınma setleriyle
 * kirlenirdi — 12 tekrar kalça köprüsü ısınması ile 12 tekrar kalça köprüsü
 * antrenmanı aynı şey değil. Bu ekran gösteriyor; sayan şey seans ekranı.
 *
 * ## Neden ayrı ekran
 *
 * Seans ekranı terli elle, tek egzersize odaklanarak kullanılıyor ve tab
 * çubuğu bile gizli. Isınmayı oraya bir blok olarak koymak o odağı bozardı;
 * üstelik ısınma sırayla yapılan ve bittiğinde geride bırakılan bir şey.
 * Kayıt ancak buradan çıkarken açılıyor: ısınmayı açıp vazgeçen üye arkada
 * yarım bir antrenman kaydı bırakmıyor.
 */
export default function WorkoutWarmup() {
  const router = useRouter();
  const { dayId } = useLocalSearchParams<{ dayId?: string }>();
  const { colors, spacing, radius } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [template, setTemplate] = useState<ProgramTemplate | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchActiveProgramForMember(tenantId, uid, setProgram);
  }, [tenantId, uid]);

  const warmupId = program?.warmup;
  useEffect(() => {
    if (program === undefined) return;
    let cancelled = false;
    // Isınma okunamazsa antrenmanı ENGELLEMİYOR: liste boş kalıyor, düğme
    // çalışıyor. Isınma bir hazırlık; onun yüzünden antrenman durmamalı.
    const p = warmupId ? getProgramTemplate(warmupId) : Promise.resolve(null);
    p.then((t) => !cancelled && setTemplate(t)).catch(() => !cancelled && setTemplate(null));
    return () => {
      cancelled = true;
    };
  }, [program, warmupId]);

  const days = program ? programDays(program) : [];
  const day = days.find((d) => d.id === dayId) ?? days[0];

  const start = async () => {
    if (!tenantId || !user || !program || !day || starting) return;
    setStarting(true);
    try {
      const logId = await startWorkoutLog(tenantId, user.uid, program, day);
      // `replace`: geri tuşu antrenmanın ortasından ısınmaya dönmemeli.
      router.replace({ pathname: '/member/workout/session', params: { logId } });
    } finally {
      setStarting(false);
    }
  };

  if (program === undefined || template === undefined) return <View style={{ flex: 1 }} />;

  const lines = template?.days[0]?.exercises ?? [];

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
      <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
        <View style={{ gap: 4 }}>
          <Text variant="h3">{template?.title ?? 'Isınma'}</Text>
          <Text variant="helper" tone="sub">
            {day ? `${day.name} öncesi` : 'Antrenman öncesi'}
            {template ? ` · ${template.durationMinutes} dk` : ''}
          </Text>
        </View>

        {template?.summary ? (
          <Text variant="helper" tone="sub">
            {template.summary}
          </Text>
        ) : null}

        {lines.length === 0 ? (
          <Text variant="helper" tone="sub">
            Isınma bloğu okunamadı. Antrenmana başlayabilirsin; birkaç dakika hafif hareketle
            başlamak yine de iyi olur.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {lines.map((e, i) => (
              <View
                key={`${e.name}-${i}`}
                style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, gap: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                  <Text variant="helper" weight="900" style={{ flex: 1 }}>
                    {e.name}
                  </Text>
                  <Text variant="label" tone="sub">
                    {formatDose(e)}
                  </Text>
                </View>
                {e.cue ? (
                  <Text variant="label" tone="sub">
                    {e.cue}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Şablonun sınırları burada da geçerli: ısınma bir antrenman değil. */}
        {template && template.limits.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Ionicons name="information-circle-outline" size={16} color={colors.sub} />
            <Text variant="label" tone="sub" style={{ flex: 1 }}>
              {template.limits[0]}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={{ paddingBottom: spacing.md }}>
        <Button
          label={starting ? '…' : 'Isındım, antrenmana başla'}
          critical
          disabled={starting || !day}
          onPress={start}
        />
      </View>
    </View>
  );
}
