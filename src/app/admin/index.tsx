import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { watchTodayCheckinCount } from '@/data/firebase/checkinRepo';
import { countActiveMembers, watchPendingRequests } from '@/data/firebase/membershipRepo';
import { watchPaymentsForTenant } from '@/data/firebase/paymentRepo';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/** Admin dashboard — "is my business okay?" answered in one glance. */
export default function AdminPanel() {
  const router = useRouter();
  const { colors, spacing, tenantName } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [checkinCount, setCheckinCount] = useState<number | null>(null);
  const [activeMembers, setActiveMembers] = useState<number | null>(null);
  const [requests, setRequests] = useState<TenantMembership[]>([]);
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const unsubCheckins = watchTodayCheckinCount(tenantId, setCheckinCount);
    const unsubRequests = watchPendingRequests(tenantId, setRequests);
    countActiveMembers(tenantId).then(setActiveMembers);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const unsubPayments = watchPaymentsForTenant(tenantId, (payments) => {
      setMonthRevenue(
        payments
          .filter((p) => p.status === 'confirmed' && p.createdAt >= monthStart)
          .reduce((sum, p) => sum + p.amount, 0),
      );
    });
    return () => {
      unsubCheckins();
      unsubRequests();
      unsubPayments();
    };
  }, [tenantId]);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" tone="onp" weight="900">
            {tenantName[0]}
          </Text>
        </View>
        <Text variant="h3">{tenantName}</Text>
      </View>

      <Pressable onPress={() => router.push('/admin/today')}>
        <Card style={{ alignItems: 'center' }} outlineColor={colors.p}>
          <Text variant="helper" tone="sub">
            Bugün içeri giren
          </Text>
          <Text variant="h1">
            {checkinCount ?? '–'} <Text variant="helper" weight="600" style={{ color: colors.ok }}>▲ canlı</Text>
          </Text>
          <Text variant="label" style={{ color: colors.p }}>
            Kimlerin girdiğini gör →
          </Text>
        </Card>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/admin/members')}>
          <Card style={{ alignItems: 'center' }}>
            <Text variant="body" weight="900">
              {activeMembers ?? '–'}
            </Text>
            <Text variant="label" tone="sub">
              aktif üye
            </Text>
          </Card>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/admin/members')}>
          <Card style={{ alignItems: 'center' }}>
            <Text variant="body" weight="900" style={{ color: requests.length > 0 ? colors.warn : colors.txt }}>
              {requests.length}
            </Text>
            <Text variant="label" tone="sub">
              bekleyen istek
            </Text>
          </Card>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push('/admin/payments')}>
          <Card style={{ alignItems: 'center' }}>
            <Text variant="body" weight="900">
              {monthRevenue === null ? '–' : `${Math.round(monthRevenue).toLocaleString('tr-TR')}₺`}
            </Text>
            <Text variant="label" tone="sub">
              bu ay gelir
            </Text>
          </Card>
        </Pressable>
      </View>

      {requests.length > 0 && (
        <Pressable onPress={() => router.push('/admin/members')}>
          <Card outlineColor={colors.p} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="helper" weight="900" style={{ color: colors.p }}>
                {(requests[0].userDisplayName || requests[0].userEmail || '?').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700">
                {requests.length} yeni katılım isteği
              </Text>
              <Text variant="label" tone="sub" numberOfLines={1}>
                {requests[0].userDisplayName || requests[0].userEmail}
                {requests.length > 1 ? ` ve ${requests.length - 1} kişi bekliyor` : ' bekliyor'}
              </Text>
            </View>
            <View style={{ backgroundColor: colors.p, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 }}>
              <Text variant="helper" weight="700" tone="onp">
                İncele
              </Text>
            </View>
          </Card>
        </Pressable>
      )}
    </ScrollView>
  );
}
