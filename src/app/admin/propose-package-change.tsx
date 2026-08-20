import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { applyPromotionEffect, getMemberPackage } from '@/data/firebase/memberPackageRepo';
import { watchPackagesForTenant } from '@/data/firebase/packageRepo';
import { createPackageChangeRequest } from '@/data/firebase/packageChangeRepo';
import { isPromotionUsable, watchPromotionsForTenant } from '@/data/firebase/promotionRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { GymPackage, MemberPackage, PackageChangeKind, Promotion } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

const KIND_LABEL: Record<PackageChangeKind, string> = {
  upgrade: 'Yükseltme',
  downgrade: 'Düşürme',
  promotion: 'Promosyonlu yenileme',
  addon: 'Ek paket',
};

function summary(pkg: GymPackage): string {
  if (pkg.kind === 'lessons') return `${pkg.lessonCount ?? '?'} ders · ${pkg.lessonValidityDays ?? '?'} gün geçerli`;
  const parts = [`${pkg.durationDays ?? '?'} gün salon`];
  const gc = pkg.entitlements.groupClasses;
  if (gc?.unlimited) parts.push('sınırsız grup dersi');
  else if (gc) parts.push(`${gc.periodDays} günde ${gc.count} grup dersi`);
  if (pkg.entitlements.ptLessons) parts.push(`${pkg.entitlements.ptLessons.periodDays} günde ${pkg.entitlements.ptLessons.count} özel ders`);
  return parts.join(' · ');
}

/**
 * Admin *proposes* a swap for a member who already holds a package — this
 * never touches `member_packages` itself, only creates a `pending` request
 * (PKG-6). "İlk atama onay istemez" doesn't apply here: this member already
 * has something, so changing it needs their yes.
 */
export default function AdminProposePackageChange() {
  const { activeMembership } = useAuth();
  const { memberId, memberName, currentAssignmentId } = useLocalSearchParams<{
    memberId: string;
    memberName: string;
    currentAssignmentId: string;
  }>();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [current, setCurrent] = useState<MemberPackage | null | undefined>(undefined);
  useEffect(() => {
    if (!currentAssignmentId) return;
    getMemberPackage(currentAssignmentId).then(setCurrent);
  }, [currentAssignmentId]);

  if (!tenantId || !memberId || !currentAssignmentId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }
  if (current === undefined) {
    return <View style={{ flex: 1 }} />;
  }
  if (current === null) {
    return <AccessGuard title="Bu paket bulunamadı" hint="Üye ekranına dönüp tekrar dene." />;
  }

  return <ProposeChangeBody tenantId={tenantId} memberId={memberId} memberName={memberName || 'Üye'} current={current} />;
}

