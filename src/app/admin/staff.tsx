import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import {
  setMembershipPermissions,
  setMembershipRoles,
  watchActiveMembers,
  watchActiveTrainers,
} from '@/data/firebase/membershipRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { MembershipRole, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function nameOf(m: TenantMembership): string {
  return m.userDisplayName || m.userEmail || 'Kullanıcı';
}

function rolesLabel(roles: MembershipRole[]): string {
  const parts: string[] = [];
  if (roles.includes('admin')) parts.push('Yönetici');
  if (roles.includes('trainer')) parts.push('Antrenör');
  if (roles.includes('member')) parts.push('Üye');
  return parts.join(' · ') || 'Rol yok';
}

/**
 * Staff and permissions — who works here, and who may admit members at the
 * door while the owner isn't in.
 *
 * The check-in permission exists because in a small studio the owner is
 * rarely standing at the desk all day; without it a member can't get in
 * unless the admin personally scans them.
 */
export default function AdminStaff() {
  const { colors, spacing } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [trainers, setTrainers] = useState<TenantMembership[]>([]);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveTrainers(tenantId, setTrainers, () => setFailed(true));
  }, [tenantId, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers, () => setFailed(true));
  }, [tenantId, retryKey]);

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  const toggleCheckin = async (m: TenantMembership) => {
    setBusyId(m.id);
    try {
      const has = m.permissions.includes('checkin');
      await setMembershipPermissions(m.id, has ? [] : ['checkin']);
    } finally {
      setBusyId(null);
    }
  };

  const toggleTrainerRole = async (m: TenantMembership) => {
    setBusyId(m.id);
    try {
      const isTrainer = m.roles.includes('trainer');
      const next = isTrainer ? m.roles.filter((r) => r !== 'trainer') : ([...m.roles, 'trainer'] as MembershipRole[]);
      await setMembershipRoles(m.id, next);
    } finally {
      setBusyId(null);
    }
  };

  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  const isSelf = (m: TenantMembership) => m.userId === user?.uid;

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Text variant="h3">Ekip ve yetkiler</Text>

      {failed && <ErrorNotice message="Ekip listesi alınamadı." onRetry={retry} />}

      <Card style={{ gap: 6 }}>
        <Text variant="label" tone="sub">
          KAPIDA ÜYE KABULÜ
        </Text>
        <Text variant="helper" tone="sub">
          Sen salonda olmadığında üyeleri kimin içeri alabileceğini buradan
          seçersin. Bu yetki yalnızca QR/kod okutmayı açar — ödeme defterine
          veya salon ayarlarına erişim vermez.
        </Text>
      </Card>

      <Text variant="label" tone="sub">
        ANTRENÖRLER
      </Text>
      {trainers.length === 0 ? (
        <Text variant="helper" tone="sub">
          Bu salonda henüz antrenör yok.
        </Text>
      ) : (
        trainers.map((m) => {
          const canCheckIn = m.permissions.includes('checkin') || m.roles.includes('admin');
          const isAdminToo = m.roles.includes('admin');
          return (
            <Card key={m.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="label" weight="900" style={{ color: colors.p }}>
                    {initialsOf(nameOf(m))}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700" numberOfLines={1}>
                    {nameOf(m)}
                    {isSelf(m) ? ' (sen)' : ''}
                  </Text>
                  <Text variant="label" tone="sub" numberOfLines={1}>
                    {rolesLabel(m.roles)}
                  </Text>
                </View>
              </View>

              {isAdminToo ? (
                <Text variant="label" tone="sub">
                  Yönetici olduğu için üye kabulü zaten açık.
                </Text>
              ) : (
                <Button
                  label={busyId === m.id ? '…' : canCheckIn ? 'Üye kabulünü kaldır' : 'Üye kabulü ver'}
                  variant={canCheckIn ? 'ghost' : 'secondary'}
                  compact
                  disabled={busyId === m.id}
                  onPress={() => toggleCheckin(m)}
                />
              )}
            </Card>
          );
        })
      )}

      <Text variant="label" tone="sub" style={{ marginTop: spacing.sm }}>
        ÜYELER
      </Text>
      <Text variant="helper" tone="sub">
        Bir üyeyi antrenör yapabilirsin. Küçük salonlarda aynı kişi hem
        çalıştırıp hem üye olabilir — roller birbirini dışlamaz.
      </Text>
      {members.length === 0 ? (
        <Text variant="helper" tone="sub">
          Henüz aktif üye yok.
        </Text>
      ) : (
        members.map((m) => (
          <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="label" weight="900" style={{ color: colors.p }}>
                {initialsOf(nameOf(m))}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700" numberOfLines={1}>
                {nameOf(m)}
                {isSelf(m) ? ' (sen)' : ''}
              </Text>
              <Text variant="label" tone="sub" numberOfLines={1}>
                {rolesLabel(m.roles)}
              </Text>
            </View>
            <Button
              label={busyId === m.id ? '…' : m.roles.includes('trainer') ? 'Antrenörlüğü al' : 'Antrenör yap'}
              variant={m.roles.includes('trainer') ? 'ghost' : 'secondary'}
              compact
              disabled={busyId === m.id}
              onPress={() => toggleTrainerRole(m)}
            />
          </Card>
        ))
      )}
    </ScrollView>
  );
}
