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
import { watchPromotionsForTenant } from '@/data/firebase/promotionRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { Promotion } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

const KIND_LABEL: Record<Promotion['kind'], (value: number) => string> = {
  percentDiscount: (v) => `%${v} indirim`,
  amountDiscount: (v) => `${v.toLocaleString('tr-TR')} ₺ indirim`,
  bonusDays: (v) => `+${v} gün hediye`,
  bonusLessons: (v) => `+${v} ders hediye`,
};

function isExpired(promo: Promotion): boolean {
  return promo.endsAt < new Date();
}

function isExhausted(promo: Promotion): boolean {
  return promo.maxRedemptions != null && promo.redeemed >= promo.maxRedemptions;
}

/**
 * Promotion campaigns (PKG-5). Layered on top of the package catalog, never
 * editing it — a package's content is locked the moment anything is sold
 * from it, so a seasonal campaign has to live here instead.
 */
export default function AdminPromotions() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [promotions, setPromotions] = useState<Promotion[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    return watchPromotionsForTenant(tenantId, setPromotions, () => setFailed(true));
  }, [tenantId, retryKey]);

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Button label="+ Promosyon ekle" onPress={() => router.push('/admin/promotion-form')} />

      {failed ? (
        <ErrorNotice message="Promosyonlar alınamadı." onRetry={() => { setFailed(false); setRetryKey((k) => k + 1); }} />
      ) : promotions === undefined ? (
        <ListSkeleton rows={2} avatar={false} />
      ) : promotions.length === 0 ? (
        <EmptyState
          icon="megaphone-outline"
          title="Henüz promosyon yok"
          description="Sınırlı süreli kampanyalar (yüzde indirimi, hediye ay/ders) burada tanımlanır ve paket atarken uygulanır."
          actionLabel="İlk promosyonu ekle"
          onAction={() => router.push('/admin/promotion-form')}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {promotions.map((promo) => {
            const expired = isExpired(promo);
            const exhausted = isExhausted(promo);
            return (
              <Pressable key={promo.id} onPress={() => router.push({ pathname: '/admin/promotion-form', params: { promotionId: promo.id } })}>
                <View
                  style={{
                    backgroundColor: colors.surf,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.md,
                    padding: 14,
                    gap: 8,
                    opacity: promo.isActive ? 1 : 0.55,
                  }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text variant="body" weight="900">
                      {promo.name}
                    </Text>
                    <Text variant="body" weight="900" style={{ color: colors.p }}>
                      {KIND_LABEL[promo.kind](promo.value)}
                    </Text>
                  </View>
                  <Text variant="helper" tone="sub">
                    {promo.appliesTo.length === 0 ? 'Tüm paketler' : `${promo.appliesTo.length} pakette geçerli`} ·{' '}
                    {promo.redeemed}
                    {promo.maxRedemptions != null ? `/${promo.maxRedemptions}` : ''} kullanım
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {!promo.isActive && <StatusBadge label="Kapalı" tone="sub" />}
                    {expired && <StatusBadge label="Süresi doldu" tone="sub" />}
                    {exhausted && <StatusBadge label="Kontenjan doldu" tone="warn" />}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
