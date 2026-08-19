import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Chip } from '@/components/Chip';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { isStaff, tenantIdIf } from '@/data/membership';
import { watchProgramsForTenant } from '@/data/firebase/programRepo';
import { Program } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

const FILTERS = ['Tümü', 'Aktif', 'Taslak'] as const;
type Filter = (typeof FILTERS)[number];

function summarize(program: Program): string {
  if (program.exercises.length === 0) return 'Henüz egzersiz eklenmedi';
  const names = program.exercises.slice(0, 2).map((e) => e.name).join(', ');
  const rest = program.exercises.length - 2;
  return rest > 0 ? `${names} +${rest}` : names;
}

/**
 * Programlar tab — the list the trainer lands on. The builder is a detail
 * screen reached from here, since it needs a specific programId.
 */
export default function TrainerPrograms() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, isStaff(activeMembership));

  const [programs, setPrograms] = useState<Program[]>([]);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [filter, setFilter] = useState<Filter>('Tümü');

  useEffect(() => {
    if (!tenantId) return;
    return watchProgramsForTenant(tenantId, setPrograms, () => setFailed(true));
  }, [tenantId, retryKey]);

  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  if (!tenantId) {
    return <AccessGuard title="Salon antrenör oturumu gerekli" />;
  }

  const activeCount = programs.filter((p) => p.status === 'active').length;
  const draftCount = programs.filter((p) => p.status === 'draft').length;
  const visible =
    filter === 'Aktif' ? programs.filter((p) => p.status === 'active')
    : filter === 'Taslak' ? programs.filter((p) => p.status === 'draft')
    : programs;

  const countFor = (f: Filter) => (f === 'Aktif' ? activeCount : f === 'Taslak' ? draftCount : programs.length);

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}>
      <Text variant="h3">Programlar</Text>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={`${f} (${countFor(f)})`} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {failed ? (
        <ErrorNotice message="Program listesi alınamadı." onRetry={retry} />
      ) : visible.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 6, marginTop: spacing.xl, paddingHorizontal: spacing.lg }}>
          <Text style={{ fontSize: 24 }}>📋</Text>
          <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
            {filter === 'Taslak' ? 'Taslak program yok' : filter === 'Aktif' ? 'Aktif program yok' : 'Henüz program yok'}
          </Text>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            Üyeler sekmesinden bir üye seçerek yeni program oluşturabilirsin.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
          <ListGroup>
            {visible.map((p, i) => (
              <ListRow
                key={p.id}
                last={i === visible.length - 1}
                onPress={() => router.push({ pathname: '/trainer/builder', params: { programId: p.id } })}>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {p.memberName}
                  </Text>
                  <Text variant="label" tone="sub" numberOfLines={1}>
                    {summarize(p)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <View style={{ backgroundColor: colors.surf2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text variant="label" weight="600" style={{ color: p.status === 'active' ? colors.ok : colors.warn }}>
                      {p.status === 'active' ? 'Aktif' : 'Taslak'}
                    </Text>
                  </View>
                  <Text variant="label" tone="sub">
                    {p.exercises.length} egzersiz
                  </Text>
                </View>
              </ListRow>
            ))}
          </ListGroup>
        </ScrollView>
      )}
    </View>
  );
}
