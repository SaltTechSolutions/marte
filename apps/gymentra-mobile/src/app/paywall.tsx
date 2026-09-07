import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { FREE_MEMBER_LIMIT } from '@/data/seats';
import {
  configurePurchases,
  getProOffering,
  isPurchaseAvailable,
  purchaseProPackage,
  restorePurchases,
} from '@/services/purchases';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

/** Prices come from the store, never from here — a hardcoded "500 ₺" goes
 *  stale the moment pricing changes and is wrong in every other currency. */
function periodLabel(pkg: PurchasesPackage): { title: string; per: string } {
  const period = pkg.product.subscriptionPeriod ?? '';
  if (period === 'P1Y') return { title: 'YILLIK', per: '/yıl' };
  if (period === 'P1M') return { title: 'AYLIK', per: '/ay' };
  return { title: pkg.packageType.toUpperCase(), per: '' };
}

/**
 * Shown when a gym hits the free-tier seat limit (P0-1).
 *
 * The purchase itself proves nothing: RevenueCat verifies the receipt with
 * Apple/Google and the `revenueCatWebhook` function writes
 * `tenants/{id}.subscription`. This screen waits for that field to change
 * rather than unlocking on its own say-so — the seat limit is enforced in
 * security rules, so a client that unlocked itself would just fail the next
 * write with a confusing permission error.
 */
