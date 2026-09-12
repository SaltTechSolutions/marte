import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { applyPromotionEffect, assignPackageToMember } from '@/data/firebase/memberPackageRepo';
import { watchPackagesForTenant } from '@/data/firebase/packageRepo';
import { isPromotionUsable, watchPromotionsForTenant } from '@/data/firebase/promotionRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { GymPackage, Promotion } from '@/data/types';
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
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [selected, setSelected] = useState<GymPackage | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    return watchPackagesForTenant(tenantId, setPackages);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    return watchPromotionsForTenant(tenantId, setPromotions);
  }, [tenantId]);

  if (!tenantId || !memberId || !user) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  const active = (packages ?? []).filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const usablePromotions = selected ? promotions.filter((p) => isPromotionUsable(p, selected.id)) : [];
  const effect = selected
    ? selectedPromotion
      ? applyPromotionEffect(selected.price, selectedPromotion)
      : { finalPrice: selected.price, bonusDays: 0, bonusLessons: 0 }
    : null;

  const selectPackage = (pkg: GymPackage) => {
    setSelected(pkg);
    setSelectedPromotion(null); // last package's promotion may not apply to the new one
  };

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
        ...(selectedPromotion ? { promotion: selectedPromotion } : {}),
      });
      toast.success(`${selected.name} ${memberName || 'üyeye'} atandı`);
      router.back();
    } catch (e) {
      toast.error((e as Error).message === 'PROMOTION_EXHAUSTED' ? 'Bu promosyonun kontenjanı az önce doldu.' : 'Paket atanamadı, tekrar deneyin.');
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
              <Pressable key={pkg.id} onPress={() => selectPackage(pkg)}>
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
                    <Text variant="body" weight="900" style={{ color: colors.pText }}>
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

      {selected && usablePromotions.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text variant="label" tone="sub">
            PROMOSYON UYGULA
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label="Yok" selected={!selectedPromotion} onPress={() => setSelectedPromotion(null)} />
            {usablePromotions.map((promo) => (
              <Chip
                key={promo.id}
                label={promo.name}
                selected={selectedPromotion?.id === promo.id}
                onPress={() => setSelectedPromotion(promo)}
              />
            ))}
          </View>
        </View>
      )}

      {selected && effect && selectedPromotion && (
        <Card style={{ gap: 6 }}>
          <Text variant="label" tone="sub">
            ÖZET
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="helper" tone="sub">
              Fiyat
            </Text>
            <Text variant="helper" weight="700">
              {effect.finalPrice === selected.price
                ? `${selected.price.toLocaleString('tr-TR')} ₺`
                : `${selected.price.toLocaleString('tr-TR')} ₺ → ${effect.finalPrice.toLocaleString('tr-TR')} ₺`}
            </Text>
          </View>
          {effect.bonusDays > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="helper" tone="sub">
                Süre
              </Text>
              <Text variant="helper" weight="700" style={{ color: colors.ok }}>
                +{effect.bonusDays} gün hediye
              </Text>
            </View>
          )}
          {effect.bonusLessons > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="helper" tone="sub">
                Ders
              </Text>
              <Text variant="helper" weight="700" style={{ color: colors.ok }}>
                +{effect.bonusLessons} ders hediye
              </Text>
            </View>
          )}
        </Card>
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
