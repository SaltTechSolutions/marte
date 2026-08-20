import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { assignPackageToMember } from '@/data/firebase/memberPackageRepo';
import { watchPackagesForTenant } from '@/data/firebase/packageRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { GymPackage } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function summary(pkg: GymPackage): string {
  if (pkg.kind === 'lessons') return `${pkg.lessonCount ?? '?'} ders · ${pkg.lessonValidityDays ?? '?'} gün geçerli`;
  const parts = [`${pkg.durationDays ?? '?'} gün salon`];
  const gc = pkg.entitlements.groupClasses;
  if (gc?.unlimited) parts.push('sınırsız grup dersi');
  else if (gc) parts.push(`${gc.periodDays} günde ${gc.count} grup dersi`);
  if (pkg.entitlements.ptLessons) parts.push(`${pkg.entitlements.ptLessons.periodDays} günde ${pkg.entitlements.ptLessons.count} özel ders`);
  return parts.join(' · ');
}

/**
 * Direct assignment — no member approval. Only correct for a first-time or
 * additive grant (PKG-6's doc comment on `assignPackageToMember` has the
 * full reasoning). Retired packages never reach this list; the query
 * doesn't filter them out, the render does, so a package that goes inactive
 * while this screen happens to be open still disappears live.
 */
export default function AdminAssignPackage() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { user, activeMembership } = useAuth();
  const { memberId, memberName } = useLocalSearchParams<{ memberId: string; memberName: string }>();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [packages, setPackages] = useState<GymPackage[] | undefined>(undefined);
  const [selected, setSelected] = useState<GymPackage | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    return watchPackagesForTenant(tenantId, setPackages);
  }, [tenantId]);

  if (!tenantId || !memberId || !user) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  const active = (packages ?? []).filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  const assign = async () => {
    if (!selected || assigning) return;
    setAssigning(true);
    try {
      await assignPackageToMember({
        tenantId,
        memberId,
        memberName: memberName || 'Üye',
        pkg: selected,
        startsAt: new Date(),
        assignedBy: user.uid,
      });
      toast.success(`${selected.name} ${memberName || 'üyeye'} atandı`);
      router.back();
    } catch {
      toast.error('Paket atanamadı, tekrar deneyin.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Text variant="helper" tone="sub">
        {memberName} için bir paket seç
      </Text>

      {packages === undefined ? (
        <ListSkeleton rows={3} avatar={false} />
      ) : active.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="Satılabilir paket yok"
          description="Önce Salon Ayarları → Paketler'den bir paket oluştur."
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {active.map((pkg) => {
            const isSelected = selected?.id === pkg.id;
            return (
              <Pressable key={pkg.id} onPress={() => setSelected(pkg)}>
                <View
                  style={{
                    backgroundColor: colors.surf,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? colors.p : colors.line,
                    borderRadius: radius.md,
                    padding: 14,
                    gap: 6,
                  }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="body" weight="900">
                      {pkg.name}
                    </Text>
                    <Text variant="body" weight="900" style={{ color: colors.p }}>
                      {pkg.price.toLocaleString('tr-TR')} ₺
                    </Text>
                  </View>
                  <Text variant="helper" tone="sub">
                    {summary(pkg)}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <Button
        label={assigning ? '…' : selected ? `${selected.name} ata` : 'Bir paket seç'}
        critical
        disabled={!selected || assigning}
        onPress={assign}
      />
    </KeyboardAwareScroll>
  );
}
