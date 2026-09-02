import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { reportExercise } from '@/data/firebase/exerciseReportRepo';
import { isStaff, tenantIdIf } from '@/data/membership';
import { ExerciseReportReason } from '@/data/types';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { MuscleMap, MuscleMapLegend } from '@/components/MuscleMap';
import { PoseDiagram } from '@/components/PoseDiagram';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import {
  Activation,
  Exercise,
  MuscleId,
  POSE_ARCHETYPES,
  PoseFrame,
  exerciseById,
  exerciseByName,
} from '@/data/exerciseLibrary';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

/**
 * How a movement is performed (PER-19) — muscle map, start/end frames, steps.
 *
 * A top-level route rather than a screen inside either tab group: the member
 * opens it mid-workout and the trainer opens it while writing a programme, and
 * pushing one role into the other's route group swaps the whole tab bar.
 *
 * Accepts either `exerciseId` (a library id, from the trainer's picker) or
 * `name` (a programme line, from the workout screen) — the workout log stores
 * the exercise's name, not a library reference, so name is the only handle
 * that screen has until the PER-17 model change lands.
 */
export default function ExerciseDetail() {
  const { exerciseId, name } = useLocalSearchParams<{ exerciseId?: string; name?: string }>();
  const exercise = exerciseById(exerciseId) ?? exerciseByName(name);

  if (!exercise) {
    return (
      <Screen>
        <BackRow title={name || 'Hareket'} />
        <EmptyState
          icon="barbell-outline"
          title="Bu hareketin anlatımı yok"
          description={
            name
              ? `"${name}" kütüphanedeki tek tek hareketlerden biri değil — kardiyo blokları ve devre tarifleri anlatım sayfası taşımıyor.`
              : 'Aradığın hareket kütüphanede bulunamadı.'
          }
        />
      </Screen>
    );
  }

  return <Detail exercise={exercise} />;
}

function BackRow({ title }: { title: string }) {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
      <Pressable
        onPress={() => safeBack(router, '/')}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
      </Pressable>
      <Text variant="h3" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}

function difficultyTone(difficulty: string, colors: ReturnType<typeof useAppTheme>['colors']): string {
  if (difficulty === 'İLERİ') return colors.danger;
  if (difficulty === 'ORTA-İLERİ') return colors.warn;
  return colors.ok;
}

