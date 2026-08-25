import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { setTrainerAvailability, watchTrainerAvailability } from '@/data/firebase/availabilityRepo';
import { TimeWindow, Weekday } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

const DAYS: { key: Weekday; label: string }[] = [
  { key: 'mon', label: 'Pazartesi' },
  { key: 'tue', label: 'Salı' },
  { key: 'wed', label: 'Çarşamba' },
  { key: 'thu', label: 'Perşembe' },
  { key: 'fri', label: 'Cuma' },
  { key: 'sat', label: 'Cumartesi' },
  { key: 'sun', label: 'Pazar' },
];

// Whole hours only, gym-typical range — no free-form time input exists in
// this app yet (same v1 simplification as PKG-5/6's dates). One window per
// day: the data model (`TimeWindow[]`) allows more (e.g. a lunch-break
// split), this screen just doesn't expose that yet.
const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 06:00 .. 22:00

function fmt(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

type DayState = TimeWindow | null;

/**
 * A trainer's recurring working hours (PKG-7) — the precondition for a
 * member being able to book them at all. An empty day here isn't neutral:
 * `hasAnyAvailability` treats a never-configured trainer as "not bookable
 * yet," so leaving this screen untouched is the same as being closed every
 * day, on purpose (a silent "no slots" would land on the member, not the
 * trainer who forgot to fill this in).
 */
export default function TrainerAvailability() {
  const { spacing } = useAppTheme();
  const toast = useToast();
  const { user, activeMembership } = useAuth();
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  const [days, setDays] = useState<Record<Weekday, DayState>>({
    mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
  });
  const [slotMinutes, setSlotMinutes] = useState(60);
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

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const weekly: Partial<Record<Weekday, TimeWindow[]>> = {};
      for (const { key } of DAYS) {
        if (days[key]) weekly[key] = [days[key]!];
      }
      await setTrainerAvailability({ tenantId, trainerId: user.uid, weekly, slotMinutes, exceptions: [] });
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
        return (
          <View key={key} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="helper" weight="700">
                {label}
              </Text>
              <Chip
                label={isOpen ? 'Açık' : 'Kapalı'}
                selected={isOpen}
                onPress={() => setDay(key, isOpen ? null : { start: '09:00', end: '18:00' })}
              />
            </View>
            {isOpen && (
              <>
                <Text variant="label" tone="sub">
                  Başlangıç
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {HOURS.map((h) => (
                    <Chip
                      key={h}
                      label={fmt(h)}
                      selected={window!.start === fmt(h)}
                      onPress={() => setDay(key, { ...window!, start: fmt(h) })}
                    />
                  ))}
                </View>
                <Text variant="label" tone="sub">
                  Bitiş
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {HOURS.map((h) => (
                    <Chip
                      key={h}
                      label={fmt(h)}
                      selected={window!.end === fmt(h)}
                      onPress={() => setDay(key, { ...window!, end: fmt(h) })}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        );
      })}

      <Button label={saving ? '…' : 'Kaydet'} critical disabled={saving} onPress={save} />
    </KeyboardAwareScroll>
  );
}
