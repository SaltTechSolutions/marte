import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Chip } from '@/components/Chip';
import { ListGroup, ListRow } from '@/components/ListRow';
import { SwipeableRow } from '@/components/SwipeableRow';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { confirmDestructive } from '@/utils/confirm';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { createClass, deleteClass, watchClassesForTenant } from '@/data/firebase/classRepo';
import { ClassSession } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

const DAY_OFFSETS = [
  { label: 'Bugün', days: 0 },
  { label: 'Yarın', days: 1 },
  { label: '2 gün sonra', days: 2 },
];
const TIME_PRESETS = ['09:00', '12:30', '18:30', '19:30'];
const DURATION_PRESETS = [30, 50, 60];

function sessionTime(d: Date) {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function sessionDay(d: Date) {
  return d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AdminClasses() {
  const { spacing } = useAppTheme();
  const toast = useToast();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(!!tenantId);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [trainer, setTrainer] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState(TIME_PRESETS[0]);
  const [duration, setDuration] = useState(DURATION_PRESETS[1]);
  const [capacity, setCapacity] = useState(10);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    // From the start of this month onward — the admin schedules ahead and
    // occasionally reviews the recent past, but never the whole history.
    const from = new Date();
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 3);
    return watchClassesForTenant(
      tenantId,
      { from, to },
      (s) => {
        setSessions(s);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [tenantId]);

  const submit = async () => {
    if (!tenantId || !name.trim() || !trainer.trim()) return;
    setSubmitting(true);
    try {
      const [hh, mm] = time.split(':').map(Number);
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      date.setHours(hh, mm, 0, 0);
      await createClass({ tenantId, name: name.trim(), trainerName: trainer.trim(), date, durationMinutes: duration, capacity });
      setName('');
      setTrainer('');
      setShowForm(false);
      toast.success('Ders eklendi');
    } catch (e) {
      reportError(e, toast, 'Ders eklenemedi, tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };


  /**
   * Cancelling takes the class off everyone's schedule, so the people who
   * had booked it are named in the prompt — "3 kişi kayıtlı" is the whole
   * reason an admin might hesitate, and it is the one fact the row itself
   * already shows but a confirm dialog would otherwise drop.
   */
  const confirmCancel = (s: ClassSession) => {
    const booked = s.bookedUserIds.length;
    confirmDestructive({
      title: 'Dersi iptal et',
      message:
        `${s.name} — ${sessionDay(s.date)} ${sessionTime(s.date)}` +
        (booked > 0
          ? `\n\n${booked} kişi bu derse kayıtlı. İptal edince ders programlarından kalkacak.`
          : '\n\nHenüz kimse kayıtlı değil.'),
      confirmLabel: 'Dersi iptal et',
      onConfirm: () => void doCancel(s),
    });
  };

  const doCancel = async (s: ClassSession) => {
    try {
      await deleteClass(s.id);
      toast.success('Ders iptal edildi');
    } catch (e) {
      reportError(e, toast, 'İptal edilemedi, tekrar dene.');
    }
  };
  if (!tenantId) {
    return (
      <AccessGuard
        title="Salon yönetici oturumu gerekli"
        hint="Ders programını yönetmek için bir salonun admin’i olarak giriş yapmalısın."
      />
    );
  }

  return (
    <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3">Ders programı</Text>
        <Button label={showForm ? 'Vazgeç' : '+ Ders ekle'} compact variant={showForm ? 'ghost' : 'primary'} onPress={() => setShowForm((v) => !v)} />
      </View>

      {showForm && (
        <Card style={{ gap: 10 }}>
          <TextField placeholder="Ders adı (ör. HIIT Öğle)" value={name} onChangeText={setName} />
          <TextField placeholder="Eğitmen" value={trainer} onChangeText={setTrainer} />

          <Text variant="label" tone="sub">
            GÜN
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DAY_OFFSETS.map((d) => (
              <Chip key={d.days} label={d.label} selected={dayOffset === d.days} onPress={() => setDayOffset(d.days)} />
            ))}
          </View>

          <Text variant="label" tone="sub">
            SAAT
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {TIME_PRESETS.map((t) => (
              <Chip key={t} label={t} selected={time === t} onPress={() => setTime(t)} />
            ))}
          </View>

          <Text variant="label" tone="sub">
            SÜRE
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {DURATION_PRESETS.map((d) => (
              <Chip key={d} label={`${d} dk`} selected={duration === d} onPress={() => setDuration(d)} />
            ))}
          </View>

          <Text variant="label" tone="sub">
            KONTENJAN
          </Text>
          <Stepper value={capacity} unit="kişi" step={1} decimals={0} onChange={setCapacity} />

          <Button label={submitting ? 'Ekleniyor…' : 'Dersi ekle'} critical disabled={!name.trim() || !trainer.trim() || submitting} onPress={submit} />
        </Card>
      )}

      {loading ? (
        <ListSkeleton rows={3} avatar={false} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Henüz ders eklenmedi"
          description="Haftalık ders programını buradan kur; üyeler kendi Dersler sekmesinden yer ayırtabilir."
          actionLabel="İlk dersi ekle"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <ListGroup>
          {sessions.map((s, i) => (
            <SwipeableRow
              key={s.id}
              actions={[
                { icon: 'trash-outline', label: 'İptal et', destructive: true, onPress: () => confirmCancel(s) },
              ]}>
            <ListRow last={i === sessions.length - 1}>
              <View style={{ alignItems: 'center', minWidth: 56 }}>
                <Text variant="helper" weight="900">
                  {sessionTime(s.date)}
                </Text>
                <Text variant="label" tone="sub">
                  {sessionDay(s.date)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700" numberOfLines={1}>
                  {s.name}
                </Text>
                <Text variant="label" tone="sub" numberOfLines={1}>
                  {s.trainerName} · {s.bookedUserIds.length}/{s.capacity} dolu
                  {s.waitlistUserIds.length > 0 ? ` · ${s.waitlistUserIds.length} bekliyor` : ''}
                </Text>
              </View>
            </ListRow>
            </SwipeableRow>
          ))}
        </ListGroup>
      )}
    </KeyboardAwareScroll>
  );
}
