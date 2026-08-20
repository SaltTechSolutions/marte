import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { getMembership } from '@/data/firebase/membershipRepo';
import { watchMemberCredits, watchMemberPackages } from '@/data/firebase/memberPackageRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { MemberCredit, MemberPackage, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusTone(status: MemberPackage['status']): 'ok' | 'warn' | 'sub' {
  if (status === 'active') return 'ok';
  if (status === 'frozen') return 'warn';
  return 'sub';
}

const STATUS_LABEL: Record<MemberPackage['status'], string> = {
  active: 'Aktif',
  frozen: 'Donduruldu',
  expired: 'Süresi doldu',
  cancelled: 'İptal edildi',
};

/**
 * A member's packages and quota balances, reached by tapping their row in
 * the roster. `getMembership` + the two live watches run in parallel — none
 * of the three blocks on the others, so contact info shows up as soon as
 * it's ready even if the package list is still loading.
 */
export default function AdminMemberDetail() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { activeMembership } = useAuth();
  const { memberId, memberName } = useLocalSearchParams<{ memberId: string; memberName: string }>();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [membership, setMembership] = useState<TenantMembership | null | undefined>(undefined);
  const [packages, setPackages] = useState<MemberPackage[] | undefined>(undefined);
  const [ptCredits, setPtCredits] = useState<MemberCredit[]>([]);
  const [groupCredits, setGroupCredits] = useState<MemberCredit[]>([]);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    getMembership(tenantId, memberId).then(setMembership);
  }, [tenantId, memberId, retryKey]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchMemberPackages(tenantId, memberId, setPackages, () => setFailed(true));
  }, [tenantId, memberId, retryKey]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchMemberCredits(tenantId, memberId, 'ptLesson', setPtCredits);
  }, [tenantId, memberId]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchMemberCredits(tenantId, memberId, 'groupClass', setGroupCredits);
  }, [tenantId, memberId]);

  if (!tenantId || !memberId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  const name = memberName || 'Üye';
  const ptRemaining = ptCredits.reduce((sum, c) => sum + (c.total - c.used), 0);
  const groupRemaining = groupCredits.reduce((sum, c) => sum + (c.total - c.used), 0);
  const soonestPt = ptCredits[0];
  const soonestGroup = groupCredits[0];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" weight="900" style={{ color: colors.p }}>
            {name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {name}
          </Text>
          {(membership?.phone || membership?.birthDate) && (
            <Text variant="label" tone="sub" numberOfLines={1}>
              {[membership.phone, membership.birthDate ? formatDate(membership.birthDate) : null].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>

      <Button
        label="+ Paket ata"
        onPress={() => router.push({ pathname: '/admin/assign-package', params: { memberId, memberName: name } })}
      />

      {(ptRemaining > 0 || groupRemaining > 0) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ptRemaining > 0 && (
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="h3">{ptRemaining}</Text>
              <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                kalan özel ders
              </Text>
              {soonestPt && (
                <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                  {formatDate(soonestPt.expiresAt)}&apos;e kadar
                </Text>
              )}
            </Card>
          )}
          {groupRemaining > 0 && (
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="h3">{groupRemaining}</Text>
              <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                kalan grup dersi
              </Text>
              {soonestGroup && (
                <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                  {formatDate(soonestGroup.expiresAt)}&apos;e kadar
                </Text>
              )}
            </Card>
          )}
        </View>
      )}

      <Text variant="label" tone="sub" style={{ marginTop: 4 }}>
        PAKETLER
      </Text>

      {failed ? (
        <ErrorNotice message="Paketler alınamadı." onRetry={() => { setFailed(false); setRetryKey((k) => k + 1); }} />
      ) : packages === undefined ? (
        <ListSkeleton rows={2} avatar={false} />
      ) : packages.length === 0 ? (
        <EmptyState icon="pricetags-outline" title="Henüz paket atanmadı" description="Yukarıdaki düğmeyle bu üyeye bir paket atayabilirsin." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {packages.map((p) => (
            <Card key={p.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text variant="body" weight="900">
                  {p.packageName}
                </Text>
                <Text variant="body" weight="900" style={{ color: colors.p }}>
                  {p.finalPrice.toLocaleString('tr-TR')} ₺
                </Text>
              </View>
              <Text variant="helper" tone="sub">
                {formatDate(p.startsAt)} → {formatDate(p.endsAt)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <StatusBadge label={STATUS_LABEL[p.status]} tone={statusTone(p.status)} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
