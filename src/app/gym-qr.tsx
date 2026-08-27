import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { QRCode } from '@/components/QRCode';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { isStaff } from '@/data/membership';
import { useAppTheme } from '@/theme/ThemeContext';

/** Prefix keeps the payload self-describing: the join scanner can tell a gym
 *  code apart from a member card (whose payload is a membership doc id) and
 *  refuse the wrong one instead of silently searching for a gym that cannot
 *  exist. Kept in one place so both sides stay in step. */
export const GYM_QR_PREFIX = 'gymentra:gym:';

export function encodeGymQr(code: string): string {
  return `${GYM_QR_PREFIX}${code}`;
}

/** Returns the gym code, or null when this is not a gym-join QR. */
export function decodeGymQr(payload: string): string | null {
  return payload.startsWith(GYM_QR_PREFIX) ? payload.slice(GYM_QR_PREFIX.length).trim() : null;
}

/**
 * The scannable join code, for staff to hold up at the front desk.
 *
 * Deliberately the whole screen rather than a card on the profile: it exists
 * to be pointed at someone else's phone, so the QR wants the space and the
 * screen wants to stay lit and still.
 */
export default function GymQr() {
  const { colors, spacing } = useAppTheme();
  const router = useRouter();
  const { activeMembership, activeTenant } = useAuth();

  if (!isStaff(activeMembership)) {
    return <AccessGuard title="Bu ekran salon ekibine açık" />;
  }

  if (!activeTenant) {
    return <AccessGuard title="Salon bilgisi yüklenemedi" />;
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text variant="h3">{activeTenant.name}</Text>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            Yeni üye, GymEntra&rsquo;yı açıp bu karekodu okutsun.
          </Text>
        </View>

        <QRCode value={encodeGymQr(activeTenant.code)} size={220} />

        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="label" tone="sub">
            OKUTAMIYORSA BU KODU YAZSIN
          </Text>
          <Text variant="h3" selectable style={{ letterSpacing: 2 }}>
            {activeTenant.code}
          </Text>
        </View>

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg }}>
          <Text variant="helper" weight="700" style={{ color: colors.p }}>
            Kapat
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
