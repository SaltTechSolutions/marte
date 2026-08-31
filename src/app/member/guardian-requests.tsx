import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { respondToGuardian, watchMyChildren } from '@/data/firebase/membershipRepo';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';
import { ageFrom } from '@/utils/birthDate';

function childLabel(c: TenantMembership) {
  return c.userDisplayName || c.userEmail || 'Üye';
}

/**
 * The parent's side of the link (MEMBER-5b).
 *
 * Approving is a legal act, not a convenience: it is the consent that makes
 * processing a minor's data lawful, and it hands the parent responsibility for
 * that child's bookings and payments. So the screen says what is being agreed
 * to before the button, rather than after.
 */
export default function GuardianRequests() {
  const { user, activeMembership } = useAuth();
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  if (!tenantId || !user) {
    return (
      <AccessGuard
        title="Aktif üyelik gerekli"
        hint="Ebeveyn onayı için salonda aktif bir üyeliğin olmalı."
      />
    );
  }
  return <RequestList tenantId={tenantId} guardianId={user.uid} />;
}

function RequestList({ tenantId, guardianId }: { tenantId: string; guardianId: string }) {
  const { colors, spacing } = useAppTheme();
  const toast = useToast();

  const [children, setChildren] = useState<TenantMembership[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    return watchMyChildren(tenantId, guardianId, setChildren, () => setFailed(true));
  }, [tenantId, guardianId, retryKey]);

  // Clearing the flag belongs to the tap, not to the effect: resetting it
  // inside the effect is a synchronising setState (AGENTS §4).
  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  const respond = async (child: TenantMembership, approve: boolean) => {
    setBusyId(child.id);
    try {
      await respondToGuardian(tenantId, child.userId, approve);
      toast.success(approve ? `${childLabel(child)} onaylandı` : 'Onay verilmedi');
    } catch (e) {
      reportError(e, toast, 'İşlem tamamlanamadı, tekrar dene.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = (child: TenantMembership) =>
    confirmDestructive({
      title: 'Onay verme',
      message: `${childLabel(child)} senin onayın olmadan salona üye olamaz. Bağlantı tamamen kaldırılacak; isterse başka bir ebeveyn gösterebilir.`,
      confirmLabel: 'Onay verme',
      onConfirm: () => void respond(child, false),
    });

  const pending = children?.filter((c) => c.guardianStatus === 'pending') ?? [];
  const approved = children?.filter((c) => c.guardianStatus === 'approved') ?? [];

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      {failed ? (
        <ErrorNotice
          message="Ebeveyn istekleri alınamadı."
          onRetry={retry}
        />
      ) : children === undefined ? (
        <ListSkeleton rows={2} />
      ) : children.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Bağlı çocuk yok"
          description="18 yaşından küçük bir üye seni ebeveyni olarak gösterdiğinde isteği burada göreceksin."
        />
      ) : null}

      {pending.map((child) => (
        <Card key={child.id} style={{ gap: spacing.sm }} outlineColor={colors.p}>
          <Text variant="label" tone="sub">
            ONAY BEKLİYOR
          </Text>
          <Text variant="helper" weight="700">
            {childLabel(child)}
            {child.birthDate ? ` · ${ageFrom(child.birthDate)} yaşında` : ''}
          </Text>
          <Text variant="label" tone="sub">
            Onaylarsan {childLabel(child)} salona üye olabilir; sen de onun adına ödeme
            yapabilir, randevu alabilir ve iptal edebilirsin. Onayın kayıt altına alınır.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Onay verme"
                variant="secondary"
                disabled={busyId === child.id}
                onPress={() => confirmReject(child)}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                label={busyId === child.id ? '…' : 'Onaylıyorum'}
                critical
                disabled={busyId === child.id}
                onPress={() => void respond(child, true)}
              />
            </View>
          </View>
        </Card>
      ))}

      {approved.length > 0 && (
        <>
          <Text variant="label" tone="sub" style={{ marginTop: spacing.sm }}>
            BAĞLI ÇOCUKLARIM
          </Text>
          {approved.map((child) => (
            <Card key={child.id} style={{ gap: 3 }}>
              <Text variant="helper" weight="700">
                {childLabel(child)}
              </Text>
              <Text variant="label" tone="sub">
                {child.status === 'active' ? 'Salon üyeliği aktif' : 'Salon onayı bekliyor'}
                {child.guardianConsentAt
                  ? ` · onayın ${child.guardianConsentAt.toLocaleDateString('tr-TR')}`
                  : ''}
              </Text>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}
