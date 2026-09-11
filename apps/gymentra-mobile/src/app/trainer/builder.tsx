import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { reportError } from '@/data/errors';
import { newLocalId, saveProgramDays, setProgramStatus, setProgramWarmup, watchProgram } from '@/data/firebase/programRepo';
import { watchProgramTemplates } from '@/data/firebase/programTemplateRepo';
import { daysFromTemplate, formatDose } from '@/data/programTemplate';
import { useAuth } from '@/context/AuthContext';
import { isStaff, tenantIdIf } from '@/data/membership';
import { exerciseById, exerciseByName } from '@/data/exerciseLibrary';
import { LIBRARY_GROUPS } from '@/data/exerciseGroups';
import { programDays } from '@/data/program';
import { Program, ProgramDay, ProgramExercise, ProgramTemplate } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';
import { confirmDestructive } from '@/utils/confirm';


export default function ProgramBuilder() {
  return <ProgramBuilderScreen />;
}

/**
 * Exported so the admin-side route can render the same builder without
 * dragging the admin into the trainer route group — pushing them there swaps
 * the whole tab bar mid-task, which is the bug `admin/calendar` was created
 * to avoid.
 */
export function ProgramBuilderScreen() {
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

  // Program artık günlerden oluşuyor; tek günlü programlar da tek elemanlı
  // bir gün listesi olarak düzenleniyor, böylece ekranın iki ayrı hâli yok.
  const [days, setDays] = useState<ProgramDay[]>(programDays(program));
  const [dayId, setDayId] = useState<string>(programDays(program)[0].id);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pickingFromLibrary, setPickingFromLibrary] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [assigning, setAssigning] = useState(false);

  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, isStaff(activeMembership));

  // Şablonlar yalnızca seçici açıkken dinleniyor: kurucuya her girişte 19
  // belge çekmenin karşılığı yok, antrenörlerin çoğu elle yazmaya devam edecek.
  useEffect(() => {
    if (!pickingTemplate || !tenantId) return;
    return watchProgramTemplates(tenantId, setTemplates);
  }, [pickingTemplate, tenantId]);

  const activeDay = days.find((d) => d.id === dayId) ?? days[0];
  const exercises = activeDay.exercises;

  const persistDays = (next: ProgramDay[]) => {
    setDays(next);
    saveProgramDays(program.id, next);
  };

  const persist = (next: ProgramExercise[]) => {
    persistDays(days.map((d) => (d.id === activeDay.id ? { ...d, exercises: next } : d)));
  };

  const addDay = () => {
    const day: ProgramDay = { id: newLocalId(), name: `Gün ${days.length + 1}`, exercises: [] };
    persistDays([...days, day]);
    setDayId(day.id);
    setExpandedId(null);
  };

  const removeDay = () => {
    if (days.length < 2) return;
    confirmDestructive({
      title: 'Günü kaldır',
      message: `"${activeDay.name}" ve içindeki ${activeDay.exercises.length} egzersiz programdan çıkarılacak.`,
      confirmLabel: 'Kaldır',
      onConfirm: () => {
        const next = days.filter((d) => d.id !== activeDay.id);
        persistDays(next);
        setDayId(next[0].id);
        setExpandedId(null);
      },
    });
  };

  /**
   * Şablon ATANMAZ, KOPYALANIR — kopyadan sonra bağ yok.
   *
   * Şablonun günleri programın günlerinin YERİNE geçer, sonuna eklenmez:
   * "şablondan başla" düğmesi yalnızca program boşken görünüyor, yani
   * ezilecek bir şey zaten yok.
   */
  const startFromTemplate = (template: ProgramTemplate) => {
    const next = daysFromTemplate(template, newLocalId);
    setDays(next);
    setDayId(next[0].id);
    setExpandedId(null);
    setPickingTemplate(false);
    saveProgramDays(program.id, next, { warmup: template.warmup, templateId: template.id });
    toast.success(`${template.title} kopyalandı — düzenleyip atayabilirsin.`);
  };

  const addFromLibrary = (entryId: string, name: string) => {
    // Kütüphane kimliği kaydediliyor: anlatım bağı isim üzerinden kuruluyordu
    // ve antrenör ismi düzenlediğinde sessizce kopuyordu (PER-19).
    const exercise: ProgramExercise = { id: newLocalId(), name, libraryId: entryId, sets: 3, reps: 10, targetWeightKg: 20 };
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
    } catch (e) {
      reportError(e, toast, 'Program aktif edilemedi, tekrar deneyin.');
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

      {/* Isınma ön bloğu. PER-18: ısınma her programın otomatik ön bloğudur ve
          "antrenör kapatabilir" — kapatma yolu burası. Kapalıyken açmak genel
          ısınmayı getiriyor: elle yazılmış programın hiç ısınması olmuyordu ve
          antrenörün dört şablondan birini ezbere bilmesi beklenemez. */}
      <Pressable
        onPress={() => setProgramWarmup(program.id, program.warmup ? null : (program.warmup ?? 'warmup-general'))}
        accessibilityRole="switch"
        accessibilityState={{ checked: !!program.warmup }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <Ionicons
          name={program.warmup ? 'checkbox-outline' : 'square-outline'}
          size={18}
          color={program.warmup ? colors.ok : colors.sub}
        />
        <Text variant="label" tone="sub" style={{ flex: 1 }}>
          {program.warmup
            ? `Isınma açık: ${templates.find((t) => t.id === program.warmup)?.title ?? program.warmup}`
            : 'Isınma kapalı — üye antrenmana doğrudan başlar'}
        </Text>
      </Pressable>

      {/* Gün sekmeleri. Tek günlü programda da görünür: ikinci günü eklemek
          buradan tek dokunuş, ve "program = günler" fikri baştan okunuyor. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {days.map((d) => (
          <Chip
            key={d.id}
            label={`${d.name} · ${d.exercises.length}`}
            selected={d.id === activeDay.id}
            onPress={() => {
              setDayId(d.id);
              setExpandedId(null);
            }}
          />
        ))}
        <Chip label="+ Gün" onPress={addDay} />
      </ScrollView>

      {days.length > 1 && (
        <Pressable onPress={removeDay} accessibilityRole="button">
          <Text variant="label" style={{ color: colors.danger }}>
            {activeDay.name} gününü kaldır
          </Text>
        </Pressable>
      )}

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
                    {formatDose(ex)}
                    {ex.type === 'time' ? '' : ` · ${ex.targetWeightKg} kg`}
                  </Text>
                </View>
                {(ex.libraryId ? exerciseById(ex.libraryId) : exerciseByName(ex.name)) && (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/exercise-detail',
                        params: ex.libraryId ? { exerciseId: ex.libraryId } : { name: ex.name },
                      })
                    }
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${ex.name} nasıl yapılır`}>
                    <Ionicons name="information-circle-outline" size={19} color={colors.sub} />
                  </Pressable>
                )}
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

        {/* Şablondan başlama yalnızca program BOŞKEN: dolu bir programın
            üstüne şablon kopyalamak antrenörün yazdığını sessizce silerdi. */}
        {exercises.length === 0 && !pickingFromLibrary && (
          pickingTemplate ? (
            <View style={{ gap: 8 }}>
              <Text variant="label" tone="sub">
                HAZIR ŞABLONLAR
              </Text>
              {templates.length === 0 ? (
                <Text variant="helper" tone="sub" style={{ textAlign: 'center', paddingVertical: 12 }}>
                  Şablonlar yükleniyor…
                </Text>
              ) : (
                templates.map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => startFromTemplate(t)}
                    style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, gap: 4, minHeight: 44 }}>
                    <Text variant="helper" weight="700">
                      {t.title}
                    </Text>
                    <Text variant="label" tone="sub">
                      {t.level === 'beginner' ? 'Başlangıç' : t.level === 'intermediate' ? 'Orta' : 'Her seviye'} ·{' '}
                      {t.durationMinutes} dk · {t.days.reduce((n, d) => n + d.exercises.length, 0)} egzersiz
                      {t.tenantId ? ' · salonun kendi şablonu' : ''}
                    </Text>
                    <Text variant="label" tone="sub" numberOfLines={2}>
                      {t.summary}
                    </Text>
                    {/* İlk sınır listede görünüyor: antrenör şablonu üyeye
                        anlatan kişi ve şablonun ne YAPMADIĞINI seçmeden önce
                        bilmesi gerekiyor. Tamamı üyenin "Hedefim" ekranında. */}
                    {t.limits.length > 0 && (
                      <Text variant="label" tone="sub" numberOfLines={2}>
                        Yapmaz: {t.limits[0]}
                        {t.limits.length > 1 ? ` (+${t.limits.length - 1})` : ''}
                      </Text>
                    )}
                  </Pressable>
                ))
              )}
              <Text variant="label" tone="sub">
                Şablon kopyalanır, atanmaz — kopyaladıktan sonra üyeye göre serbestçe düzenle.
              </Text>
              <Pressable onPress={() => setPickingTemplate(false)}>
                <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
                  Vazgeç
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setPickingTemplate(true)}
              style={{ borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf, borderRadius: radius.md, padding: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
              <Text variant="helper" weight="700">
                Şablondan başla
              </Text>
              <Text variant="label" tone="sub">
                Kanıta dayalı hazır programlar
              </Text>
            </Pressable>
          )
        )}

        {pickingFromLibrary ? (
          <View style={{ gap: 8 }}>
            {LIBRARY_GROUPS.map((group) => (
              <View key={group.label} style={{ gap: 6 }}>
                <Text variant="label" tone="sub">
                  {group.label}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {group.ids.map((id) => {
                    const entry = exerciseById(id);
                    if (!entry) return null;
                    return <Chip key={id} label={entry.tr} onPress={() => addFromLibrary(entry.id, entry.tr)} />;
                  })}
                </View>
              </View>
            ))}
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
          disabled={assigning || days.every((d) => d.exercises.length === 0)}
          onPress={assign}
        />
      </View>
    </View>
  );
}
