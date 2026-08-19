import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { Chip } from '@/components/Chip';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { canCheckIn, isStaff, tenantIdIf } from '@/data/membership';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import { watchActiveProgramsForTenant } from '@/data/firebase/programRepo';
import { Program, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

const FILTERS = ['Tümü', 'Programsız'] as const;

/** Client list — built for interrupted, repeated glances. */
export default function TrainerClients() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, isStaff(activeMembership));

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Tümü');
  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [activePrograms, setActivePrograms] = useState<Program[]>([]);
  const [failed, setFailed] = useState(false);
  // Bumping this re-runs the effects, which re-subscribes after a failure.
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers, () => setFailed(true));
  }, [tenantId, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveProgramsForTenant(tenantId, setActivePrograms, () => setFailed(true));
  }, [tenantId, retryKey]);

  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  if (!tenantId) {
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

  const programByMember = new Map(activePrograms.map((p) => [p.memberId, p]));
  const visible = filter === 'Programsız' ? members.filter((m) => !programByMember.has(m.userId)) : members;

  // Opens the coaching detail screen. Deliberately does NOT create a
  // programme: this used to call findOrCreateDraftProgram, so merely
  // browsing the roster wrote empty drafts to the database.
  const openClient = (member: TenantMembership) => {
    router.push({
      pathname: '/trainer/member',
      params: { memberId: member.userId, memberName: member.userDisplayName || member.userEmail || 'Üye' },
    });
  };

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm }}>
      <Text variant="h3">Üyelerim</Text>

      {/* Only for staff the owner has put on the door. Front-desk check-in is
          frequent and time-critical, so it sits on the landing screen rather
          than behind the profile tab. */}
      {canCheckIn(activeMembership) && (
        <Pressable onPress={() => router.push('/checkin')}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: colors.surf,
              borderWidth: 1.5,
              borderColor: colors.p,
              borderRadius: 14,
              padding: 13,
            }}>
            <Ionicons name="qr-code-outline" size={22} color={colors.p} />
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700">
                Giriş kabul et
              </Text>
              <Text variant="label" tone="sub">
                Üyenin QR kodunu okut veya 6 haneli kodu gir
              </Text>
            </View>
            <Text style={{ color: colors.p }}>›</Text>
          </View>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f === 'Tümü' ? `Tümü (${members.length})` : `Programsız (${members.filter((m) => !programByMember.has(m.userId)).length})`} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {failed ? (
        <ErrorNotice message="Üye listesi alınamadı." onRetry={retry} />
      ) : visible.length === 0 ? (
        <Text variant="helper" tone="sub" style={{ textAlign: 'center', marginTop: spacing.xl }}>
          {filter === 'Programsız' ? 'Herkesin bir programı var 🎉' : 'Henüz aktif üye yok.'}
        </Text>
      ) : (
        // FlatList rather than ScrollView: a real gym has dozens of members
        // and rendering every row up front is wasted work. This screen had no
        // scroll container at all, so past the first screenful the roster was
        // simply unreachable.
        <FlatList
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            overflow: 'hidden',
          }}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: m, index }) => {
            const name = m.userDisplayName || m.userEmail || 'Üye';
            const program = programByMember.get(m.userId);
            return (
              <ListRow last={index === visible.length - 1} onPress={() => openClient(m)}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="helper" weight="900" style={{ color: colors.p }}>
                    {initialsOf(name)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="label" tone="sub" numberOfLines={1}>
                    {program ? `Program: ${program.name}` : 'Henüz program atanmadı'}
                  </Text>
                </View>
                <View style={{ backgroundColor: colors.surf2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text variant="label" weight="600" style={{ color: program ? colors.ok : colors.warn }}>
                    {program ? 'Aktif' : 'Programsız'}
                  </Text>
                </View>
              </ListRow>
            );
          }}
        />
      )}
    </View>
  );
}
