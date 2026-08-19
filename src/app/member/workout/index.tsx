import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchActiveProgramForMember } from '@/data/firebase/programRepo';
import { startWorkoutLog } from '@/data/firebase/workoutLogRepo';
import { Program } from '@/data/types';
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

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchActiveProgramForMember(tenantId, uid, setProgram);
  }, [tenantId, uid]);

  const start = async () => {
    if (!tenantId || !user || !program || starting) return;
    setStarting(true);
    try {
      const logId = await startWorkoutLog(tenantId, user.uid, program);
      router.push({ pathname: '/member/workout/session', params: { logId } });
    } finally {
      setStarting(false);
    }
  };

  if (program === undefined) return (
      <Screen>
        <View />
      </Screen>
    );

  if (!program) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 }}>
        <Text style={{ fontSize: 28 }}>🏋️</Text>
        <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
          Henüz programın yok
        </Text>
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          Antrenörün senin için bir program hazırladığında burada göreceksin.
        </Text>
      </View>
    );
  }

  const firstExercise = program.exercises[0];

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md }}>
      <Text variant="h3">Programım</Text>
      <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, gap: 6 }}>
        <Text variant="body" weight="900">
          {program.name}
        </Text>
        <Text variant="helper" tone="sub">
          {program.exercises.length} egzersiz{firstExercise ? ` · ${firstExercise.name} ile başlar` : ''}
        </Text>
        <Button
          label={starting ? '…' : 'Antrenmana başla'}
          critical
          disabled={starting || program.exercises.length === 0}
          style={{ marginTop: spacing.sm }}
          onPress={start}
        />
      </View>
    </View>
  );
}
