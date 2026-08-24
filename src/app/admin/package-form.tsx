import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import {
  canEditPackage,
  createGymPackage,
  createPackageVersion,
  getGymPackage,
  PackageDraft,
  updateGymPackage,
} from '@/data/firebase/packageRepo';
import { reportError } from '@/data/errors';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { GymPackage, PackageKind } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmAction } from '@/utils/confirm';

const DURATION_PRESETS = [
  { label: '1 ay', days: 30 },
  { label: '3 ay', days: 90 },
  { label: '6 ay', days: 180 },
  { label: '1 yıl', days: 365 },
  { label: '2 yıl', days: 730 },
];

const LESSON_COUNT_PRESETS = [8, 12, 20];

type GroupClassMode = 'none' | 'unlimited' | 'quota';

/**
 * Create/edit form for one catalog entry. Two very different outcomes hide
 * behind the same "Kaydet" button, decided by `canEditPackage`:
 *
 * - Unlocked (no live assignments): a plain field update.
 * - Locked: `createPackageVersion` instead — the old row is retired, a new
 *   one takes its place. The admin is told this is what will happen before
 *   it happens; nothing here should feel like a silent switch.
 */
export default function AdminPackageForm() {
  const { activeMembership } = useAuth();
  const { packageId } = useLocalSearchParams<{ packageId?: string }>();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [existing, setExisting] = useState<GymPackage | null | undefined>(packageId ? undefined : null);

  useEffect(() => {
    if (!packageId) return;
    getGymPackage(packageId).then(setExisting);
  }, [packageId]);

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }
  if (existing === undefined) {
    return <View style={{ flex: 1 }} />;
  }

  return <PackageFormBody tenantId={tenantId} existing={existing} />;
}

