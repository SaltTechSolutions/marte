import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { GymCodeCard } from '@/components/GymCodeCard';
import { GymSwitchRow } from '@/components/GymSwitcher';
import { GymInfoCard } from '@/components/GymInfoCard';
import { InfoCard } from '@/components/InfoCard';
import { LeaveGymButton } from '@/components/LeaveGymButton';
import { LegalLinks } from '@/components/LegalLinks';
import { MemberAvatar } from '@/components/MemberAvatar';
import { useToast } from '@/components/Toast';
import { reportError } from '@/data/errors';
import { watchMeasurements } from '@/data/firebase/measurementRepo';
import { deleteMemberPhoto, uploadMemberPhoto } from '@/data/firebase/memberPhotoRepo';
import * as ImagePicker from 'expo-image-picker';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { updateMemberDetails, watchMyChildren } from '@/data/firebase/membershipRepo';
import { watchPendingPackageChangeRequests } from '@/data/firebase/packageChangeRepo';
import { getTenantContact } from '@/data/firebase/tenantRepo';
import { formatBirthDate } from '@/utils/birthDate';
import { MeasurementEntry, PackageChangeRequest, TenantContact, TenantMembership } from '@/data/types';
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
  const { user, activeMembership, activeTenant, refreshMembership } = useAuth();
  const displayName = user?.displayName || user?.email || 'Üye';
  const toast = useToast();
  const [photoBusy, setPhotoBusy] = useState(false);
  const [entries, setEntries] = useState<MeasurementEntry[]>([]);
  const latestWeight = entries[0]?.weightKg ?? null;
  const bmi =
    latestWeight && activeMembership?.heightCm
      ? (latestWeight / Math.pow(activeMembership.heightCm / 100, 2)).toFixed(1)
      : null;

  useEffect(() => {
    if (!user || activeMembership?.status !== 'active') return;
    return watchMeasurements(activeMembership.tenantId, user.uid, setEntries);
  }, [user, activeMembership]);

  const pickPhoto = async () => {
    if (!activeMembership) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    try {
      const url = await uploadMemberPhoto(res.assets[0].uri);
      await updateMemberDetails(activeMembership.id, { photoUrl: url });
      await refreshMembership();
    } catch (e) {
      reportError(e, toast, 'Fotoğraf yüklenemedi, tekrar dene.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = async () => {
    if (!activeMembership) return;
    setPhotoBusy(true);
    try {
      await deleteMemberPhoto();
      await updateMemberDetails(activeMembership.id, { photoUrl: null });
      await refreshMembership();
    } catch (e) {
      reportError(e, toast, 'Fotoğraf kaldırılamadı, tekrar dene.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const [packageOffers, setPackageOffers] = useState<PackageChangeRequest[]>([]);
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;
  useEffect(() => {
    if (!tenantId || !user) return;
    return watchPendingPackageChangeRequests(tenantId, user.uid, setPackageOffers);
  }, [tenantId, user]);

  // Children linked to this member. The entry point only appears when there
  // are any: a parent link is uncommon, and a permanently visible "Ebeveyn
  // onayı" row would be a dead end for almost everyone.
  const [children, setChildren] = useState<TenantMembership[]>([]);
  useEffect(() => {
    if (!tenantId || !user) return;
    return watchMyChildren(tenantId, user.uid, setChildren);
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

  const pendingChildCount = children.filter((c) => c.guardianStatus === 'pending').length;

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
        <MemberAvatar name={displayName} photoUrl={activeMembership?.photoUrl} size={72} />
        <Text variant="h3">{displayName}</Text>
        {activeMembership ? (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Pressable onPress={pickPhoto} disabled={photoBusy} hitSlop={8} accessibilityRole="button">
              <Text variant="label" weight="700" style={{ color: colors.p }}>
                {photoBusy ? '…' : activeMembership.photoUrl ? 'Fotoğrafı değiştir' : 'Fotoğraf ekle'}
              </Text>
            </Pressable>
            {activeMembership.photoUrl ? (
              <Pressable onPress={removePhoto} disabled={photoBusy} hitSlop={8} accessibilityRole="button">
                <Text variant="label" weight="700" tone="sub">
                  Kaldır
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {user?.email && displayName !== user.email ? (
          <Text variant="label" tone="sub">
            {user.email}
          </Text>
        ) : null}
        {activeMembership?.status === 'active' && <StatusBadge label={`${tenantName} · Aktif üyelik`} tone="ok" />}
      </Card>

      {pendingChildCount > 0 || children.length > 0 ? (
        <InfoCard
          icon="people-outline"
          outlined={pendingChildCount > 0}
          title={pendingChildCount > 0 ? 'Ebeveyn onayı bekleniyor' : 'Bağlı çocuklarım'}
          subtitle={
            pendingChildCount > 0
              ? `${pendingChildCount} istek senin onayını bekliyor`
              : `${children.length} çocuk sana bağlı`
          }
          subtitleTone={pendingChildCount > 0 ? 'warn' : 'sub'}
          trailing
          onPress={() => router.push('/member/guardian-requests')}
        />
      ) : null}

      {activeMembership && (
        <InfoCard
          icon="person-outline"
          title="Bilgilerim"
          // A missing birth date is called out rather than left blank: the
          // sign-up screen promised to ask later and never did, so most
          // members have none and have no reason to suspect it is missing.
          subtitle={
            activeMembership.birthDate
              ? [
                  activeMembership.phone,
                  formatBirthDate(activeMembership.birthDate),
                  activeMembership.heightCm ? `${activeMembership.heightCm} cm` : null,
                  latestWeight ? `${latestWeight} kg` : null,
                  // BMI from profile height + latest weigh-in — the two facts the
                  // app already holds, never a second weight field.
                  bmi ? `VKİ ${bmi}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
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
      <GymSwitchRow />

      {activeTenant && (
        <GymInfoCard hours={activeTenant.openingHours} address={activeTenant.address} contact={contact} />
      )}

      <RoleSwitcher />

      <Button label="Çıkış yap" variant="ghost" onPress={signOut} />

      <View style={{ marginTop: spacing.md }}>
        <LeaveGymButton />
        <NotificationPreferences />
        <LegalLinks />
        <DeleteAccountButton />
      </View>
    </ScrollView>
  );
}
