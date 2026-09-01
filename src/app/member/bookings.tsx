import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { InfoCard } from '@/components/InfoCard';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { cancelBooking, watchMyUpcomingClasses } from '@/data/firebase/classRepo';
import { cancelPtSession, watchUpcomingSessionsForMember } from '@/data/firebase/ptSessionRepo';
import { ClassSession, PtSession } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

/** One row in the merged list — the two sources have different shapes but the
 *  member does not think of them as different kinds of appointment. */
type Booking =
  | { kind: 'pt'; id: string; date: Date; title: string; subtitle: string; session: PtSession }
  | { kind: 'class'; id: string; date: Date; title: string; subtitle: string; session: ClassSession };

function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Yarın';
  return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Everything the member has booked, in one place (MEMBER-3).
 *
 * Until now the Today screen showed only the NEXT PT appointment and the
 * Classes screen showed one chosen day, so "what have I got coming up" had no
 * answer anywhere — a member with a class on Thursday and a session on Friday
 * had to go looking in two places and know to look.
 *
 * Group classes and PT sessions are merged and sorted by time rather than
 * kept in separate sections: the member's question is "what is next", and
 * splitting the list by our data model makes them do the merge themselves.
 */
export default function MemberBookings() {
  const { user, activeMembership } = useAuth();
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  if (!tenantId || !user) {
    return (
      <AccessGuard
        title="Aktif üyelik gerekli"
        hint="Rezervasyonlarını görmek için salonda aktif bir üyeliğin olmalı."
      />
    );
  }
  return <BookingList tenantId={tenantId} userId={user.uid} />;
}

function BookingList({ tenantId, userId }: { tenantId: string; userId: string }) {
  const { colors, spacing } = useAppTheme();
  const toast = useToast();

  const [sessions, setSessions] = useState<PtSession[] | undefined>(undefined);
  const [classes, setClasses] = useState<ClassSession[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(
    () => watchUpcomingSessionsForMember(tenantId, userId, setSessions, () => setFailed(true)),
    [tenantId, userId, retryKey],
  );
  useEffect(
    () => watchMyUpcomingClasses(tenantId, userId, setClasses, () => setFailed(true)),
    [tenantId, userId, retryKey],
  );

  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  const loading = sessions === undefined || classes === undefined;

  const bookings: Booking[] = [
    ...(sessions ?? [])
      .filter((s) => s.status !== 'cancelled')
      .map<Booking>((s) => ({
        kind: 'pt',
        id: s.id,
        date: s.date,
        title: 'Özel ders',
        subtitle: s.trainerName,
        session: s,
      })),
    ...(classes ?? []).map<Booking>((c) => ({
      kind: 'class',
      id: c.id,
      date: c.date,
      title: c.name,
      subtitle: `${c.trainerName} · ${c.durationMinutes} dk`,
      session: c,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const cancel = (b: Booking) =>
    confirmDestructive({
      title: b.kind === 'pt' ? 'Randevuyu iptal et' : 'Rezervasyonu iptal et',
      message:
        b.kind === 'pt'
          ? `${dayLabel(b.date)} ${timeLabel(b.date)} randevun iptal edilecek. Salonun iptal süresi geçmediyse ders hakkın iade edilir.`
          : `${b.title} dersindeki yerin bırakılacak.`,
      confirmLabel: 'İptal et',
      onConfirm: () => void doCancel(b),
    });

  const doCancel = async (b: Booking) => {
    setBusyId(b.id);
    try {
      if (b.kind === 'pt') {
        const { refunded } = await cancelPtSession(b.id);
        toast.success(refunded ? 'İptal edildi, ders hakkın iade edildi' : 'İptal edildi');
      } else {
        await cancelBooking(b.id, userId);
        toast.success('Rezervasyonun iptal edildi');
      }
    } catch (e) {
      reportError(e, toast, 'İptal edilemedi, tekrar dene.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      {failed ? (
        <ErrorNotice message="Rezervasyonların alınamadı." onRetry={retry} />
      ) : loading ? (
        <ListSkeleton rows={3} />
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Yaklaşan rezervasyonun yok"
          description="Ders programından bir derse yazılabilir ya da antrenöründen özel ders randevusu alabilirsin."
        />
      ) : (
        // `InfoCard` draws its own Card; wrapping it in another one would
        // nest two cards and double the padding. The cancel action goes in
        // its `children` slot, which is what that slot is for.
        bookings.map((b) => (
          <InfoCard
            key={`${b.kind}-${b.id}`}
            icon={b.kind === 'pt' ? 'barbell-outline' : 'people-outline'}
            title={`${dayLabel(b.date)} · ${timeLabel(b.date)}`}
            subtitle={`${b.title} — ${b.subtitle}`}>
            <Pressable
              onPress={() => cancel(b)}
              disabled={busyId === b.id}
              accessibilityRole="button"
              // 44pt minimum — a bare Text label is a target people miss.
              style={{ minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' }}>
              <Text variant="helper" weight="700" style={{ color: busyId === b.id ? colors.sub : colors.danger }}>
                {busyId === b.id ? '…' : 'İptal et'}
              </Text>
            </Pressable>
          </InfoCard>
        ))
      )}
    </ScrollView>
  );
}
