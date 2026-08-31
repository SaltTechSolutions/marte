import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { InfoCard } from '@/components/InfoCard';
import { ListSkeleton } from '@/components/ListSkeleton';
import { StatCard } from '@/components/StatCard';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { watchMemberCredits, watchMemberPackages } from '@/data/firebase/memberPackageRepo';
import { cancelPtSession, watchUpcomingSessionsForMember } from '@/data/firebase/ptSessionRepo';
import { MemberCredit, MemberPackage, PtSession } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

function formatWhen(d: Date) {
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * What a parent may see and do for one child (MEMBER-5c, decision 4).
 *
 * The parent's own membership is irrelevant here — decision 2 says they may
 * not train at all. Everything on this screen belongs to the child, and the
 * rules let the parent read it only while the link is `approved`.
 */
export default function ChildDetail() {
  const { childId, childName } = useLocalSearchParams<{ childId: string; childName?: string }>();
  const { activeMembership } = useAuth();
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  if (!tenantId || !childId) {
    return <AccessGuard title="Üye bulunamadı" />;
  }
  return <ChildView tenantId={tenantId} childId={childId} childName={childName ?? 'Çocuğun'} />;
}

function ChildView({ tenantId, childId, childName }: { tenantId: string; childId: string; childName: string }) {
  const { spacing } = useAppTheme();
  const toast = useToast();

  const [packages, setPackages] = useState<MemberPackage[] | undefined>(undefined);
  const [credits, setCredits] = useState<MemberCredit[]>([]);
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => watchMemberPackages(tenantId, childId, setPackages), [tenantId, childId]);
  useEffect(() => watchMemberCredits(tenantId, childId, 'ptLesson', setCredits), [tenantId, childId]);
  useEffect(() => watchUpcomingSessionsForMember(tenantId, childId, setSessions), [tenantId, childId]);

  const activePackage = packages?.find((p) => p.status === 'active');
  const remaining = credits.reduce((sum, c) => sum + Math.max(0, c.total - c.used), 0);

  const confirmCancel = (session: PtSession) =>
    confirmDestructive({
      title: 'Randevuyu iptal et',
      message: `${childName} için ${formatWhen(session.date)} randevusu iptal edilecek. Salonun iptal süresi geçmediyse ders hakkı iade edilir.`,
      confirmLabel: 'İptal et',
      onConfirm: () => void cancel(session),
    });

  const cancel = async (session: PtSession) => {
    setBusyId(session.id);
    try {
      const { refunded } = await cancelPtSession(session.id);
      toast.success(refunded ? 'İptal edildi, ders hakkı iade edildi' : 'İptal edildi');
    } catch (e) {
      reportError(e, toast, 'İptal edilemedi, tekrar dene.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <StatCard
        label={childName.toUpperCase()}
        stats={[
          { value: activePackage ? 'Var' : 'Yok', label: 'aktif paket' },
          { value: remaining, label: 'kalan ders hakkı' },
          { value: sessions.length, label: 'yaklaşan randevu' },
        ]}
      />

      {packages === undefined ? (
        <ListSkeleton rows={2} />
      ) : activePackage ? (
        <InfoCard
          icon="cube-outline"
          label="PAKETİ"
          title={activePackage.packageName}
          subtitle={`${activePackage.endsAt.toLocaleDateString('tr-TR')} tarihinde bitiyor`}
        />
      ) : (
        <EmptyState
          icon="cube-outline"
          title="Aktif paketi yok"
          description="Salon yöneticisi paket tanımladığında burada görünecek."
        />
      )}

      <Text variant="label" tone="sub" style={{ marginTop: spacing.sm }}>
        YAKLAŞAN RANDEVULARI
      </Text>
      {sessions.length === 0 ? (
        <Text variant="helper" tone="sub">
          Yaklaşan randevusu yok.
        </Text>
      ) : (
        sessions.map((s) => (
          <Card key={s.id} style={{ gap: spacing.sm }}>
            <View>
              <Text variant="helper" weight="700">
                {formatWhen(s.date)}
              </Text>
              <Text variant="label" tone="sub">
                {s.trainerName}
              </Text>
            </View>
            <Button
              label={busyId === s.id ? '…' : 'Randevuyu iptal et'}
              variant="secondary"
              disabled={busyId === s.id}
              onPress={() => confirmCancel(s)}
            />
          </Card>
        ))
      )}
    </ScrollView>
  );
}
