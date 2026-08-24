import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { watchPackagesForTenant } from '@/data/firebase/packageRepo';
import { createPromotion, getPromotion, PromotionDraft, updatePromotion } from '@/data/firebase/promotionRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { GymPackage, Promotion, PromotionKind } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * `compatibleKind` narrows which packages a campaign can even mean anything
 * for — `bonusDays` only extends a `membership` package's validity,
 * `bonusLessons` only adds to a `lessons` package's credit. Discounts apply
 * to a price either kind has, so they're unrestricted. Filtering the picker
 * here is what keeps `assignPackageToMember`'s "mismatched promotion kind is
 * a no-op" case from actually coming up in practice.
 */
const KIND_OPTIONS: { kind: PromotionKind; label: string; unit: string; compatibleKind?: GymPackage['kind'] }[] = [
  { kind: 'percentDiscount', label: 'Yüzde indirim', unit: '%' },
  { kind: 'amountDiscount', label: 'Tutar indirimi', unit: '₺' },
  { kind: 'bonusDays', label: 'Hediye gün', unit: 'gün', compatibleKind: 'membership' },
  { kind: 'bonusLessons', label: 'Hediye ders', unit: 'ders', compatibleKind: 'lessons' },
];

/**
 * Create/edit form for one campaign. Deliberately no calendar date-range
 * picker: a start date is always "now" (no scheduling a future-dated
 * campaign in v1 — no date-picker component exists anywhere in this app
 * yet, and adding one is a native-module decision bigger than this form).
 * Duration is a day count instead, the same idiom `package-form.tsx`
 * already uses for everything else time-related.
 */
export default function AdminPromotionForm() {
  const { activeMembership } = useAuth();
  const { promotionId } = useLocalSearchParams<{ promotionId?: string }>();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [existing, setExisting] = useState<Promotion | null | undefined>(promotionId ? undefined : null);

  useEffect(() => {
    if (!promotionId) return;
    getPromotion(promotionId).then(setExisting);
  }, [promotionId]);

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }
  if (existing === undefined) {
    return <View style={{ flex: 1 }} />;
  }

  return <PromotionFormBody tenantId={tenantId} existing={existing} />;
}

function PromotionFormBody({ tenantId, existing }: { tenantId: string; existing: Promotion | null }) {
  const router = useRouter();
  const { spacing } = useAppTheme();
  const toast = useToast();

  const [packages, setPackages] = useState<GymPackage[] | undefined>(undefined);
  useEffect(() => {
    return watchPackagesForTenant(tenantId, setPackages);
  }, [tenantId]);

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<PromotionKind>(existing?.kind ?? 'bonusDays');
  const [value, setValue] = useState(existing?.value ?? 30);
  const [appliesToAll, setAppliesToAll] = useState(existing ? existing.appliesTo.length === 0 : true);
  const [selectedPackageIds, setSelectedPackageIds] = useState<string[]>(existing?.appliesTo ?? []);
  const initialDurationDays = existing ? Math.max(1, Math.round((existing.endsAt.getTime() - existing.startsAt.getTime()) / 86400000)) : 30;
  const [durationDays, setDurationDays] = useState(initialDurationDays);
  const [hasCap, setHasCap] = useState(existing?.maxRedemptions != null);
  const [maxRedemptions, setMaxRedemptions] = useState(existing?.maxRedemptions ?? 20);
  const [saving, setSaving] = useState(false);

  const selectedKind = KIND_OPTIONS.find((k) => k.kind === kind)!;
  const eligiblePackages = (packages ?? []).filter(
    (p) => p.isActive && (!selectedKind.compatibleKind || p.kind === selectedKind.compatibleKind),
  );
  // Switching to a kind that's only compatible with one package kind (e.g.
  // bonusDays -> membership) can strand a previously-picked package outside
  // the now-eligible list. Rather than sync it back into state, filter at
  // the one place it's actually consumed — the ineligible id just never
  // makes it into what gets saved.
  const effectiveSelectedIds = selectedPackageIds.filter((id) => eligiblePackages.some((p) => p.id === id));
  const valid = name.trim().length > 0 && value > 0 && (appliesToAll || effectiveSelectedIds.length > 0);

  const togglePackage = (id: string) => {
    setSelectedPackageIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const startsAt = existing?.startsAt ?? new Date();
      const draft: PromotionDraft = {
        name: name.trim(),
        kind,
        value,
        appliesTo: appliesToAll ? [] : effectiveSelectedIds,
        startsAt,
        endsAt: addDays(startsAt, durationDays),
        ...(hasCap ? { maxRedemptions } : {}),
      };
      if (existing) {
        await updatePromotion(existing.id, draft);
        toast.success('Promosyon güncellendi');
      } else {
        await createPromotion(tenantId, draft);
        toast.success(`${draft.name} eklendi`);
      }
      router.back();
    } catch (e) {
      reportError(e, toast, 'Promosyon kaydedilemedi, tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          AD
        </Text>
        <TextField value={name} onChangeText={setName} placeholder="Yıllık üyeliğe 1 ay hediye" />
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          TÜR
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {KIND_OPTIONS.map((opt) => (
            <Chip key={opt.kind} label={opt.label} selected={kind === opt.kind} onPress={() => setKind(opt.kind)} />
          ))}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          DEĞER ({selectedKind.unit})
        </Text>
        <Stepper
          value={value}
          unit={selectedKind.unit}
          step={kind === 'percentDiscount' ? 5 : kind === 'amountDiscount' ? 50 : 1}
          decimals={0}
          onChange={setValue}
        />
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          NE KADAR SÜRECEK
        </Text>
        <Stepper value={durationDays} unit="gün" step={1} decimals={0} onChange={setDurationDays} />
        {existing && (
          <Text variant="label" tone="sub">
            Başlangıç sabit kalır ({existing.startsAt.toLocaleDateString('tr-TR')}); bu süreyi değiştirmek yalnızca bitişi kaydırır.
          </Text>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          HANGİ PAKETLERDE
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Tüm paketler" selected={appliesToAll} onPress={() => setAppliesToAll(true)} />
          <Chip label="Seçili paketler" selected={!appliesToAll} onPress={() => setAppliesToAll(false)} />
        </View>
        {!appliesToAll && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {eligiblePackages.map((pkg) => (
              <Chip
                key={pkg.id}
                label={pkg.name}
                selected={selectedPackageIds.includes(pkg.id)}
                onPress={() => togglePackage(pkg.id)}
              />
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="label" tone="sub">
            KULLANIM SINIRI
          </Text>
          <Chip label={hasCap ? 'Sınırlı' : 'Sınırsız'} selected={hasCap} onPress={() => setHasCap((v) => !v)} />
        </View>
        {hasCap && <Stepper value={maxRedemptions} unit="kez" step={1} decimals={0} onChange={setMaxRedemptions} />}
      </View>

      <Button label={saving ? '…' : 'Kaydet'} critical disabled={!valid || saving} onPress={save} />
    </KeyboardAwareScroll>
  );
}
