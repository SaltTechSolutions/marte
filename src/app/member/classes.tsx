import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListGroup, ListRow } from '@/components/ListRow';
import { dayKey, isSameDay, MonthCalendar, startOfDay } from '@/components/MonthCalendar';
import { Snackbar } from '@/components/Snackbar';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { bookClass, cancelBooking, watchClassesForTenant } from '@/data/firebase/classRepo';
import { toGymClass } from '@/data/classDisplay';
import { ClassSession, GymClass } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function classButtonProps(status: GymClass['status']) {
  switch (status) {
    case 'booked':
      return { label: 'İptal et', variant: 'ghost' as const };
    case 'full':
      return { label: 'Listeye gir', variant: 'secondary' as const };
    default:
      return { label: 'Katıl', variant: 'primary' as const };
  }
}

/** Class schedule — full/waitlist states included; cancel is undo-able, never a confirm dialog. */
export default function MemberClasses() {
  const { colors, spacing, radius } = useAppTheme();
  const { user, activeTenant } = useAuth();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(!!activeTenant);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

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

  const onPressClass = async (session: ClassSession, status: GymClass['status']) => {
    if (!user) return;
    setBusyId(session.id);
    try {
      if (status === 'booked') {
        await cancelBooking(session.id, user.uid);
        setSnack('İptal edildi');
      } else {
        const result = await bookClass(session.id, user.uid);
        setSnack(result === 'waitlisted' ? 'Bekleme listesine eklendin' : 'Katıldın!');
      }
    } catch {
      setSnack('Bir hata oluştu, tekrar dene.');
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
    return map;
  }, [sessions]);

  const daySessions = useMemo(
    () => sessions.filter((s) => isSameDay(s.date, selectedDate)).sort((a, b) => a.date.getTime() - b.date.getTime()),
    [sessions, selectedDate],
  );

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
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
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
        <Text variant="helper" tone="sub">
          Yükleniyor…
        </Text>
      ) : gymClasses.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: radius.md, padding: 12, alignItems: 'center' }}>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            Bu güne planlanmış ders yok.
          </Text>
        </View>
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
                  {...classButtonProps(c.status)}
                  compact
                  disabled={busyId === session.id}
                  onPress={() => onPressClass(session, c.status)}
                />
              </ListRow>
            );
          })}
        </ListGroup>
      )}

      {snack && <Snackbar message={snack} onAction={() => setSnack(null)} />}
    </ScrollView>
  );
}
