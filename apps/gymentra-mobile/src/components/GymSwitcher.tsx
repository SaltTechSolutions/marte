import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { getTenant } from '@/data/firebase/tenantRepo';
import { ROLE_LABEL } from '@/data/membership';
import { Tenant, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

/**
 * Salon değiştirici (P1-8).
 *
 * İki salona üye olan kişi ikincisine hiç erişemiyordu: istemci ilk aktif
 * üyeliği alıp gerisini yok sayıyordu. Kişi bir salonda yönetici, diğerinde
 * üye olabilir — bu yüzden geçiş rolü de yeniden çözer.
 *
 * Yalnızca birden fazla üyelik varsa görünür: tek salonlu hesapların
 * ezici çoğunluğuna hiçbir şey eklemiyor.
 */
export function GymSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors, spacing, radius } = useAppTheme();
  const { memberships, activeMembership, switchTenant } = useAuth();
  const router = useRouter();
  const [tenants, setTenants] = useState<Record<string, Tenant>>({});

  // Salon adları üyelik belgesinde yok; liste açılınca okunuyor. Ad gelene
  // kadar satır kimliğini rol ve kod taşıyor, boş kutu gösterilmiyor.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all(
      memberships.map(async (m) => {
        try {
          return [m.tenantId, await getTenant(m.tenantId)] as const;
        } catch {
          return [m.tenantId, null] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, Tenant> = {};
      pairs.forEach(([id, tenant]) => {
        if (tenant) next[id] = tenant;
      });
      setTenants(next);
    });
    return () => {
      cancelled = true;
    };
  }, [open, memberships]);

  const pick = async (m: TenantMembership) => {
    await switchTenant(m.tenantId);
    onClose();
    // Rol salona göre değişiyor: yeni yüzeye kök üzerinden gidiliyor, yoksa
    // yöneticiden üyeye geçen biri artık açamayacağı bir ekranda kalıyor.
    router.replace('/');
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Kapat"
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.bg0,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.md,
            gap: spacing.sm,
            maxHeight: '80%',
          }}>
          <Text variant="h3">Salonlarım</Text>
          <Text variant="label" tone="sub">
            Uygulama seçtiğin salonu gösterir. Rolün her salonda ayrıdır.
          </Text>

          <ScrollView contentContainerStyle={{ gap: spacing.xs }}>
            {memberships.map((m) => {
              const on = m.tenantId === activeMembership?.tenantId;
              const tenant = tenants[m.tenantId];
              return (
                <Pressable
                  key={m.tenantId}
                  onPress={() => (on ? onClose() : pick(m))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 60,
                    paddingHorizontal: 13,
                    backgroundColor: colors.surf,
                    borderWidth: 1,
                    borderColor: on ? colors.p : colors.line,
                    borderRadius: radius.md,
                  }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="helper" weight="700" numberOfLines={1}>
                      {tenant?.branding.appName || tenant?.name || m.tenantId}
                    </Text>
                    <Text variant="label" tone="sub">
                      {m.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
                    </Text>
                  </View>
                  {on ? <Ionicons name="checkmark-circle" size={22} color={colors.pText} /> : <Text tone="sub">›</Text>}
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={() => {
              onClose();
              router.push('/onboarding/gym-code');
            }}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              minHeight: 52,
              paddingHorizontal: 13,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.md,
            }}>
            <Ionicons name="add-circle-outline" size={20} color={colors.pText} />
            <Text variant="helper" weight="700" style={{ flex: 1 }}>
              Başka bir salona katıl
            </Text>
            <Text tone="sub">›</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Ana ekran başlığındaki salon satırı. Tek salonlu hesapta düz metin, birden
 * fazlaysa dokunulabilir — hesabın çoğunluğuna hiçbir şey eklemiyor.
 */
export function GymSwitchTarget({ children }: { children: React.ReactNode }) {
  const { memberships } = useAuth();
  const [open, setOpen] = useState(false);
  if (memberships.length < 2) return <>{children}</>;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Salon değiştir"
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {children}
      </Pressable>
      <GymSwitcher open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Hesap ekranlarındaki satır. Aynı gerekçeyle tek salonluda görünmez. */
export function GymSwitchRow() {
  const { colors, radius, spacing } = useAppTheme();
  const { memberships } = useAuth();
  const [open, setOpen] = useState(false);
  if (memberships.length < 2) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 13,
          marginTop: spacing.xs,
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
        }}>
        <Ionicons name="swap-horizontal-outline" size={19} color={colors.pText} />
        <View style={{ flex: 1 }}>
          <Text variant="helper" weight="700">
            Salon değiştir
          </Text>
          <Text variant="label" tone="sub">
            {memberships.length} salonda üyeliğin var
          </Text>
        </View>
        <Text tone="sub">›</Text>
      </Pressable>
      <GymSwitcher open={open} onClose={() => setOpen(false)} />
    </>
  );
}