function ProposeChangeBody({
  tenantId,
  memberId,
  memberName,
  current,
}: {
  tenantId: string;
  memberId: string;
  memberName: string;
  current: MemberPackage;
}) {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { user } = useAuth();

  const [packages, setPackages] = useState<GymPackage[] | undefined>(undefined);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [selected, setSelected] = useState<GymPackage | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<Promotion | null>(null);
  const [kind, setKind] = useState<PackageChangeKind>('upgrade');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return watchPackagesForTenant(tenantId, setPackages);
  }, [tenantId]);
  useEffect(() => {
    return watchPromotionsForTenant(tenantId, setPromotions);
  }, [tenantId]);

  const choices = (packages ?? []).filter((p) => p.isActive && p.id !== current.packageId).sort((a, b) => a.sortOrder - b.sortOrder);
  const usablePromotions = selected ? promotions.filter((p) => isPromotionUsable(p, selected.id)) : [];
  const effect = selected
    ? selectedPromotion
      ? applyPromotionEffect(selected.price, selectedPromotion)
      : { finalPrice: selected.price, bonusDays: 0, bonusLessons: 0 }
    : null;
  const priceDelta = effect ? effect.finalPrice - current.finalPrice : 0;

  const selectPackage = (pkg: GymPackage) => {
    setSelected(pkg);
    setSelectedPromotion(null);
    setKind(pkg.kind !== current.kind ? 'addon' : pkg.price > current.finalPrice ? 'upgrade' : 'downgrade');
  };

  const submit = async () => {
    if (!selected || !user || submitting) return;
    setSubmitting(true);
    try {
      await createPackageChangeRequest({
        tenantId,
        memberId,
        memberName,
        kind,
        // A different kind (e.g. adding a lessons package to a membership
        // holder) doesn't replace anything — nothing to cancel, so no
        // `current` reference is sent.
        ...(selected.kind === current.kind ? { current: { assignmentId: current.id, pkg: current } } : {}),
        proposedPackage: selected,
        ...(selectedPromotion ? { proposedPromotion: selectedPromotion } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        // Effective immediately — same v1 limitation as PKG-5's promotions:
        // no date-picker component exists in the app yet to schedule a
        // future-dated change.
        effectiveInDays: 0,
        createdBy: user.uid,
      });
      toast.success(`${memberName} için teklif gönderildi`);
      router.back();
    } catch {
      toast.error('Teklif oluşturulamadı, tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      <Card style={{ gap: 4 }}>
        <Text variant="label" tone="sub">
          ŞU AN
        </Text>
        <Text variant="body" weight="900">
          {current.packageName} · {current.finalPrice.toLocaleString('tr-TR')} ₺
        </Text>
      </Card>

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          YENİ PAKET
        </Text>
        {packages === undefined ? (
          <ListSkeleton rows={2} avatar={false} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {choices.map((pkg) => {
              const isSelected = selected?.id === pkg.id;
              return (
                <Pressable key={pkg.id} onPress={() => selectPackage(pkg)}>
                  <View
                    style={{
                      backgroundColor: colors.surf,
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? colors.p : colors.line,
                      borderRadius: radius.md,
                      padding: 14,
                      gap: 6,
                    }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text variant="body" weight="900">
                        {pkg.name}
                      </Text>
                      <Text variant="body" weight="900" style={{ color: colors.p }}>
                        {pkg.price.toLocaleString('tr-TR')} ₺
                      </Text>
                    </View>
                    <Text variant="helper" tone="sub">
                      {summary(pkg)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {selected && (
        <>
          <View style={{ gap: 6 }}>
            <Text variant="label" tone="sub">
              TÜR
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(KIND_LABEL) as PackageChangeKind[]).map((k) => (
                <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
          </View>

          {usablePromotions.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text variant="label" tone="sub">
                PROMOSYON UYGULA
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Chip label="Yok" selected={!selectedPromotion} onPress={() => setSelectedPromotion(null)} />
                {usablePromotions.map((promo) => (
                  <Chip
                    key={promo.id}
                    label={promo.name}
                    selected={selectedPromotion?.id === promo.id}
                    onPress={() => setSelectedPromotion(promo)}
                  />
                ))}
              </View>
            </View>
          )}

          <View style={{ gap: 6 }}>
            <Text variant="label" tone="sub">
              NOT (İSTEĞE BAĞLI)
            </Text>
            <TextField value={note} onChangeText={setNote} placeholder="Üyeye görünecek kısa açıklama" multiline />
          </View>

          <Card style={{ gap: 6 }}>
            <Text variant="label" tone="sub">
              ÜYENİN GÖRECEĞİ ÖZET
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="helper" tone="sub">
                Fiyat
              </Text>
              <Text variant="helper" weight="700">
                {current.finalPrice.toLocaleString('tr-TR')} ₺ → {effect!.finalPrice.toLocaleString('tr-TR')} ₺
                {priceDelta !== 0 && (
                  <Text variant="helper" weight="700" style={{ color: priceDelta > 0 ? colors.warn : colors.ok }}>
                    {' '}
                    ({priceDelta > 0 ? '+' : ''}
                    {priceDelta.toLocaleString('tr-TR')} ₺)
                  </Text>
                )}
              </Text>
            </View>
            {effect!.bonusDays > 0 && (
              <Text variant="helper" style={{ color: colors.ok }}>
                +{effect!.bonusDays} gün hediye
              </Text>
            )}
            {effect!.bonusLessons > 0 && (
              <Text variant="helper" style={{ color: colors.ok }}>
                +{effect!.bonusLessons} ders hediye
              </Text>
            )}
          </Card>

          <Button label={submitting ? '…' : 'Teklifi gönder'} critical disabled={submitting} onPress={submit} />
        </>
      )}
    </KeyboardAwareScroll>
  );
}
