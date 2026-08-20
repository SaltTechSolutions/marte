import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { toGymClass } from '@/data/classDisplay';
import { watchMyCheckins } from '@/data/firebase/checkinRepo';
import { watchClassesForTenant } from '@/data/firebase/classRepo';
import { watchPendingPackageChangeRequests } from '@/data/firebase/packageChangeRepo';
import { watchPaymentsForMember } from '@/data/firebase/paymentRepo';
import { watchUpcomingSessionsForMember } from '@/data/firebase/ptSessionRepo';
import { watchCompletedThisWeek } from '@/data/firebase/workoutLogRepo';
import { GymClass, PackageChangeRequest, Payment, PtSession } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

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
  const { user, activeMembership } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;
  const displayName = user?.displayName?.split(' ')[0] || 'Üye';

  const [todayClass, setTodayClass] = useState<GymClass | null | undefined>(undefined);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [payments, setPayments] = useState<Payment[] | undefined>(undefined);
  const [visits, setVisits] = useState<Date[]>([]);
  const [packageOffers, setPackageOffers] = useState<PackageChangeRequest[]>([]);

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
    });
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchCompletedThisWeek(tenantId, uid, setCompletedThisWeek);
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchUpcomingSessionsForMember(tenantId, uid, setSessions);
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchPaymentsForMember(tenantId, uid, setPayments);
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchPendingPackageChangeRequests(tenantId, uid, setPackageOffers);
  }, [tenantId, uid]);

  const weekStart = useMemo(() => startOfWeek(), []);
  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMyCheckins(tenantId, uid, weekStart, setVisits);
  }, [tenantId, uid, weekStart]);

  const percent = Math.min(100, Math.round((completedThisWeek / WEEKLY_TARGET) * 100));
  const nextSession = sessions[0];
  const pendingPayment = payments?.find((p) => p.status === 'pending');
  const lastConfirmed = payments?.find((p) => p.status === 'confirmed');

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" tone="onp" weight="900">
            {tenantName[0]}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="helper" weight="700">
            {tenantName}
          </Text>
          <Text variant="label" tone="sub">
            Merhaba {displayName} 👋
          </Text>
        </View>
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

      {/* A pending offer outranks even today's action — it's the one thing
          on this screen with a real deadline (expiresAt) and a decision only
          this person can make. */}
      {packageOffers.map((offer) => (
        <Pressable key={offer.id} onPress={() => router.push({ pathname: '/member/package-offer', params: { requestId: offer.id } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} outlineColor={colors.p}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="swap-horizontal-outline" size={19} color={colors.p} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700">
                Paket teklifin var
              </Text>
              <Text variant="label" tone="sub" numberOfLines={1}>
                {offer.proposedSummary.packageName} — incelemek için dokun
              </Text>
            </View>
            <Text tone="sub">›</Text>
          </Card>
        </Pressable>
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

      {/* --- What's coming --- */}
      <Text variant="label" tone="sub" style={{ marginTop: 8 }}>
        YAKLAŞAN RANDEVU
      </Text>
      {nextSession && (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="barbell-outline" size={19} color={colors.p} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              {formatSessionDate(nextSession.date)}
            </Text>
            <Text variant="label" tone="sub">
              {nextSession.trainerName} · {nextSession.durationMinutes} dk
            </Text>
          </View>
        </Card>
      )}
      <Pressable onPress={() => router.push('/member/trainers')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={18} color={colors.p} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Randevu al
            </Text>
            <Text variant="label" tone="sub">
              Bir antrenörden özel ders saati seç
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </Card>
      </Pressable>

      {/* --- Status --- */}
      <Text variant="label" tone="sub" style={{ marginTop: 8 }}>
        DURUMUM
      </Text>

      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <ProgressRing percent={percent} label={`%${percent}`} sublabel="hedef" />
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="900">
            Haftada {completedThisWeek}/{WEEKLY_TARGET} antrenman
          </Text>
          <Text variant="helper" tone="sub" style={{ marginTop: 3 }}>
            {completedThisWeek >= WEEKLY_TARGET ? 'Bu haftaki hedefini tamamladın 🎉' : `Hedefe ${WEEKLY_TARGET - completedThisWeek} antrenman kaldı`}
          </Text>
          <Text variant="label" tone="sub" style={{ marginTop: 4 }}>
            {visits.length > 0 ? `Bu hafta ${visits.length} kez salona geldin` : 'Bu hafta henüz salona gelmedin'}
          </Text>
        </View>
      </Card>

      <Pressable onPress={() => router.push('/member/payments')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="card-outline" size={19} color={pendingPayment ? colors.warn : colors.p} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Ödemelerim
            </Text>
            <Text variant="label" tone="sub">
              {pendingPayment
                ? `${pendingPayment.amount} ₺ bildirimin onay bekliyor`
                : lastConfirmed
                  ? `Son ödeme: ${lastConfirmed.amount} ₺ · ${lastConfirmed.createdAt.toLocaleDateString('tr-TR')}`
                  : 'Henüz ödeme kaydın yok'}
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </Card>
      </Pressable>
    </ScrollView>
  );
}
