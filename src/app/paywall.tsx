import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { FREE_MEMBER_LIMIT } from '@/data/seats';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

const PLANS = [
  { id: 'monthly', label: 'Aylık', price: '500 ₺', per: '/ay', note: null },
  { id: 'yearly', label: 'Yıllık', price: '5.000 ₺', per: '/yıl', note: '2 ay bedava' },
] as const;

/**
 * Shown when a gym hits the free-tier seat limit.
 *
 * Purchasing is not wired up yet — the store products and the receipt
 * verification behind them do not exist, so this screen tells the truth
 * instead of showing a button that cannot work. See plan.md P0-1.
 */
export default function Paywall() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { activeTenant } = useAuth();

  const memberCount = activeTenant?.activeMemberCount;

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: 30, gap: spacing.md }}>
        <Text variant="h3">Salonun büyüyor</Text>
        <Text variant="helper" tone="sub" style={{ lineHeight: 20 }}>
          Ücretsiz plan {FREE_MEMBER_LIMIT} aktif üyeye kadar.
          {typeof memberCount === 'number' ? ` Şu an ${memberCount} üyen var.` : ''} Yeni üyelik
          isteklerin <Text variant="helper" weight="700">silinmedi</Text> — sırada bekliyorlar ve
          limiti yükselttiğin anda onaylayabilirsin.
        </Text>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.sm }}>
          {PLANS.map((plan) => (
            <View
              key={plan.id}
              style={{
                flex: 1,
                backgroundColor: colors.surf,
                borderWidth: 1.5,
                borderColor: colors.line,
                borderRadius: radius.lg,
                padding: 16,
                gap: 2,
              }}>
              <Text variant="label" tone="sub">
                {plan.label.toUpperCase()}
              </Text>
              <Text variant="h3">
                {plan.price}
                <Text variant="helper" tone="sub">
                  {plan.per}
                </Text>
              </Text>
              {plan.note && (
                <Text variant="label" style={{ color: colors.p }}>
                  {plan.note}
                </Text>
              )}
            </View>
          ))}
        </View>

        <Card style={{ gap: 6 }}>
          <Text variant="helper" weight="700">
            Premium ile
          </Text>
          <Text variant="helper" tone="sub" style={{ lineHeight: 22 }}>
            • Sınırsız üye{'\n'}• Tüm antrenör ve program özellikleri{'\n'}• Ödeme defteri ve
            raporlar
          </Text>
          <Text variant="label" tone="sub" style={{ marginTop: 4 }}>
            Ücret yalnızca salondan alınır — üyelerin ve antrenörlerin hiçbir zaman ödeme yapmaz.
          </Text>
        </Card>

        <Card style={{ borderColor: colors.warn, gap: 4 }} outlineColor={colors.warn}>
          <Text variant="helper" weight="700">
            Satın alma henüz açık değil
          </Text>
          <Text variant="label" tone="sub" style={{ lineHeight: 18 }}>
            Abonelik App Store ve Google Play üzerinden sunulacak; mağaza kurulumu tamamlanmadı.
            Şimdilik limit yükseltmesi için bizimle iletişime geç.
          </Text>
        </Card>

        <View style={{ flex: 1 }} />
        <Button
          label="Geri dön"
          variant="secondary"
          style={{ marginBottom: spacing.lg }}
          onPress={() => safeBack(router, '/admin/members')}
        />
      </View>
    </Screen>
  );
}
