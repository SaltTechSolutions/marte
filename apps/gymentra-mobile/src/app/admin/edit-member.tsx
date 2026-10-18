import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { AvatarPicker } from '@/components/AvatarPicker';
import { Button } from '@/components/Button';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { getMemberAddress, MEMBER_ADDRESS_MAX, setMemberAddress } from '@/data/repo/memberAddressRepo';
import { getMembershipById, updateMemberDetails } from '@/data/repo/membershipRepo';
import { FEATURES } from '@/data/features';
import { canManageGym } from '@/data/membership';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { ageFrom, formatBirthDate, parseBirthDate } from '@/utils/birthDate';

/**
 * Editing the details of a member the admin ADDED BY HAND (`managed`).
 *
 * Until 14 Oct 2026 this screen opened for every member, to fix names that
 * arrive wrong from the member's own sign-up or the marte06 migration (WEB-6).
 * It is now only for members the gym itself created: someone with their own
 * account owns their details and the rules refuse the write, so the screen says
 * so instead of letting an admin fill in a form that cannot save. Role and
 * status changes live on their own screens, where they get their own guards.
 */
export default function EditMember() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { colors, spacing } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const { activeMembership, user } = useAuth();

  const [membership, setMembership] = useState<TenantMembership | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  // What was stored when the form opened: a blank field is only a deletion if
  // there was something to delete, and deleting a missing document is refused.
  const [storedAddress, setStoredAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!membershipId) return;
    getMembershipById(membershipId).then((m) => {
      setMembership(m);
      if (m) {
        setName(m.userDisplayName ?? '');
        setPhone(m.phone ?? '');
        setEmail(m.userEmail ?? '');
        setBirthDate(formatBirthDate(m.birthDate));
        setAvatarId(m.avatarId ?? null);
        if (FEATURES.managedMembers) {
          getMemberAddress(m.tenantId, m.userId)
            .then((a) => {
              setAddress(a?.address ?? '');
              setStoredAddress(a?.address ?? '');
            })
            .catch(() => {});
        }
      }
    });
  }, [membershipId]);

  if (!canManageGym(activeMembership)) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  if (membership === undefined) {
    return (
      <View style={{ padding: spacing.md }}>
        <ListSkeleton rows={3} avatar={false} />
      </View>
    );
  }

  if (membership === null) {
    return <AccessGuard title="Üye bulunamadı" />;
  }

  if (FEATURES.managedMembers && !membership.managed) {
    return <AccessGuard title="Bu üye kendi hesabıyla katıldı: bilgilerini yalnızca kendisi düzenleyebilir" />;
  }

  const trimmedName = name.trim();
  // The date is optional, but a half-typed one must not save silently.
  const parsedBirth = parseBirthDate(birthDate);
  const birthDateValid = birthDate.trim() === '' || parsedBirth !== null;
  // The gym cannot write a minor's membership: a parent's recorded consent is
  // part of joining, and a row the gym edits itself skips it.
  const isMinor = FEATURES.managedMembers && parsedBirth !== null && ageFrom(parsedBirth) < 18;
  const emailValid = email.trim() === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSave = trimmedName.length > 0 && birthDateValid && !isMinor && emailValid && !saving;
  const showAvatar = FEATURES.avatars && membership.managed === true;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const parsed = parseBirthDate(birthDate);
      await updateMemberDetails(membershipId, {
        userDisplayName: trimmedName,
        phone,
        // The deployed rules do not let an admin write e-mail yet.
        ...(FEATURES.managedMembers ? { userEmail: email } : {}),
        ...(parsed ? { birthDate: parsed } : {}),
        // Only a hand-added member's avatar is the gym's to set; only sent when changed.
        ...(showAvatar && avatarId !== (membership.avatarId ?? null) ? { avatarId } : {}),
      });
      const nextAddress = address.trim();
      if (FEATURES.managedMembers && user && nextAddress !== storedAddress.trim()) {
        await setMemberAddress({ tenantId: membership.tenantId, memberId: membership.userId, address: nextAddress, updatedBy: user.uid });
      }
      toast.success('Bilgiler güncellendi');
      router.back();
    } catch (e) {
      reportError(e, toast, 'Güncellenemedi, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScroll
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      <Text variant="h3">Üye bilgilerini düzenle</Text>

      {FEATURES.managedMembers ? (
        <Text variant="label" tone="sub">
          Bu üyeyi sen ekledin, bilgilerini sen yönetirsin.
        </Text>
      ) : membership.userEmail ? (
        <Text variant="label" tone="sub">
          {membership.userEmail} — e-posta üyenin kendi hesabına ait, buradan değiştirilemez.
        </Text>
      ) : null}

      <TextField placeholder="Ad Soyad" value={name} onChangeText={setName} autoCapitalize="words" />
      <TextField placeholder="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      {FEATURES.managedMembers && (
        <TextField
          placeholder="E-posta"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
      )}
      {FEATURES.managedMembers && !emailValid && (
        <Text variant="helper" style={{ color: colors.danger }}>
          E-posta adresi geçersiz görünüyor.
        </Text>
      )}
      <TextField
        placeholder="Doğum tarihi (1990-05-21)"
        value={birthDate}
        onChangeText={setBirthDate}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
      {!birthDateValid && (
        <Text variant="helper" style={{ color: colors.danger }}>
          Tarihi yıl-ay-gün olarak yaz: 1990-05-21
        </Text>
      )}
      {isMinor && (
        <Text variant="helper" style={{ color: colors.danger }}>
          18 yaşından küçük üyeler elle yönetilemez: veli onayı için uygulamadan katılmaları gerekiyor.
        </Text>
      )}
      {FEATURES.managedMembers && (
        <TextField
          placeholder="Adres"
          value={address}
          onChangeText={(v) => setAddress(v.slice(0, MEMBER_ADDRESS_MAX))}
          multiline
        />
      )}

      {showAvatar ? (
        <>
          <Text variant="label" tone="sub">
            AVATAR
          </Text>
          <AvatarPicker value={avatarId} onChange={setAvatarId} disabled={saving} />
        </>
      ) : null}

      <Button label={saving ? '…' : 'Kaydet'} critical disabled={!canSave} onPress={save} />
    </KeyboardAwareScroll>
  );
}