export default function Paywall() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { activeTenant, refreshMembership } = useAuth();

  const tenantId = activeTenant?.id ?? null;
  const memberCount = activeTenant?.activeMemberCount;
  const alreadySubscribed = activeTenant?.subscription?.status === 'active';

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(isPurchaseAvailable());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tenantId || !isPurchaseAvailable()) return;
    let alive = true;
    (async () => {
      try {
        await configurePurchases(tenantId);
        const current = await getProOffering();
        if (!alive) return;
        setOffering(current);
        // Preselect the annual plan: it is the better deal and the one a gym
        // committing to the product should see chosen by default.
        const annual = current?.availablePackages.find((p) => p.product.subscriptionPeriod === 'P1Y');
        setSelectedId((annual ?? current?.availablePackages[0])?.identifier ?? null);
      } catch {
        // Offerings can fail offline or before the store products are live.
        // The notice below covers it; an error toast on a screen the admin
        // was pushed to involuntarily would be noise.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const packages = offering?.availablePackages ?? [];
  const selected = packages.find((p) => p.identifier === selectedId) ?? null;

  const buy = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const entitled = await purchaseProPackage(selected);
      if (!entitled) return; // cancelled — say nothing, they chose to back out
      // The webhook writes the tenant doc; refreshing pulls it back so the
      // admin returns to a screen that already lets them approve.
      await refreshMembership();
      toast.success('Aboneliğin başladı — üyelerini onaylayabilirsin.');
      safeBack(router, '/admin/members');
    } catch (e) {
      reportError(e, toast, 'Satın alma tamamlanamadı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const entitled = await restorePurchases();
      await refreshMembership();
      toast[entitled ? 'success' : 'error'](
        entitled ? 'Aboneliğin geri yüklendi.' : 'Bu hesapta aktif abonelik bulunamadı.',
      );
      if (entitled) safeBack(router, '/admin/members');
    } catch (e) {
      reportError(e, toast, 'Geri yüklenemedi, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 30, gap: spacing.md, paddingBottom: spacing.lg }}>
        <Text variant="h3">{alreadySubscribed ? 'Aboneliğin aktif' : 'Salonun büyüyor'}</Text>
        {alreadySubscribed ? (
          <Text variant="helper" tone="sub" style={{ lineHeight: 20 }}>
            Sınırsız üye ekleyebilirsin — sırada bekleyen üyelik isteklerini onaylaman yeterli.
          </Text>
        ) : (
          <Text variant="helper" tone="sub" style={{ lineHeight: 20 }}>
            Ücretsiz plan {FREE_MEMBER_LIMIT} aktif üyeye kadar.
            {typeof memberCount === 'number' ? ` Şu an ${memberCount} üyen var.` : ''} Yeni üyelik
            isteklerin <Text variant="helper" weight="700">silinmedi</Text> — sırada bekliyorlar ve
            limiti yükselttiğin anda onaylayabilirsin.
          </Text>
        )}

        {alreadySubscribed ? (
          <Card outlineColor={colors.ok} style={{ gap: 4 }}>
            <Text variant="helper" weight="700">
              Üye onaylayamıyor musun?
            </Text>
            <Text variant="label" tone="sub">
              Uygulamayı kapatıp açman yeterli — abonelik bilgisi tazelenir.
            </Text>
          </Card>
        ) : null}

        {!alreadySubscribed && packages.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.sm }}>
            {packages.map((pkg) => {
              const { title, per } = periodLabel(pkg);
              const isSelected = pkg.identifier === selectedId;
              return (
                <Pressable
                  key={pkg.identifier}
                  onPress={() => setSelectedId(pkg.identifier)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  style={{
                    flex: 1,
                    backgroundColor: colors.surf,
                    borderWidth: 1.5,
                    borderColor: isSelected ? colors.p : colors.line,
                    borderRadius: radius.lg,
                    padding: 16,
                    gap: 2,
                  }}>
                  <Text variant="label" tone="sub">
                    {title}
                  </Text>
                  <Text variant="h3">
                    {pkg.product.priceString}
                    <Text variant="helper" tone="sub">
                      {per}
                    </Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Card style={{ gap: 6 }}>
          <Text variant="helper" weight="700">
            Pro ile
          </Text>
          <Text variant="helper" tone="sub" style={{ lineHeight: 22 }}>
            • Sınırsız üye{'\n'}• Tüm antrenör ve program özellikleri{'\n'}• Ödeme defteri ve
            raporlar
          </Text>
          <Text variant="label" tone="sub" style={{ marginTop: 4 }}>
            Ücret yalnızca salondan alınır — üyelerin ve antrenörlerin hiçbir zaman ödeme yapmaz.
          </Text>
        </Card>

        {/* Only when there is genuinely nothing to buy. Loading is a separate
            state: "no plans" and "not fetched yet" must not look the same. */}
        {!alreadySubscribed && !loading && packages.length === 0 && (
          <Card outlineColor={colors.warn} style={{ gap: 4 }}>
            <Text variant="helper" weight="700">
              Satın alma şu an açılamadı
            </Text>
            <Text variant="label" tone="sub" style={{ lineHeight: 18 }}>
              {isPurchaseAvailable()
                ? 'Planlar yüklenemedi. İnternet bağlantını kontrol edip tekrar dene; sürerse bizimle iletişime geç.'
                : 'Abonelik App Store ve Google Play üzerinden sunulacak; bu sürümde henüz açık değil.'}
            </Text>
          </Card>
        )}

        {!alreadySubscribed && packages.length > 0 && (
          <>
            <Button
              label={busy ? '…' : 'Aboneliği başlat'}
              critical
              disabled={!selected || busy}
              onPress={buy}
            />
            {/* Required by App Store review, and genuinely needed: a gym owner
                on a new phone has a valid subscription this install knows
                nothing about. */}
            <Pressable onPress={restore} disabled={busy} accessibilityRole="button">
              <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                Satın alımlarımı geri yükle
              </Text>
            </Pressable>
            <Text variant="label" tone="sub" style={{ textAlign: 'center', lineHeight: 16 }}>
              Abonelik dönem sonunda otomatik yenilenir. İptal, cihazının mağaza hesabı
              ayarlarından yapılır.
            </Text>
          </>
        )}

        <Button
          label="Geri dön"
          variant="secondary"
          onPress={() => safeBack(router, '/admin/members')}
        />
      </ScrollView>
    </Screen>
  );
}
