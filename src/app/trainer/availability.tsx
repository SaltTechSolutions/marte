import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { DateStepper } from '@/components/DateStepper';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { TimeStepper } from '@/components/TimeStepper';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { setTrainerAvailability, watchTrainerAvailability } from '@/data/firebase/availabilityRepo';
import { gymWindowFor } from '@/data/openingHours';
import { AvailabilityException, DayHours, TimeWindow, Weekday } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { toHHMM, toMinutes } from '@/utils/time';

function isoDateFromOffset(offset: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
}

const DAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'Pazartesi' },
  { key: 'tue', label: 'Salı' },
  { key: 'wed', label: 'Çarşamba' },
  { key: 'thu', label: 'Perşembe' },
  { key: 'fri', label: 'Cuma' },
  { key: 'sat', label: 'Cumartesi' },
  { key: 'sun', label: 'Pazar' },
];

// Fallback range for a gym that has never set its opening hours. Every gym
// predates the field, so an unset one must stay usable rather than locked out.
const FALLBACK: DayHours = { open: '06:00', close: '22:00' };

// One window per day: the data model (`TimeWindow[]`) allows more (e.g. a
// lunch-break split), this screen just doesn't expose that yet.

type DayState = TimeWindow | null;

/**
 * A trainer's recurring working hours (PKG-7) — the precondition for a
 * member being able to book them at all. An empty day here isn't neutral:
 * `hasAnyAvailability` treats a never-configured trainer as "not bookable
 * yet," so leaving this screen untouched is the same as being closed every
 * day, on purpose (a silent "no slots" would land on the member, not the
 * trainer who forgot to fill this in).
 *
 * Bounded by the gym's own opening hours (UX-4): a trainer may work any hour
 * the gym is open, but opening a bookable slot while it is shut sends the
 * member to a locked door. Days the gym is closed cannot be opened at all.
 *
 * The two 17-chip walls this screen used to draw — start and end, per day —
 * are gone for the same reason the class form's were.
 */
