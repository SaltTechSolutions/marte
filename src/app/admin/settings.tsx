import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { GymCodeCard } from '@/components/GymCodeCard';
import { Button } from '@/components/Button';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { LegalLinks } from '@/components/LegalLinks';
import { ProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { useAuth } from '@/context/AuthContext';
import { canManageGym, tenantIdIf } from '@/data/membership';
import {
  getTenantContact,
  updateTenantBranding,
  updateTenantContact,
  updateTenantIdentity,
  uploadTenantLogo,
} from '@/data/firebase/tenantRepo';
import { Tenant, TenantBranding } from '@/data/types';
import { reportError } from '@/data/errors';
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
  const toast = useToast();
  const { refreshMembership } = useAuth();

  // The gym's own name, not just its branding label — one field drives both.
  // It used to be read-only (`const [appName] = useState`), so the name shown
  // to every member could not be changed from anywhere in the app.
  const [name, setName] = useState(tenant.branding.appName || tenant.name);
  const [address, setAddress] = useState(tenant.address ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [primaryColor, setPrimaryColor] = useState(tenant.branding.primaryColor);
  const [logoUri, setLogoUri] = useState<string | undefined>(tenant.branding.logoUrl);
  const [pickedLocalUri, setPickedLocalUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [contactUnavailable, setContactUnavailable] = useState(false);

  // Contact lives in a members-only subdocument, so it is a separate read.
  // Loading (not deriving) state: there is nothing on screen to compute it
  // from — it has to come back from Firestore before the fields can show it.
  useEffect(() => {
    let alive = true;
    getTenantContact(tenantId)
      .then((c) => {
        if (!alive) return;
        setPhone(c.phone ?? '');
        setEmail(c.email ?? '');
      })
      .catch(() => {
        // A failed read must not blank out a saved number: leaving the fields
        // empty and then saving would wipe the contact details.
        if (alive) setContactUnavailable(true);
      });
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const draftBranding = (color: string, themeMode: ThemeMode): TenantBranding => ({
    appName: name,
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

  const trimmedName = name.trim();

  /** Any edit invalidates the "Kaydedildi ✓" label — otherwise the button
   *  claims the change is saved while it is still only in the field. */
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSaved(false);
  };

  const save = async () => {
    if (saving || !trimmedName) return;
    setSaving(true);
    try {
      let finalLogoUrl = logoUri;
      if (pickedLocalUri) {
        finalLogoUrl = await uploadTenantLogo(tenantId, pickedLocalUri);
      }
      const branding: TenantBranding = {
        appName: trimmedName,
        primaryColor,
        accentColor: shiftHue(primaryColor, 40),
        themeMode: mode,
        ...(finalLogoUrl ? { logoUrl: finalLogoUrl } : {}),
      };
      await updateTenantBranding(tenantId, branding);
      // The gym doc carries the name members join by and the roster shows;
      // branding.appName alone would rename the header and nothing else.
      await updateTenantIdentity(tenantId, { name: trimmedName, address });
      // Skipped when the read failed — writing the empty fields would erase
      // details we never managed to show.
      if (!contactUnavailable) {
        await updateTenantContact(tenantId, { phone, email });
      }
      applyTenantBranding(branding);
      setLogoUri(finalLogoUrl);
      setPickedLocalUri(null);
      await refreshMembership();
      setSaved(true);
    } catch (e) {
      // Without this the admin taps Kaydet, the spinner stops, and nothing
      // says the save never happened.
      reportError(e, toast, 'Kaydedilemedi, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      <GymCodeCard tenantName={tenant.name} code={tenant.code} showQrAction />

      <Text variant="h3">Salon bilgileri</Text>

      <Text variant="label" tone="sub">
        SALON ADI
      </Text>
      <TextField placeholder="Salonun adı" value={name} onChangeText={edit(setName)} />

      <Text variant="label" tone="sub">
        ADRES
      </Text>
      <TextField placeholder="Sokak, mahalle, ilçe" value={address} onChangeText={edit(setAddress)} multiline />

      <Text variant="label" tone="sub">
        TELEFON
      </Text>
      <TextField placeholder="0212 000 00 00" value={phone} onChangeText={edit(setPhone)} keyboardType="phone-pad" />

      <Text variant="label" tone="sub">
        E-POSTA
      </Text>
      <TextField
        placeholder="salon@ornek.com"
        value={email}
        onChangeText={edit(setEmail)}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Text variant="label" tone="sub">
        {contactUnavailable
          ? 'İletişim bilgileri okunamadı — kaydetsen de telefon ve e-posta değişmeyecek.'
          : 'Telefon ve e-posta yalnızca salon üyelerine görünür.'}
      </Text>

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
            {name}
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
        disabled={saving || !trimmedName}
        critical
      />

      <Pressable onPress={() => router.push('/admin/hours')}>
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
          <Ionicons name="time-outline" size={18} color={colors.txt} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Çalışma saatleri
            </Text>
            <Text variant="label" tone="sub">
              Üyeler görür; antrenörler bu saatler içinde randevu açar
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

      <Pressable onPress={() => router.push('/admin/packages')}>
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
          <Ionicons name="pricetags-outline" size={18} color={colors.txt} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Paketler
            </Text>
            <Text variant="label" tone="sub">
              Sattığın üyelikleri ve ders paketlerini tanımla
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

      <Pressable onPress={() => router.push('/admin/promotions')}>
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
          <Ionicons name="megaphone-outline" size={18} color={colors.txt} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Promosyonlar
            </Text>
            <Text variant="label" tone="sub">
              Sınırlı süreli kampanyalar — indirim, hediye ay veya ders
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

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
          <Ionicons name="people-outline" size={18} color={colors.txt} />
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
          <Ionicons name="calendar-outline" size={18} color={colors.txt} />
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
