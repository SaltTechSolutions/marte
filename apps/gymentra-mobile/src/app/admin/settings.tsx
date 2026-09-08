import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { GymCodeCard } from '@/components/GymCodeCard';
import { GymSwitchRow } from '@/components/GymSwitcher';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { LegalLinks } from '@/components/LegalLinks';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { ProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { useAuth } from '@/context/AuthContext';
import { EXERCISES } from '@/data/exerciseLibrary';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { FREE_MEMBER_LIMIT } from '@/data/seats';
import {
  getTenantContact,
  updateTenantBranding,
  updateTenantContact,
  updateTenantCancellationHours,
  updateTenantIdentity,
  uploadTenantLogo,
} from '@/data/firebase/tenantRepo';
import { DEFAULT_CANCELLATION_HOURS, Tenant, TenantBranding } from '@/data/types';
import { reportError } from '@/data/errors';
import { shiftHue } from '@/theme/deriveColor';
import { useAppTheme } from '@/theme/ThemeContext';
import { ThemeMode } from '@/theme/tokens';
import { signOutAndForget } from '@/services/signOut';

/**
 * Marka rengi seçenekleri, tayf sırasıyla — satır bir renk çemberi gibi
 * okunsun diye hue'ya göre dizildi, popülerliğe göre değil.
 *
 * Hepsi güvenli: `onColorFor` ana rengin üstündeki metni iki mürekkepten
 * kontrastı yüksek olanı seçerek belirliyor ve açık temada `derivePalette`
 * ana rengi l≤0.42'ye indiriyor, bu yüzden sarı ve limon da beyaz zeminde
 * okunur kalıyor.
 */
/** Salonların gerçekte kullandığı eşikler. Ara değerler bir politika değil,
 *  ince ayar; kimse iptal süresini 19 saat yapmıyor. */
const CANCEL_HOUR_OPTIONS = [6, 12, 24, 48];

const SWATCHES = [
  '#EF4444', // kırmızı
  '#F97316', // turuncu
  '#EAB308', // sarı
  '#84CC16', // limon
  '#10B981', // zümrüt (varsayılan)
  '#14B8A6', // turkuaz
  '#0EA5E9', // gök
  '#6366F1', // çivit
  '#8B5CF6', // mor
  '#EC4899', // pembe
];

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
  const [cancelHours, setCancelHours] = useState(tenant.cancellationHours ?? DEFAULT_CANCELLATION_HOURS);
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

  const isPro = tenant.subscription?.status === 'active';

  const trimmedName = name.trim();

  /** Any edit invalidates the "Kaydedildi ✓" label — otherwise the button
   *  claims the change is saved while it is still only in the field. */
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSaved(false);
  };

  /** Tek dokunuş = tek yazım. Saat sayısını serbest bir sayaçla girdirmek
   *  her adımda bir yazım demek olurdu; salon zaten bir sayı ince ayarlamıyor,
   *  bir politika seçiyor. */
  const selectCancelHours = async (hours: number) => {
    const previous = cancelHours;
    setCancelHours(hours);
    try {
      await updateTenantCancellationHours(tenant.id, hours);
      toast.success(`İptal süresi ${hours} saat oldu`);
    } catch (e) {
      setCancelHours(previous);
      reportError(e, toast, 'İptal süresi kaydedilemedi.');
    }
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
      <GymSwitchRow />

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
      {/* Sabit genişlik on renge yetmiyordu (10×34 + boşluklar ekranı aşıyor).
          `flex: 1` + `aspectRatio: 1` kalan genişliği eşit bölüyor ve daireyi
          kendi ölçüsünde tutuyor, yani her ekran boyutunda tek satır. */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {SWATCHES.map((sw) => {
          const selected = sw.toLowerCase() === primaryColor.toLowerCase();
          return (
            <Pressable
              key={sw}
              onPress={() => selectColor(sw)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={{
                flex: 1,
                aspectRatio: 1,
                borderRadius: 999,
                padding: 2,
                // Seçili olan dışarıdan bir halka alıyor. Eski hâlindeki
                // zemin renginde ince iç kenarlık, küçülen dairede
                // seçiliyi seçilmeyenden ayırt edilemez hâle getiriyordu.
                borderWidth: 2,
                borderColor: selected ? colors.txt : 'transparent',
              }}>
              <View style={{ flex: 1, borderRadius: 999, backgroundColor: sw }} />
            </Pressable>
          );
        })}
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
        label={saving ? 'Kaydediliyor…' : saved ? 'Kaydedildi ✓' : 'Kaydet'}
        onPress={save}
        disabled={saving || !trimmedName}
        critical
      />
      {/* The consequence belongs under the button, not inside its label: a
          button says what it does, not what happens afterwards. */}
      <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
        Üyeler yeni görünümü hemen alır.
      </Text>

      {/* Subscription. The paywall used to be reachable only by hitting the
          member limit while approving someone, so an owner who simply wanted
          to pay had no way to — and an App Review tester had no way to find
          the purchase at all, which is a Guideline 2.1 rejection. */}
      <Pressable onPress={() => router.push('/paywall')}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: isPro ? colors.ok : colors.p,
            borderRadius: radius.md,
            padding: 13,
          }}>
          <Ionicons name={isPro ? 'star' : 'star-outline'} size={18} color={isPro ? colors.ok : colors.p} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              {isPro ? 'GymEntra Pro — aktif' : 'GymEntra Pro'}
            </Text>
            <Text variant="label" tone="sub">
              {isPro
                ? tenant.subscription?.expiresAt
                  ? `${tenant.subscription.expiresAt.toLocaleDateString('tr-TR')} tarihine kadar · sınırsız üye`
                  : 'Sınırsız üye'
                : `Ücretsiz plan ${FREE_MEMBER_LIMIT} aktif üyeye kadar — sınırsız üye için yükselt`}
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

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

      <View style={{ gap: 8 }}>
        <View style={{ gap: 2 }}>
          <Text variant="label" tone="sub">
            İPTAL VE İADE
          </Text>
          <Text variant="helper" tone="sub">
            Üye randevusunu bu süreden önce iptal ederse hakkı geri verilir,
            daha geç iptal ederse yanar. Antrenör veya yönetici iptalinde hak
            her zaman iade edilir.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {CANCEL_HOUR_OPTIONS.map((h) => (
            <Chip
              key={h}
              label={`${h} saat`}
              selected={cancelHours === h}
              onPress={() => selectCancelHours(h)}
            />
          ))}
        </View>
      </View>

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

      <Pressable onPress={() => router.push('/admin/announcements')}>
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
          <Ionicons name="notifications-outline" size={18} color={colors.txt} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Duyurular
            </Text>
            <Text variant="label" tone="sub">
              Herkese tek seferde — yarın kapalıyız, yeni ders, kampanya
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

      <Pressable onPress={() => router.push('/exercise-library')}>
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
          <Ionicons name="body-outline" size={18} color={colors.txt} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Hareket kütüphanesi
            </Text>
            <Text variant="label" tone="sub">
              {EXERCISES.length} hareket — çalışan kaslar, anlatım, sorun bildirme
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

      <NotificationPreferences />
      <LegalLinks />
      <DeleteAccountButton />
    </ScrollView>
  );
}
