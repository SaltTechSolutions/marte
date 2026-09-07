import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { FormScreen } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { createTenantWithOwner, updateTenantBranding, uploadTenantLogo } from '@/data/firebase/tenantRepo';
import { auth } from '@/services/firebase';
import { onColorFor } from '@/theme/contrast';
import { useAppTheme } from '@/theme/ThemeContext';
import { shiftHue } from '@/theme/deriveColor';

const SWATCHES = ['#10B981', '#F97316', '#8B5CF6', '#EF4444', '#0EA5E9', '#EC4899'];

function suggestCode(name: string) {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Math.floor(10 + Math.random() * 90);
  return slug ? `${slug}-${suffix}` : '';
}

/** Gym owner onboarding — self-service tenant creation (white-label entry point). */
export default function CreateGymScreen() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { refreshMembership } = useAuth();
  const toast = useToast();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held locally until the gym exists: the upload callable authorises by
  // membership, and the creator only becomes an admin once the tenant and
  // their membership are written.
  const [logoUri, setLogoUri] = useState<string | null>(null);

  const pickLogo = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!res.canceled && res.assets[0]) setLogoUri(res.assets[0].uri);
  };

  const onNameChange = (v: string) => {
    setName(v);
    setCode(suggestCode(v));
  };

  const submit = async () => {
    if (!auth.currentUser || !name.trim() || !code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const branding = {
        appName: name.trim(),
        primaryColor: color,
        accentColor: shiftHue(color, 40),
        themeMode: 'dark' as const,
      };
      const tenant = await createTenantWithOwner({
        name: name.trim(),
        code,
        branding,
        ownerUid: auth.currentUser.uid,
      });
      // The gym exists now. The logo is an extra on top of it, never a
      // condition for it: a failed upload must not turn a created gym into
      // an error screen, so it is caught here and the owner is told to try
      // again from settings.
      if (logoUri) {
        try {
          const logoUrl = await uploadTenantLogo(tenant.id, logoUri);
          await updateTenantBranding(tenant.id, { ...branding, logoUrl });
        } catch {
          toast.show({
            message: 'Salon kuruldu, logo yüklenemedi — Salon ayarlarından tekrar dene.',
            tone: 'info',
          });
        }
      }
      await refreshMembership();
      router.replace('/admin');
    } catch (e) {
      const message = (e as { message?: string }).message;
      setError(message === 'CODE_TAKEN' ? 'Bu salon kodu zaten kullanılıyor. Başka bir kod deneyin.' : 'Salon oluşturulurken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormScreen contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 44, gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.md }}>
        <Text variant="h2">Salonunu oluştur</Text>
        <Text variant="helper" tone="sub">
          Kendi salonunun GymEntra sayfasını aç — üyelerin bu kodla katılsın.
        </Text>

        <TextField placeholder="Salon adı" value={name} onChangeText={onNameChange} autoCapitalize="words" />
        <TextField
          placeholder="Salon kodu (ör. OLYMPUS-84)"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          autoCapitalize="characters"
        />

        <Text variant="label" tone="sub">
          MARKA RENGİN
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {SWATCHES.map((sw) => (
            <Pressable
              key={sw}
              onPress={() => setColor(sw)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: sw,
                borderWidth: color === sw ? 2 : 0,
                borderColor: colors.bg0,
                shadowColor: sw,
              }}
            />
          ))}
        </View>

        <Pressable
          onPress={pickLogo}
          accessibilityRole="button"
          accessibilityLabel={logoUri ? 'Logoyu değiştir' : 'Logo seç'}
          style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={{ width: 38, height: 38, borderRadius: 10 }} />
          ) : (
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="helper" weight="900" style={{ color: onColorFor(color) }}>
                {name.trim()[0]?.toUpperCase() ?? 'G'}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              {logoUri ? 'Logoyu değiştir' : 'Logo seç'}
            </Text>
            <Text variant="label" tone="sub">
              {logoUri ? 'Üyelerin göreceği işaret bu.' : 'İstersen sonra Salon ayarlarından da yükleyebilirsin.'}
            </Text>
          </View>
        </Pressable>

        {error && (
          <Text variant="helper" style={{ color: '#F87171' }}>
            {error}
          </Text>
        )}

        <View style={{ flex: 1 }} />
        <Button
          label={submitting ? 'Oluşturuluyor…' : 'Salonu oluştur'}
          critical
          disabled={!name.trim() || !code.trim() || submitting}
          onPress={submit}
          style={{ marginBottom: spacing.lg }}
        />
      </View>
    </FormScreen>
  );
}
