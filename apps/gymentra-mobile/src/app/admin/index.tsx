import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Card } from '@/components/Card';
import { GymLogo } from '@/components/GymLogo';
import { GymSwitchTarget } from '@/components/GymSwitcher';
import { InfoCard } from '@/components/InfoCard';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { watchTodayCheckinCount } from '@/data/firebase/checkinRepo';
import { sumPayments } from '@/utils/revenue';
import { countActiveMembers, watchPendingRequests } from '@/data/firebase/membershipRepo';
import { watchPaymentsForTenant } from '@/data/firebase/paymentRepo';
import { watchPendingRenewals } from '@/data/firebase/renewalRequestRepo';
import { RenewalRequest, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { useRefreshControl } from '@/components/useRefreshControl';

/** Admin dashboard — "is my business okay?" answered in one glance. */
export default function AdminPanel() {
  const router = useRouter();
  const { colors, spacing, tenantName } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  // Yeniden abone olmak için — çevrimdışıyken düşen bir dinleyici
  // her zaman kendiliğinden toparlamıyor.
  const [retryKey, setRetryKey] = useState(0);
  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  const [checkinCount, setCheckinCount] = useState<number | null>(null);
  const [activeMembers, setActiveMembers] = useState<number | null>(null);
  const [requests, setRequests] = useState<TenantMembership[]>([]);
  const [renewals, setRenewals] = useState<RenewalRequest[]>([]);
  const [monthRevenue, setMonthRevenue] = useState<number | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const unsubCheckins = watchTodayCheckinCount(tenantId, setCheckinCount);
    const unsubRequests = watchPendingRequests(tenantId, setRequests);
    const unsubRenewals = watchPendingRenewals(tenantId, setRenewals);
    countActiveMembers(tenantId).then(setActiveMembers);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const unsubPayments = watchPaymentsForTenant(tenantId, (payments) => {
      // Signed: a reversal or refund has to come OFF the month, not add to
      // it. Summing raw amounts made correcting a mistake look like income.
      setMonthRevenue(
        sumPayments(payments.filter((p) => p.status === 'confirmed' && p.createdAt >= monthStart)),
      );
    });
    return () => {
      unsubCheckins();
      unsubRequests();
      unsubRenewals();
      unsubPayments();
    };
  }, [tenantId, retryKey]);

  return (
    <ScrollView
      refreshControl={refreshControl} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
        <GymSwitchTarget>
          <GymLogo size={30} radius={8} />
          <Text variant="h3" numberOfLines={1} style={{ flex: 1 }}>
            {tenantName}
          </Text>
        </GymSwitchTarget>
      </View>

      <Pressable onPress={() => router.push('/admin/today')}>
        <Card style={{ alignItems: 'center' }} outlineColor={colors.p}>
          <Text variant="helper" tone="sub">
            Bugün içeri giren
          </Text>
          <Text variant="h1">
            {checkinCount ?? '–'} <Text variant="helper" weight="600" style={{ color: colors.ok }}>▲ canlı</Text>
          </Text>
          <Text variant="label" style={{ color: colors.pText }}>
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

      <Pressable onPress={() => router.push('/admin/reports')}>
        <InfoCard
          outlined
          icon="bar-chart-outline"
          title="Raporlar"
          subtitle="Bekleyen ödemeler, biten paketler, gelir ve katılım"
          trailing={<Ionicons name="chevron-forward" size={18} color={colors.sub} />}
        />
      </Pressable>

      {renewals.length > 0 && (
        <InfoCard
          outlined
          onPress={() => router.push('/admin/members')}
          icon="refresh-outline"
          title={`${renewals.length} yenileme talebi`}
          subtitle={`${renewals[0].memberName}${renewals.length > 1 ? ` ve ${renewals.length - 1} kişi` : ''} paketini yenilemek istiyor`}
          trailing={
            <View style={{ backgroundColor: colors.p, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 }}>
              <Text variant="helper" weight="700" tone="onp">
                Paket ata
              </Text>
            </View>
          }
        />
      )}

      {requests.length > 0 && (
        <InfoCard
          outlined
          onPress={() => router.push('/admin/members')}
          initials={(requests[0].userDisplayName || requests[0].userEmail || '?').slice(0, 2).toUpperCase()}
          title={`${requests.length} yeni katılım isteği`}
          subtitle={`${requests[0].userDisplayName || requests[0].userEmail}${
            requests.length > 1 ? ` ve ${requests.length - 1} kişi bekliyor` : ' bekliyor'
          }`}
          trailing={
            <View style={{ backgroundColor: colors.p, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 }}>
              <Text variant="helper" weight="700" tone="onp">
                İncele
              </Text>
            </View>
          }
        />
      )}
    </ScrollView>
  );
}