function Detail({ exercise }: { exercise: Exercise }) {
  const { colors, spacing, radius } = useAppTheme();
  const [view, setView] = useState<'front' | 'back'>('front');

  const pose = POSE_ARCHETYPES[exercise.archetype];
  const activation: Partial<Record<MuscleId, Activation>> = {};
  exercise.secondary.forEach((m) => (activation[m] = 'secondary'));
  exercise.primary.forEach((m) => (activation[m] = 'primary'));

  const viewToggle = (target: 'front' | 'back', label: string) => {
    const on = view === target;
    return (
      <Pressable
        onPress={() => setView(target)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={{
          height: 32,
          minWidth: 60,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 14,
          borderRadius: 999,
          backgroundColor: on ? colors.p : 'transparent',
        }}>
        <Text variant="helper" weight="700" tone={on ? 'onp' : 'sub'}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
          <BackButton />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="h3" numberOfLines={1}>
              {exercise.tr}
            </Text>
            <Text variant="label" tone="sub" numberOfLines={1}>
              {exercise.en}
            </Text>
          </View>
          <View style={{ backgroundColor: colors.surf2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
            <Text variant="label" weight="700" style={{ color: difficultyTone(exercise.difficulty, colors) }}>
              {exercise.difficulty}
            </Text>
          </View>
        </View>

        {/* --- Movement frames --- */}
        <Card style={{ marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="label" tone="sub">
              HAREKET
            </Text>
            <Text variant="label" tone="sub">
              {pose.end ? '2 kare' : 'sabit duruş'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PoseCard label="Başlangıç" step={1} pose={pose.start} showArrow />
            {pose.end ? (
              <PoseCard label="Bitiş" step={2} pose={pose.end} />
            ) : (
              <View style={{ flex: 1, backgroundColor: colors.bg1, borderRadius: radius.md, padding: 10, justifyContent: 'center' }}>
                <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                  İzometrik hareket — pozisyonu koru, tekrar yok.
                </Text>
              </View>
            )}
          </View>
          {!exercise.poseReviewed && (
            <Text variant="label" tone="sub">
              ⓘ Çizimler şematiktir, antrenör onayı bekliyor. Tekniği antrenörüne doğrulat.
            </Text>
          )}
        </Card>

        {/* --- Dose + equipment --- */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
          <Card style={{ flex: 1, gap: 3 }}>
            <Text variant="label" tone="sub">
              SET · TEKRAR
            </Text>
            <Text variant="body" weight="900">
              {exercise.setsHint || '—'}
            </Text>
            <Text variant="label" tone="sub">
              {exercise.restHint ? `Dinlenme ${exercise.restHint}` : 'Antrenörün belirler'}
            </Text>
          </Card>
          <Card style={{ flex: 1, gap: 3 }}>
            <Text variant="label" tone="sub">
              EKİPMAN
            </Text>
            <Text variant="helper" weight="700">
              {exercise.equipTr}
            </Text>
            <Text variant="label" tone="sub">
              {exercise.equipEn}
            </Text>
          </Card>
        </View>

        {/* --- Muscles --- */}
        <Card style={{ marginHorizontal: spacing.md, marginBottom: spacing.sm, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="label" tone="sub">
              ÇALIŞAN KASLAR
            </Text>
            <View style={{ flexDirection: 'row', backgroundColor: colors.bg1, borderRadius: 999, padding: 3 }}>
              {viewToggle('front', 'Ön')}
              {viewToggle('back', 'Arka')}
            </View>
          </View>

          <View style={{ alignItems: 'center' }}>
            <MuscleMap view={view} activation={activation} />
          </View>
          <MuscleMapLegend />
        </Card>

        {/* --- How to --- */}
        {exercise.steps.length > 0 && (
          <Card style={{ marginHorizontal: spacing.md, gap: 14 }}>
            <Text variant="label" tone="sub">
              NASIL YAPILIR
            </Text>
            {exercise.steps.map(([tr, en], i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 11 }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="label" weight="900">
                    {i + 1}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="helper">{tr}</Text>
                  <Text variant="label" tone="sub" style={{ paddingTop: 3 }}>
                    {en}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <ReportProblem exercise={exercise} />
      </ScrollView>
    </Screen>
  );
}

const REASONS: { key: ExerciseReportReason; label: string }[] = [
  { key: 'pose', label: 'Çizim yanlış' },
  { key: 'muscles', label: 'Kaslar yanlış' },
  { key: 'text', label: 'Anlatım yanlış' },
  { key: 'other', label: 'Başka' },
];

/**
 * Staff flagging an explainer that is wrong (PER-19).
 *
 * The pose frames are archetype-derived and unreviewed, so some of them WILL
 * be wrong in ways only a coach spots. Waiting for one big review pass means
 * those errors sit in front of members until it happens; this turns the
 * correction into something the people who notice can send in the moment.
 *
 * Staff only, and not because members are untrusted: judging whether a pose
 * misrepresents a lift is a coaching call, and an open report button is a
 * spam target. Hidden entirely for a member rather than shown disabled —
 * a control you can never use is noise.
 */
function ReportProblem({ exercise }: { exercise: Exercise }) {
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { user, activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, isStaff(activeMembership));

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ExerciseReportReason>('pose');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  if (!tenantId || !user) return null;

  const send = async () => {
    if (sending) return;
    setSending(true);
    try {
      await reportExercise({
        exerciseId: exercise.id,
        exerciseName: exercise.tr,
        tenantId,
        reportedBy: user.uid,
        ...(user.displayName ? { reportedByName: user.displayName } : {}),
        reason,
        note,
      });
      toast.success('Bildirimin iletildi, teşekkürler.');
      setOpen(false);
      setNote('');
      setReason('pose');
    } catch (e) {
      reportError(e, toast, 'Bildirim gönderilemedi, tekrar dene.');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    // Quiet, but not a footnote. As bare muted text after the last card it
    // read as a caption and was easy to miss entirely; as a filled button it
    // would compete with the content on every view for something used maybe
    // once a month. A bordered row with an icon is the app's own treatment
    // for "secondary but findable" — same shape as the settings rows.
    return (
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${exercise.tr} için sorun bildir`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginHorizontal: spacing.md,
          marginTop: spacing.sm,
          minHeight: 48,
          paddingHorizontal: 13,
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
        }}>
        <Ionicons name="flag-outline" size={18} color={colors.warn} />
        <View style={{ flex: 1 }}>
          <Text variant="helper" weight="700">
            Sorun bildir
          </Text>
          <Text variant="label" tone="sub">
            Çizim, kaslar veya anlatım yanlışsa bize ulaştır
          </Text>
        </View>
        <Text tone="sub">›</Text>
      </Pressable>
    );
  }

  return (
    <Card style={{ marginHorizontal: spacing.md, marginTop: spacing.sm, gap: 10 }} outlineColor={colors.warn}>
      <Text variant="helper" weight="700">
        Sorun bildir — {exercise.tr}
      </Text>
      <Text variant="label" tone="sub">
        Bu anlatım uygulamayla birlikte geliyor, salonun kendi içeriği değil.
        Bildirimin geliştiricilere ulaşır; salonda kimseye görünmez.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {REASONS.map((r) => (
          <Chip key={r.key} label={r.label} selected={reason === r.key} onPress={() => setReason(r.key)} />
        ))}
      </View>

      <TextField
        placeholder="Ne yanlış? (ör. bitiş karesinde diz açısı)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/* Deliberately NOT disabled while sending. A write that never
            settles (offline, or a server that never answers) leaves `sending`
            stuck true, and disabling the way out along with the way forward
            locks the member inside a form they cannot leave — AGENTS §2,
            no locked flows. Closing mid-flight is safe: the write is already
            queued and will land or fail on its own. */}
        <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button label={sending ? '…' : 'Gönder'} style={{ flex: 1 }} disabled={sending} onPress={send} />
      </View>
    </Card>
  );
}

function PoseCard({
  label,
  step,
  pose,
  showArrow = false,
}: {
  label: string;
  step: number;
  pose: PoseFrame;
  showArrow?: boolean;
}) {
  const { colors, radius } = useAppTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg1, borderRadius: radius.md, padding: 8, paddingBottom: 6 }}>
      <PoseDiagram pose={pose} showArrow={showArrow} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
        <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="label" tone="onp" weight="900" style={{ fontSize: 10 }}>
            {step}
          </Text>
        </View>
        <Text variant="label" weight="700">
          {label}
        </Text>
      </View>
    </View>
  );
}

function BackButton() {
  const router = useRouter();
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={() => safeBack(router, '/')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Geri"
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
    </Pressable>
  );
}

