import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { reportError } from '@/data/errors';
import { respondToPackageChangeRequest, watchPackageChangeRequest } from '@/data/firebase/packageChangeRepo';
import { entitlementRows } from '@/data/entitlementRows';
import { PackageChangeRequest } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MemberPackageOffer() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const toast = useToast();
  const { requestId } = useLocalSearchParams<{ requestId: string }>();

  const [request, setRequest] = useState<PackageChangeRequest | null | undefined>(undefined);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    return watchPackageChangeRequest(requestId, setRequest);
  }, [requestId]);

  if (!requestId || request === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          Bu teklif artık geçerli değil.
        </Text>
      </View>
    );
  }
  if (request === undefined) {
    return <View style={{ flex: 1 }} />;
  }

  const respond = (approve: boolean) => {
    if (responding) return;
    const act = async () => {
      setResponding(true);
      try {
        const outcome = await respondToPackageChangeRequest(requestId, approve);
        if (outcome === 'promotion-expired') {
          // Not a success: the server refused the whole swap because the
          // promotion the member approved ran out in the meantime — stay on
          // screen, the live subscription above already re-renders to the
          // "süresi doldu" branch once the request's status lands.
          toast.error('Bu tekliften vazgeçildi çünkü bağlı kampanyanın süresi doldu. Salonla iletişime geç.');
          return;
        }
        toast.success(outcome === 'approved' ? 'Teklifi onayladın' : 'Teklifi reddettin');
        router.back();
      } catch (e) {
        reportError(e, toast, 'İşlem tamamlanamadı, tekrar dene.');
      } finally {
        setResponding(false);
      }
    };
    if (approve) {
      void act();
      return;
    }
    confirmDestructive({
      title: 'Teklifi reddet',
      message: 'Bu teklifi reddedeceksin. Salon seninle tekrar iletişime geçebilir ama bu teklif bir daha geçerli olmaz.',
      confirmLabel: 'Reddet',
      onConfirm: () => void act(),
    });
  };

  const isPending = request.status === 'pending';

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Text variant="h3">Paket teklifi</Text>
      {request.note && (
        <Text variant="helper" tone="sub">
          {request.note}
        </Text>
      )}

      {request.currentSummary && (
        <Card style={{ gap: 6 }}>
          <Text variant="label" tone="sub">
            ŞU AN
          </Text>
          <Text variant="body" weight="900">
            {request.currentSummary.packageName} · {request.currentSummary.price.toLocaleString('tr-TR')} ₺
          </Text>
          {entitlementRows(request.currentSummary).map((row) => (
            <Text key={row} variant="helper" tone="sub">
              · {row}
            </Text>
          ))}
        </Card>
      )}

      <View style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 20, color: colors.p }}>↓</Text>
      </View>

      <Card style={{ gap: 6 }} outlineColor={colors.p}>
        <Text variant="label" tone="sub">
          {request.currentSummary ? 'YENİ' : 'TEKLİF EDİLEN'}
        </Text>
        <Text variant="body" weight="900">
          {request.proposedSummary.packageName} · {request.proposedSummary.price.toLocaleString('tr-TR')} ₺
        </Text>
        {entitlementRows(request.proposedSummary).map((row) => (
          <Text key={row} variant="helper" tone="sub">
            · {row}
          </Text>
        ))}
        <Text variant="label" tone="sub">
          {formatDate(request.effectiveAt)}&apos;den itibaren geçerli
        </Text>
      </Card>

      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="helper" tone="sub">
            Fiyat farkı
          </Text>
          <Text variant="helper" weight="700" style={{ color: request.priceDelta > 0 ? colors.warn : request.priceDelta < 0 ? colors.ok : colors.txt }}>
            {request.priceDelta === 0 ? 'Değişmiyor' : `${request.priceDelta > 0 ? '+' : ''}${request.priceDelta.toLocaleString('tr-TR')} ₺`}
          </Text>
        </View>
        {request.refundAmount != null && request.refundAmount > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="helper" tone="sub">
              İade ({request.refundBasis})
            </Text>
            <Text variant="helper" weight="700" style={{ color: colors.ok }}>
              {request.refundAmount.toLocaleString('tr-TR')} ₺
            </Text>
          </View>
        )}
      </Card>

      {isPending ? (
        <>
          <Button label={responding ? '…' : 'Onayla'} critical disabled={responding} onPress={() => respond(true)} />
          <Button label="Reddet" variant="ghost" disabled={responding} onPress={() => respond(false)} />
        </>
      ) : (
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          {request.status === 'approved'
            ? 'Bu teklifi onayladın.'
            : request.status === 'rejected'
              ? 'Bu teklifi reddettin.'
              : request.status === 'expired'
                ? 'Bu teklifin süresi doldu.'
                : 'Bu teklif geri çekildi.'}
        </Text>
      )}
    </ScrollView>
  );
}
