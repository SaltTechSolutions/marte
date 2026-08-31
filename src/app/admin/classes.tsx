import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Chip } from '@/components/Chip';
import { TimeStepper } from '@/components/TimeStepper';
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
import { createClass, deleteClass, updateClass, watchClassesForTenant } from '@/data/firebase/classRepo';
import { watchActiveTrainers } from '@/data/firebase/membershipRepo';
import { ClassSession, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

const DAY_OFFSETS = [
  { label: 'Bugün', days: 0 },
  { label: 'Yarın', days: 1 },
  { label: '2 gün sonra', days: 2 },
];
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
  const [trainers, setTrainers] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(!!tenantId);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [trainer, setTrainer] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(DURATION_PRESETS[1]);
  const [capacity, setCapacity] = useState(10);
  // Non-null while editing an existing class; the same form serves both so
  // the two can never drift apart in fields or validation.
  const [editing, setEditing] = useState<ClassSession | null>(null);
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

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setName('');
    setTrainer('');
  };

  /** Opens the shared form on an existing class. The day and time chips get
   *  the class's own values appended when they are not among the presets,
   *  otherwise reopening a 07:15 class would silently move it to 09:00. */
  const startEdit = (s: ClassSession) => {
    setEditing(s);
    setName(s.name);
    setTrainer(s.trainerName);
    setDuration(s.durationMinutes);
    setCapacity(s.capacity);
    setTime(sessionTime(s.date));
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const target = new Date(s.date);
    target.setHours(0, 0, 0, 0);
    setDayOffset(Math.round((target.getTime() - midnight.getTime()) / 86400000));
    setShowForm(true);
  };

  /** Presets plus, while editing, the class's own day when it is not one of
   *  them — a class next Tuesday must stay next Tuesday unless the admin
   *  deliberately moves it. */
  const dayChoices = useMemo(() => {
    const base = DAY_OFFSETS.map((d) => ({ label: d.label, days: d.days }));
    if (base.some((d) => d.days === dayOffset)) return base;
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    return [...base, { label: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }), days: dayOffset }];
  }, [dayOffset]);

  const durationChoices = useMemo(
    () => (DURATION_PRESETS.includes(duration) ? DURATION_PRESETS : [...DURATION_PRESETS, duration]),
    [duration],
  );

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveTrainers(tenantId, setTrainers);
  }, [tenantId]);

  const submit = async () => {
    if (!tenantId || !name.trim() || !trainer.trim()) return;
    setSubmitting(true);
    try {
      const [hh, mm] = time.split(':').map(Number);
      const date = new Date();
      date.setDate(date.getDate() + dayOffset);
      date.setHours(hh, mm, 0, 0);
      if (editing) {
        await updateClass(editing.id, {
          name: name.trim(),
          trainerName: trainer.trim(),
          date,
          durationMinutes: duration,
          capacity,
        });
        toast.success('Ders güncellendi');
      } else {
        await createClass({ tenantId, name: name.trim(), trainerName: trainer.trim(), date, durationMinutes: duration, capacity });
        toast.success('Ders eklendi');
      }
      closeForm();
    } catch (e) {
      reportError(e, toast, editing ? 'Güncellenemedi, tekrar dene.' : 'Ders eklenemedi, tekrar dene.');
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
        <Button
          label={showForm ? 'Vazgeç' : '+ Ders ekle'}
          compact
          variant={showForm ? 'ghost' : 'primary'}
          onPress={() => (showForm ? closeForm() : setShowForm(true))}
        />
      </View>

      {showForm && (
        <Card style={{ gap: 10 }}>
          <TextField placeholder="Ders adı (ör. HIIT Öğle)" value={name} onChangeText={setName} />
          {/* Typed by hand this was a data-quality hole: "Mert", "mert kaya"
              and "Mert Kaya" all became different coaches, and a typo'd name
              matched nobody. The gym's own trainer list is the only correct
              source. Free text stays as the fallback when a gym has not
              added its trainers yet, so a class can still be scheduled. */}
          <Text variant="label" tone="sub">
            EĞİTMEN
          </Text>
          {trainers.length > 0 ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {trainers.map((t) => {
                const label = t.userDisplayName || t.userEmail || 'Antrenör';
                return <Chip key={t.id} label={label} selected={trainer === label} onPress={() => setTrainer(label)} />;
              })}
            </View>
          ) : (
            <TextField placeholder="Eğitmen adı" value={trainer} onChangeText={setTrainer} />
          )}

          <Text variant="label" tone="sub">
            GÜN
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {dayChoices.map((d) => (
              <Chip key={d.days} label={d.label} selected={dayOffset === d.days} onPress={() => setDayOffset(d.days)} />
            ))}
          </View>

          <Text variant="label" tone="sub">
            SAAT
          </Text>
          <TimeStepper value={time} onChange={setTime} />

          <Text variant="label" tone="sub">
            SÜRE
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {durationChoices.map((d) => (
              <Chip key={d} label={`${d} dk`} selected={duration === d} onPress={() => setDuration(d)} />
            ))}
          </View>

          <Text variant="label" tone="sub">
            KONTENJAN
          </Text>
          <Stepper value={capacity} unit="kişi" step={1} decimals={0} onChange={setCapacity} />

          <Button
            label={submitting ? (editing ? 'Kaydediliyor…' : 'Ekleniyor…') : editing ? 'Değişikliği kaydet' : 'Dersi ekle'}
            critical
            disabled={!name.trim() || !trainer.trim() || submitting}
            onPress={submit}
          />
          {editing && editing.bookedUserIds.length > 0 && (
            <Text variant="label" tone="sub">
              {editing.bookedUserIds.length} kişi bu derse kayıtlı — saati değiştirirsen programlarında da değişir.
            </Text>
          )}
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
                { icon: 'create-outline', label: 'Düzenle', onPress: () => startEdit(s) },
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
