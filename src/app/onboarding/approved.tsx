import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { QRCode } from '@/components/QRCode';
import { Screen } from '@/components/Screen';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { membershipId } from '@/data/firebase/membershipRepo';
import { auth } from '@/services/firebase';
import { useAppTheme } from '@/theme/ThemeContext';

/** Onboarding 4/4 — notification + first card moment. */
export default function ApprovedScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { tenantId, tenantName } = useLocalSearchParams<{ tenantId: string; tenantName: string }>();
  const user = auth.currentUser;
  const firstName = user?.displayName?.split(' ')[0] ?? 'orada';
  const qrValue = user && tenantId ? membershipId(tenantId, user.uid) : 'gymentra://pending';

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
            backgroundColor: colors.surf2,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: 10,
          }}>
          <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="label" tone="onp" weight="900">
              {tenantName?.[0] ?? 'G'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="label" weight="700">
              {tenantName}
            </Text>
            <Text variant="label" tone="sub">
              🎉 Üyeliğin onaylandı! Kartın hazır.
            </Text>
          </View>
          <Text variant="label" tone="sub">
            şimdi
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
        <Text variant="h3">Hoş geldin, {firstName}!</Text>
        <Text variant="helper" tone="sub">
          İşte üye kartın 👇
        </Text>
        <QRCode value={qrValue} size={120} />
        <StatusBadge label="Aktif üyelik" tone="ok" />
      </View>

      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }}>
        <Button label="Salonu keşfet" critical onPress={() => router.replace('/member')} />
      </View>
    </Screen>
  );
}
