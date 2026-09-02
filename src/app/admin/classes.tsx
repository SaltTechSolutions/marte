import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Chip } from '@/components/Chip';
import { DateStepper } from '@/components/DateStepper';
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
import {
  createClassSeries,
  deleteClass,
  deleteClassSeriesFrom,
  updateClass,
  watchClassesForTenant,
} from '@/data/firebase/classRepo';
import { watchActiveTrainers } from '@/data/firebase/membershipRepo';
import { gymWindowForDate } from '@/data/openingHours';
import { ClassSession, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { dateFromOffset, offsetFromDate, toHHMM, toMinutes } from '@/utils/time';

const DURATION_PRESETS = [30, 50, 60];
/** Occurrences including the first — 1 is an ordinary one-off (PER-10). */
const REPEAT_PRESETS: { weeks: number; label: string }[] = [
  { weeks: 1, label: 'Tek sefer' },
  { weeks: 4, label: '4 hafta' },
  { weeks: 8, label: '8 hafta' },
  { weeks: 12, label: '12 hafta' },
];

function sessionTime(d: Date) {
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
function sessionDay(d: Date) {
  return d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AdminClasses() {
  const { colors, spacing } = useAppTheme();
  const toast = useToast();
  const { activeMembership, activeTenant } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [trainers, setTrainers] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(!!tenantId);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [trainer, setTrainer] = useState('');
  // PER-8: the uid behind the chosen name. Empty when the gym has no trainers
  // added and the name was typed by hand — that class stays admin-owned.
  const [trainerId, setTrainerId] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(DURATION_PRESETS[1]);
  const [capacity, setCapacity] = useState(10);
  // Non-null while editing an existing class; the same form serves both so
  // the two can never drift apart in fields or validation.
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  // From the start of this month onward — the admin schedules ahead and
  // occasionally reviews the recent past, but never the whole history.
  // Computed once per mount: a value that changes every render would tear
  // the subscription down and rebuild it on each pass.
  const [listWindow] = useState(() => {
    const from = new Date();
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 3);
    return { from, to };
  });

  useEffect(() => {
    if (!tenantId) return;
    return watchClassesForTenant(
      tenantId,
      listWindow,
      (s) => {
        setSessions(s);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [tenantId, listWindow]);

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setName('');
    setTrainer('');
    setTrainerId('');
    setRepeatWeeks(1);
  };

  /** Opens the shared form on an existing class. Duration keeps the class's
   *  own value appended when it is not among the presets, otherwise reopening
   *  a 75-minute class would silently shorten it to 60. */
  const startEdit = (s: ClassSession) => {
    setEditing(s);
    setName(s.name);
    setTrainer(s.trainerName);
    setTrainerId(s.trainerId ?? '');
    setDuration(s.durationMinutes);
    setCapacity(s.capacity);
    setTime(sessionTime(s.date));
    setDayOffset(offsetFromDate(s.date));
    setRepeatWeeks(1);
    setShowForm(true);
  };

  /** New classes cannot start before today. An existing one already in the
   *  past keeps its own date as the floor — editing yesterday's capacity must
   *  not silently drag the class forward to today. */
  const minOffset = editing ? Math.min(0, offsetFromDate(editing.date)) : 0;
  /** The far edge of the window the list below watches. Scheduling past it
   *  would create a class this screen could never show again. */
  const maxOffset = offsetFromDate(listWindow.to);

  /**
   * The gym's window on the chosen day, and the bounds the time stepper gets.
   *
   * `undefined` = this gym has never set opening hours, so nothing is clamped.
   * `null` = the gym is shut that day; the class cannot be scheduled at all.
   *
   * The class has to *end* by closing time, not merely start before it, so the
   * ceiling moves with the duration. A window shorter than the class leaves no
   * legal start at all — the bound collapses onto the opening time and the
   * warning below says why, rather than the stepper just refusing to move.
   */
  const gymWindow = gymWindowForDate(activeTenant?.openingHours, dateFromOffset(dayOffset));
  const timeBounds = gymWindow
    ? {
        min: toHHMM(Math.min(toMinutes(gymWindow.open), toMinutes(time))),
        max: toHHMM(Math.max(toMinutes(gymWindow.open), toMinutes(gymWindow.close) - duration)),
      }
    : undefined;
  const gymClosedThatDay = gymWindow === null;
  const outsideGymHours =
    !!gymWindow &&
    (toMinutes(time) < toMinutes(gymWindow.open) ||
      toMinutes(time) + duration > toMinutes(gymWindow.close));

  const durationChoices = useMemo(
    () => (DURATION_PRESETS.includes(duration) ? DURATION_PRESETS : [...DURATION_PRESETS, duration]),
    [duration],
  );

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveTrainers(tenantId, setTrainers);
  }, [tenantId]);

  const submit = async () => {
    if (!tenantId || !name.trim() || !trainer.trim() || gymClosedThatDay) return;
    setSubmitting(true);
    try {
      const [hh, mm] = time.split(':').map(Number);
      const date = dateFromOffset(dayOffset);
      date.setHours(hh, mm, 0, 0);
      if (editing) {
        await updateClass(editing.id, {
          name: name.trim(),
          ...(trainerId ? { trainerId } : {}),
          trainerName: trainer.trim(),
          date,
          durationMinutes: duration,
          capacity,
        });
        toast.success('Ders güncellendi');
      } else {
        const { created } = await createClassSeries(
          {
            tenantId,
            name: name.trim(),
            ...(trainerId ? { trainerId } : {}),
            trainerName: trainer.trim(),
            date,
            durationMinutes: duration,
            capacity,
          },
          repeatWeeks,
        );
        toast.success(created > 1 ? `${created} hafta boyunca eklendi` : 'Ders eklendi');
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
    const who =
      booked > 0
        ? `\n\n${booked} kişi bu derse kayıtlı. İptal edince ders programlarından kalkacak.`
        : '\n\nHenüz kimse kayıtlı değil.';

    // A repeating class is almost never cancelled for one week only — but
    // sometimes it is, so both stay on offer and neither is the default.
    // Forward-only: past occurrences already ran, and deleting them would take
    // their attendance with them.
    if (s.seriesId) {
      Alert.alert(
        'Dersi iptal et',
        `${s.name} — ${sessionDay(s.date)} ${sessionTime(s.date)}${who}`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Yalnızca bu ders', style: 'destructive', onPress: () => void doCancel(s) },
          {
            text: 'Bu ve sonrakiler',
            style: 'destructive',
            onPress: () => void doCancelSeries(s),
          },
        ],
      );
      return;
    }

    confirmDestructive({
      title: 'Dersi iptal et',
      message: `${s.name} — ${sessionDay(s.date)} ${sessionTime(s.date)}${who}`,
      confirmLabel: 'Dersi iptal et',
      onConfirm: () => void doCancel(s),
    });
  };

  const doCancelSeries = async (s: ClassSession) => {
    if (!tenantId || !s.seriesId) return;
    try {
      const { deleted } = await deleteClassSeriesFrom(tenantId, s.seriesId, s.date);
      toast.success(`${deleted} ders iptal edildi`);
    } catch (e) {
      reportError(e, toast, 'İptal edilemedi, tekrar dene.');
    }
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
                return (
                  <Chip
                    key={t.id}
                    label={label}
                    selected={trainerId === t.userId}
                    onPress={() => {
                      setTrainer(label);
                      setTrainerId(t.userId);
                    }}
                  />
                );
              })}
            </View>
          ) : (
            <TextField
              placeholder="Eğitmen adı"
              value={trainer}
              onChangeText={(v) => {
                setTrainer(v);
                setTrainerId('');
              }}
            />
          )}

          <Text variant="label" tone="sub">
            GÜN
          </Text>
          <DateStepper value={dayOffset} onChange={setDayOffset} min={minOffset} max={maxOffset} />

          <Text variant="label" tone="sub">
            SAAT
          </Text>
          {gymClosedThatDay ? (
            <Text variant="helper" style={{ color: colors.warn }}>
              Salon o gün kapalı. Ders eklemek için başka bir gün seç ya da
              çalışma saatlerini güncelle.
            </Text>
          ) : (
            <>
              <TimeStepper
                value={time}
                onChange={setTime}
                min={timeBounds?.min}
                max={timeBounds?.max}
                hint={gymWindow ? `başlangıç · salon ${gymWindow.open}–${gymWindow.close}` : undefined}
              />
              {outsideGymHours && (
                <Text variant="label" style={{ color: colors.warn }}>
                  Bu ders salonun {gymWindow!.open}–{gymWindow!.close} saatleri dışına taşıyor.
                </Text>
              )}
            </>
          )}

          <Text variant="label" tone="sub">
            SÜRE
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {durationChoices.map((d) => (
              <Chip key={d} label={`${d} dk`} selected={duration === d} onPress={() => setDuration(d)} />
            ))}
          </View>

          {!editing && (
            <>
              <Text variant="label" tone="sub">
                TEKRAR
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {REPEAT_PRESETS.map((r) => (
                  <Chip
                    key={r.weeks}
                    label={r.label}
                    selected={repeatWeeks === r.weeks}
                    onPress={() => setRepeatWeeks(r.weeks)}
                  />
                ))}
              </View>
              {repeatWeeks > 1 && (
                <Text variant="label" tone="sub">
                  Aynı gün ve saatte {repeatWeeks} hafta boyunca oluşturulur.
                </Text>
              )}
            </>
          )}

          <Text variant="label" tone="sub">
            KONTENJAN
          </Text>
          <Stepper value={capacity} unit="kişi" step={1} decimals={0} onChange={setCapacity} />

          <Button
            label={submitting ? (editing ? 'Kaydediliyor…' : 'Ekleniyor…') : editing ? 'Değişikliği kaydet' : 'Dersi ekle'}
            critical
            disabled={!name.trim() || !trainer.trim() || submitting || gymClosedThatDay}
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
