import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { requestJoin } from '@/data/firebase/membershipRepo';
import { findTenantByCode } from '@/data/firebase/tenantRepo';
import { Tenant } from '@/data/types';
import { auth } from '@/services/firebase';
import { useAppTheme } from '@/theme/ThemeContext';
import { signOutAndForget } from '@/services/signOut';

/** Onboarding 2/4 — zero-typing goal: scan the front-desk QR, or type the gym code. */
export default function GymCodeScreen() {
  const router = useRouter();
  const { colors, spacing, radius, applyTenantBranding } = useAppTheme();
  const [code, setCode] = useState('');
  const [found, setFound] = useState<Tenant | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!code.trim()) return;
    setSearching(true);
    setError(null);
    setFound(null);
    try {
      const tenant = await findTenantByCode(code);
      if (!tenant) {
        setError('Geçersiz salon kodu. Lütfen kodunuzu kontrol ediniz.');
      } else {
        setFound(tenant);
        // Live preview of the real gym's actual colors, derived the same
        // way the app will re-skin itself once membership is active.
        applyTenantBranding(tenant.branding);
      }
    } catch {
      setError('Salon aranırken bir hata oluştu.');
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!found || !auth.currentUser) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestJoin({
        tenantId: found.id,
        tenantCode: found.code,
        tenantName: found.name,
        userId: auth.currentUser.uid,
        userDisplayName: auth.currentUser.displayName,
        userEmail: auth.currentUser.email,
      });
      router.push({
        pathname: '/onboarding/pending',
        params: { tenantId: found.id, tenantName: found.name },
      });
    } catch {
      setError('İstek gönderilirken bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: 44, gap: spacing.md }}>
        <Text variant="h2">Salonuna katıl</Text>
        <Text variant="helper" tone="sub">
          Resepsiyondaki QR&rsquo;ı okut ya da salon kodunu gir.
        </Text>

        <Pressable
          style={{
            height: 120,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: colors.p,
            borderRadius: radius.lg,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: 0.5,
          }}>
          <Text style={{ fontSize: 26, color: colors.p }}>⌗</Text>
          <Text variant="helper" weight="700" style={{ color: colors.p }}>
            QR kodu tara (yakında)
          </Text>
        </Pressable>

        <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
          — veya —
        </Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextField
            placeholder="Salon kodu (ör. TARABYA-01)"
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase());
              setFound(null);
            }}
            autoCapitalize="characters"
            style={{ flex: 1 }}
          />
          <Button label={searching ? '…' : 'Ara'} onPress={search} disabled={searching || !code.trim()} compact />
        </View>

        {error && (
          <Text variant="helper" style={{ color: '#F87171' }}>
            {error}
          </Text>
        )}

        {found && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: colors.surf,
              borderWidth: 1,
              borderColor: colors.p,
              borderRadius: radius.md,
              padding: 11,
            }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: colors.p,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text tone="onp" weight="900" variant="helper">
                {found.name[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700">
                {found.name}
              </Text>
              <Text variant="label" tone="sub">
                {found.address ?? found.code}
              </Text>
            </View>
            <Text style={{ color: colors.ok, fontSize: 14 }}>✓</Text>
          </View>
        )}

        <View style={{ flex: 1 }} />
        <Button
          label={submitting ? 'Gönderiliyor…' : 'Katılım isteği gönder'}
          critical
          disabled={!found || submitting}
          onPress={submit}
        />
        <Button
          label="Salonun yok mu? Sen oluştur"
          variant="secondary"
          onPress={() => router.push('/onboarding/create-gym')}
        />
        <Button
          label="Çıkış yap"
          variant="ghost"
          style={{ marginBottom: spacing.lg }}
          onPress={async () => {
            await signOutAndForget();
            router.replace('/onboarding/register');
          }}
        />
      </View>
    </Screen>
  );
}
