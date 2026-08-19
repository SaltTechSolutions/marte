import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { toGymClass } from '@/data/classDisplay';
import { watchClassesForTenant } from '@/data/firebase/classRepo';
import { watchCompletedThisWeek } from '@/data/firebase/workoutLogRepo';
import { GymClass } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

const WEEKLY_TARGET = 4;

/** Member home — "what's my next class?" answerable in under 3 seconds. */
export default function MemberHome() {
  const router = useRouter();
  const { colors, spacing, tenantName } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;
  const displayName = user?.displayName?.split(' ')[0] || 'Üye';

  const [todayClass, setTodayClass] = useState<GymClass | null | undefined>(undefined);
  const [completedThisWeek, setCompletedThisWeek] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    // Home card only shows today, so load just today.
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return watchClassesForTenant(tenantId, { from, to }, (sessions) => {
      const now = new Date();
      const todaySessions = sessions.filter((s) => s.date.toDateString() === now.toDateString());
      const bookedToday = todaySessions.find((s) => uid && s.bookedUserIds.includes(uid));
      const pick = bookedToday ?? todaySessions[0] ?? null;
      setTodayClass(pick ? toGymClass(pick, uid) : null);
    });
  }, [tenantId, uid]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchCompletedThisWeek(tenantId, uid, setCompletedThisWeek);
  }, [tenantId, uid]);

  const percent = Math.min(100, Math.round((completedThisWeek / WEEKLY_TARGET) * 100));

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" tone="onp" weight="900">
            {tenantName[0]}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="helper" weight="700">
            {tenantName}
          </Text>
          <Text variant="label" tone="sub">
            Merhaba {displayName} 👋
          </Text>
        </View>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Text>🔔</Text>
        </View>
      </View>

      <Card style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <ProgressRing percent={percent} label={`%${percent}`} sublabel="hedef" />
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="900">
            Haftada {completedThisWeek}/{WEEKLY_TARGET} antrenman
          </Text>
          <Text variant="helper" tone="sub" style={{ marginTop: 3 }}>
            {completedThisWeek >= WEEKLY_TARGET ? 'Bu haftaki hedefini tamamladın 🎉' : `Hedefe ${WEEKLY_TARGET - completedThisWeek} antrenman kaldı`}
          </Text>
        </View>
      </Card>

      {todayClass && (
        <>
          <Text variant="label" tone="sub" style={{ marginTop: 8 }}>
            BUGÜN
          </Text>
          <Pressable onPress={() => router.push('/member/classes')}>
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ backgroundColor: colors.surf2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text variant="body" weight="900">
                  {todayClass.time}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700">
                  {todayClass.name}
                </Text>
                <Text variant="label" tone="sub">
                  {todayClass.meta}
                </Text>
              </View>
            </Card>
          </Pressable>
        </>
      )}

      <Button
        variant="pulse"
        label="Üye Kartım"
        icon="▦"
        critical
        onPress={() => router.push('/member/card')}
        style={{ marginTop: spacing.sm }}
      />

      <Pressable onPress={() => router.push('/member/payments')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 18 }}>💳</Text>
          <Text variant="helper" weight="700" style={{ flex: 1 }}>
            Ödemelerim
          </Text>
          <Text tone="sub">›</Text>
        </Card>
      </Pressable>
    </ScrollView>
  );
}
