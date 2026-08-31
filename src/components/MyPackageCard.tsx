import React from 'react';
import { View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { InfoCard } from './InfoCard';
import { Text } from './Text';

import { MemberCredit, MemberPackage } from '@/data/types';

function daysLeft(endsAt: Date): number {
  return Math.ceil((endsAt.getTime() - Date.now()) / 86400000);
}

function remaining(credits: MemberCredit[]): number {
  return credits.reduce((sum, c) => sum + (c.total - c.used), 0);
}

/** A count with its unit, sized to sit beside body text rather than tower
 *  over it — a lone oversized digit in the middle of a card was what made
 *  the first version look unbalanced. */
function CreditPill({ value, label }: { value: string; label: string }) {
  const { colors, radius } = useAppTheme();
  return (
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
        {value}
      </Text>
      <Text variant="label" tone="sub">
        {label}
      </Text>
    </View>
  );
}

/**
 * What the member actually bought.
 *
 * The gym takes money for a package and, until this existed, the app never
 * showed it back: `watchMemberCredits` was called in exactly one place — the
 * booking screen's "do you have a lesson left" check.
 *
 * Built on `InfoCard` so it carries the same leading icon, spacing and
 * typography as every other card on the home screen; the credits hang below
 * the row as pills.
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
  const { spacing } = useAppTheme();

  if (!activePackage) {
    return (
      <InfoCard
        label="PAKETİM"
        icon="ribbon-outline"
        title="Aktif paketin yok"
        subtitle="Salon yöneticisi sana bir paket atadığında burada görünür."
      />
    );
  }

  const left = daysLeft(activePackage.endsAt);
  const group = remaining(groupCredits);
  const pt = remaining(ptCredits);
  const unlimitedGroup = activePackage.entitlements.groupClasses?.unlimited === true;
  const showPills = unlimitedGroup || group > 0 || pt > 0;

  return (
    <InfoCard
      label="PAKETİM"
      icon="ribbon-outline"
      title={activePackage.packageName}
      // Days rather than a date: the question being asked is "do I need to
      // renew?". The last week is coloured so it reads before it is read.
      subtitle={`${left > 0 ? `${left} gün kaldı` : 'Süresi doldu'} · ${activePackage.endsAt.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`}
      subtitleTone={left <= 7 ? 'warn' : 'sub'}>
      {showPills ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.xs }}>
          {(unlimitedGroup || group > 0) && <CreditPill value={unlimitedGroup ? '∞' : String(group)} label="grup dersi" />}
          {pt > 0 && <CreditPill value={String(pt)} label="özel ders" />}
        </View>
      ) : null}
    </InfoCard>
  );
}
