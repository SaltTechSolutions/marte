import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Snackbar } from '@/components/Snackbar';
import { Stepper } from '@/components/Stepper';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { createClass, watchClassesForTenant } from '@/data/firebase/classRepo';
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
  const { colors, spacing, radius } = useAppTheme();
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
  const [snack, setSnack] = useState<string | null>(null);

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
      setSnack('Ders eklendi');
    } catch {
      setSnack('Ders eklenemedi, tekrar dene.');
    } finally {
      setSubmitting(false);
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
        <Text variant="helper" tone="sub">
          Yükleniyor…
        </Text>
      ) : sessions.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: radius.md, padding: 12, alignItems: 'center' }}>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            Henüz ders eklenmedi — üstteki butonla ilk dersini oluştur.
          </Text>
        </View>
      ) : (
        <ListGroup>
          {sessions.map((s, i) => (
            <ListRow key={s.id} last={i === sessions.length - 1}>
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
          ))}
        </ListGroup>
      )}

      {snack && <Snackbar message={snack} onAction={() => setSnack(null)} />}
    </KeyboardAwareScroll>
  );
}