function PackageFormBody({ tenantId, existing }: { tenantId: string; existing: GymPackage | null }) {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const toast = useToast();

  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<PackageKind>(existing?.kind ?? 'membership');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [durationDays, setDurationDays] = useState(existing?.durationDays ?? 30);
  const [lessonCount, setLessonCount] = useState(existing?.lessonCount ?? 8);
  const [lessonValidityDays, setLessonValidityDays] = useState(existing?.lessonValidityDays ?? 90);

  const [groupClassMode, setGroupClassMode] = useState<GroupClassMode>(
    existing?.entitlements.groupClasses?.unlimited ? 'unlimited' : existing?.entitlements.groupClasses ? 'quota' : 'none',
  );
  const [groupClassCount, setGroupClassCount] = useState(existing?.entitlements.groupClasses?.count ?? 4);
  const [groupClassPeriod, setGroupClassPeriod] = useState(existing?.entitlements.groupClasses?.periodDays ?? 30);

  const [hasBonusLessons, setHasBonusLessons] = useState(existing?.entitlements.ptLessons != null);
  const [bonusLessonCount, setBonusLessonCount] = useState(existing?.entitlements.ptLessons?.count ?? 12);
  const [bonusLessonPeriod, setBonusLessonPeriod] = useState(existing?.entitlements.ptLessons?.periodDays ?? 90);

  const [freezeAllowed, setFreezeAllowed] = useState(existing?.freezePolicy != null);
  const [freezeMinDays, setFreezeMinDays] = useState(existing?.freezePolicy?.minDays ?? 15);
  const [freezeMaxCount, setFreezeMaxCount] = useState(existing?.freezePolicy?.maxCount ?? 1);

  const [saving, setSaving] = useState(false);

  const priceNum = Number(price.replace(',', '.'));
  const locked = existing ? !canEditPackage(existing) : false;
  const valid = name.trim().length > 0 && priceNum >= 0 && !Number.isNaN(priceNum);

  const buildDraft = (): PackageDraft => ({
    name: name.trim(),
    kind,
    price: priceNum,
    ...(kind === 'membership' ? { durationDays } : {}),
    ...(kind === 'lessons' ? { lessonCount, lessonValidityDays } : {}),
    entitlements: {
      // A lessons package grants no standalone gym-access right of its own —
      // access on its scheduled days comes from having a session that day
      // (PKG-3), not from this flag.
      gymAccess: kind === 'membership',
      ...(kind === 'membership' && groupClassMode !== 'none'
        ? { groupClasses: groupClassMode === 'unlimited' ? { unlimited: true } : { count: groupClassCount, periodDays: groupClassPeriod } }
        : {}),
      ...(kind === 'membership' && hasBonusLessons ? { ptLessons: { count: bonusLessonCount, periodDays: bonusLessonPeriod } } : {}),
    },
    ...(kind === 'membership' && freezeAllowed ? { freezePolicy: { minDays: freezeMinDays, maxCount: freezeMaxCount } } : {}),
  });

  const persist = async () => {
    setSaving(true);
    try {
      const draft = buildDraft();
      if (!existing) {
        await createGymPackage(tenantId, draft);
        toast.success(`${draft.name} kataloğa eklendi`);
      } else if (!locked) {
        await updateGymPackage(existing.id, draft);
        toast.success('Paket güncellendi');
      } else {
        await createPackageVersion(existing, draft);
        toast.success(`${draft.name} yeni sürüm olarak kaydedildi`);
      }
      router.back();
    } catch (e) {
      reportError(e, toast, 'Paket kaydedilemedi, tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!valid || saving) return;
    if (locked) {
      confirmAction({
        title: 'Yeni sürüm oluşturulacak',
        message: `Bu pakete sahip ${existing!.activeAssignmentCount} aktif üye var, bu yüzden içeriği doğrudan değiştirilemiyor. Değişikliklerin yeni bir sürüm olarak kaydedilecek; mevcut üyeler eski koşullarında kalacak.`,
        confirmLabel: 'Yeni sürüm oluştur',
        onConfirm: () => void persist(),
      });
      return;
    }
    void persist();
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      {locked && (
        <Card style={{ borderColor: colors.warn, gap: 4 }} outlineColor={colors.warn}>
          <Text variant="helper" weight="700">
            {existing!.activeAssignmentCount} üyede aktif
          </Text>
          <Text variant="label" tone="sub" style={{ lineHeight: 18 }}>
            İçeriği doğrudan değiştirilemiyor. Kaydettiğinde bu paket kaldırılır ve
            değişikliklerinle yeni bir sürüm oluşturulur; mevcut üyeler eski koşullarında kalır.
          </Text>
        </Card>
      )}

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          AD
        </Text>
        <TextField value={name} onChangeText={setName} placeholder="Gold, 8 Ders…" />
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          TÜR
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Süreli Üyelik" selected={kind === 'membership'} onPress={() => setKind('membership')} />
          <Chip label="Ders Paketi" selected={kind === 'lessons'} onPress={() => setKind('lessons')} />
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          FİYAT (₺)
        </Text>
        <TextField value={price} onChangeText={setPrice} placeholder="0" keyboardType="decimal-pad" />
      </View>

      {kind === 'membership' ? (
        <>
          <View style={{ gap: 6 }}>
            <Text variant="label" tone="sub">
              SÜRE
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {DURATION_PRESETS.map((p) => (
                <Chip key={p.days} label={p.label} selected={durationDays === p.days} onPress={() => setDurationDays(p.days)} />
              ))}
            </View>
            <Stepper value={durationDays} unit="gün" step={1} decimals={0} onChange={setDurationDays} />
          </View>

          <View style={{ gap: 6 }}>
            <Text variant="label" tone="sub">
              GRUP DERSİ HAKKI
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Yok" selected={groupClassMode === 'none'} onPress={() => setGroupClassMode('none')} />
              <Chip label="Sınırsız" selected={groupClassMode === 'unlimited'} onPress={() => setGroupClassMode('unlimited')} />
              <Chip label="Kotalı" selected={groupClassMode === 'quota'} onPress={() => setGroupClassMode('quota')} />
            </View>
            {groupClassMode === 'quota' && (
              <>
                <Stepper value={groupClassCount} unit="ders" step={1} decimals={0} onChange={setGroupClassCount} />
                <Stepper value={groupClassPeriod} unit="günde bir yenilenir" step={1} decimals={0} onChange={setGroupClassPeriod} />
              </>
            )}
          </View>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="label" tone="sub">
                PERİYODİK ÖZEL DERS HEDİYESİ
              </Text>
              <Chip label={hasBonusLessons ? 'Var' : 'Yok'} selected={hasBonusLessons} onPress={() => setHasBonusLessons((v) => !v)} />
            </View>
            {hasBonusLessons && (
              <>
                <Stepper value={bonusLessonCount} unit="ders" step={1} decimals={0} onChange={setBonusLessonCount} />
                <Stepper value={bonusLessonPeriod} unit="günde bir yenilenir" step={1} decimals={0} onChange={setBonusLessonPeriod} />
              </>
            )}
          </View>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="label" tone="sub">
                DONDURMA
              </Text>
              <Chip label={freezeAllowed ? 'İzin ver' : 'Yok'} selected={freezeAllowed} onPress={() => setFreezeAllowed((v) => !v)} />
            </View>
            {freezeAllowed && (
              <>
                <Stepper value={freezeMinDays} unit="gün en az" step={1} decimals={0} onChange={setFreezeMinDays} />
                <Stepper value={freezeMaxCount} unit="kez hak" step={1} decimals={0} onChange={setFreezeMaxCount} />
              </>
            )}
          </View>
        </>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text variant="label" tone="sub">
              DERS SAYISI
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {LESSON_COUNT_PRESETS.map((n) => (
                <Chip key={n} label={`${n} ders`} selected={lessonCount === n} onPress={() => setLessonCount(n)} />
              ))}
            </View>
            <Stepper value={lessonCount} unit="ders" step={1} decimals={0} onChange={setLessonCount} />
          </View>

          <View style={{ gap: 6 }}>
            <Text variant="label" tone="sub">
              GEÇERLİLİK SÜRESİ
            </Text>
            <Stepper value={lessonValidityDays} unit="gün" step={15} decimals={0} onChange={setLessonValidityDays} />
          </View>
        </>
      )}

      <Button
        label={saving ? '…' : locked ? 'Yeni sürüm olarak kaydet' : 'Kaydet'}
        critical
        disabled={!valid || saving}
        onPress={save}
      />
    </KeyboardAwareScroll>
  );
}
