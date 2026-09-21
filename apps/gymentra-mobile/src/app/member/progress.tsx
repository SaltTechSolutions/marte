import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { StatCard } from '@/components/StatCard';
import { MiniBarChart } from '@/components/MiniBarChart';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchMyCheckins } from '@/data/firebase/checkinRepo';
import { addMeasurement, watchMeasurements } from '@/data/firebase/measurementRepo';
import { watchWorkoutLogsForMember } from '@/data/firebase/workoutLogRepo';
import { draftFromEntries, MeasurementDraft, MeasureField, startValue } from '@/data/measurement';
import { MeasurementEntry, WorkoutLog } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { useRefreshControl } from '@/components/useRefreshControl';

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

  // Yeniden abone olmak için — çevrimdışıyken düşen bir dinleyici
  // her zaman kendiliğinden toparlamıyor.
  const [retryKey, setRetryKey] = useState(0);
  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  // Failed listeners used to leave "Henüz ölçüm yok / İlk ölçümünü ekle" on
  // screen for a member with months of measurements (DEN-13). The tap clears
  // the flag (AGENTS §4: no synchronising setState in the effect).
  const [failed, setFailed] = useState(false);
  const onError = () => setFailed(true);
  const [entries, setEntries] = useState<MeasurementEntry[] | undefined>(undefined);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [visits, setVisits] = useState<Date[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  // Every field starts empty and only a field the member fills in is saved
  // (DEN-4). `openForm` seeds it from the last entry.
  const [draft, setDraft] = useState<MeasurementDraft>(() => draftFromEntries(undefined));
  const setField = (field: MeasureField) => (value: number | null) => setDraft((d) => ({ ...d, [field]: value }));

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMeasurements(tenantId, uid, setEntries, onError);
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchWorkoutLogsForMember(tenantId, uid, setLogs, onError);
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    // Twelve weeks back: enough for the monthly and weekly counts below
    // without an unbounded listener.
    const since = new Date();
    since.setDate(since.getDate() - 84);
    since.setHours(0, 0, 0, 0);
    return watchMyCheckins(tenantId, uid, since, setVisits, onError);
  }, [tenantId, uid, retryKey]);

  const openForm = () => {
    setDraft(draftFromEntries(entries));
    setAdding(true);
  };

  const save = async () => {
    const { weightKg, chestCm, waistCm, armCm } = draft;
    if (!tenantId || !user || saving || weightKg == null) return;
    setSaving(true);
    try {
      await addMeasurement({
        tenantId,
        memberId: user.uid,
        weightKg,
        chestCm: chestCm ?? undefined,
        waistCm: waistCm ?? undefined,
        armCm: armCm ?? undefined,
      });
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
    <ScrollView
      refreshControl={refreshControl} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Text variant="h3">Gelişim</Text>

      {failed ? (
        <ErrorNotice
          message="Bazı bilgiler yüklenemedi; ölçümlerin ve özetlerin eksik olabilir."
          onRetry={() => {
            setFailed(false);
            setRetryKey((k) => k + 1);
          }}
        />
      ) : null}

      {visits.length > 0 && (
        <StatCard
          label="SALONA GELİŞ"
          stats={[
            { value: visitsThisWeek, label: 'bu hafta' },
            { value: visitsThisMonth, label: 'bu ay' },
            { value: visits.length, label: 'son 12 hafta' },
          ]}
          footnote={lastVisit ? `Son gelişin: ${formatDate(lastVisit)}` : undefined}
        />
      )}

      {completedLogs.length > 0 && (
        <StatCard
          label="ANTRENMAN ÖZETİ"
          stats={[
            { value: completedLogs.length, label: 'toplam' },
            { value: thisMonthCount, label: 'bu ay' },
            { value: formatDuration(totalSeconds), label: 'toplam süre' },
          ]}
          footnote={avgSeconds > 0 ? `Antrenman başına ortalama ${formatDuration(avgSeconds)}` : undefined}
        />
      )}

      {entries === undefined ? (
        failed ? null : <ListSkeleton rows={2} avatar={false} />
      ) : !latest ? (
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
                <MiniBarChart
                  values={trend}
                  label={`Son ${trend.length} ölçüm: ${formatNumber(trend[0])} kilodan ${formatNumber(trend[trend.length - 1])} kiloya`}
                />
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
                        <Text variant="label" weight="700" style={{ color: colors.pText }}>
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
          <MeasureRow
            label="Kilo"
            addLabel="Kilonu gir"
            unit="kg"
            step={0.5}
            decimals={1}
            required
            value={draft.weightKg}
            start={startValue(entries, 'weightKg')}
            onChange={setField('weightKg')}
          />
          <MeasureRow
            label="Göğüs"
            unit="cm"
            step={1}
            decimals={0}
            value={draft.chestCm}
            start={startValue(entries, 'chestCm')}
            onChange={setField('chestCm')}
          />
          <MeasureRow
            label="Bel"
            unit="cm"
            step={1}
            decimals={0}
            value={draft.waistCm}
            start={startValue(entries, 'waistCm')}
            onChange={setField('waistCm')}
          />
          <MeasureRow
            label="Kol"
            unit="cm"
            step={1}
            decimals={0}
            value={draft.armCm}
            start={startValue(entries, 'armCm')}
            onChange={setField('armCm')}
          />
          {draft.weightKg == null && (
            <Text variant="helper" tone="sub">
              Kaydetmek için kilonu gir. Diğer ölçüler isteğe bağlı.
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setAdding(false)} disabled={saving} />
            <Button label={saving ? '…' : 'Kaydet'} style={{ flex: 1 }} onPress={save} disabled={saving || draft.weightKg == null} />
          </View>
        </Card>
      ) : (
        <Button label="+ Ölçüm ekle" critical onPress={openForm} />
      )}
    </ScrollView>
  );
}

/**
 * One field of the new-measurement form. Empty until the member adds it, so a
 * field they never touched is never saved (DEN-4). Weight is required; the
 * body measurements can be added and removed.
 */
function MeasureRow({
  label,
  addLabel = '+ Ekle',
  unit,
  step,
  decimals,
  required,
  value,
  start,
  onChange,
}: {
  label: string;
  addLabel?: string;
  unit: string;
  step: number;
  decimals: number;
  required?: boolean;
  value: number | null;
  /** Where the stepper opens when the member adds the field. */
  start: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" tone="sub">
          {required ? label : `${label} · isteğe bağlı`}
        </Text>
        {!required && value != null && (
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel={`${label} ölçümünü kaldır`}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text variant="helper" weight="700" tone="sub">
              Kaldır
            </Text>
          </Pressable>
        )}
      </View>
      {value == null ? (
        <Button label={addLabel} variant="secondary" compact onPress={() => onChange(start)} />
      ) : (
        <Stepper value={value} unit={unit} label={label} step={step} decimals={decimals} onChange={onChange} />
      )}
    </View>
  );
}
