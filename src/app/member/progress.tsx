import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MiniBarChart } from '@/components/MiniBarChart';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchMyCheckins } from '@/data/firebase/checkinRepo';
import { addMeasurement, watchMeasurements } from '@/data/firebase/measurementRepo';
import { watchWorkoutLogsForMember } from '@/data/firebase/workoutLogRepo';
import { MeasurementEntry, WorkoutLog } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/** Active seconds in one workout — prefers the per-exercise timers, falling
 * back to wall-clock for logs recorded before those existed. */
function logActiveSeconds(log: WorkoutLog): number {
  const fromExercises = log.exerciseLogs.reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0);
  if (fromExercises > 0) return fromExercises;
  if (log.completedAt) return Math.max(0, Math.round((log.completedAt.getTime() - log.startedAt.getTime()) / 1000));
  return 0;
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours} sa ${minutes} dk`;
  return `${minutes} dk`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function formatNumber(n: number, decimals = 1): string {
  return n.toFixed(decimals).replace('.', ',');
}

/** Progress hub — workout totals, weight trend, and first-vs-current body
 * measurements. Log via steppers, never free text. */
export default function MemberProgress() {
  const { colors, spacing, radius } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  const [entries, setEntries] = useState<MeasurementEntry[] | undefined>(undefined);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [visits, setVisits] = useState<Date[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftWeight, setDraftWeight] = useState(75);
  const [draftChest, setDraftChest] = useState(100);
  const [draftWaist, setDraftWaist] = useState(85);
  const [draftArm, setDraftArm] = useState(35);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMeasurements(tenantId, uid, setEntries);
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchWorkoutLogsForMember(tenantId, uid, setLogs);
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    // Twelve weeks back: enough for the monthly and weekly counts below
    // without an unbounded listener.
    const since = new Date();
    since.setDate(since.getDate() - 84);
    since.setHours(0, 0, 0, 0);
    return watchMyCheckins(tenantId, uid, since, setVisits);
  }, [tenantId, uid]);

  const openForm = () => {
    if (entries?.[0]) {
      setDraftWeight(entries[0].weightKg);
      if (entries[0].chestCm != null) setDraftChest(entries[0].chestCm);
      if (entries[0].waistCm != null) setDraftWaist(entries[0].waistCm);
      if (entries[0].armCm != null) setDraftArm(entries[0].armCm);
    }
    setAdding(true);
  };

  const save = async () => {
    if (!tenantId || !user || saving) return;
    setSaving(true);
    try {
      await addMeasurement({ tenantId, memberId: user.uid, weightKg: draftWeight, chestCm: draftChest, waistCm: draftWaist, armCm: draftArm });
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  // --- Workout totals ---
  const completedLogs = logs.filter((l) => l.completedAt != null);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonthCount = completedLogs.filter((l) => l.startedAt >= monthStart).length;
  const totalSeconds = completedLogs.reduce((sum, l) => sum + logActiveSeconds(l), 0);

  // --- Gym visits ---
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  const visitsThisMonth = visits.filter((d) => d >= monthStart).length;
  const visitsThisWeek = visits.filter((d) => d >= weekStart).length;
  const lastVisit = visits[0];
  const avgSeconds = completedLogs.length > 0 ? Math.round(totalSeconds / completedLogs.length) : 0;

  // --- Measurements: entries come newest-first ---
  const latest = entries?.[0];
  const first = entries && entries.length > 0 ? entries[entries.length - 1] : undefined;
  const hasComparison = entries != null && entries.length > 1 && first != null && latest != null;

  const trend = (entries ?? [])
    .slice(0, 8)
    .map((e) => e.weightKg)
    .reverse();

  const comparisonRows: { label: string; unit: string; from?: number; to?: number }[] = [
    { label: 'Kilo', unit: 'kg', from: first?.weightKg, to: latest?.weightKg },
    { label: 'Göğüs', unit: 'cm', from: first?.chestCm, to: latest?.chestCm },
    { label: 'Bel', unit: 'cm', from: first?.waistCm, to: latest?.waistCm },
    { label: 'Kol', unit: 'cm', from: first?.armCm, to: latest?.armCm },
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Text variant="h3">Gelişim</Text>

      {visits.length > 0 && (
        <Card style={{ gap: 12 }}>
          <Text variant="label" tone="sub">
            SALONA GELİŞ
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text variant="h3">{visitsThisWeek}</Text>
              <Text variant="label" tone="sub">
                bu hafta
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text variant="h3">{visitsThisMonth}</Text>
              <Text variant="label" tone="sub">
                bu ay
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.line }} />
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text variant="h3">{visits.length}</Text>
              <Text variant="label" tone="sub">
                son 12 hafta
              </Text>
            </View>
          </View>
          {lastVisit && (
            <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
              Son gelişin: {formatDate(lastVisit)}
            </Text>
          )}
        </Card>
      )}

      {completedLogs.length > 0 && (
        <Card style={{ gap: 12 }}>
          <Text variant="label" tone="sub">
            ANTRENMAN ÖZETİ
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
              <Text variant="h3">{thisMonthCount}</Text>
              <Text variant="label" tone="sub">
                bu ay
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
          {avgSeconds > 0 && (
            <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
              Antrenman başına ortalama {formatDuration(avgSeconds)}
            </Text>
          )}
        </Card>
      )}

      {!latest ? (
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: spacing.lg }}>
          <Ionicons name="trending-up-outline" size={24} color={colors.sub} />
          <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
            Henüz ölçüm yok
          </Text>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            İlk ölçümünü ekleyerek gelişimini takip etmeye başla.
          </Text>
        </Card>
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="label" tone="sub">
                KİLO TAKİBİ
              </Text>
              <Text variant="h3">{formatNumber(latest.weightKg)} kg</Text>
            </View>
            {trend.length > 1 ? (
              <>
                <MiniBarChart values={trend} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="label" tone="sub">
                    {formatDate(entries[Math.min(entries.length, 8) - 1].recordedAt)}
                  </Text>
                  <Text variant="label" tone="sub">
                    {formatDate(latest.recordedAt)}
                  </Text>
                </View>
              </>
            ) : (
              <Text variant="helper" tone="sub">
                Grafiği görmek için en az iki ölçüm gerekli.
              </Text>
            )}
          </Card>

          {hasComparison && (
            <Card style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text variant="label" tone="sub">
                  İLK ÖLÇÜM → GÜNCEL
                </Text>
                <Text variant="label" tone="sub">
                  {formatDate(first.recordedAt)} – {formatDate(latest.recordedAt)}
                </Text>
              </View>

              {comparisonRows.map((row) => {
                if (row.from == null || row.to == null) return null;
                const diff = Math.round((row.to - row.from) * 10) / 10;
                // One decimal throughout so the from → to → delta arithmetic
                // stays consistent on screen; half-centimetre changes matter here.
                const decimals = 1;
                return (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text variant="helper" tone="sub" style={{ width: 52 }}>
                      {row.label}
                    </Text>
                    <Text variant="helper" tone="sub">
                      {formatNumber(row.from, decimals)}
                    </Text>
                    <Text variant="helper" tone="sub">
                      →
                    </Text>
                    <Text variant="body" weight="900">
                      {formatNumber(row.to, decimals)} {row.unit}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {diff !== 0 && (
                      <View style={{ backgroundColor: colors.surf2, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text variant="label" weight="700" style={{ color: colors.p }}>
                          {diff > 0 ? '+' : '−'}
                          {formatNumber(Math.abs(diff), decimals)}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
          )}

          {!hasComparison && (
            <Card style={{ gap: 6 }}>
              <Text variant="label" tone="sub">
                İLK ÖLÇÜM KAYDEDİLDİ
              </Text>
              <Text variant="helper" tone="sub">
                Bir sonraki ölçümünü eklediğinde değişimini burada karşılaştırmalı göreceksin.
              </Text>
            </Card>
          )}
        </>
      )}

      {adding ? (
        <Card style={{ gap: 12 }}>
          <Text variant="helper" weight="700">
            Yeni ölçüm
          </Text>
          <View style={{ gap: 4 }}>
            <Text variant="label" tone="sub">
              Kilo
            </Text>
            <Stepper value={draftWeight} unit="kg" step={0.5} onChange={setDraftWeight} />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label" tone="sub">
              Göğüs
            </Text>
            <Stepper value={draftChest} unit="cm" step={1} decimals={0} onChange={setDraftChest} />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label" tone="sub">
              Bel
            </Text>
            <Stepper value={draftWaist} unit="cm" step={1} decimals={0} onChange={setDraftWaist} />
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label" tone="sub">
              Kol
            </Text>
            <Stepper value={draftArm} unit="cm" step={1} decimals={0} onChange={setDraftArm} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setAdding(false)} disabled={saving} />
            <Button label={saving ? '…' : 'Kaydet'} style={{ flex: 1 }} onPress={save} disabled={saving} />
          </View>
        </Card>
      ) : (
        <Button label="+ Ölçüm ekle" critical onPress={openForm} />
      )}
    </ScrollView>
  );
}
