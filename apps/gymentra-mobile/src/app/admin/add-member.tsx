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
import { MEMBER_ADDRESS_MAX } from '@/data/repo/memberAddressRepo';
import { countActiveMembers, createManagedMember } from '@/data/repo/membershipRepo';
import { canManageGym } from '@/data/membership';
import { canActivateAnotherMember } from '@/data/seats';
import { useAppTheme } from '@/theme/ThemeContext';
import { ageFrom, parseBirthDate } from '@/utils/birthDate';

/**
 * An admin adds a member by hand (14 Oct 2026) — someone who pays at the desk
 * and will never install the app.
 *
 * The row has no account behind it, so it is the gym's own record: the admin
 * can edit it afterwards, which is exactly what is not true of a member who
 * joined with their own account. It takes a seat like any member, so the
 * free-tier limit is checked here for the message and again on the server for
 * the rule. Under-18s are refused on both sides: a minor's membership needs a
 * parent's recorded consent, which only the app's sign-up flow collects.
 */
export default function AddMember() {
  const { colors, spacing } = useAppTheme();
  const router = useRouter();
  const toast = useToast();
  const { activeMembership, activeTenant } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  if (!canManageGym(activeMembership)) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }
  const tenantId = activeMembership!.tenantId;

  const trimmedName = name.trim();
  const parsedBirth = parseBirthDate(birthDate);
  const birthDateValid = birthDate.trim() === '' || parsedBirth !== null;
  const isMinor = parsedBirth !== null && ageFrom(parsedBirth) < 18;
  const emailValid = email.trim() === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSave = trimmedName.length > 0 && birthDateValid && !isMinor && emailValid && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const activeCount = await countActiveMembers(tenantId);
      if (!canActivateAnotherMember(activeTenant, activeCount)) {
        toast.error('Üye limitine ulaştın.');
        router.push('/paywall');
        return;
      }
      const { memberId } = await createManagedMember({
        tenantId,
        name: trimmedName,
        phone,
        email,
        birthDate: parsedBirth,
        address,
      });
      toast.success(`${trimmedName} eklendi`);
      router.replace({ pathname: '/admin/member', params: { memberId, memberName: trimmedName } });
    } catch (e) {
      // The server's refusals (seat limit, under-18) are written for the admin.
      const message = (e as { message?: string }).message;
      reportError(e, toast, message && !message.startsWith('internal') ? message : 'Üye eklenemedi, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScroll
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      <Text variant="h3">Üye ekle</Text>
      <Text variant="label" tone="sub">
        Uygulaması olmayan üyeler için. Bilgilerini sen yönetirsin; üye giriş yapamaz, salona 6 haneli koduyla girer.
      </Text>

      <TextField placeholder="Ad Soyad" value={name} onChangeText={setName} autoCapitalize="words" />
      <TextField placeholder="Telefon" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <TextField
        placeholder="E-posta"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      {!emailValid && (
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
          18 yaşından küçük üyeler elle eklenemez: veli onayı için uygulamadan katılmaları gerekiyor.
        </Text>
      )}
      <TextField
        placeholder="Adres"
        value={address}
        onChangeText={(v) => setAddress(v.slice(0, MEMBER_ADDRESS_MAX))}
        multiline
      />

      <Button label={saving ? '…' : 'Üyeyi ekle'} disabled={!canSave} onPress={save} />
    </KeyboardAwareScroll>
  );
}
