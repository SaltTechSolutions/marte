import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { getMembershipById, updateMemberDetails } from '@/data/firebase/membershipRepo';
import { canManageGym } from '@/data/membership';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/** `1990-05-21` in, Date out — null for anything that isn't a real date, so a
 *  half-typed value never silently becomes 1 Jan 1970. */
function parseBirthDate(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatBirthDate(d?: Date): string {
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Correcting a member's details.
 *
 * Names arrive from the member's own sign-up or the marte06 migration and are
 * routinely wrong, abbreviated, or several people in one field (see WEB-6).
 * Only the three fields rules allow an admin to touch are here — role and
 * status changes live on their own screens, where they get their own guards.
 */
export default function EditMember() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { spacing } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const { activeMembership } = useAuth();

  const [membership, setMembership] = useState<TenantMembership | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!membershipId) return;
    getMembershipById(membershipId).then((m) => {
      setMembership(m);
      if (m) {
        setName(m.userDisplayName ?? '');
        setPhone(m.phone ?? '');
        setBirthDate(formatBirthDate(m.birthDate));
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

  const trimmedName = name.trim();
  // The date is optional, but a half-typed one must not save silently.
  const birthDateValid = birthDate.trim() === '' || parseBirthDate(birthDate) !== null;
  const canSave = trimmedName.length > 0 && birthDateValid && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const parsed = parseBirthDate(birthDate);
      await updateMemberDetails(membershipId, {
        userDisplayName: trimmedName,
        phone,
        ...(parsed ? { birthDate: parsed } : {}),
      });
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

      {membership.userEmail ? (
        <Text variant="label" tone="sub">
          {membership.userEmail} — e-posta üyenin kendi hesabına ait, buradan değiştirilemez.
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
      {!birthDateValid && (
        <Text variant="helper" style={{ color: '#F87171' }}>
          Tarihi yıl-ay-gün olarak yaz: 1990-05-21
        </Text>
      )}

      <Button label={saving ? '…' : 'Kaydet'} critical disabled={!canSave} onPress={save} />
    </KeyboardAwareScroll>
  );
}
