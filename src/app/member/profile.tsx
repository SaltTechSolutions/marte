import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { GymCodeCard } from '@/components/GymCodeCard';
import { GymInfoCard } from '@/components/GymInfoCard';
import { InfoCard } from '@/components/InfoCard';
import { LeaveGymButton } from '@/components/LeaveGymButton';
import { LegalLinks } from '@/components/LegalLinks';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchPendingPackageChangeRequests } from '@/data/firebase/packageChangeRepo';
import { getTenantContact } from '@/data/firebase/tenantRepo';
import { formatBirthDate } from '@/utils/birthDate';
import { PackageChangeRequest, TenantContact } from '@/data/types';
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
  const router = useRouter();
  const { colors, spacing, tenantName } = useAppTheme();
  const { user, activeMembership, activeTenant } = useAuth();
  const displayName = user?.displayName || user?.email || 'Üye';

  const [packageOffers, setPackageOffers] = useState<PackageChangeRequest[]>([]);
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;
  useEffect(() => {
    if (!tenantId || !user) return;
    return watchPendingPackageChangeRequests(tenantId, user.uid, setPackageOffers);
  }, [tenantId, user]);

  // Contact lives in a members-only subdocument, so it needs its own read.
  // Failing quietly is right here: the card simply omits the contact lines
  // rather than the profile screen reporting an error the member cannot act on.
  const [contact, setContact] = useState<TenantContact | undefined>(undefined);
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;
    getTenantContact(tenantId)
      .then((c) => alive && setContact(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tenantId]);

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

      {activeMembership && (
        <InfoCard
          icon="person-outline"
          title="Bilgilerim"
          // A missing birth date is called out rather than left blank: the
          // sign-up screen promised to ask later and never did, so most
          // members have none and have no reason to suspect it is missing.
          subtitle={
            activeMembership.birthDate
              ? `${activeMembership.phone ? `${activeMembership.phone} · ` : ''}${formatBirthDate(activeMembership.birthDate)}`
              : 'Doğum tarihin eksik — eklemek için dokun'
          }
          subtitleTone={activeMembership.birthDate ? 'sub' : 'warn'}
          trailing
          onPress={() => router.push('/member/edit-profile')}
        />
      )}

      {packageOffers.map((offer) => (
        <Pressable key={offer.id} onPress={() => router.push({ pathname: '/member/package-offer', params: { requestId: offer.id } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} outlineColor={colors.p}>
            <Ionicons name="swap-horizontal-outline" size={19} color={colors.p} />
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700">
                Paket teklifin var
              </Text>
              <Text variant="label" tone="sub" numberOfLines={1}>
                {offer.proposedSummary.packageName} — incelemek için dokun
              </Text>
            </View>
            <Text tone="sub">›</Text>
          </Card>
        </Pressable>
      ))}

      {activeTenant && <GymCodeCard tenantName={activeTenant.name} code={activeTenant.code} />}

      {activeTenant && (
        <GymInfoCard hours={activeTenant.openingHours} address={activeTenant.address} contact={contact} />
      )}

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
