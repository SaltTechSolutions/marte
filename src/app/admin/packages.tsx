import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchPackagesForTenant } from '@/data/firebase/packageRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { GymPackage } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { useRefreshControl } from '@/components/useRefreshControl';

function entitlementSummary(pkg: GymPackage): string {
  if (pkg.kind === 'lessons') {
    return `${pkg.lessonCount ?? '?'} ders${pkg.lessonValidityDays ? ` · ${pkg.lessonValidityDays} gün geçerli` : ''}`;
  }
  const parts = [`${pkg.durationDays ?? '?'} gün salon`];
  const gc = pkg.entitlements.groupClasses;
  if (gc?.unlimited) parts.push('sınırsız grup dersi');
  else if (gc) parts.push(`ayda ${gc.count} grup dersi`);
  const pt = pkg.entitlements.ptLessons;
  if (pt) parts.push(`${pt.periodDays} günde ${pt.count} özel ders`);
  return parts.join(' · ');
}

/**
 * Package catalog (PKG-1). What a gym sells, not who bought it — assignment
 * lives on `member_packages` (PKG-2) and is reached from the member roster,
 * not from here.
 */
export default function AdminPackages() {
  const router = useRouter();
  const { spacing } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [packages, setPackages] = useState<GymPackage[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  useEffect(() => {
    if (!tenantId) return;
    return watchPackagesForTenant(tenantId, setPackages, () => setFailed(true));
  }, [tenantId, retryKey]);

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  // Retired versions (superseded, isActive:false) stay visible so the admin
  // can see the catalog's history — they just sort to the bottom.
  const visible = (packages ?? []).slice().sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });

  return (
    <ScrollView
      refreshControl={refreshControl} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Button label="+ Paket ekle" onPress={() => router.push('/admin/package-form')} />

      {failed ? (
        <ErrorNotice message="Paket kataloğu alınamadı." onRetry={() => { setFailed(false); setRetryKey((k) => k + 1); }} />
      ) : packages === undefined ? (
        <ListSkeleton rows={3} avatar={false} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="Henüz paket yok"
          description="Salonun sattığı süreli üyelikleri ve ders paketlerini burada tanımlarsın."
          actionLabel="İlk paketi ekle"
          onAction={() => router.push('/admin/package-form')}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {visible.map((pkg) => (
            <PackageRow key={pkg.id} pkg={pkg} onPress={() => router.push({ pathname: '/admin/package-form', params: { packageId: pkg.id } })} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function PackageRow({ pkg, onPress }: { pkg: GymPackage; onPress: () => void }) {
  const { colors, radius } = useAppTheme();
  const locked = pkg.activeAssignmentCount > 0;

  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: 14,
          gap: 8,
          opacity: pkg.isActive ? 1 : 0.55,
        }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text variant="body" weight="900">
            {pkg.name}
          </Text>
          <Text variant="body" weight="900" style={{ color: colors.p }}>
            {pkg.price.toLocaleString('tr-TR')} ₺
          </Text>
        </View>
        <Text variant="helper" tone="sub">
          {entitlementSummary(pkg)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {!pkg.isActive && <StatusBadge label="Kaldırıldı" tone="sub" />}
          {locked && <StatusBadge label={`${pkg.activeAssignmentCount} üyede aktif`} tone="warn" />}
          {pkg.supersedesId && <StatusBadge label="Güncellenmiş sürüm" tone="sub" />}
        </View>
      </View>
    </Pressable>
  );
}
