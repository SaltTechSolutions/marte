import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { QRCode } from '@/components/QRCode';
import { Screen } from '@/components/Screen';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
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

  const { activeMembership, switchTenant } = useAuth();
  const [entering, setEntering] = useState(false);

  // Someone who already belongs to another gym (the switcher's "Başka bir salona
  // katıl") keeps that gym selected after the refresh: the saved choice is still
  // the old one. This screen just showed the NEW gym's card, so put that gym on
  // screen, the same way the switcher does. For a first-time member the active
  // gym already is this one and nothing switches (DEN-1).
  const enter = async () => {
    setEntering(true);
    try {
      if (tenantId && activeMembership && activeMembership.tenantId !== tenantId) await switchTenant(tenantId);
    } catch {
      // Best effort: landing on the previous gym beats being stuck here.
    } finally {
      setEntering(false);
    }
    router.replace('/member');
  };

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
        <Button label="Salonu keşfet" critical onPress={enter} disabled={entering} />
      </View>
    </Screen>
  );
}
