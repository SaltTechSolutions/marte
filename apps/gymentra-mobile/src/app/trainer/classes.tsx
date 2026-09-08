import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { dayKey, isSameDay, MonthCalendar, startOfDay } from '@/components/MonthCalendar';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useRefreshControl } from '@/components/useRefreshControl';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { setClassAttendance, watchClassesForTrainer } from '@/data/firebase/classRepo';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import { canCoach, tenantIdIf } from '@/data/membership';
import { ClassSession, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function time(d: Date) {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The coach's own group classes, and the register (PER-8).
 *
 * Until now the schedule lived only on the admin screen: a trainer could not
 * see which classes were theirs, could not see who had booked one, and there
 * was nowhere in the app that recorded who actually turned up. "3/10 dolu"
 * was the whole story — a number with no names behind it.
 *
 * Attendance is deliberately three-state. An unmarked member is not the same
 * as an absent one; a register nobody filled in must not read as a room full
 * of no-shows once this feeds reporting.
 */
export default function TrainerClasses() {
  const { user, activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canCoach(activeMembership));

  if (!tenantId || !user) {
    return <AccessGuard title="Salon antrenör oturumu gerekli" />;
  }
  return <MyClasses tenantId={tenantId} trainerId={user.uid} />;
}

function MyClasses({ tenantId, trainerId }: { tenantId: string; trainerId: string }) {
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();

  const [sessions, setSessions] = useState<ClassSession[] | undefined>(undefined);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfDay(new Date()));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  // One month, padded a week either side so the grid's leading and trailing
  // cells still show their markers — same window the other calendars use.
  const range = useMemo(() => {
    const from = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }, [monthAnchor]);

  useEffect(
    () => watchClassesForTrainer(tenantId, trainerId, range, setSessions, () => setFailed(true)),
    [tenantId, trainerId, range, retryKey],
  );

  // Names for the register: a class stores uids, and the client cannot look up
  // another user's Auth profile — the roster is the only join available.
  useEffect(() => watchActiveMembers(tenantId, setMembers), [tenantId]);

  const nameOf = (uid: string) => {
    const m = members.find((x) => x.userId === uid);
    return m?.userDisplayName || m?.userEmail || 'Üye';
  };

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions ?? []) map.set(dayKey(s.date), (map.get(dayKey(s.date)) ?? 0) + 1);
    return map;
  }, [sessions]);

  const daySessions = useMemo(
    () => (sessions ?? []).filter((s) => isSameDay(s.date, selectedDate)),
    [sessions, selectedDate],
  );

  const mark = async (s: ClassSession, uid: string, value: 'present' | 'absent' | null) => {
    const key = `${s.id}:${uid}`;
    setBusyKey(key);
    try {
      await setClassAttendance(s.id, uid, value);
    } catch (e) {
      reportError(e, toast, 'Yoklama kaydedilemedi, tekrar dene.');
    } finally {
      setBusyKey(null);
    }
  };

  const isViewingToday = isSameDay(selectedDate, startOfDay(new Date()));

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h3">Derslerim</Text>
        {!isViewingToday && (
          <Pressable
            onPress={() => {
              const now = startOfDay(new Date());
              setSelectedDate(now);
              setMonthAnchor(now);
            }}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="helper" weight="700" style={{ color: colors.pText }}>
              Bugüne dön
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        refreshControl={refreshControl}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg, paddingTop: spacing.sm }}
        showsVerticalScrollIndicator={false}>
        <MonthCalendar
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setExpandedId(null);
          }}
          monthAnchor={monthAnchor}
          onChangeMonth={setMonthAnchor}
          countsByDay={countsByDay}
        />

        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text variant="helper" weight="700">
            {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
          </Text>
          <Text variant="label" tone="sub">
            {daySessions.length > 0 ? `${daySessions.length} ders` : 'ders yok'}
          </Text>
        </View>

        {failed ? (
          <ErrorNotice
            message="Ders listen alınamadı."
            onRetry={() => {
              setFailed(false);
              setRetryKey((k) => k + 1);
            }}
          />
        ) : sessions === undefined ? (
          <ListSkeleton rows={3} avatar={false} />
        ) : daySessions.length === 0 ? (
          <EmptyState
            icon="calendar-clear-outline"
            title="Bu güne dersin yok"
            description="Salon yöneticisi sana ders atadığında burada görünür; takvimden başka bir gün de seçebilirsin."
          />
        ) : (
          daySessions.map((s) => {
            const expanded = expandedId === s.id;
            const marked = Object.keys(s.attendance ?? {}).length;
            return (
              <Card key={s.id} style={{ gap: 8 }}>
                <Pressable
                  onPress={() => setExpandedId(expanded ? null : s.id)}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
                  <View style={{ alignItems: 'center', minWidth: 48 }}>
                    <Text variant="helper" weight="900">
                      {time(s.date)}
                    </Text>
                    <Text variant="label" tone="sub">
                      {s.durationMinutes} dk
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="helper" weight="700" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text variant="label" tone="sub">
                      {s.bookedUserIds.length}/{s.capacity} kayıtlı
                      {marked > 0 ? ` · ${marked} işaretlendi` : ''}
                    </Text>
                  </View>
                  <Text tone="sub">{expanded ? '▾' : '›'}</Text>
                </Pressable>

                {expanded && (
                  <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
                    {s.bookedUserIds.length === 0 ? (
                      <Text variant="label" tone="sub">
                        Bu derse henüz kimse kayıtlı değil.
                      </Text>
                    ) : (
                      s.bookedUserIds.map((uid) => {
                        const state = s.attendance?.[uid];
                        const busy = busyKey === `${s.id}:${uid}`;
                        const chip = (value: 'present' | 'absent', label: string, tone: string) => {
                          const on = state === value;
                          return (
                            <Pressable
                              // Tapping the active state clears it — an
                              // accidental mark has to be undoable, and
                              // "unmarked" is a real state, not a gap.
                              onPress={() => void mark(s, uid, on ? null : value)}
                              disabled={busy}
                              accessibilityRole="button"
                              accessibilityState={{ selected: on }}
                              style={{
                                minHeight: 34,
                                paddingHorizontal: 12,
                                justifyContent: 'center',
                                borderRadius: radius.pill,
                                backgroundColor: on ? tone : 'transparent',
                                borderWidth: on ? 0 : 1,
                                borderColor: colors.line,
                                opacity: busy ? 0.5 : 1,
                              }}>
                              <Text variant="label" weight="700" tone={on ? 'onp' : 'sub'}>
                                {label}
                              </Text>
                            </Pressable>
                          );
                        };
                        return (
                          <View key={uid} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text variant="helper" style={{ flex: 1 }} numberOfLines={1}>
                              {nameOf(uid)}
                            </Text>
                            {chip('present', 'Geldi', colors.ok)}
                            {chip('absent', 'Gelmedi', colors.danger)}
                          </View>
                        );
                      })
                    )}

                    {s.waitlistUserIds.length > 0 && (
                      <Text variant="label" tone="sub">
                        Bekleme listesinde {s.waitlistUserIds.length} kişi
                      </Text>
                    )}
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
