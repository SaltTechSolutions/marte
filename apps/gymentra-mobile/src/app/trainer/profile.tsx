import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { StatCard } from '@/components/StatCard';
import { GymCodeCard } from '@/components/GymCodeCard';
import { GymSwitchRow } from '@/components/GymSwitcher';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { LegalLinks } from '@/components/LegalLinks';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { useAuth } from '@/context/AuthContext';
import { EXERCISES } from '@/data/exerciseLibrary';
import { reportError } from '@/data/errors';
import { isStaff, tenantIdIf } from '@/data/membership';
import { grantCalendarShare, revokeCalendarShare, watchSharesGrantedToMe, watchSharesIGranted } from '@/data/firebase/calendarShareRepo';
import { watchActiveMembers, watchActiveTrainers } from '@/data/firebase/membershipRepo';
import { watchProgramsForTenant } from '@/data/firebase/programRepo';
import { watchSessionsForTrainer } from '@/data/firebase/ptSessionRepo';
import { CalendarShare, Program, PtSession, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { signOutAndForget } from '@/services/signOut';

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(): Date {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Trainer's own profile: workload at a glance, plus calendar-sharing
 * management — grant a colleague view/take-over access so they can cover
 * for you when you're out. */
export default function TrainerProfile() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { user, activeMembership, activeTenant } = useAuth();
  const uid = user?.uid;
  const tenantId = tenantIdIf(activeMembership, isStaff(activeMembership));
  const tenantName = activeMembership?.tenantName ?? '';
  const displayName = user?.displayName || user?.email || 'Antrenör';

  // `undefined` = not here yet. These used to start as [] and so drew "0
  // randevu", "Bu salonda başka aktif antrenör yok" and, worst, "Erişimi yok"
  // beside a colleague the calendar IS shared with — with a live "Paylaş"
  // button that decided grant-or-revoke from that empty list (DEN-13).
  const [colleagues, setColleagues] = useState<TenantMembership[] | undefined>(undefined);
  const [grantedShares, setGrantedShares] = useState<CalendarShare[] | undefined>(undefined);
  const [sharedToMe, setSharedToMe] = useState<CalendarShare[]>([]);
  const [members, setMembers] = useState<TenantMembership[] | undefined>(undefined);
  const [programs, setPrograms] = useState<Program[] | undefined>(undefined);
  const [sessions, setSessions] = useState<PtSession[] | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);

  // One flag for the six listeners plus one banner; the tap clears it (AGENTS
  // §4: no synchronising setState in the effect).
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };
  const onError = () => setFailed(true);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchActiveTrainers(tenantId, (all) => setColleagues(all.filter((t) => t.userId !== uid)), onError);
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchSharesIGranted(tenantId, uid, setGrantedShares, onError);
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchSharesGrantedToMe(tenantId, uid, setSharedToMe, onError);
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers, onError);
  }, [tenantId, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    return watchProgramsForTenant(tenantId, setPrograms, onError);
  }, [tenantId, retryKey]);

  // The stats below only ever look at this month, so scope the listener to it.
  const monthRange = useMemo(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }, []);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchSessionsForTrainer(tenantId, uid, monthRange, setSessions, onError);
  }, [tenantId, uid, monthRange, retryKey]);

  const stats = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    if (!sessions) return null;
    return {
      today: sessions.filter((s) => s.status === 'scheduled' && isSameDay(s.date, today)).length,
      thisWeek: sessions.filter((s) => s.status !== 'cancelled' && s.date >= weekStart).length,
      completedThisMonth: sessions.filter((s) => s.status === 'completed' && s.date >= monthStart).length,
    };
  }, [sessions]);

  const myPrograms = useMemo(() => programs?.filter((p) => p.trainerId === user?.uid), [programs, user?.uid]);

  if (!tenantId || !user) {
    return <AccessGuard title="Salon antrenör oturumu gerekli" />;
  }

  const grantedTo = new Set((grantedShares ?? []).map((s) => s.viewerTrainerId));
  const activeProgramCount = myPrograms ? myPrograms.filter((p) => p.status === 'active').length : '–';
  const draftProgramCount = myPrograms ? myPrograms.filter((p) => p.status === 'draft').length : '–';

  const toggleShare = async (colleague: TenantMembership) => {
    // Whether the calendar is already shared comes from `grantedShares`; toggling
    // before it arrives would grant or revoke on a guess.
    if (!grantedShares) return;
    setBusyId(colleague.userId);
    try {
      if (grantedTo.has(colleague.userId)) {
        await revokeCalendarShare(tenantId, user.uid, colleague.userId);
      } else {
        await grantCalendarShare({
          tenantId,
          ownerTrainerId: user.uid,
          ownerTrainerName: displayName,
          viewerTrainerId: colleague.userId,
        });
      }
    } catch (e) {
      reportError(e, toast, 'Takvim paylaşımı güncellenemedi, tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg }}>
      {/* --- Identity --- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.surf2,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.p,
          }}>
          <Text variant="body" weight="900" style={{ color: colors.pText }}>
            {initialsOf(displayName)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {displayName}
          </Text>
          <Text variant="helper" tone="sub" numberOfLines={1}>
            Antrenör · {tenantName}
          </Text>
          {user.email && (
            <Text variant="label" tone="sub" numberOfLines={1}>
              {user.email}
            </Text>
          )}
        </View>
      </View>

      {failed ? (
        <ErrorNotice message="Bazı bilgiler yüklenemedi; aşağıdaki sayılar ve paylaşımlar eksik olabilir." onRetry={retry} />
      ) : null}

      {activeTenant && <GymCodeCard tenantName={activeTenant.name} code={activeTenant.code} showQrAction />}
      <GymSwitchRow />

      {/* --- Workload --- */}
      <StatCard
        label="RANDEVULARIM"
        stats={[
          { value: stats?.today ?? '–', label: 'bugün' },
          { value: stats?.thisWeek ?? '–', label: 'bu hafta' },
          { value: stats?.completedThisMonth ?? '–', label: 'bu ay tamamlanan' },
        ]}
      />

      <Pressable onPress={() => router.push('/trainer/availability')}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: 13,
          }}>
          <Ionicons name="time-outline" size={18} color={colors.txt} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Çalışma saatlerim
            </Text>
            <Text variant="label" tone="sub">
              Üyeler yalnızca bu saatlerde randevu alabilir
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

      <Pressable onPress={() => router.push('/exercise-library')}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surf,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: 13,
          }}>
          <Ionicons name="body-outline" size={18} color={colors.txt} />
          <View style={{ flex: 1 }}>
            <Text variant="helper" weight="700">
              Hareket kütüphanesi
            </Text>
            <Text variant="label" tone="sub">
              {EXERCISES.length} hareket — çalışan kaslar ve anlatım
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>


      {/* --- Coaching load --- */}
      <StatCard
        label="ÜYE VE PROGRAMLAR"
        stats={[
          { value: members?.length ?? '–', label: 'salon üyesi' },
          { value: activeProgramCount, label: 'aktif programım' },
          { value: draftProgramCount, label: 'taslak' },
        ]}
      />

      {/* --- Calendars shared with me --- */}
      {sharedToMe.length > 0 && (
        <Card style={{ gap: 8 }}>
          <Text variant="label" tone="sub">
            BANA AÇILAN TAKVİMLER
          </Text>
          {sharedToMe.map((s) => (
            <Text key={s.id} variant="helper" numberOfLines={1}>
              {s.ownerTrainerName}
              <Text variant="label" tone="sub">
                {' '}
                · takvimini görebilir ve devralabilirsin
              </Text>
            </Text>
          ))}
        </Card>
      )}

      {/* --- Calendar sharing --- */}
      <View style={{ gap: 8, marginTop: spacing.xs }}>
        <Text variant="label" tone="sub">
          TAKVİM PAYLAŞIMI — SEN YOKKEN KİM DEVRALSIN?
        </Text>
        {colleagues === undefined ? (
          <Text variant="helper" tone="sub">
            {failed ? 'Alınamadı' : 'Yükleniyor…'}
          </Text>
        ) : colleagues.length === 0 ? (
          <Text variant="helper" tone="sub">
            Bu salonda başka aktif antrenör yok.
          </Text>
        ) : (
          colleagues.map((c) => {
            const name = c.userDisplayName || c.userEmail || 'Antrenör';
            const granted = grantedTo.has(c.userId);
            return (
              <View
                key={c.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: colors.surf,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  padding: 12,
                }}>
                <View
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="label" weight="900" style={{ color: colors.pText }}>
                    {initialsOf(name)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="label" tone="sub" numberOfLines={1}>
                    {!grantedShares ? (failed ? 'Alınamadı' : 'Yükleniyor…') : granted ? 'Takvimini görebilir ve devralabilir' : 'Erişimi yok'}
                  </Text>
                </View>
                <Button
                  label={busyId === c.userId ? '…' : granted ? 'Kaldır' : 'Paylaş'}
                  variant={granted ? 'ghost' : 'secondary'}
                  compact
                  disabled={busyId === c.userId || !grantedShares}
                  onPress={() => toggleShare(c)}
                />
              </View>
            );
          })
        )}
      </View>

      <Button
        label="Çıkış yap"
        variant="ghost"
        onPress={async () => {
          await signOutAndForget();
          router.replace('/onboarding/register?mode=signIn');
        }}
        style={{ marginTop: spacing.sm }}
      />

      <RoleSwitcher />

      <NotificationPreferences />
<LegalLinks />
      <DeleteAccountButton />
    </ScrollView>
  );
}
