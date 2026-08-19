import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { createTenantWithOwner } from '@/data/firebase/tenantRepo';
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

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onNameChange = (v: string) => {
    setName(v);
    setCode(suggestCode(v));
  };

  const submit = async () => {
    if (!auth.currentUser || !name.trim() || !code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTenantWithOwner({
        name: name.trim(),
        code,
        branding: {
          appName: name.trim(),
          primaryColor: color,
          accentColor: shiftHue(color, 40),
          themeMode: 'dark',
        },
        ownerUid: auth.currentUser.uid,
      });
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
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: 44, gap: spacing.md }}>
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

        <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="helper" weight="900" style={{ color: onColorFor(color) }}>
              {name.trim()[0]?.toUpperCase() ?? 'G'}
            </Text>
          </View>
          <Text variant="helper" tone="sub" style={{ flex: 1 }}>
            Üyelerin göreceği önizleme — logo yükleme sonra
          </Text>
        </View>

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
    </Screen>
  );
}
