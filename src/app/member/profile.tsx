import React from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { LeaveGymButton } from '@/components/LeaveGymButton';
import { LegalLinks } from '@/components/LegalLinks';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { signOutAndForget } from '@/services/signOut';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

/**
 * Account screen for members.
 *
 * These controls used to live at the bottom of the QR card. That put "Hesabımı
 * sil" and "Salondan ayrıl" one scroll below the thing a member opens while
 * standing at the door — and hid the account settings behind a tab called
 * "Üye Kartım", where nobody would look for them.
 *
 * Reached from the Today header rather than a sixth tab: it is a place you
 * visit occasionally, not one you switch between.
 */
export default function MemberProfile() {
  const { colors, spacing, tenantName } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const displayName = user?.displayName || user?.email || 'Üye';

  const signOut = () =>
    confirmDestructive({
      title: 'Çıkış yap',
      message: 'Oturumun kapatılacak. Tekrar giriş yapman gerekecek.',
      confirmLabel: 'Çıkış yap',
      // Navigation is handled by AuthRedirect once the listener clears.
      onConfirm: () => void signOutAndForget(),
    });

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: spacing.lg }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="h3" style={{ color: colors.p }}>
            {displayName[0]?.toUpperCase()}
          </Text>
        </View>
        <Text variant="h3">{displayName}</Text>
        {user?.email && displayName !== user.email ? (
          <Text variant="label" tone="sub">
            {user.email}
          </Text>
        ) : null}
        {activeMembership?.status === 'active' && <StatusBadge label={`${tenantName} · Aktif üyelik`} tone="ok" />}
      </Card>

      <RoleSwitcher />

      <Button label="Çıkış yap" variant="ghost" onPress={signOut} />

      <View style={{ marginTop: spacing.md }}>
        <LeaveGymButton />
        <LegalLinks />
        <DeleteAccountButton />
      </View>
    </ScrollView>
  );
}
