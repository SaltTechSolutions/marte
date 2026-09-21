import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GymLogo } from '@/components/GymLogo';
import { ErrorNotice } from '@/components/ErrorNotice';
import { GymSwitchTarget } from '@/components/GymSwitcher';
import { MyPackageCard } from '@/components/MyPackageCard';
import { RenewalRequestRow } from '@/components/RenewalRequestRow';
import { isLive, watchAnnouncements } from '@/data/firebase/announcementRepo';
import { InfoCard } from '@/components/InfoCard';
import { ProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { toGymClass } from '@/data/classDisplay';
import { reportError } from '@/data/errors';
import { watchMyCheckins } from '@/data/firebase/checkinRepo';
import { watchClassesForTenant } from '@/data/firebase/classRepo';
import { watchMemberCredits, watchMemberPackages } from '@/data/firebase/memberPackageRepo';
import { watchPendingPackageChangeRequests } from '@/data/firebase/packageChangeRepo';
import { watchPaymentsForMember } from '@/data/firebase/paymentRepo';
import { cancelPtSession, watchUpcomingSessionsForMember } from '@/data/firebase/ptSessionRepo';
import { cancellationConsequence } from '@/utils/cancellation';
import { watchCompletedThisWeek } from '@/data/firebase/workoutLogRepo';
import { GymClass, MemberCredit, MemberPackage, PackageChangeRequest, Payment, PtSession, Announcement } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { useRefreshControl } from '@/components/useRefreshControl';
import { confirmDestructive } from '@/utils/confirm';

const WEEKLY_TARGET = 4;

function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Monday-based, matching how a Turkish gym week reads.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function formatSessionDate(d: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Bugün ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Yarın ${time}`;
  return `${d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} ${time}`;
}

/**
 * Member home — a dashboard, not a greeting.
 *
 * It used to answer one question ("what's my next class?") and left the rest
 * of what a member actually wonders — do I owe money, when is my PT session,
 * have I been coming — spread across other tabs or nowhere at all.
 *
 * Order is deliberate: today's action first, then what's coming, then status.
 * Status is last because it is the thing you check occasionally, not the
 * thing you opened the app for.
 */
export default function MemberHome() {
  const router = useRouter();
  const { colors, spacing, tenantName } = useAppTheme();
  const toast = useToast();
  // Aboneliği yeniden kurmak için — canlı dinleyici çevrimdışıyken
  // düşerse kendiliğinden toparlamayabiliyor.
  const [retryKey, setRetryKey] = useState(0);
  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  // Any of the ten listeners below dropping. One banner is enough: the cards
  // that never got their data say so themselves (DEN-13). Cleared by the tap,
  // not by an effect (AGENTS §4: no synchronising setState).
  const [failed, setFailed] = useState(false);
  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { user, activeMembership, activeTenant } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;
  const displayName = user?.displayName?.split(' ')[0] || 'Üye';

  const [todayClass, setTodayClass] = useState<GymClass | null | undefined>(undefined);
  // `undefined` = not here yet. These used to start at 0 / [], so before the
  // first snapshot the home screen claimed "Aktif paketin yok", "bu hafta
  // henüz gelmedin" and "Henüz ödeme kaydın yok" about a member who has all
  // three (DEN-13). Lists that only ever ADD a card when non-empty (sessions,
  // offers, announcements, credits) keep [] because empty already draws nothing.
  const [completedThisWeek, setCompletedThisWeek] = useState<number | undefined>(undefined);
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [payments, setPayments] = useState<Payment[] | undefined>(undefined);
  const [visits, setVisits] = useState<Date[] | undefined>(undefined);
  const [packageOffers, setPackageOffers] = useState<PackageChangeRequest[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [packages, setPackages] = useState<MemberPackage[] | undefined>(undefined);
  const [groupCredits, setGroupCredits] = useState<MemberCredit[]>([]);
  const [ptCredits, setPtCredits] = useState<MemberCredit[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    return watchAnnouncements(tenantId, setAnnouncements, () => setFailed(true), 5);
  }, [tenantId, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    // Home card only shows today, so load just today.
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return watchClassesForTenant(tenantId, { from, to }, (all) => {
      const now = new Date();
      const todaySessions = all.filter((s) => s.date.toDateString() === now.toDateString());
      const bookedToday = todaySessions.find((s) => uid && s.bookedUserIds.includes(uid));
      const pick = bookedToday ?? todaySessions[0] ?? null;
      setTodayClass(pick ? toGymClass(pick, uid) : null);
    }, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchCompletedThisWeek(tenantId, uid, setCompletedThisWeek, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchUpcomingSessionsForMember(tenantId, uid, setSessions, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchPaymentsForMember(tenantId, uid, setPayments, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchPendingPackageChangeRequests(tenantId, uid, setPackageOffers, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMemberPackages(tenantId, uid, setPackages, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMemberCredits(tenantId, uid, 'groupClass', setGroupCredits, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMemberCredits(tenantId, uid, 'ptLesson', setPtCredits, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  const weekStart = useMemo(() => startOfWeek(), []);
  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMyCheckins(tenantId, uid, weekStart, setVisits, () => setFailed(true));
  }, [tenantId, uid, weekStart, retryKey]);

  const statusReady = completedThisWeek !== undefined && visits !== undefined;
  const done = completedThisWeek ?? 0;
  const percent = Math.min(100, Math.round((done / WEEKLY_TARGET) * 100));
  const nextSession = sessions[0];
  const pendingPayment = payments?.find((p) => p.status === 'pending');
  const lastConfirmed = payments?.find((p) => p.status === 'confirmed');

  return (
    <ScrollView
      refreshControl={refreshControl}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <GymSwitchTarget>
          <GymLogo size={32} radius={9} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              {tenantName}
            </Text>
            <Text variant="label" tone="sub">
              Merhaba {displayName} 👋
            </Text>
          </View>
        </GymSwitchTarget>
        {/* Account lives here rather than in a sixth tab — it is somewhere you
            visit, not somewhere you switch between. */}
        <Pressable
          onPress={() => router.push('/member/profile')}
          accessibilityRole="button"
          accessibilityLabel="Hesabım"
          hitSlop={8}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person-outline" size={19} color={colors.txt} />
        </Pressable>
      </View>

      {failed ? (
        <ErrorNotice message="Bazı bilgiler yüklenemedi; aşağıdaki kartlar eksik olabilir." onRetry={retry} />
      ) : null}

      {/* A pending offer outranks even today's action — it's the one thing
          on this screen with a real deadline (expiresAt) and a decision only
          this person can make. */}
      {/* Gym announcements — the one channel the gym has to everyone at
          once. Latest two only; the rest is noise on a home screen. */}
      {announcements.filter((a) => isLive(a)).slice(0, 2).map((a) => (
        <InfoCard
          key={a.id}
          icon="megaphone-outline"
          title={a.title}
          subtitle={a.body}
          outlined
        />
      ))}

      {packageOffers.map((offer) => (
        <InfoCard
          key={offer.id}
          icon="swap-horizontal-outline"
          title="Paket teklifin var"
          subtitle={`${offer.proposedSummary.packageName} — incelemek için dokun`}
          trailing
          outlined
          onPress={() => router.push({ pathname: '/member/package-offer', params: { requestId: offer.id } })}
        />
      ))}

      {/* --- Today's action --- */}
      <Button
        variant="pulse"
        label="Üye Kartım"
        icon="▦"
        critical
        onPress={() => router.push('/member/card')}
      />

      {todayClass && (
        <>
          <Text variant="label" tone="sub" style={{ marginTop: 8 }}>
            BUGÜN
          </Text>
          <Pressable onPress={() => router.push('/member/classes')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ backgroundColor: colors.surf2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text variant="body" weight="900">
                  {todayClass.time}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700">
                  {todayClass.name}
                </Text>
                <Text variant="label" tone="sub">
                  {todayClass.meta}
                </Text>
              </View>
            </Card>
          </Pressable>
        </>
      )}

      {/* What the member bought comes before what they can do with it —
          "kaç dersim kaldı" is the question they open the app with. */}
      <View style={{ marginTop: 8 }}>
        <MyPackageCard
          // Donmuş paket de gösteriliyor: yalnızca 'active' arayınca
          // dondurulmuş üye "aktif paketin yok" görüyordu, ki bu paketini
          // kaybettiği anlamına geliyor — kart donmuş hâli kendi anlatıyor.
          activePackage={
            packages?.find((p) => p.status === 'active') ??
            packages?.find((p) => p.status === 'frozen') ??
            null
          }
          // Until the packages arrive the card must not say there is none.
          status={packages === undefined ? (failed ? 'failed' : 'loading') : undefined}
          groupCredits={groupCredits}
          ptCredits={ptCredits}
        />
        {tenantId ? (
          <RenewalRequestRow
            tenantId={tenantId}
            endsAt={packages?.find((p) => p.status === 'active' || p.status === 'frozen')?.endsAt ?? null}
          />
        ) : null}
      </View>

      {/* --- What's coming --- */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
        <Text variant="label" tone="sub">
          YAKLAŞAN RANDEVU
        </Text>
        {/* This card shows only the NEXT one; everything else lives on the
            bookings screen. Without a way in, a member with a class on
            Thursday and a session on Friday has no place that shows both. */}
        <Pressable onPress={() => router.push('/member/bookings')} hitSlop={8}>
          <Text variant="label" weight="700" style={{ color: colors.pText }}>
            Tümü ›
          </Text>
        </Pressable>
      </View>
      {nextSession && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="barbell-outline" size={19} color={colors.pText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              {formatSessionDate(nextSession.date)}
            </Text>
            <Text variant="label" tone="sub">
              {nextSession.trainerName} · {nextSession.durationMinutes} dk
            </Text>
          </View>
          <Pressable
            hitSlop={8}
            disabled={cancellingId === nextSession.id}
            onPress={() => {
              const session = nextSession;
              confirmDestructive({
                title: 'Randevuyu iptal et',
                message: `${formatSessionDate(session.date)} ${session.trainerName} randevusu iptal edilecek. ${cancellationConsequence(
                  {
                    sessionDate: session.date,
                    now: new Date(),
                    hoursSetting: activeTenant?.cancellationHours,
                    hasCredit: Boolean(session.creditId),
                  },
                )}`,
                confirmLabel: 'İptal et',
                onConfirm: () => {
                  const run = async () => {
                    setCancellingId(session.id);
                    try {
                      const { refunded } = await cancelPtSession(session.id);
                      if (session.creditId) {
                        if (refunded) toast.success('Randevu iptal edildi, dersin iade edildi.');
                        else toast.show({ message: 'Randevu iptal edildi, ders geç iptal nedeniyle iade edilmedi.', tone: 'info' });
                      }
                    } catch (e) {
                      reportError(e, toast, 'İptal edilemedi, tekrar dene.');
                    } finally {
                      setCancellingId(null);
                    }
                  };
                  void run();
                },
              });
            }}>
            <Text variant="label" tone="sub" style={{ textDecorationLine: 'underline' }}>
              İptal et
            </Text>
          </Pressable>
        </Card>
      )}
      <InfoCard
        icon="calendar-outline"
        title="Randevu al"
        subtitle="Bir antrenörden özel ders saati seç"
        trailing
        onPress={() => router.push('/member/trainers')}
      />

      {/* --- Status --- */}
      <Text variant="label" tone="sub" style={{ marginTop: 8 }}>
        DURUMUM
      </Text>

      {/* The ring is a genuinely different leading visual, so it goes through
          `lead` rather than being hand-built alongside a second layout. */}
      <InfoCard
        lead={<ProgressRing percent={percent} label={statusReady ? `%${percent}` : '–'} sublabel="hedef" />}
        title={statusReady ? `Haftada ${done}/${WEEKLY_TARGET} antrenman` : 'Haftalık hedefin'}
        subtitle={
          !statusReady
            ? failed
              ? 'Şu an alınamadı'
              : 'Yükleniyor…'
            : done >= WEEKLY_TARGET
              ? 'Bu haftaki hedefini tamamladın 🎉'
              : `Hedefe ${WEEKLY_TARGET - done} antrenman kaldı · ${
                  visits.length > 0 ? `bu hafta ${visits.length} kez geldin` : 'bu hafta henüz gelmedin'
                }`
        }
      />

      <InfoCard
        icon="card-outline"
        title="Ödemelerim"
        subtitle={
          pendingPayment
            ? `${pendingPayment.amount} ₺ bildirimin onay bekliyor`
            : lastConfirmed
              ? `Son ödeme: ${lastConfirmed.amount} ₺ · ${lastConfirmed.createdAt.toLocaleDateString('tr-TR')}`
              : payments === undefined
                ? 'Ödemelerini gör'
                : 'Henüz ödeme kaydın yok'
        }
        // A pending notice is the one state the member may need to act on.
        subtitleTone={pendingPayment ? 'warn' : 'sub'}
        trailing
        onPress={() => router.push('/member/payments')}
      />
    </ScrollView>
  );
}
