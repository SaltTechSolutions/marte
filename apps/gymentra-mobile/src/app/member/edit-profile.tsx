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
import { requestGuardian, updateMemberDetails } from '@/data/firebase/membershipRepo';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { ageFrom, formatBirthDate, parseBirthDate } from '@/utils/birthDate';
import { Card } from '@/components/Card';

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
  const [height, setHeight] = useState(membership.heightCm ? String(membership.heightCm) : '');
  const [saving, setSaving] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState('');
  const [linking, setLinking] = useState(false);

  const trimmedName = name.trim();
  const parsed = parseBirthDate(birthDate);
  // Optional, but a half-typed date must not save silently.
  const birthDateValid = birthDate.trim() === '' || parsed !== null;
  const heightNum = height.trim() === '' ? null : Number(height.replace(',', '.'));
  // The rule accepts 100–250; anything else is a typo, not a person.
  const heightValid = heightNum === null || (Number.isFinite(heightNum) && heightNum >= 100 && heightNum <= 250);
  const canSave = trimmedName.length > 0 && birthDateValid && heightValid && !saving;

  // Derived from what is SAVED, not from the field being typed into.
  const isMinor = !!membership.birthDate && ageFrom(membership.birthDate) < 18;
  const needsGuardian = isMinor && membership.guardianStatus !== 'approved';

  const linkGuardian = async () => {
    if (linking) return;
    setLinking(true);
    try {
      const name = await requestGuardian(membership.tenantId, guardianEmail);
      toast.success(`${name} onaya davet edildi`);
      setGuardianEmail('');
    } catch (e) {
      // The callable's own message is the useful one here — "no active member
      // with that e-mail" tells the child exactly what to do next, where a
      // generic failure would not.
      const message = (e as { message?: string }).message;
      reportError(e, toast, message || 'İstek gönderilemedi, tekrar dene.');
    } finally {
      setLinking(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateMemberDetails(membership.id, {
        userDisplayName: trimmedName,
        phone,
        ...(parsed ? { birthDate: parsed } : {}),
        heightCm: heightNum === null ? null : Math.round(heightNum),
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
      <TextField placeholder="Boy (cm) — örn. 176" value={height} onChangeText={setHeight} keyboardType="number-pad" />
      {!heightValid ? (
        <Text variant="helper" style={{ color: colors.danger }}>
          Boyu santimetre olarak yaz: 100 ile 250 arası.
        </Text>
      ) : null}
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

      {/* Only once the birth date is SAVED, not merely typed: the guardian
          flow writes to the server, and offering it against an unsaved date
          would let someone link a parent to a record that still says nothing
          about their age. */}
      {isMinor && (
        <Card style={{ gap: spacing.sm }} outlineColor={needsGuardian ? colors.warn : undefined}>
          <Text variant="label" tone="sub">
            EBEVEYN ONAYI
          </Text>
          {membership.guardianStatus === 'approved' ? (
            <Text variant="helper">
              {membership.guardianName} onayladı. Senin adına ödeme yapabilir ve randevu alabilir.
            </Text>
          ) : membership.guardianStatus === 'pending' ? (
            <Text variant="helper" tone="sub">
              {membership.guardianName} onayı bekleniyor. Onaylayana kadar salon üyeliğin
              başlatılamaz.
            </Text>
          ) : (
            <>
              <Text variant="helper" tone="sub">
                18 yaşından küçüksün, bu yüzden bir ebeveyninin onayı gerekiyor. Ebeveynin
                salona zaten üye olmalı — e-postasını yaz.
              </Text>
              {membership.guardianStatus === 'rejected' && (
                <Text variant="label" style={{ color: colors.warn }}>
                  Önceki isteğin onaylanmadı. Başka bir ebeveyn seçebilirsin.
                </Text>
              )}
              <TextField
                placeholder="ebeveyn@ornek.com"
                value={guardianEmail}
                onChangeText={setGuardianEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Button
                label={linking ? '…' : 'Onay isteği gönder'}
                disabled={!guardianEmail.trim() || linking}
                onPress={linkGuardian}
              />
            </>
          )}
        </Card>
      )}
    </KeyboardAwareScroll>
  );
}
