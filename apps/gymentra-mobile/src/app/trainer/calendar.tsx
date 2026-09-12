import { User } from 'firebase/auth';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { dayKey, isSameDay, MonthCalendar, startOfDay } from '@/components/MonthCalendar';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { watchSharesGrantedToMe } from '@/data/firebase/calendarShareRepo';
import { canOverseeCalendars, isStaff } from '@/data/membership';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import {
  cancelPtSession,
  createPtSession,
  reassignSession,
  setSessionStatus,
  watchSessionsForTenant,
  watchSessionsForTrainer,
} from '@/data/firebase/ptSessionRepo';
import { PtSession, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { useRefreshControl } from '@/components/useRefreshControl';
import { confirmDestructive } from '@/utils/confirm';

function formatTime(d: Date): string {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}

/** Trainer's own PT calendar, colleagues' shared calendars, and — for admins — every trainer's. */
export default function TrainerCalendar() {
  const { user, activeMembership } = useAuth();
  if (!isStaff(activeMembership) || !user || !activeMembership) {
    return <AccessGuard title="Salon antrenör oturumu gerekli" />;
  }

  return (
    <TrainerCalendarView
      tenantId={activeMembership.tenantId}
      isAdmin={canOverseeCalendars(activeMembership)}
      user={user}
    />
  );
}

/** Exported so the admin-side route can render the same calendar without
 * dragging the admin into the trainer tab group. */
export function TrainerCalendarView({ tenantId, isAdmin, user }: { tenantId: string; isAdmin: boolean; user: User }) {
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();

  // Yeniden abone olmak için — çevrimdışıyken düşen bir dinleyici
  // her zaman kendiliğinden toparlamıyor.
  const [retryKey, setRetryKey] = useState(0);
  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [shares, setShares] = useState<{ ownerTrainerId: string; ownerTrainerName: string }[]>([]);
  const [allSessions, setAllSessions] = useState<PtSession[]>([]);
  const [viewingTrainerId, setViewingTrainerId] = useState(user.uid);

  // Calendar starts on today, so the trainer's most common question —
  // "what do I have now?" — is answered without any interaction.
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfDay(new Date()));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const [scheduling, setScheduling] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TenantMembership | null>(null);
  const [hour, setHour] = useState(10);
  const [minute, setMinute] = useState(0);
  const [duration, setDuration] = useState(45);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => watchActiveMembers(tenantId, setMembers), [tenantId]);

  useEffect(
    () => watchSharesGrantedToMe(tenantId, user.uid, (s) => setShares(s.map((x) => ({ ownerTrainerId: x.ownerTrainerId, ownerTrainerName: x.ownerTrainerName })))),
    [tenantId, user.uid],
  );

  // One month at a time — the grid never shows more, and an unbounded
  // listener would grow with every session the gym has ever run. Padded by a
  // week either side so the leading/trailing grid cells still show dots.
  const range = useMemo(() => {
    const from = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }, [monthAnchor]);

  useEffect(() => {
    if (isAdmin) return watchSessionsForTenant(tenantId, range, setAllSessions, () => setFailed(true));
    return watchSessionsForTrainer(tenantId, viewingTrainerId, range, setAllSessions, () => setFailed(true));
  }, [tenantId, isAdmin, viewingTrainerId, range, retryKey]);

  const trainerOptions = useMemo(() => {
    const mine = { id: user.uid, name: 'Ben' };
    const colleagues = shares.map((s) => ({ id: s.ownerTrainerId, name: s.ownerTrainerName }));
    return [mine, ...colleagues];
  }, [user.uid, shares]);

  // A trainer can only book/complete/cancel on their OWN calendar. Admin
  // doesn't train members themselves, so no creation UI — only oversight
  // (complete/cancel/reassign any session, useful when covering a gap).
  const isOwnCalendar = !isAdmin && viewingTrainerId === user.uid;
  const canCreate = isOwnCalendar;
  const canManageStatus = isAdmin || isOwnCalendar;
  const canTakeOver = !isAdmin && viewingTrainerId !== user.uid;

  /** Day-of-month → count of non-cancelled sessions, for the grid's dots. */
  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of allSessions) {
      if (s.status === 'cancelled') continue;
      const k = dayKey(s.date);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [allSessions]);

  const daySessions = useMemo(
    () => allSessions.filter((s) => isSameDay(s.date, selectedDate)).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [allSessions, selectedDate],
  );

  const knownTrainers = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of allSessions) map.set(s.trainerId, s.trainerName);
    return [...map.entries()].filter(([id]) => id !== viewingTrainerId);
  }, [allSessions, viewingTrainerId]);

  const jumpToToday = () => {
    const now = startOfDay(new Date());
    setSelectedDate(now);
    setMonthAnchor(now);
  };

  const schedule = async () => {
    if (!selectedMember || saving) return;
    setSaving(true);
    try {
      const date = new Date(selectedDate);
      date.setHours(hour, minute, 0, 0);
      await createPtSession({
        tenantId,
        trainerId: user.uid,
        memberId: selectedMember.userId,
        date,
        durationMinutes: duration,
      });
      setScheduling(false);
      setSelectedMember(null);
    } catch (e) {
      // A clash is a normal outcome now, not a bug: the server refuses the
      // write and says which appointment it collides with. Swallowing it
      // would leave the trainer staring at a form that did nothing.
      reportError(e, toast, 'Randevu oluşturulamadı, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  const takeOver = async (session: PtSession) => {
    setBusyId(session.id);
    try {
      await reassignSession(session, user.uid, user.displayName || user.email || 'Antrenör');
    } finally {
      setBusyId(null);
    }
  };

  const reassignToOther = async (session: PtSession, trainerId: string, trainerName: string) => {
    setBusyId(session.id);
    try {
      await reassignSession(session, trainerId, trainerName);
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = (session: PtSession, status: 'completed' | 'cancelled' | 'no-show') => {
    if (status === 'no-show') {
      confirmDestructive({
        title: 'Gelmedi olarak işaretle',
        message: `${session.memberName} bu randevuya gelmemiş sayılacak ve ders hakkı iade edilmeyecek.${
          session.creditId ? '' : ' Bu randevu bir ders hakkından düşmemişti.'
        }`,
        confirmLabel: 'Gelmedi',
        onConfirm: () => void applyStatus(session, status),
      });
      return;
    }
    if (status !== 'cancelled') {
      void applyStatus(session, status);
      return;
    }
    confirmDestructive({
      title: 'Randevuyu iptal et',
      message: `${session.memberName} ile ${formatLongDate(session.date)} ${formatTime(session.date)} randevusu iptal edilecek. Geri alınamaz.`,
      confirmLabel: 'İptal et',
      onConfirm: () => void applyStatus(session, status),
    });
  };

  const applyStatus = async (session: PtSession, status: 'completed' | 'cancelled' | 'no-show') => {
    setBusyId(session.id);
    try {
      if (status === 'cancelled') {
        // A credit-linked session's cancellation has to decide whether the
        // credit comes back — the rule refuses this as a direct write now
        // (plan-eng-review Faz 1.9), so this always goes through the
        // callable. Safe for a non-credit session too; it just cancels.
        // A trainer/admin cancellation always refunds the credit (the
        // member didn't cause it) — the time-gated "burns the credit" path
        // in cancelPtSession only applies when the MEMBER is the caller,
        // which this screen never is.
        await cancelPtSession(session.id);
        if (session.creditId) toast.success('Randevu iptal edildi, kredi iade edildi.');
      } else {
        await setSessionStatus(session.id, status);
      }
    } catch (e) {
      reportError(e, toast, 'İşlem tamamlanamadı, tekrar dene.');
    } finally {
      setBusyId(null);
    }
  };

  const isViewingToday = isSameDay(selectedDate, startOfDay(new Date()));

  return (
    <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="h3">Takvim</Text>
        {!isViewingToday && (
          <Pressable onPress={jumpToToday} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="helper" weight="700" style={{ color: colors.pText }}>
              Bugüne dön
            </Text>
          </Pressable>
        )}
      </View>

      {!isAdmin && trainerOptions.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm }}>
          {trainerOptions.map((t) => (
            <Chip key={t.id} label={t.name} selected={viewingTrainerId === t.id} onPress={() => setViewingTrainerId(t.id)} />
          ))}
        </View>
      )}

      <ScrollView
      refreshControl={refreshControl} contentContainerStyle={{ paddingBottom: spacing.lg, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: spacing.sm }}>
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
        </View>

        {/* --- Selected day --- */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text variant="helper" weight="700">
            {formatLongDate(selectedDate)}
          </Text>
          <Text variant="label" tone="sub">
            {daySessions.length > 0 ? `${daySessions.length} randevu` : 'randevu yok'}
          </Text>
        </View>

        {canTakeOver && (
          <Text variant="label" tone="sub">
            Bu takvimi görüntülüyorsun — bir seansı devralabilirsin.
          </Text>
        )}

        {failed ? (
          <ErrorNotice message="Takvim alınamadı." />
        ) : daySessions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: 4 }}>
            <Text variant="helper" tone="sub">
              Bu güne planlı randevu yok.
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' }}>
            {daySessions.map((s, i) => {
              const expanded = expandedId === s.id;
              const cancelled = s.status === 'cancelled';
              const completed = s.status === 'completed';
              const noShow = s.status === 'no-show';
              return (
                <View key={s.id} style={{ borderBottomWidth: i === daySessions.length - 1 ? 0 : 1, borderBottomColor: colors.line }}>
                  <Pressable
                    onPress={() => setExpandedId(expanded ? null : s.id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, minHeight: 44 }}>
                    <View style={{ alignItems: 'center', width: 46 }}>
                      <Text variant="helper" weight="900" style={{ color: cancelled ? colors.sub : colors.pText }}>
                        {formatTime(s.date)}
                      </Text>
                      <Text variant="label" tone="sub">
                        {s.durationMinutes}dk
                      </Text>
                    </View>
                    <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.line }} />
                    <View style={{ flex: 1 }}>
                      <Text
                        variant="helper"
                        weight="700"
                        numberOfLines={1}
                        style={cancelled ? { textDecorationLine: 'line-through', color: colors.sub } : undefined}>
                        {s.memberName}
                      </Text>
                      <Text variant="label" tone="sub" numberOfLines={1}>
                        {s.trainerName}
                        {s.originalTrainerId && s.originalTrainerId !== s.trainerId ? ' · devralındı' : ''}
                      </Text>
                    </View>
                    {(completed || cancelled || noShow) && (
                      <Text
                        variant="label"
                        weight="600"
                        style={{ color: completed ? colors.ok : noShow ? colors.warn : colors.sub }}>
                        {completed ? '✓' : noShow ? 'Gelmedi' : 'İptal'}
                      </Text>
                    )}
                    <Text tone="sub">{expanded ? '▾' : '›'}</Text>
                  </Pressable>

                  {expanded && s.status === 'scheduled' && (canManageStatus || canTakeOver) && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                      {canTakeOver && (
                        <Button label={busyId === s.id ? '…' : 'Devral'} compact onPress={() => takeOver(s)} disabled={busyId === s.id} />
                      )}
                      {canManageStatus && (
                        <View style={{ gap: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Button label="Tamamla" compact style={{ flex: 1 }} disabled={busyId === s.id} onPress={() => setStatus(s, 'completed')} />
                            {/* Üçüncü seçenek: üye gelmedi. Öncesinde antrenör
                                ya "Tamamla" (üyenin geçmişinde göreceği bir
                                yalan) ya "İptal et" (hak iade edilir, salon
                                zarar eder) demek zorundaydı. */}
                            <Button label="Gelmedi" variant="secondary" compact style={{ flex: 1 }} disabled={busyId === s.id} onPress={() => setStatus(s, 'no-show')} />
                          </View>
                          <Button label="İptal et" variant="ghost" compact disabled={busyId === s.id} onPress={() => setStatus(s, 'cancelled')} />
                        </View>
                      )}
                      {isAdmin && knownTrainers.length > 0 && (
                        <View style={{ gap: 4 }}>
                          <Text variant="label" tone="sub">
                            Başka antrenöre ata:
                          </Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {knownTrainers.map(([id, name]) => (
                              <Pressable
                                key={id}
                                disabled={busyId === s.id}
                                onPress={() => reassignToOther(s, id, name)}
                                style={{ backgroundColor: colors.surf2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                                <Text variant="label" weight="600">
                                  {name}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* --- New appointment, always for the day currently selected above --- */}
        {canCreate &&
          (scheduling ? (
            <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, gap: 10 }}>
              <Text variant="helper" weight="700">
                {formatLongDate(selectedDate)} · yeni randevu
              </Text>
              <Text variant="label" tone="sub">
                Tarihi değiştirmek için yukarıdaki takvimden başka bir gün seç.
              </Text>

              <Text variant="label" tone="sub">
                ÜYE
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {members.map((m) => (
                  <Chip
                    key={m.id}
                    label={m.userDisplayName || m.userEmail || 'Üye'}
                    selected={selectedMember?.id === m.id}
                    onPress={() => setSelectedMember(m)}
                  />
                ))}
              </View>

              <View style={{ gap: 4 }}>
                <Text variant="label" tone="sub">
                  Saat
                </Text>
                <Stepper value={hour} unit="saat" step={1} decimals={0} onChange={(v) => setHour(((v % 24) + 24) % 24)} />
              </View>
              <View style={{ gap: 4 }}>
                <Text variant="label" tone="sub">
                  Dakika
                </Text>
                <Stepper value={minute} unit="dk" step={15} decimals={0} onChange={(v) => setMinute(((v % 60) + 60) % 60)} />
              </View>
              <View style={{ gap: 4 }}>
                <Text variant="label" tone="sub">
                  Süre
                </Text>
                <Stepper value={duration} unit="dk" step={15} decimals={0} onChange={setDuration} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setScheduling(false)} disabled={saving} />
                <Button label={saving ? '…' : 'Randevu oluştur'} style={{ flex: 1 }} disabled={saving || !selectedMember} onPress={schedule} />
              </View>
            </View>
          ) : (
            <Button label="+ Randevu ekle" critical onPress={() => setScheduling(true)} />
          ))}
      </ScrollView>
    </View>
  );
}
