import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { ListRow } from '@/components/ListRow';
import { GymLogo } from '@/components/GymLogo';
import { GymSwitchTarget } from '@/components/GymSwitcher';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { canCheckIn, isStaff, tenantIdIf } from '@/data/membership';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import { watchActiveProgramsForTenant } from '@/data/firebase/programRepo';
import { Program, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { compareTr, matchesTr } from '@/utils/search';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

const FILTERS = ['Tümü', 'Programsız'] as const;

/**
 * "Son aktiviteye göre" was on the brief but is deliberately not here: nothing
 * on the membership records last activity, so it would mean scanning every
 * member's check-in history on a screen that already loads two collections.
 * Join date answers the same "who is new to me?" question from data already
 * in hand.
 */
const SORTS = { name: 'Ada göre', recent: 'Yeni üyeler' } as const;
type Sort = keyof typeof SORTS;

function joinedAt(m: TenantMembership): number {
  return (m.approvedAt ?? m.requestedAt).getTime();
}

/** Client list — built for interrupted, repeated glances. */
export default function TrainerClients() {
  const router = useRouter();
  const { colors, spacing, radius, tenantName } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, isStaff(activeMembership));

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Tümü');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('name');
  // undefined until the first snapshot lands — [] would claim the gym is
  // empty while the query is still in flight.
  const [members, setMembers] = useState<TenantMembership[] | undefined>(undefined);
  const [activePrograms, setActivePrograms] = useState<Program[]>([]);
  const loading = members === undefined;
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

  const programByMember = useMemo(
    () => new Map(activePrograms.map((p) => [p.memberId, p])),
    [activePrograms],
  );

  const nameOf = (m: TenantMembership) => m.userDisplayName || m.userEmail || 'Üye';

  const withoutProgram = useMemo(
    () => (members ?? []).filter((m) => !programByMember.has(m.userId)),
    [members, programByMember],
  );

  const visible = useMemo(() => {
    const base = filter === 'Programsız' ? withoutProgram : (members ?? []);
    const q = query.trim();
    const found = q ? base.filter((m) => matchesTr(nameOf(m), q) || matchesTr(m.userEmail ?? '', q)) : base;
    return [...found].sort((a, b) =>
      sort === 'name' ? compareTr(nameOf(a), nameOf(b)) : joinedAt(b) - joinedAt(a),
    );
  }, [filter, members, withoutProgram, query, sort]);

  if (!tenantId) {
    return <AccessGuard title="Salon antrenör oturumu gerekli" />;
  }

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
      {/* The trainer's home was the one role surface with no gym mark at
          all — the same header row the member and admin homes use. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <GymSwitchTarget>
          <GymLogo size={30} radius={8} />
          <Text variant="helper" weight="700" tone="sub" style={{ flex: 1 }} numberOfLines={1}>
            {tenantName}
          </Text>
        </GymSwitchTarget>
      </View>
      {/* "Üyeler", matching the tab and the header — the screen used to say
          "Üyelerim" while both of those said "Üyeler". */}
      <Text variant="h3">Üyeler</Text>

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
            <Ionicons name="qr-code-outline" size={22} color={colors.pText} />
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700">
                Giriş kabul et
              </Text>
              <Text variant="label" tone="sub">
                Üyenin QR kodunu okut veya 6 haneli kodu gir
              </Text>
            </View>
            <Text style={{ color: colors.pText }}>›</Text>
          </View>
        </Pressable>
      )}
      {/* Search earns its place past a couple of dozen members — the pilot gym
          has 50 — and it is the fastest way to a specific person, so it sits
          above the filters rather than behind them. */}
      <View style={{ justifyContent: 'center' }}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Üye ara"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={{ paddingLeft: 40 }}
        />
        <Ionicons name="search" size={17} color={colors.sub} style={{ position: 'absolute', left: 14 }} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={f === 'Tümü' ? `Tümü (${members?.length ?? 0})` : `Programsız (${withoutProgram.length})`}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
        <View style={{ flex: 1 }} />
        <Chip
          label={SORTS[sort]}
          icon="swap-vertical-outline"
          onPress={() => setSort((c) => (c === 'name' ? 'recent' : 'name'))}
        />
      </View>

      {failed ? (
        <ErrorNotice message="Üye listesi alınamadı." onRetry={retry} />
      ) : loading ? (
        <ListSkeleton />
      ) : visible.length === 0 ? (
        query.trim() ? (
          <EmptyState
            icon="search-outline"
            title="Eşleşen üye yok"
            description={`"${query.trim()}" aramasına uyan kimse bulunamadı. Farklı bir yazım dene.`}
            actionLabel="Aramayı temizle"
            onAction={() => setQuery('')}
          />
        ) : filter === 'Programsız' ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title="Herkesin bir programı var"
            description="Bu salondaki tüm aktif üyelere program atanmış durumda."
          />
        ) : (
          <EmptyState
            icon="people-outline"
            title="Henüz aktif üye yok"
            description="Üyeler salon koduyla katılıp yönetici onayından geçtikçe burada listelenecek."
          />
        )
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
                  <Text variant="helper" weight="900" style={{ color: colors.pText }}>
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
