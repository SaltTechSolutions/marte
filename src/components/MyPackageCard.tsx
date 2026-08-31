import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Card } from './Card';
import { Text } from './Text';

import { MemberCredit, MemberPackage } from '@/data/types';

function daysLeft(endsAt: Date): number {
  const ms = endsAt.getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function remaining(credits: MemberCredit[]): number {
  return credits.reduce((sum, c) => sum + (c.total - c.used), 0);
}

/**
 * What the member actually bought.
 *
 * The gym takes money for a package and, until this existed, the app never
 * showed it back: `watchMemberCredits` was called in exactly one place — the
 * booking screen's "do you have a lesson left" check — so nobody could see
 * their own package name, expiry or remaining lessons anywhere.
 *
 * Expiry is stated in days rather than a date because that is the question
 * being asked ("do I need to renew?"), and the last week is coloured as a
 * warning so it reads before it is read.
 */
export function MyPackageCard({
  activePackage,
  groupCredits,
  ptCredits,
}: {
  activePackage: MemberPackage | null;
  groupCredits: MemberCredit[];
  ptCredits: MemberCredit[];
}) {
  const { colors, spacing, radius } = useAppTheme();

  if (!activePackage) {
    return (
      <Card style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          PAKETİM
        </Text>
        <Text variant="helper" tone="sub">
          Aktif paketin yok. Salon yöneticisi sana bir paket atadığında burada görünür.
        </Text>
      </Card>
    );
  }

  const left = daysLeft(activePackage.endsAt);
  const expiringSoon = left <= 7;
  const group = remaining(groupCredits);
  const pt = remaining(ptCredits);
  const unlimitedGroup = activePackage.entitlements.groupClasses?.unlimited === true;

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text variant="label" tone="sub">
        PAKETİM
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ribbon-outline" size={19} color={colors.p} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="helper" weight="700" numberOfLines={1}>
            {activePackage.packageName}
          </Text>
          <Text variant="label" style={{ color: expiringSoon ? colors.warn : colors.sub }}>
            {left > 0 ? `${left} gün kaldı` : 'Süresi doldu'}
            {' · '}
            {activePackage.endsAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
          </Text>
        </View>
      </View>

      {(unlimitedGroup || group > 0 || pt > 0) && (
        // Inline pills rather than big centred numbers: with only one credit
        // type a full-width column left a single huge digit floating in the
        // middle of the card, out of scale with the two lines above it.
        // Pills keep the weight on the left edge with everything else and
        // stay balanced at zero, one or two entries.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(unlimitedGroup || group > 0) && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.surf2,
                borderRadius: radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}>
              <Text variant="helper" weight="900">
                {unlimitedGroup ? '∞' : group}
              </Text>
              <Text variant="label" tone="sub">
                grup dersi
              </Text>
            </View>
          )}
          {pt > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: colors.surf2,
                borderRadius: radius.pill,
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}>
              <Text variant="helper" weight="900">
                {pt}
              </Text>
              <Text variant="label" tone="sub">
                özel ders
              </Text>
            </View>
          )}
        </View>
      )}

    </Card>
  );
}
