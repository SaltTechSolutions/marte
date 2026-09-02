import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Linking as RNLinking, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { watchMembership } from '@/data/firebase/membershipRepo';
import { getTenantContact } from '@/data/firebase/tenantRepo';
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

  /**
   * PER-1. This button had no `onPress` at all — it looked like a way to
   * chase up a request and did nothing, which is both the most frustrating
   * moment to hit a dead control and a Guideline 2.1 risk if a reviewer
   * lands here with a pending demo account.
   *
   * The number lives in the members-only contact document, so until the rule
   * was widened (`isPendingIn`) the one person who needed it was the one who
   * could not read it. Hidden rather than disabled when the gym has no
   * number on file: a control you can never use is noise.
   */
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    getTenantContact(tenantId)
      .then((c) => alive && setPhone(c.phone?.trim() || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tenantId]);

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
          <Ionicons name="hourglass-outline" size={34} color={colors.p} />
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

        {phone && (
          <Button
            label={`Salonu ara · ${phone}`}
            leftIcon={<Ionicons name="call-outline" size={18} color={colors.txt} />}
            variant="ghost"
            style={{ alignSelf: 'stretch' }}
            onPress={() => {
              const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
              // `canOpenURL` first: the simulator has no phone app, and an
              // unhandled tel: link throws rather than doing nothing.
              RNLinking.canOpenURL(url)
                .then((can) => (can ? Linking.openURL(url) : null))
                .catch(() => {});
            }}
          />
        )}

        <View style={{ flex: 1 }} />
        <Text variant="label" tone="sub" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          Bu ekranda beklemek zorunda değilsin — kapat, biz haber veririz. Onaylandığında otomatik ilerleriz.
        </Text>
      </View>
    </Screen>
  );
}
