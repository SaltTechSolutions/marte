import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ErrorNotice } from '@/components/ErrorNotice';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchTodayCheckins } from '@/data/firebase/checkinRepo';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import { canCheckIn, tenantIdIf } from '@/data/membership';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

/**
 * Who came in today.
 *
 * The dashboard showed a live count that led to the scanner rather than the
 * list behind the number — tapping "bugün içeri giren: 12" answered a
 * different question than the one it raised.
 *
 * Check-in rows only store a uid, so names come from the member roster,
 * joined here rather than denormalised onto every scan.
 */
export default function AdminToday() {
  const { colors, spacing } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canCheckIn(activeMembership));

  const [entries, setEntries] = useState<{ id: string; userId: string; checkedInAt: Date }[]>([]);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    return watchTodayCheckins(tenantId, setEntries, () => setFailed(true));
  }, [tenantId, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers, () => setFailed(true));
  }, [tenantId, retryKey]);

  if (!tenantId) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 }}>
          <Text style={{ fontSize: 28 }}>🔒</Text>
          <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
            Bu ekran için yetkin yok
          </Text>
        </View>
      </Screen>
    );
  }

  const nameOf = (userId: string) => {
    const m = members.find((x) => x.userId === userId);
    return m?.userDisplayName || m?.userEmail || 'Üye';
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Text variant="h3">
        Bugün girenler <Text variant="h3" style={{ color: colors.p }}>{entries.length}</Text>
      </Text>

      {failed ? (
        <ErrorNotice message="Giriş listesi alınamadı." onRetry={() => { setFailed(false); setRetryKey((k) => k + 1); }} />
      ) : entries.length === 0 ? (
        <Text variant="helper" tone="sub" style={{ textAlign: 'center', marginTop: spacing.xl }}>
          Bugün henüz kimse giriş yapmadı.
        </Text>
      ) : (
        <ListGroup>
          {entries.map((e, i) => (
            <ListRow key={e.id} last={i === entries.length - 1}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="helper" weight="900" style={{ color: colors.p }}>
                  {initialsOf(nameOf(e.userId))}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700" numberOfLines={1}>
                  {nameOf(e.userId)}
                </Text>
              </View>
              <Text variant="helper" weight="700" style={{ color: colors.p }}>
                {e.checkedInAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </ListRow>
          ))}
        </ListGroup>
      )}
    </ScrollView>
  );
}
