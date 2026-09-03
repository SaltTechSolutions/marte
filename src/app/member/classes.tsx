import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { ListGroup, ListRow } from '@/components/ListRow';
import { dayKey, isSameDay, MonthCalendar, startOfDay } from '@/components/MonthCalendar';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import {
  bookClass,
  bookGroupClassWithCredit,
  cancelBooking,
  cancelGroupClassWithCredit,
  watchClassesForTenant,
} from '@/data/firebase/classRepo';
import { watchMemberEntitlements } from '@/data/firebase/memberPackageRepo';
import { cancelPtSession, watchSessionsForMember } from '@/data/firebase/ptSessionRepo';
import { cancellationConsequence, formatDeadline, sessionOutcome } from '@/utils/cancellation';
import { toGymClass } from '@/data/classDisplay';
import { ClassSession, GymClass, MemberEntitlementsCache, PtSession } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { useRefreshControl } from '@/components/useRefreshControl';
import { confirmDestructive } from '@/utils/confirm';

function classButtonProps(status: GymClass['status'], canJoin: boolean) {
  if (status === 'booked') return { label: 'İptal et', variant: 'ghost' as const };
  if (!canJoin) return { label: 'Kilitli', variant: 'secondary' as const };
  return status === 'full' ? { label: 'Listeye gir', variant: 'secondary' as const } : { label: 'Katıl', variant: 'primary' as const };
}

/**
 * Whether this member may reserve a group class, and by which route.
 *
 * `endsAt` is re-checked against "now" here, same reasoning as the rule: the
 * cache only refreshes on write, so a package that lapsed since the last one
 * still looks live in the document.
 *
 * PKG-4 shipped only the unlimited half. A quota'd allowance now goes through
 * `bookGroupClass`, which spends the credit and takes the place atomically
 * (PER-9) — before that a gym could sell "ayda 8 grup dersi" and the member
 * holding it saw a locked button reading "yakında aktif olacak".
 */
type BookingRoute = 'none' | 'unlimited' | 'quota';

function bookingRoute(cache: MemberEntitlementsCache | null | undefined): BookingRoute {
  if (!cache || cache.endsAt < new Date()) return 'none';
  const gc = cache.entitlements.groupClasses;
  if (!gc) return 'none';
  return gc.unlimited === true ? 'unlimited' : 'quota';
}

