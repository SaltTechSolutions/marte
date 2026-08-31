import { useRouter } from 'expo-router';
import React, { useState } from 'react';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { updateMemberDetails } from '@/data/firebase/membershipRepo';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { ageFrom, formatBirthDate, parseBirthDate } from '@/utils/birthDate';

/**
 * The member correcting their own details (MEMBER-2, and the precondition for
 * MEMBER-5's under-18 handling).
 *
 * The sign-up screen has always promised that birth date and photo would be
 * asked for "later"; until now that later never came, so no member who joined
 * through the app had a birth date at all. Only the migrated marte06 records
 * did — which is why nothing age-related could be built on top of it.
 *
 * E-mail is not here: it belongs to the member's Auth account, not to this
 * gym's record of them, and changing it is a re-authentication flow.
 */
export default function MemberEditProfile() {
  const { activeMembership } = useAuth();
  if (!activeMembership) {
    return (
      <AccessGuard
        title="Üyelik gerekli"
        hint="Bilgilerini düzenlemek için bir salona kayıtlı olman gerekiyor."
      />
    );
  }
  return <EditForm membership={activeMembership} />;
}

function EditForm({ membership }: { membership: TenantMembership }) {
  const { colors, spacing } = useAppTheme();
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState(membership.userDisplayName ?? '');
  const [phone, setPhone] = useState(membership.phone ?? '');
  const [birthDate, setBirthDate] = useState(formatBirthDate(membership.birthDate));
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const parsed = parseBirthDate(birthDate);
  // Optional, but a half-typed date must not save silently.
  const birthDateValid = birthDate.trim() === '' || parsed !== null;
  const canSave = trimmedName.length > 0 && birthDateValid && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateMemberDetails(membership.id, {
        userDisplayName: trimmedName,
        phone,
        ...(parsed ? { birthDate: parsed } : {}),
      });
      toast.success('Bilgilerin güncellendi');
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
      {membership.userEmail ? (
        <Text variant="label" tone="sub">
          {membership.userEmail} — e-posta hesabına ait, buradan değiştirilemez.
        </Text>
      ) : null}

      <TextField placeholder="Ad Soyad" value={name} onChangeText={setName} autoCapitalize="words" />
      <TextField placeholder="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextField
        placeholder="Doğum tarihi (1990-05-21)"
        value={birthDate}
        onChangeText={setBirthDate}
        autoCapitalize="none"
        keyboardType="numbers-and-punctuation"
      />
      {!birthDateValid ? (
        <Text variant="helper" style={{ color: colors.danger }}>
          Tarihi yıl-ay-gün olarak yaz: 1990-05-21
        </Text>
      ) : parsed ? (
        // Echoes the parsed date back as an age: the fastest way to notice a
        // typo'd year, which otherwise looks like a perfectly valid date.
        <Text variant="label" tone="sub">
          {ageFrom(parsed)} yaşındasın.
        </Text>
      ) : null}

      <Button label={saving ? '…' : 'Kaydet'} critical disabled={!canSave} onPress={save} />
    </KeyboardAwareScroll>
  );
}
