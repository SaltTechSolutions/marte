import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Card } from './Card';
import { GymLogo } from './GymLogo';
import { Text } from './Text';

/**
 * The gym's join code, on every role's account screen.
 *
 * It used to live nowhere: the owner typed it once while creating the gym and
 * the app never showed it again, so adding a member depended on someone
 * remembering it. Trainers never knew it at all, and members could not pass it
 * to a friend.
 *
 * The code is `selectable` so it can be long-pressed and copied without
 * pulling in a clipboard native module.
 *
 * `showQrAction` is for staff (admin/trainer), who need to *hand out* the code
 * at the front desk — they get a button through to the scannable card. A
 * member only needs to read it out.
 */
export function GymCodeCard({
  tenantName,
  code,
  showQrAction = false,
}: {
  tenantName: string;
  code: string;
  showQrAction?: boolean;
}) {
  const { colors, spacing, radius } = useAppTheme();
  const router = useRouter();

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text variant="label" tone="sub">
        SALONUM
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <GymLogo size={36} />
        <Text variant="helper" weight="700" numberOfLines={1} style={{ flex: 1 }}>
          {tenantName}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surf2,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}>
        <Ionicons name="key-outline" size={18} color={colors.pText} />
        <Text variant="body" weight="900" selectable style={{ flex: 1, letterSpacing: 1 }}>
          {code}
        </Text>
      </View>

      <Text variant="label" tone="sub">
        Salona katılmak isteyenler bu kodu girer. Kopyalamak için koda basılı tut.
      </Text>

      {showQrAction && (
        <Pressable
          onPress={() => router.push('/gym-qr')}
          accessibilityRole="button"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 44,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.p,
          }}>
          <Ionicons name="qr-code-outline" size={18} color={colors.pText} />
          <Text variant="helper" weight="700" style={{ color: colors.pText }}>
            Karekodu göster
          </Text>
        </Pressable>
      )}
    </Card>
  );
}
