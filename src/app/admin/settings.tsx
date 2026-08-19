import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { LegalLinks } from '@/components/LegalLinks';
import { ProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/Text';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { useAuth } from '@/context/AuthContext';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { updateTenantBranding, uploadTenantLogo } from '@/data/firebase/tenantRepo';
import { Tenant, TenantBranding } from '@/data/types';
import { shiftHue } from '@/theme/deriveColor';
import { useAppTheme } from '@/theme/ThemeContext';
import { ThemeMode } from '@/theme/tokens';
import { signOutAndForget } from '@/services/signOut';

const SWATCHES = ['#10B981', '#F97316', '#8B5CF6', '#EF4444', '#0EA5E9'];

/** Branding settings — the white-label magic moment: live preview of what members see. */
export default function AdminSettings() {
  const { activeMembership, activeTenant } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  // Wait for the real tenant doc before mounting the form, so its useState
  // initializers below can seed straight from server data — no effect, no
  // cascading-render lint trip, no flash of stale/default branding.
  if (!activeTenant) {
    return <View style={{ flex: 1 }} />;
  }

  return <AdminSettingsForm tenantId={tenantId} tenant={activeTenant} />;
}

function AdminSettingsForm({ tenantId, tenant }: { tenantId: string; tenant: Tenant }) {
  const router = useRouter();
  const { colors, spacing, radius, mode, setMode, applyTenantBranding } = useAppTheme();
  const { refreshMembership } = useAuth();

  const [appName] = useState(tenant.branding.appName);
  const [primaryColor, setPrimaryColor] = useState(tenant.branding.primaryColor);
  const [logoUri, setLogoUri] = useState<string | undefined>(tenant.branding.logoUrl);
  const [pickedLocalUri, setPickedLocalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const draftBranding = (color: string, themeMode: ThemeMode): TenantBranding => ({
    appName,
    primaryColor: color,
    accentColor: shiftHue(color, 40),
    logoUrl: logoUri,
    themeMode,
  });

  const selectColor = (color: string) => {
    setPrimaryColor(color);
    setSaved(false);
    applyTenantBranding(draftBranding(color, mode));
  };

  const selectMode = (m: ThemeMode) => {
    setMode(m);
    setSaved(false);
    applyTenantBranding(draftBranding(primaryColor, m));
  };

  const pickLogo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedLocalUri(result.assets[0].uri);
      setLogoUri(result.assets[0].uri);
      setSaved(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      let finalLogoUrl = logoUri;
      if (pickedLocalUri) {
        finalLogoUrl = await uploadTenantLogo(tenantId, pickedLocalUri);
      }
      const branding: TenantBranding = {
        appName,
        primaryColor,
        accentColor: shiftHue(primaryColor, 40),
        themeMode: mode,
        ...(finalLogoUrl ? { logoUrl: finalLogoUrl } : {}),
      };
      await updateTenantBranding(tenantId, branding);
      applyTenantBranding(branding);
      setLogoUri(finalLogoUrl);
      setPickedLocalUri(null);
      await refreshMembership();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      <Text variant="h3">Salonunun görünümü</Text>

      <Pressable
        onPress={pickLogo}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: 13,
        }}>
        {logoUri ? (
          <Image source={{ uri: logoUri }} style={{ width: 38, height: 38, borderRadius: 10 }} />
        ) : (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.p,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ color: colors.p, fontSize: 16 }}>↑</Text>
          </View>
        )}
        <View>
          <Text variant="helper" weight="700">
            {logoUri ? 'Logoyu değiştir' : 'Logo yükle'}
          </Text>
          <Text variant="label" tone="sub">
            PNG, kare, min 512px
          </Text>
        </View>
      </Pressable>

      <Text variant="label" tone="sub">
        MARKA RENGİN
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {SWATCHES.map((sw) => (
          <Pressable
            key={sw}
            onPress={() => selectColor(sw)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: sw,
              borderWidth: sw.toLowerCase() === primaryColor.toLowerCase() ? 2 : 0,
              borderColor: colors.bg0,
            }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => selectMode('dark')}
          style={{
            flex: 1,
            backgroundColor: mode === 'dark' ? colors.p : 'transparent',
            borderWidth: mode === 'dark' ? 0 : 1,
            borderColor: colors.line,
            borderRadius: 11,
            paddingVertical: 9,
            alignItems: 'center',
          }}>
          <Text variant="helper" weight="700" tone={mode === 'dark' ? 'onp' : 'sub'}>
            Koyu tema
          </Text>
        </Pressable>
        <Pressable
          onPress={() => selectMode('light')}
          style={{
            flex: 1,
            backgroundColor: mode === 'light' ? colors.p : 'transparent',
            borderWidth: mode === 'light' ? 0 : 1,
            borderColor: colors.line,
            borderRadius: 11,
            paddingVertical: 9,
            alignItems: 'center',
          }}>
          <Text variant="helper" weight="700" tone={mode === 'light' ? 'onp' : 'sub'}>
            Açık tema
          </Text>
        </Pressable>
      </View>

      <Text variant="label" tone="sub">
        CANLI ÖNİZLEME — üyenin göreceği ekran
      </Text>
      <View style={{ backgroundColor: colors.bg0, borderWidth: 1, borderColor: colors.p, borderRadius: radius.lg, padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={{ width: 20, height: 20, borderRadius: 6 }} />
          ) : (
            <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: colors.p }} />
          )}
          <Text variant="label" weight="700">
            {appName}
          </Text>
        </View>
        <View style={{ backgroundColor: colors.surf, borderRadius: 11, padding: 9, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <ProgressRing percent={65} size={34} label="" sublabel="" />
          <View>
            <Text variant="label" weight="700">
              Haftada 3/4 antrenman
            </Text>
            <Text variant="label" tone="sub" style={{ fontSize: 8.5 }}>
              Kalan ders: 12
            </Text>
          </View>
        </View>
        <View style={{ backgroundColor: colors.p, borderRadius: 10, paddingVertical: 8, alignItems: 'center' }}>
          <Text variant="label" weight="900" tone="onp">
            ▦ Üye Kartım
          </Text>
        </View>
      </View>

      <Button
        label={saving ? 'Kaydediliyor…' : saved ? 'Kaydedildi ✓' : 'Kaydet — üyeler yeni görünümü hemen alır'}
        onPress={save}
        disabled={saving}
        critical
      />

      <Pressable onPress={() => router.push('/admin/staff')}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: 13,
          }}>
          <Text style={{ fontSize: 18 }}>👥</Text>
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Ekip ve yetkiler
            </Text>
            <Text variant="label" tone="sub">
              Sen yokken kim üye kabul etsin, kim antrenör olsun
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

      <Pressable onPress={() => router.push('/admin/calendar')}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: 13,
          }}>
          <Text style={{ fontSize: 18 }}>📅</Text>
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Antrenör takvimleri
            </Text>
            <Text variant="label" tone="sub">
              Tüm randevuları gör, gelmeyen antrenörün seansını devret
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

      <Button
        label="Çıkış yap"
        variant="ghost"
        onPress={async () => {
          await signOutAndForget();
          router.replace('/onboarding/register');
        }}
      />

      <RoleSwitcher />

      <LegalLinks />
      <DeleteAccountButton />
    </ScrollView>
  );
}
