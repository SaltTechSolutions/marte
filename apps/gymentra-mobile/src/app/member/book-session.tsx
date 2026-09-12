import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/ListSkeleton';
import { isSameDay, MonthCalendar, startOfDay } from '@/components/MonthCalendar';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { computeFreeSlots, hasAnyAvailability, watchTrainerAvailability, watchTrainerBusySlotsForDay } from '@/data/firebase/availabilityRepo';
import { bookPtSessions } from '@/data/firebase/ptSessionRepo';
import { watchMemberCredits } from '@/data/firebase/memberPackageRepo';
import { MemberCredit, TrainerAvailability, TrainerBusySlot } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function remainingCredits(credits: MemberCredit[]): number {
  return credits.reduce((sum, c) => sum + (c.total - c.used), 0);
}

/**
 * Step 2 of PKG-8: pick a day, pick a free slot, confirm. The actual credit
 * spend and slot-conflict check happen in the `bookPtSessions` Cloud
 * Function — this screen's `remaining` check is UX only (a disabled button
 * beats a round-trip failure), the callable is the real gate.
 */
export default function BookSession() {
  const router = useRouter();
  // `memberId` present = a parent booking for their child (MEMBER-5c). The
  // whole screen then works against the CHILD: their credits are counted,
  // their name is shown, and the callable books in their name.
  const { trainerId, trainerName, memberId, memberName } = useLocalSearchParams<{
    trainerId: string;
    trainerName: string;
    memberId?: string;
    memberName?: string;
  }>();
  const { colors, spacing } = useAppTheme();
  const toast = useToast();
  const { user, activeTenant } = useAuth();
  const tenantId = activeTenant?.id;

  const [availability, setAvailability] = useState<TrainerAvailability | null | undefined>(undefined);
  const [busySlots, setBusySlots] = useState<TrainerBusySlot[]>([]);
  const [credits, setCredits] = useState<MemberCredit[] | undefined>(undefined);
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => startOfDay(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!tenantId || !trainerId) return;
    return watchTrainerAvailability(tenantId, trainerId, setAvailability);
  }, [tenantId, trainerId]);

  useEffect(() => {
    if (!tenantId || !trainerId) return;
    return watchTrainerBusySlotsForDay(tenantId, trainerId, selectedDate, setBusySlots);
  }, [tenantId, trainerId, selectedDate]);

  // A slot chosen on a previous day shouldn't stay "selected" once the day
  // changes underneath it — derived rather than reset via effect.
  const effectiveSelectedSlot = selectedSlot && isSameDay(selectedSlot, selectedDate) ? selectedSlot : null;

  // Whose appointment this is. Defaults to the caller, which is every case
  // except a guardian booking for a child.
  const bookingForId = memberId || user?.uid;

  useEffect(() => {
    if (!tenantId || !bookingForId) return;
    return watchMemberCredits(tenantId, bookingForId, 'ptLesson', setCredits);
  }, [tenantId, bookingForId]);

  const freeSlots = useMemo(() => {
    if (!availability) return [];
    return computeFreeSlots(availability, selectedDate, busySlots);
  }, [availability, selectedDate, busySlots]);

  const remaining = credits ? remainingCredits(credits) : 0;
  const loading = availability === undefined || credits === undefined;

  const confirm = async () => {
    if (!tenantId || !trainerId || !effectiveSelectedSlot || booking) return;
    setBooking(true);
    try {
      await bookPtSessions({
        tenantId,
        trainerId,
        slots: [effectiveSelectedSlot],
        ...(memberId ? { memberId } : {}),
      });
      toast.success(memberId ? `${memberName ?? 'Çocuğun'} için randevu oluşturuldu` : 'Randevun oluşturuldu');
      router.back();
    } catch (e) {
      reportError(e, toast, 'Randevu alınamadı, tekrar dene.');
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return (
      <View style={{ padding: spacing.md }}>
        <ListSkeleton rows={5} avatar={false} />
      </View>
    );
  }

  if (!hasAnyAvailability(availability ?? null)) {
    return (
      <EmptyState
        icon="time-outline"
        title="Bu antrenör henüz uygun değil"
        description={`${trainerName ?? 'Bu antrenör'} çalışma saatlerini henüz tanımlamamış.`}
      />
    );
  }

  if (remaining <= 0) {
    return (
      <EmptyState
        icon="ticket-outline"
        title="Özel ders hakkın yok"
        description="Randevu alabilmek için önce bir özel ders paketi veya kredisi gerekiyor."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      <Text variant="label" tone="sub">
        {trainerName} · {remaining} hak kaldı
      </Text>
      {/* Booking on someone else's behalf has to say so on the screen where
          the credit is spent — it is the child's quota going down, not the
          parent's, and there is no other cue that this is not their own. */}
      {memberId ? (
        <Text variant="helper" weight="700" style={{ color: colors.pText }}>
          {memberName ?? 'Çocuğun'} adına randevu alıyorsun
        </Text>
      ) : null}

      <MonthCalendar
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        monthAnchor={monthAnchor}
        onChangeMonth={setMonthAnchor}
        countsByDay={new Map()}
      />

      <Text variant="label" tone="sub">
        {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
      </Text>

      {freeSlots.length === 0 ? (
        <Card>
          <Text variant="helper" tone="sub">
            Bu gün için uygun saat yok.
          </Text>
        </Card>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {freeSlots.map((slot) => (
            <Chip
              key={slot.getTime()}
              label={slot.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              selected={effectiveSelectedSlot?.getTime() === slot.getTime()}
              onPress={() => setSelectedSlot(slot)}
            />
          ))}
        </View>
      )}

      <Button label={booking ? '…' : 'Randevuyu onayla'} critical disabled={!effectiveSelectedSlot || booking} onPress={confirm} />
    </ScrollView>
  );
}