export default function TrainerAvailability() {
  const { colors, spacing } = useAppTheme();
  const toast = useToast();
  const { user, activeMembership, activeTenant } = useAuth();
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  const [days, setDays] = useState<Record<Weekday, DayState>>({
    mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
  });
  const [slotMinutes, setSlotMinutes] = useState(60);
  // Kept in state and written back on save. The first version sent `[]` on
  // every save, so any day off ever recorded was wiped the next time the
  // trainer touched their hours.
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [dayOffOffset, setDayOffOffset] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId || !user) return;
    return watchTrainerAvailability(tenantId, user.uid, (availability) => {
      if (availability) {
        setDays((prev) => {
          const next = { ...prev };
          for (const { key } of DAYS) next[key] = availability.weekly[key]?.[0] ?? null;
          return next;
        });
        setSlotMinutes(availability.slotMinutes);
        setExceptions(availability.exceptions);
      }
      setLoaded(true);
    });
  }, [tenantId, user]);

  if (!tenantId || !user) {
    return (
      <View style={{ padding: spacing.md }}>
        <ListSkeleton rows={7} avatar={false} />
      </View>
    );
  }

  const setDay = (key: Weekday, window: DayState) => setDays((prev) => ({ ...prev, [key]: window }));

  /** What the gym allows on this day, and the bounds the steppers get.
   *  A stored value already outside the window widens the bound on that side
   *  only: the trainer keeps what they had and can walk it back in, rather
   *  than the screen silently rewriting hours they never touched. */
  const boundsFor = (key: Weekday, window: TimeWindow) => {
    const gym = gymWindowFor(activeTenant?.openingHours, key);
    const w = gym === undefined ? FALLBACK : gym;
    if (!w) return null;
    return {
      gym: w,
      startMin: toHHMM(Math.min(toMinutes(w.open), toMinutes(window.start))),
      startMax: w.close,
      endMin: window.start,
      endMax: toHHMM(Math.max(toMinutes(w.close), toMinutes(window.end))),
    };
  };

  // Only closed days, only from today on — a past day off is history, not a
  // setting, and a half-day window (the model allows it) has no UI yet.
  const todayIso = isoDateFromOffset(0);
  const upcomingDaysOff = exceptions.filter((e) => e.closed && e.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const weekly: Partial<Record<Weekday, TimeWindow[]>> = {};
      for (const { key } of DAYS) {
        if (days[key]) weekly[key] = [days[key]!];
      }
      await setTrainerAvailability({ tenantId, trainerId: user.uid, weekly, slotMinutes, exceptions });
      toast.success('Çalışma saatlerin kaydedildi');
    } catch (e) {
      reportError(e, toast, 'Kaydedilemedi, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      {loaded && Object.values(days).every((d) => d === null) && (
        <Text variant="helper" tone="sub">
          Henüz hiç gün açmadın — üyeler senden randevu alamaz.
        </Text>
      )}

      <View style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          RANDEVU SÜRESİ
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[30, 45, 60, 90].map((m) => (
            <Chip key={m} label={`${m} dk`} selected={slotMinutes === m} onPress={() => setSlotMinutes(m)} />
          ))}
        </View>
      </View>

      {DAYS.map(({ key, label }) => {
        const window = days[key];
        const isOpen = window !== null;
        const bounds = boundsFor(key, window ?? { start: '09:00', end: '18:00' });
        // The gym is shut this day: there is no window a trainer could open
        // inside, so the toggle would only produce an unbookable slot.
        if (!bounds) {
          return (
            <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="helper" weight="700" tone="sub">
                {label}
              </Text>
              <Text variant="label" tone="sub">
                Salon kapalı
              </Text>
            </View>
          );
        }
        return (
          <View key={key} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="helper" weight="700">
                {label}
              </Text>
              <Chip
                label={isOpen ? 'Açık' : 'Kapalı'}
                selected={isOpen}
                onPress={() => setDay(key, isOpen ? null : { start: bounds.gym.open, end: bounds.gym.close })}
              />
            </View>
            {isOpen && (
              <>
                <TimeStepper
                  value={window!.start}
                  step={30}
                  min={bounds.startMin}
                  max={bounds.startMax}
                  hint={`başlangıç · salon ${bounds.gym.open}–${bounds.gym.close}`}
                  onChange={(start) =>
                    setDay(key, {
                      start,
                      // The end has to stay after the start; dragging the start
                      // past it would otherwise leave a negative window that
                      // silently produces no slots at all.
                      end: toMinutes(window!.end) <= toMinutes(start) ? toHHMM(toMinutes(start) + 60) : window!.end,
                    })
                  }
                />
                <TimeStepper
                  value={window!.end}
                  step={30}
                  min={bounds.endMin}
                  max={bounds.endMax}
                  hint="bitiş"
                  onChange={(end) => setDay(key, { ...window!, end })}
                />
                {(toMinutes(window!.start) < toMinutes(bounds.gym.open) ||
                  toMinutes(window!.end) > toMinutes(bounds.gym.close)) && (
                  <Text variant="label" style={{ color: colors.warn }}>
                    Bu aralık salonun {bounds.gym.open}–{bounds.gym.close} saatleri dışına taşıyor.
                  </Text>
                )}
              </>
            )}
          </View>
        );
      })}

      <View style={{ gap: 8 }}>
        <Text variant="label" tone="sub">
          İZİN GÜNLERİ
        </Text>
        <Text variant="helper" tone="sub">
          O gün hiç randevu açılmaz; üye o günü boş görmez. Alınmış randevular
          kendiliğinden iptal olmaz — onları takvimden sen kapatırsın.
        </Text>
        {upcomingDaysOff.length === 0 ? (
          <Text variant="label" tone="sub">
            Planlı izin günü yok.
          </Text>
        ) : (
          upcomingDaysOff.map((e) => (
            <View key={e.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text variant="helper" weight="700" style={{ flex: 1 }}>
                {formatIsoDate(e.date)}
              </Text>
              <Button label="Kaldır" variant="ghost" compact onPress={() => setExceptions((prev) => prev.filter((x) => x.date !== e.date))} />
            </View>
          ))
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <DateStepper value={dayOffOffset} onChange={setDayOffOffset} min={0} max={90} />
          </View>
          <Button
            label="İzin ekle"
            variant="secondary"
            compact
            disabled={exceptions.some((e) => e.date === isoDateFromOffset(dayOffOffset))}
            onPress={() =>
              setExceptions((prev) => [...prev, { date: isoDateFromOffset(dayOffOffset), closed: true }])
            }
          />
        </View>
      </View>

      <Button label={saving ? '…' : 'Kaydet'} critical disabled={saving} onPress={save} />
    </KeyboardAwareScroll>
  );
}
