import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StatCard } from '@/components/StatCard';
import { GymCodeCard } from '@/components/GymCodeCard';
import { DeleteAccountButton } from '@/components/DeleteAccountButton';
import { LegalLinks } from '@/components/LegalLinks';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { RoleSwitcher } from '@/components/RoleSwitcher';
import { useAuth } from '@/context/AuthContext';
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

  const [colleagues, setColleagues] = useState<TenantMembership[]>([]);
  const [grantedShares, setGrantedShares] = useState<CalendarShare[]>([]);
  const [sharedToMe, setSharedToMe] = useState<CalendarShare[]>([]);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sessions, setSessions] = useState<PtSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchActiveTrainers(tenantId, (all) => setColleagues(all.filter((t) => t.userId !== uid)));
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchSharesIGranted(tenantId, uid, setGrantedShares);
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchSharesGrantedToMe(tenantId, uid, setSharedToMe);
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    return watchProgramsForTenant(tenantId, setPrograms);
  }, [tenantId]);

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
    return watchSessionsForTrainer(tenantId, uid, monthRange, setSessions);
  }, [tenantId, uid, monthRange]);

  const stats = useMemo(() => {
    const today = new Date();
    const weekStart = startOfWeek();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      today: sessions.filter((s) => s.status === 'scheduled' && isSameDay(s.date, today)).length,
      thisWeek: sessions.filter((s) => s.status !== 'cancelled' && s.date >= weekStart).length,
      completedThisMonth: sessions.filter((s) => s.status === 'completed' && s.date >= monthStart).length,
    };
  }, [sessions]);

  const myPrograms = useMemo(() => programs.filter((p) => p.trainerId === user?.uid), [programs, user?.uid]);

  if (!tenantId || !user) {
    return <AccessGuard title="Salon antrenör oturumu gerekli" />;
  }

  const grantedTo = new Set(grantedShares.map((s) => s.viewerTrainerId));
  const activeProgramCount = myPrograms.filter((p) => p.status === 'active').length;
  const draftProgramCount = myPrograms.filter((p) => p.status === 'draft').length;

  const toggleShare = async (colleague: TenantMembership) => {
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
          <Text variant="body" weight="900" style={{ color: colors.p }}>
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

      {activeTenant && <GymCodeCard tenantName={activeTenant.name} code={activeTenant.code} showQrAction />}

      {/* --- Workload --- */}
      <StatCard
        label="RANDEVULARIM"
        stats={[
          { value: stats.today, label: 'bugün' },
          { value: stats.thisWeek, label: 'bu hafta' },
          { value: stats.completedThisMonth, label: 'bu ay tamamlanan' },
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
              46 hareket — çalışan kaslar ve anlatım
            </Text>
          </View>
          <Text tone="sub">›</Text>
        </View>
      </Pressable>

      {/* --- Coaching load --- */}
      <StatCard
        label="ÜYE VE PROGRAMLAR"
        stats={[
          { value: members.length, label: 'salon üyesi' },
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
        {colleagues.length === 0 ? (
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
                  <Text variant="label" weight="900" style={{ color: colors.p }}>
                    {initialsOf(name)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="label" tone="sub" numberOfLines={1}>
                    {granted ? 'Takvimini görebilir ve devralabilir' : 'Erişimi yok'}
                  </Text>
                </View>
                <Button
                  label={busyId === c.userId ? '…' : granted ? 'Kaldır' : 'Paylaş'}
                  variant={granted ? 'ghost' : 'secondary'}
                  compact
                  disabled={busyId === c.userId}
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
          router.replace('/onboarding/register');
        }}
        style={{ marginTop: spacing.sm }}
      />

      <RoleSwitcher />

      <LegalLinks />
      <DeleteAccountButton />
    </ScrollView>
  );
}