/** Class schedule — full/waitlist states included; cancel is undo-able, never a confirm dialog. */
export default function MemberClasses() {
  const { colors, spacing } = useAppTheme();
  const toast = useToast();
  const { user, activeTenant } = useAuth();
  // Aboneliği yeniden kurmak için — canlı dinleyici çevrimdışıyken
  // düşerse kendiliğinden toparlamayabiliyor.
  const [retryKey, setRetryKey] = useState(0);
  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(!!activeTenant);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [entitlements, setEntitlements] = useState<MemberEntitlementsCache | null | undefined>(undefined);
  const [ptSessions, setPtSessions] = useState<PtSession[]>([]);
  const [cancellingPtId, setCancellingPtId] = useState<string | null>(null);

  // Opens on today, so "what's on now?" needs no interaction.
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfDay(new Date()));

  // One month at a time, padded a week either side so the grid's leading and
  // trailing cells still show their markers.
  const range = useMemo(() => {
    const from = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }, [monthAnchor]);

  useEffect(() => {
    if (!activeTenant) return;
    return watchClassesForTenant(
      activeTenant.id,
      range,
      (s) => {
        setSessions(s);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setFailed(true);
      },
    );
    // activeTenant is a new object on every AuthContext recompute; only its
    // identity should restart the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id, range]);

  const tenantId = activeTenant?.id;
  useEffect(() => {
    if (!tenantId || !user) return;
    return watchMemberEntitlements(tenantId, user.uid, setEntitlements);
  }, [tenantId, user, retryKey]);

  useEffect(() => {
    if (!tenantId || !user) return;
    return watchSessionsForMember(tenantId, user.uid, range, setPtSessions);
  }, [tenantId, user, range]);

  const route = bookingRoute(entitlements);
  const canJoin = route !== 'none';

  const onPressClass = async (session: ClassSession, status: GymClass['status']) => {
    if (!user) return;
    // Cancelling is never gated — only the reservation itself is. A tap on a
    // locked "Katıl"/"Listeye gir" explains why instead of hitting the rule
    // and coming back as a raw permission error.
    if (status !== 'booked' && !canJoin) {
      toast.error('Grup dersleri Gold ve üzeri paketlerde.');
      return;
    }
    setBusyId(session.id);
    try {
      if (status === 'booked') {
        if (route === 'quota') {
          // The server decides the refund against the gym's own
          // cancellationHours, so the screen reports what happened rather
          // than promising it up front.
          const { refunded } = await cancelGroupClassWithCredit(session.id);
          toast.success(
            refunded
              ? 'İptal edildi, ders hakkın iade edildi'
              : 'İptal edildi, geç iptal nedeniyle hak iade edilmedi',
          );
        } else {
          await cancelBooking(session.id, user.uid);
          toast.success('Rezervasyonun iptal edildi');
        }
      } else if (route === 'quota') {
        const result = await bookGroupClassWithCredit(session.id);
        toast.success(result === 'waitlisted' ? 'Bekleme listesine eklendin' : 'Derse katıldın');
      } else {
        const result = await bookClass(session.id, user.uid);
        toast.success(result === 'waitlisted' ? 'Bekleme listesine eklendin' : 'Derse katıldın');
      }
    } catch (e) {
      reportError(e, toast, 'İşlem tamamlanamadı, tekrar dene.');
    } finally {
      setBusyId(null);
    }
  };

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const k = dayKey(s.date);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    for (const s of ptSessions) {
      if (s.status === 'cancelled') continue;
      const k = dayKey(s.date);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [sessions, ptSessions]);

  const daySessions = useMemo(
    () => sessions.filter((s) => isSameDay(s.date, selectedDate)).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [sessions, selectedDate],
  );

  const dayPtSessions = useMemo(
    () =>
      ptSessions
        // İptal edilenler de listede: üyenin "hakkım neden gitti" sorusunun
        // cevabı tam olarak o satırda duruyor. Gizlemek soruyu yok etmiyor,
        // yalnızca cevabı ulaşılmaz kılıyor.
        .filter((s) => isSameDay(s.date, selectedDate))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [ptSessions, selectedDate],
  );

  const cancelSession = (session: PtSession) =>
    confirmDestructive({
      title: 'Randevuyu iptal et',
      message: `${session.date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ${session.trainerName} randevusu iptal edilecek. ${cancellationConsequence(
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
          setCancellingPtId(session.id);
          try {
            const { refunded } = await cancelPtSession(session.id);
            if (session.creditId) {
              if (refunded) toast.success('Randevu iptal edildi, dersin iade edildi.');
              else toast.show({ message: 'Randevu iptal edildi, ders geç iptal nedeniyle iade edilmedi.', tone: 'info' });
            }
          } catch (e) {
            reportError(e, toast, 'İptal edilemedi, tekrar dene.');
          } finally {
            setCancellingPtId(null);
          }
        };
        void run();
      },
    });

  if (!activeTenant) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          Ders programını görmek için bir salona üye olmalısın.
        </Text>
      </View>
    );
  }

  const gymClasses = daySessions.map((s) => toGymClass(s, user?.uid));
  const isViewingToday = isSameDay(selectedDate, startOfDay(new Date()));

  return (
    <ScrollView
      refreshControl={refreshControl}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h3">Dersler</Text>
        {!isViewingToday && (
          <Text
            variant="helper"
            weight="700"
            style={{ color: colors.p }}
            onPress={() => {
              const now = startOfDay(new Date());
              setSelectedDate(now);
              setMonthAnchor(now);
            }}>
            Bugüne dön
          </Text>
        )}
      </View>

      {/* Told up front, not discovered by tapping a locked button — same
          "explain before it fails" preference as the toast fallback below. */}
      {entitlements !== undefined && !canJoin && (
        <Text variant="label" tone="sub">
          Grup dersleri Gold ve üzeri paketlerde — dersleri görebilirsin, katılmak için paketini yükselt.
        </Text>
      )}

      <MonthCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        monthAnchor={monthAnchor}
        onChangeMonth={setMonthAnchor}
        countsByDay={countsByDay}
      />

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text variant="helper" weight="700">
          {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
        </Text>
        <Text variant="label" tone="sub">
          {gymClasses.length > 0 ? `${gymClasses.length} ders` : 'ders yok'}
        </Text>
      </View>

      {failed ? (
        <ErrorNotice message="Ders programı alınamadı." />
      ) : loading ? (
        <ListSkeleton rows={3} avatar={false} />
      ) : gymClasses.length === 0 ? (
        <EmptyState
          icon="calendar-clear-outline"
          title="Bu güne planlanmış ders yok"
          description="Takvimden başka bir gün seçebilirsin; salon yeni ders ekledikçe burada görünür."
        />
      ) : (
        <ListGroup>
          {gymClasses.map((c, i) => {
            const session = daySessions[i];
            return (
              <ListRow key={c.id} last={i === gymClasses.length - 1}>
                <View style={{ alignItems: 'center', minWidth: 44 }}>
                  <Text variant="helper" weight="900">
                    {c.time}
                  </Text>
                  <Text variant="label" tone="sub">
                    {c.lengthLabel}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text variant="label" style={{ color: colors[c.metaTone] }} numberOfLines={1}>
                    {c.meta}
                  </Text>
                </View>
                <Button
                  {...classButtonProps(c.status, canJoin)}
                  compact
                  disabled={busyId === session.id}
                  onPress={() => onPressClass(session, c.status)}
                />
              </ListRow>
            );
          })}
        </ListGroup>
      )}

      {dayPtSessions.length > 0 && (
        <>
          <Text variant="label" tone="sub" style={{ marginTop: spacing.sm }}>
            ÖZEL DERS
          </Text>
          <ListGroup>
            {dayPtSessions.map((s, i) => {
              const outcome = sessionOutcome(s);
              return (
              <ListRow key={s.id} last={i === dayPtSessions.length - 1}>
                <View style={{ alignItems: 'center', minWidth: 44 }}>
                  <Text variant="helper" weight="900">
                    {s.date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text variant="label" tone="sub">
                    {s.durationMinutes} dk
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {s.trainerName}
                  </Text>
                  {s.status === 'scheduled' && s.cancellationDeadlineAt && s.creditId ? (
                    // Son tarih iptale kalkışınca değil, en baştan görünüyor.
                    // Kuralı ancak çiğnerken öğrenilen bir politika tuzaktır.
                    <Text variant="label" tone="sub">
                      Son iptal: {formatDeadline(s.cancellationDeadlineAt)}
                    </Text>
                  ) : null}
                  {outcome ? (
                    <Text
                      variant="label"
                      style={{ color: s.status === 'completed' ? colors.ok : colors.warn }}>
                      {outcome}
                    </Text>
                  ) : null}
                </View>
                {s.status === 'scheduled' ? (
                  <Button
                    label="İptal et"
                    variant="ghost"
                    compact
                    disabled={cancellingPtId === s.id}
                    onPress={() => cancelSession(s)}
                  />
                ) : null}
              </ListRow>
              );
            })}
          </ListGroup>
        </>
      )}
    </ScrollView>
  );
}
