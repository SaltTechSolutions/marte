import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { LegalLinks } from '@/components/LegalLinks';
import { QRCode } from '@/components/QRCode';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { LeaveGymButton } from '@/components/LeaveGymButton';
import { useAuth } from '@/context/AuthContext';
import { membershipId } from '@/data/firebase/membershipRepo';
import { useAppTheme } from '@/theme/ThemeContext';
import { signOutAndForget } from '@/services/signOut';

/**
 * Member QR card — renders from cache and must work offline (front-desk
 * wifi is unreliable). Friction budget: ≤5s from app-open to scan-ready.
 * QR payload is the tenant_membership doc id — the same value front-desk
 * scanning looks up directly, no extra encoding scheme needed.
 */
export default function MemberCard() {
  const router = useRouter();
  const { colors, spacing, tenantName } = useAppTheme();
  const { user, activeMembership, membershipFromCache } = useAuth();
  const qrValue = user && activeMembership ? membershipId(activeMembership.tenantId, user.uid) : 'pending';
  const displayName = user?.displayName || user?.email || 'Üye';

  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: spacing.lg }}>
      {membershipFromCache && (
        <View style={{ alignSelf: 'stretch', alignItems: 'flex-end', paddingTop: 4 }}>
          <Text variant="label" style={{ color: colors.warn }}>
            ✈ çevrimdışı — kayıtlı kartın
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: membershipFromCache ? 12 : 26 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" tone="onp" weight="900">
            {tenantName[0]}
          </Text>
        </View>
        <Text variant="h3">{tenantName}</Text>
      </View>

      <View style={{ marginTop: 22 }}>
        <QRCode value={qrValue} />
      </View>

      {activeMembership?.shortCode && (
        <View style={{ marginTop: 14, alignItems: 'center' }}>
          <Text variant="label" tone="sub">
            KAMERA ÇALIŞMIYORSA BU KODU SÖYLE
          </Text>
          <Text variant="h2" weight="900" style={{ letterSpacing: 6, marginTop: 2 }}>
            {activeMembership.shortCode.replace(/(\d{3})(\d{3})/, '$1 $2')}
          </Text>
        </View>
      )}

      <Text variant="h2" style={{ marginTop: 16 }}>
        {displayName}
      </Text>
      <View style={{ marginTop: 4 }}>
        <StatusBadge label="Aktif üyelik" tone="ok" />
      </View>

      <View style={{ flex: 1 }} />
      <Button
        label="Çıkış yap"
        variant="ghost"
        style={{ alignSelf: 'stretch' }}
        onPress={async () => {
          await signOutAndForget();
          router.replace('/onboarding/register');
        }}
      />
      <View style={{ alignSelf: 'stretch' }}>
        <RoleSwitcher />
      </View>
      <View style={{ marginBottom: spacing.md }}>
        <LeaveGymButton />
        <LegalLinks />
        <DeleteAccountButton />
      </View>
    </View>
  );
}
