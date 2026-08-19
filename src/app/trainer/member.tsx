import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchMeasurements } from '@/data/firebase/measurementRepo';
import { findOrCreateDraftProgram, watchActiveProgramForMember } from '@/data/firebase/programRepo';
import { watchWorkoutLogsForMember } from '@/data/firebase/workoutLogRepo';
import { isStaff, tenantIdIf } from '@/data/membership';
import { MeasurementEntry, Program, WorkoutLog } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatNumber(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace('.', ',');
}

/** Active seconds — mirrors the member's own Gelişim screen. */
function logActiveSeconds(log: WorkoutLog): number {
  const fromExercises = log.exerciseLogs.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0);
  if (fromExercises > 0) return fromExercises;
  if (log.completedAt) return Math.max(0, Math.round((log.completedAt.getTime() - log.startedAt.getTime()) / 1000));
  return 0;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours} sa ${minutes} dk` : `${minutes} dk`;
}

/**
 * Coaching view of one member: their programme, measurements and workout
 * history in one place.
 *
 * This exists because tapping a member used to call findOrCreateDraftProgram
 * directly — merely browsing the roster wrote empty draft programmes to the
 * database and cluttered the Programlar tab. Creating a programme is now an
 * explicit action on this screen.
 */
export default function TrainerMemberDetail() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { memberId, memberName } = useLocalSearchParams<{ memberId: string; memberName: string }>();
  const { user, activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, isStaff(activeMembership));

  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [entries, setEntries] = useState<MeasurementEntry[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchActiveProgramForMember(tenantId, memberId, setProgram);
  }, [tenantId, memberId]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchMeasurements(tenantId, memberId, setEntries);
  }, [tenantId, memberId]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchWorkoutLogsForMember(tenantId, memberId, setLogs);
  }, [tenantId, memberId]);

  if (!tenantId || !memberId) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 }}>
          <Text style={{ fontSize: 28 }}>🔒</Text>
          <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
            Salon antrenör oturumu gerekli
          </Text>
        </View>
      </Screen>
    );
  }

  const name = memberName || 'Üye';
  const completedLogs = logs.filter((l) => l.completedAt != null);
  const totalSeconds = completedLogs.reduce((sum, l) => sum + logActiveSeconds(l), 0);
  const lastWorkout = completedLogs.length > 0 ? completedLogs[completedLogs.length - 1] : null;

  const latest = entries[0];
  const first = entries.length > 1 ? entries[entries.length - 1] : undefined;

  const openProgram = async () => {
    if (!user || creating) return;
    setCreating(true);
    try {
      // Reuses an existing draft if there is one, so this stays safe to tap
      // twice — but it only runs on an explicit press now, never on browse.
      const programId = await findOrCreateDraftProgram({ tenantId, trainerId: user.uid, memberId, memberName: name });
      router.push({ pathname: '/trainer/builder', params: { programId } });
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text onPress={() => safeBack(router, '/trainer')} style={{ fontSize: 20, color: colors.txt, paddingRight: 4 }}>
          ‹
        </Text>
        <View
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" weight="900" style={{ color: colors.p }}>
            {initialsOf(name)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {name}
          </Text>
        </View>
      </View>

      {/* --- Programme --- */}
      <Card style={{ gap: 10 }}>
        <Text variant="label" tone="sub">
          PROGRAM
        </Text>
        {program === undefined ? (
          <Text variant="helper" tone="sub">
            Yükleniyor…
          </Text>
        ) : program ? (
          <>
            <Text variant="body" weight="900">
              {program.name}
            </Text>
            <Text variant="label" tone="sub">
              {program.exercises.length} egzersiz · {formatDate(program.updatedAt)} güncellendi
            </Text>
            <Button
              label="Programı düzenle"
              variant="secondary"
              compact
              onPress={() => router.push({ pathname: '/trainer/builder', params: { programId: program.id } })}
            />
          </>
        ) : (
          <>
            <Text variant="helper" tone="sub">
              Bu üyenin aktif programı yok.
            </Text>
            <Button
              label={creating ? '…' : 'Program oluştur'}
              variant="secondary"
              compact
              disabled={creating}
              onPress={openProgram}
            />
          </>
        )}
      </Card>

      {/* --- Workouts --- */}
      <Card style={{ gap: 12 }}>
        <Text variant="label" tone="sub">
          ANTRENMAN
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text variant="h3">{completedLogs.length}</Text>
            <Text variant="label" tone="sub">
              toplam
            </Text>
          </View>
          <View style={{ width: 1, backgroundColor: colors.line }} />
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <Text variant="h3">{formatDuration(totalSeconds)}</Text>
            <Text variant="label" tone="sub">
              toplam süre
            </Text>
          </View>
        </View>
        <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
          {lastWorkout ? `Son antrenman: ${formatDate(lastWorkout.startedAt)}` : 'Henüz tamamlanmış antrenman yok'}
        </Text>
      </Card>

      {/* --- Measurements --- */}
      <Card style={{ gap: 10 }}>
        <Text variant="label" tone="sub">
          ÖLÇÜMLER
        </Text>
        {!latest ? (
          <Text variant="helper" tone="sub">
            Bu üye henüz ölçüm girmemiş.
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="body" weight="900">
                {formatNumber(latest.weightKg)} kg
              </Text>
              <Text variant="label" tone="sub">
                {formatDate(latest.recordedAt)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {latest.chestCm != null && (
                <Text variant="label" tone="sub">
                  göğüs {formatNumber(latest.chestCm)}
                </Text>
              )}
              {latest.waistCm != null && (
                <Text variant="label" tone="sub">
                  bel {formatNumber(latest.waistCm)}
                </Text>
              )}
              {latest.armCm != null && (
                <Text variant="label" tone="sub">
                  kol {formatNumber(latest.armCm)}
                </Text>
              )}
            </View>
            {first && (
              <Text variant="label" tone="sub">
                İlk ölçümden bu yana kilo{' '}
                <Text variant="label" weight="700" style={{ color: colors.p }}>
                  {latest.weightKg - first.weightKg > 0 ? '+' : '−'}
                  {formatNumber(Math.abs(latest.weightKg - first.weightKg))} kg
                </Text>{' '}
                ({formatDate(first.recordedAt)} → bugün)
              </Text>
            )}
          </>
        )}
      </Card>
    </ScrollView>
  );
}
