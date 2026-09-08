import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { completeWorkoutLog, getRecentLogs, saveExerciseLogs, watchWorkoutLog } from '@/data/firebase/workoutLogRepo';
import { exerciseById, exerciseByName } from '@/data/exerciseLibrary';
import { formatLastTime, lastTimeFor } from '@/data/program';
import { WorkoutLog } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';
import { hapticSelection, hapticSuccess } from '@/utils/haptics';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Active workout mode — used mid-set with sweaty hands. Max glanceability,
 * oversized tap targets, tab bar hidden entirely (enforced by the layout).
 */
export default function WorkoutSession() {
  const router = useRouter();
  const { logId } = useLocalSearchParams<{ logId: string }>();
  const { colors, spacing, radius } = useAppTheme();
  // The tab bar is hidden during a session, so nothing else claims the
  // bottom inset — the finish button would otherwise sit on the home
  // indicator.
  const insets = useSafeAreaInsets();

  const [log, setLog] = useState<WorkoutLog | null | undefined>(undefined);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [elapsedLabel, setElapsedLabel] = useState('00:00');
  const [running, setRunning] = useState(true);
  // Total ms from segments already run, plus the timestamp the current
  // running segment started — lets pause/resume track real active time
  // instead of raw wall-clock time since the workout was created.
  const accumulatedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  // Same idea, scoped to whichever exercise is currently on screen — reset
  // every time advance() moves to a new one, so we can save a per-exercise
  // durationSeconds (future calorie/progress reporting needs this).
  const exerciseAccumulatedMsRef = useRef(0);
  const exerciseSegmentStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!logId) return;
    return watchWorkoutLog(logId, setLog);
  }, [logId]);

  // Only the start time seeds the clocks; depending on the whole log would
  // reset them on every set the member ticks off.
  const startedAtMs = log?.startedAt.getTime();
  // "Geçen sefer" için geçmiş bir kez okunuyor: seans sürerken geçmişin
  // değişmesi diye bir şey yok, canlı dinleyici gereksiz.
  const [history, setHistory] = useState<WorkoutLog[]>([]);
  useEffect(() => {
    if (!log?.tenantId || !log?.memberId) return;
    let cancelled = false;
    getRecentLogs(log.tenantId, log.memberId)
      .then((logs) => !cancelled && setHistory(logs))
      .catch(() => {
        // Geçmiş okunamazsa satır hiç görünmez; antrenman etkilenmiyor.
      });
    return () => {
      cancelled = true;
    };
  }, [log?.tenantId, log?.memberId]);

  useEffect(() => {
    if (startedAtMs == null) return;
    segmentStartRef.current = startedAtMs;
    exerciseSegmentStartRef.current = startedAtMs;
  }, [startedAtMs]);

  useEffect(() => {
    if (!log) return;
    const tick = () => {
      const segmentMs = running && segmentStartRef.current ? Date.now() - segmentStartRef.current : 0;
      setElapsedLabel(formatElapsed(accumulatedMsRef.current + segmentMs));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [log, running]);

  const toggleRunning = () => {
    hapticSelection();
    const now = Date.now();
    if (running) {
      if (segmentStartRef.current) accumulatedMsRef.current += now - segmentStartRef.current;
      if (exerciseSegmentStartRef.current) exerciseAccumulatedMsRef.current += now - exerciseSegmentStartRef.current;
      setRunning(false);
    } else {
      segmentStartRef.current = now;
      exerciseSegmentStartRef.current = now;
      setRunning(true);
    }
  };

  /** Active ms spent on the exercise currently on screen, including the running segment. */
  const currentExerciseMs = () =>
    exerciseAccumulatedMsRef.current + (running && exerciseSegmentStartRef.current ? Date.now() - exerciseSegmentStartRef.current : 0);

  if (log === undefined || !logId) return (
        <View />
    );
  if (!log) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
        <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
          Antrenman bulunamadı
        </Text>
      </View>
    );
  }

  const exercise = log.exerciseLogs[exerciseIndex];
  const isLast = exerciseIndex === log.exerciseLogs.length - 1;

  const updateExercise = (patch: Partial<(typeof log.exerciseLogs)[number]>) => {
    const next = log.exerciseLogs.map((e, i) => (i === exerciseIndex ? { ...e, ...patch } : e));
    saveExerciseLogs(log.id, next);
  };

  const toggleSet = () => {
    if (!exercise || exercise.setsCompleted >= exercise.setsTarget) return;
    hapticSuccess();
    updateExercise({ setsCompleted: exercise.setsCompleted + 1 });
  };

  /** Saves how long was actually spent on the exercise on screen, then
   * resets the per-exercise clock for whatever comes next (or stops, on exit). */
  const flushExerciseDuration = () => {
    updateExercise({ durationSeconds: Math.round(currentExerciseMs() / 1000) });
    exerciseAccumulatedMsRef.current = 0;
    exerciseSegmentStartRef.current = running ? Date.now() : null;
  };

  const advance = async () => {
    flushExerciseDuration();
    if (isLast) {
      await completeWorkoutLog(log.id);
      safeBack(router, '/member/workout');
    } else {
      setExerciseIndex((i) => i + 1);
    }
  };

  const exit = () => {
    Alert.alert('Antrenmandan çık?', 'İlerlemen kaydedildi, istediğin zaman devam edebilirsin.', [
      { text: 'Devam et', style: 'cancel' },
      { text: 'Çık', style: 'destructive', onPress: () => { flushExerciseDuration(); safeBack(router, '/member/workout'); } },
    ]);
  };

  if (!exercise) return (
        <View />
    );

  const guide = exercise.libraryId ? exerciseById(exercise.libraryId) : exerciseByName(exercise.name);
  const guideParams = exercise.libraryId ? { exerciseId: exercise.libraryId } : { name: exercise.name };
  const lastTime = lastTimeFor(history, exercise, log.id);
  const progressPercent = Math.round(((exerciseIndex + 1) / log.exerciseLogs.length) * 100);
  const nextExercise = log.exerciseLogs[exerciseIndex + 1];

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
        <Pressable onPress={exit} hitSlop={10} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={22} color={colors.txt} />
        </Pressable>
        <Text variant="body" weight="900">
          {log.programName} <Text variant="helper" tone="sub">{exerciseIndex + 1}/{log.exerciseLogs.length} egzersiz</Text>
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={{ height: 5, borderRadius: 99, backgroundColor: colors.surf2, overflow: 'hidden' }}>
        <View style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: colors.p }} />
      </View>

      <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, marginTop: 12, gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {/* This was an empty grey square waiting for artwork. It is now the
              way into the movement explainer — the one place mid-set where a
              member actually asks "am I doing this right?". */}
          <Pressable
            onPress={() =>
              guide && router.push({ pathname: '/exercise-detail', params: guideParams })
            }
            disabled={!guide}
            accessibilityRole={guide ? 'button' : undefined}
            accessibilityLabel={guide ? `${exercise.name} nasıl yapılır` : undefined}
            style={{
              width: 54,
              height: 54,
              borderRadius: 14,
              backgroundColor: colors.surf2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: guide ? 1.5 : 0,
              borderColor: colors.p,
            }}>
            <Ionicons name={guide ? 'body-outline' : 'barbell-outline'} size={24} color={guide ? colors.pText : colors.sub} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="h3" numberOfLines={1}>
              {exercise.name}
            </Text>
            <Text variant="helper" tone="sub">
              {exercise.repsTarget
                ? `${exercise.setsTarget} set × ${exercise.repsTarget} tekrar`
                : `${exercise.setsTarget} set hedefi`}
            </Text>
            {guide && (
              <Pressable
                onPress={() => router.push({ pathname: '/exercise-detail', params: guideParams })}
                hitSlop={6}
                accessibilityRole="button"
                style={{ minHeight: 22, justifyContent: 'center' }}>
                <Text variant="label" weight="700" style={{ color: colors.pText }}>
                  Nasıl yapılır? ›
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Ağırlık, antrenörün haftalar önce yazdığı hedefle açılıyor. Üyenin
            gerçekte kaldırdığı ağırlık hiçbir yerde görünmüyordu. */}
        {lastTime && (
          <Text variant="label" tone="sub">
            Geçen sefer: {formatLastTime(lastTime)}
          </Text>
        )}

        <Stepper value={exercise.weightKg} unit="kg" onChange={(w) => updateExercise({ weightKg: w })} />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Array.from({ length: exercise.setsTarget }, (_, i) => i + 1).map((setNumber) => {
            const done = setNumber <= exercise.setsCompleted;
            const isActive = setNumber === exercise.setsCompleted + 1;
            return (
              <Pressable
                key={setNumber}
                onPress={() => isActive && toggleSet()}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: 'center',
                  backgroundColor: done ? colors.p : 'transparent',
                  borderWidth: done ? 0 : isActive ? 2 : 1.5,
                  borderColor: done ? 'transparent' : isActive ? colors.p : colors.line,
                }}>
                <Text variant="body" weight="900" tone={done ? 'onp' : isActive ? 'primary' : 'sub'} style={done ? { color: colors.onp } : isActive ? { color: colors.pText } : undefined}>
                  {done ? `✓ ${setNumber}` : setNumber}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {nextExercise && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, marginTop: 12 }}>
          <Text variant="helper" weight="700" tone="sub">
            Sıradaki: {nextExercise.name}
          </Text>
          <Text tone="sub">›</Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.lg,
          padding: 10,
          marginBottom: spacing.md,
        }}>
        <Pressable
          onPress={toggleRunning}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.p,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name={running ? 'pause' : 'play'} size={26} color={colors.onp} style={running ? undefined : { marginLeft: 3 }} />
        </Pressable>
        <View>
          <Text variant="label" tone="sub">
            {running ? 'SÜRE İŞLİYOR' : 'DURAKLATILDI'}
          </Text>
          <Text variant="h2" weight="900" style={{ fontVariant: ['tabular-nums'] }}>
            {elapsedLabel}
          </Text>
        </View>
      </View>

      <Button label={isLast ? 'Antrenmanı bitir' : 'Sonraki egzersiz'} critical style={{ marginBottom: Math.max(insets.bottom, spacing.md) }} onPress={advance} />
    </View>
  );
}
