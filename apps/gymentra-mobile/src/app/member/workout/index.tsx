import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchActiveProgramForMember } from '@/data/firebase/programRepo';
import { getRecentLogs, startWorkoutLog } from '@/data/firebase/workoutLogRepo';
import { isMultiDay, lastCompletedDayId, programDays, suggestedDayId } from '@/data/program';
import { Program, WorkoutLog } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/** Program overview → today's session. */
export default function WorkoutOverview() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);
  const [recent, setRecent] = useState<WorkoutLog[]>([]);
  const [dayId, setDayId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchActiveProgramForMember(tenantId, uid, setProgram);
  }, [tenantId, uid]);

  // Sıradaki günü önermek için geçmiş bir kez okunuyor.
  useEffect(() => {
    if (!tenantId || !uid) return;
    let cancelled = false;
    getRecentLogs(tenantId, uid)
      .then((logs) => !cancelled && setRecent(logs))
      .catch(() => {
        // Geçmiş okunamadıysa öneri ilk güne düşer; antrenmana başlamak
        // buna bağlı değil.
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, uid]);

  const days = program ? programDays(program) : [];
  // Üye seçmediyse: son çalışılan günden sonraki gün.
  const selectedDayId = dayId ?? suggestedDayId(days, lastCompletedDayId(recent));
  const selectedDay = days.find((d) => d.id === selectedDayId) ?? days[0];

  const start = async () => {
    if (!tenantId || !user || !program || !selectedDay || starting) return;
    setStarting(true);
    try {
      const logId = await startWorkoutLog(tenantId, user.uid, program, selectedDay);
      router.push({ pathname: '/member/workout/session', params: { logId } });
    } finally {
      setStarting(false);
    }
  };

  if (program === undefined) return <View style={{ flex: 1 }} />;

  if (!program) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 }}>
        <Ionicons name="barbell-outline" size={28} color={colors.sub} />
        <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
          Henüz programın yok
        </Text>
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          Antrenörün senin için bir program hazırladığında burada göreceksin.
        </Text>
      </View>
    );
  }

  const firstExercise = selectedDay?.exercises[0];
  const multiDay = isMultiDay(program);

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md }}>
      <Text variant="h3">Programım</Text>
      {/* Çok günlü programda hangi günü çalışacağı üyenin seçimi; ekran son
          antrenmandan sonraki günü önceden işaretliyor. */}
      {multiDay && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {days.map((d) => (
            <Chip key={d.id} label={d.name} selected={d.id === selectedDay?.id} onPress={() => setDayId(d.id)} />
          ))}
        </View>
      )}

      <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, gap: 6 }}>
        <Text variant="body" weight="900">
          {multiDay ? `${program.name} · ${selectedDay?.name}` : program.name}
        </Text>
        <Text variant="helper" tone="sub">
          {selectedDay?.exercises.length ?? 0} egzersiz{firstExercise ? ` · ${firstExercise.name} ile başlar` : ''}
        </Text>
        <Button
          label={starting ? '…' : 'Antrenmana başla'}
          critical
          disabled={starting || (selectedDay?.exercises.length ?? 0) === 0}
          style={{ marginTop: spacing.sm }}
          onPress={start}
        />
      </View>

      <Pressable
        onPress={() => router.push({ pathname: '/exercise-library', params: { scope: 'program' } })}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 13 }}>
        <Ionicons name="body-outline" size={18} color={colors.txt} />
        <View style={{ flex: 1 }}>
          <Text variant="helper" weight="700">
            Programımdaki hareketler
          </Text>
          <Text variant="label" tone="sub">
            Çalışan kaslar ve nasıl yapıldığı
          </Text>
        </View>
        <Text tone="sub">›</Text>
      </Pressable>
    </View>
  );
}
