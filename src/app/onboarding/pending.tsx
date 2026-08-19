import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { watchMembership } from '@/data/firebase/membershipRepo';
import { auth } from '@/services/firebase';
import { useAppTheme } from '@/theme/ThemeContext';

/**
 * Onboarding 3/4 — the member's first real impression of the product.
 * Manage the wait: what happens next, how long, and how to reach the gym.
 * Live-watches the membership doc so approval navigates automatically.
 */
export default function PendingScreen() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { tenantId, tenantName } = useLocalSearchParams<{ tenantId: string; tenantName: string }>();

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !tenantId) return;
    const unsubscribe = watchMembership(tenantId, uid, (membership) => {
      if (membership?.status === 'active') {
        router.replace({ pathname: '/onboarding/approved', params: { tenantId, tenantName } });
      } else if (membership?.status === 'rejected') {
        router.replace('/onboarding/gym-code');
      }
    });
    return unsubscribe;
  }, [tenantId, tenantName, router]);

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 56, gap: spacing.md }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: colors.surf,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors.p,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 34 }}>⏳</Text>
        </View>

        <Text variant="h3" style={{ textAlign: 'center' }}>
          İsteğin salonda!
        </Text>
        <Text variant="helper" tone="sub" style={{ textAlign: 'center', lineHeight: 20 }}>
          {tenantName ?? 'Salon'} ekibi üyeliğini onaylayınca haber vereceğiz. Genellikle{' '}
          <Text variant="helper" weight="700">
            birkaç saat
          </Text>{' '}
          sürer.
        </Text>

        <Card style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
          <Text variant="helper" weight="700" style={{ marginBottom: 6 }}>
            Sırada ne var?
          </Text>
          <Text variant="helper" tone="sub" style={{ lineHeight: 24 }}>
            ① Salon onaylar → bildirim gelir{'\n'}② Üye kartın hazır olur{'\n'}③ QR ile içeri girersin
          </Text>
        </Card>

        <Button label="📞 Salonu ara" variant="ghost" style={{ alignSelf: 'stretch' }} />

        <View style={{ flex: 1 }} />
        <Text variant="label" tone="sub" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          Bu ekranda beklemek zorunda değilsin — kapat, biz haber veririz. Onaylandığında otomatik ilerleriz.
        </Text>
      </View>
    </Screen>
  );
}
