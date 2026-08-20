import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { newLocalId, saveProgramExercises, setProgramStatus, watchProgram } from '@/data/firebase/programRepo';
import { Program, ProgramExercise } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';
import { confirmDestructive } from '@/utils/confirm';

const EXERCISE_LIBRARY = ['Bench Press', 'Squat', 'Deadlift', 'Omuz Pres', 'Lat Pulldown', 'Biceps Curl', 'Triceps Pushdown', 'Leg Press', 'Plank', 'Mekik'];

export default function ProgramBuilder() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  const [program, setProgram] = useState<Program | null | undefined>(undefined);

  useEffect(() => {
    if (!programId) return;
    return watchProgram(programId, setProgram);
  }, [programId]);

  if (!programId || program === undefined) return <View style={{ flex: 1 }} />;

  if (!program) {
    return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="body" weight="900">
            Program bulunamadı
          </Text>
        </View>
    );
  }

  return <ProgramBuilderForm program={program} />;
}

/** autosaves on every change, draft badge, resumable after an interruption. */
function ProgramBuilderForm({ program }: { program: Program }) {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();

  const [exercises, setExercises] = useState<ProgramExercise[]>(program.exercises);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickingFromLibrary, setPickingFromLibrary] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const persist = (next: ProgramExercise[]) => {
    setExercises(next);
    saveProgramExercises(program.id, next);
  };

  const addFromLibrary = (name: string) => {
    const exercise: ProgramExercise = { id: newLocalId(), name, sets: 3, reps: 10, targetWeightKg: 20 };
    persist([...exercises, exercise]);
    setPickingFromLibrary(false);
    setExpandedId(exercise.id);
  };

  const updateExercise = (id: string, patch: Partial<ProgramExercise>) => {
    persist(exercises.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const removeExercise = (id: string) => {
    const exercise = exercises.find((e) => e.id === id);
    confirmDestructive({
      title: 'Egzersizi kaldır',
      message: `"${exercise?.name ?? 'Egzersiz'}" programdan çıkarılacak. Program anında kaydedildiği için geri alınamaz.`,
      confirmLabel: 'Kaldır',
      onConfirm: () => {
        persist(exercises.filter((e) => e.id !== id));
        if (expandedId === id) setExpandedId(null);
      },
    });
  };

  const leaveDraft = () => safeBack(router, '/trainer');

  const assign = async () => {
    if (assigning) return;
    setAssigning(true);
    try {
      await setProgramStatus(program.id, 'active');
      toast.success(`${program.memberName} için program aktif edildi`);
      safeBack(router, '/trainer');
    } catch {
      toast.error('Program aktif edilemedi, tekrar deneyin.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text variant="body" weight="900">
            {program.memberName} · {program.name}
          </Text>
          <Text variant="label" style={{ color: colors.ok }}>
            ✓ Otomatik kaydedildi
          </Text>
        </View>
        <View style={{ backgroundColor: colors.surf2, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 }}>
          <Text variant="label" weight="600" style={{ color: program.status === 'active' ? colors.ok : colors.warn }}>
            {program.status === 'active' ? 'AKTİF' : 'TASLAK'}
          </Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: spacing.sm }}>
        {exercises.map((ex) => {
          const expanded = expandedId === ex.id;
          return (
            <View key={ex.id} style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' }}>
              <Pressable
                onPress={() => setExpandedId(expanded ? null : ex.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, minHeight: 44 }}>
                <Text tone="sub" style={{ fontSize: 14 }}>
                  ⠿
                </Text>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text variant="label" tone="sub" numberOfLines={1}>
                    {ex.sets} set × {ex.reps} tekrar · {ex.targetWeightKg} kg
                  </Text>
                </View>
                <Text tone="sub">{expanded ? '▾' : '›'}</Text>
              </Pressable>

              {expanded && (
                <View style={{ padding: 12, paddingTop: 0, gap: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
                  <View style={{ gap: 4 }}>
                    <Text variant="label" tone="sub">
                      Set sayısı
                    </Text>
                    <Stepper value={ex.sets} unit="set" step={1} decimals={0} onChange={(v) => updateExercise(ex.id, { sets: v })} />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text variant="label" tone="sub">
                      Tekrar
                    </Text>
                    <Stepper value={ex.reps} unit="tekrar" step={1} decimals={0} onChange={(v) => updateExercise(ex.id, { reps: v })} />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text variant="label" tone="sub">
                      Hedef ağırlık
                    </Text>
                    <Stepper value={ex.targetWeightKg} unit="kg" step={2.5} onChange={(v) => updateExercise(ex.id, { targetWeightKg: v })} />
                  </View>
                  <Pressable onPress={() => removeExercise(ex.id)}>
                    <Text variant="helper" weight="700" style={{ color: colors.danger, textAlign: 'center' }}>
                      Egzersizi kaldır
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        {pickingFromLibrary ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EXERCISE_LIBRARY.map((name) => (
                <Chip key={name} label={name} onPress={() => addFromLibrary(name)} />
              ))}
            </View>
            <Pressable onPress={() => setPickingFromLibrary(false)}>
              <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
                Vazgeç
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setPickingFromLibrary(true)}
            style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.p, borderRadius: radius.md, padding: 12, alignItems: 'center' }}>
            <Text variant="helper" weight="700" style={{ color: colors.p }}>
              + Kütüphaneden egzersiz ekle
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.lg }}>
        <Button label="Taslak bırak" variant="ghost" style={{ flex: 1 }} onPress={leaveDraft} />
        <Button
          label={assigning ? '…' : `${program.memberName.split(' ')[0]}'e ata`}
          style={{ flex: 1 }}
          disabled={assigning || exercises.length === 0}
          onPress={assign}
        />
      </View>
    </View>
  );
}
