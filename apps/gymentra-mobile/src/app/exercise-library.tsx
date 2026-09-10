import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { EXERCISES, Exercise, exerciseById, exerciseByName, exerciseNames } from '@/data/exerciseLibrary';
import { LIBRARY_GROUPS } from '@/data/exerciseGroups';
import { useAuth } from '@/context/AuthContext';
import { watchActiveProgramForMember } from '@/data/firebase/programRepo';
import { allProgramExercises } from '@/data/program';
import { Program } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';
import { matchesTr } from '@/utils/search';

/**
 * Browsable movement library (PER-19).
 *
 * The explainer screen was only reachable from inside a programme, so there
 * was no way to simply look a movement up — a member wondering what a Pallof
 * press is had to already have one assigned to them.
 *
 * Not a tab: the member's bar is already at five and a sixth would push the
 * frequently-used ones out of thumb reach (AGENTS §2). It hangs off the
 * Program tab and the trainer's profile instead — somewhere you visit, not
 * somewhere you switch between, the same call `member/profile` made.
 *
 * Two scopes. `scope=program` shows only what the member has actually been
 * assigned: handing them the whole catalogue invites them to train off a
 * catalogue their coach never prescribed, and the coach is the one
 * accountable for what they do. Without the param it is the whole library,
 * which is what a trainer picking a movement needs.
 */
export default function ExerciseLibrary() {
  const router = useRouter();
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const { colors, spacing } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const [query, setQuery] = useState('');

  const programOnly = scope === 'program';
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;
  const [program, setProgram] = useState<Program | null | undefined>(undefined);

  useEffect(() => {
    if (!programOnly || !tenantId || !user) return;
    return watchActiveProgramForMember(tenantId, user.uid, setProgram);
  }, [programOnly, tenantId, user]);

  /** The member's own movements, in the order their coach wrote them. */
  const assigned = useMemo(() => {
    if (!program) return [];
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const ex of allProgramExercises(program)) {
      const hit = exerciseByName(ex.name);
      if (hit && !seen.has(hit.id)) {
        seen.add(hit.id);
        out.push(hit);
      }
    }
    return out;
  }, [program]);

  const pool = programOnly ? assigned : EXERCISES;
  const trimmed = query.trim();
  const results = useMemo(
    // Üç ad da aranıyor: antrenör hareketi hangi adla öğrendiyse onu yazıyor —
    // "bacak presi" arayan da "leg press" arayan da aynı sayfaya varmalı.
    () => (trimmed ? pool.filter((e) => exerciseNames(e).some((n) => matchesTr(n, trimmed))) : []),
    [trimmed, pool],
  );

  const open = (e: Exercise) =>
    router.push({ pathname: '/exercise-detail', params: { exerciseId: e.id } });

  const row = (e: Exercise, last: boolean) => (
    <ListRow key={e.id} last={last} onPress={() => open(e)}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="helper" weight="700" numberOfLines={1}>
          {e.tr}
        </Text>
        <Text variant="label" tone="sub" numberOfLines={1}>
          {e.trAlt ?? e.en} · {e.equipTr}
        </Text>
      </View>
      <Text tone="sub">›</Text>
    </ListRow>
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <Pressable
          onPress={() => safeBack(router, '/')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
        </Pressable>
        <Text variant="h3" style={{ flex: 1 }}>
          {programOnly ? 'Programımdaki hareketler' : 'Hareketler'}
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.md, justifyContent: 'center' }}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Hareket ara"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={{ paddingLeft: 40 }}
        />
        <Ionicons name="search" size={17} color={colors.sub} style={{ position: 'absolute', left: spacing.md + 14 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
        {trimmed ? (
          results.length === 0 ? (
            <EmptyState
              icon="search-outline"
              title="Eşleşen hareket yok"
              description={`"${trimmed}" aramasına uyan bir hareket bulunamadı. Türkçe ya da İngilizce adını dene.`}
              actionLabel="Aramayı temizle"
              onAction={() => setQuery('')}
            />
          ) : (
            <ListGroup>{results.map((e, i) => row(e, i === results.length - 1))}</ListGroup>
          )
        ) : programOnly ? (
          program === undefined ? null : assigned.length === 0 ? (
            <EmptyState
              icon="barbell-outline"
              title="Programında anlatımlı hareket yok"
              description="Antrenörün sana bir program atadığında, içindeki hareketlerin anlatımlarını burada bulacaksın."
            />
          ) : (
            <ListGroup>{assigned.map((e, i) => row(e, i === assigned.length - 1))}</ListGroup>
          )
        ) : (
          LIBRARY_GROUPS.map((group) => {
            const entries = group.ids.map(exerciseById).filter((e): e is Exercise => e !== null);
            return (
              <View key={group.label} style={{ gap: 6 }}>
                <Text variant="label" tone="sub">
                  {group.label}
                </Text>
                <ListGroup>{entries.map((e, i) => row(e, i === entries.length - 1))}</ListGroup>
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}
