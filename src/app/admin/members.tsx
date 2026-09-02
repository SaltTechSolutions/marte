import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { ListGroup, ListRow } from '@/components/ListRow';
import { SwipeableRow } from '@/components/SwipeableRow';
import { Text } from '@/components/Text';
import { useRefreshControl } from '@/components/useRefreshControl';
import { useToast } from '@/components/Toast';
import {
  approveMembership,
  countActiveMembers,
  rejectMembership,
  removeMemberFromTenant,
  watchActiveMembers,
  watchPendingRequests,
} from '@/data/firebase/membershipRepo';
import { reportError } from '@/data/errors';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { canActivateAnotherMember } from '@/data/seats';
import { TenantMembership } from '@/data/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

function requesterLabel(r: TenantMembership) {
  return r.userDisplayName || r.userEmail || r.userId;
}

function requesterInitials(r: TenantMembership) {
  const label = requesterLabel(r);
  return label.slice(0, 2).toUpperCase();
}

/** Join requests — one-tap approve, undo instead of confirm dialogs, bulk approve. */
export default function AdminMembers() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { activeMembership, activeTenant } = useAuth();

  // Only a real signed-in tenant admin can act here. No fallback to a demo
  // tenant — approving/rejecting real membership docs isn't something a
  // browsing (non-admin) session should be able to trigger.
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [requests, setRequests] = useState<TenantMembership[]>([]);
  // undefined until the roster snapshot lands; [] means the gym really is empty.
  const [members, setMembers] = useState<TenantMembership[] | undefined>(undefined);
  // No tenantId means there's nothing to load — start "loading" only when
  // there's actually a subscription about to kick off.
  const [loading, setLoading] = useState(() => !!tenantId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    return watchPendingRequests(
      tenantId,
      (r) => {
        setRequests(r);
        setLoading(false);
      },
      () => {
        // Clear loading too, otherwise a dropped listener leaves the screen
        // spinning forever with no explanation.
        setLoading(false);
        setFailed(true);
      },
    );
  }, [tenantId, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers, () => setFailed(true));
  }, [tenantId, retryKey]);

  const refreshControl = useRefreshControl(() => setRetryKey((k) => k + 1));

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setRetryKey((k) => k + 1);
  };

  /**
   * Approves one request. Returns whether the seat limit stopped it, so the
   * bulk path can stop instead of hitting the same wall once per person.
   */
  const approveOne = async (r: TenantMembership): Promise<'ok' | 'limit' | 'error'> => {
    if (!tenantId) return 'error';
    try {
      const activeCount = await countActiveMembers(tenantId);
      if (!canActivateAnotherMember(activeTenant, activeCount)) {
        // The request stays pending on purpose — nobody is turned away, the
        // gym just has to lift its seat limit first.
        return 'limit';
      }
      await approveMembership(r.id);
      return 'ok';
    } catch (e) {
      // The same limit is enforced in security rules, so a stale client-side
      // count still lands here rather than half-approving anyone.
      return (e as { code?: string }).code?.includes('permission-denied') ? 'limit' : 'error';
    }
  };

  const approve = async (r: TenantMembership) => {
    setBusyId(r.id);
    const outcome = await approveOne(r);
    setBusyId(null);
    if (outcome === 'ok') {
      toast.success(`${requesterLabel(r)} onaylandı`);
    } else if (outcome === 'limit') {
      toast.error(`${requesterLabel(r)} sırada bekliyor — üye limitine ulaştın.`);
      router.push('/paywall');
    } else {
      toast.error('Onaylanamadı, tekrar deneyin.');
    }
  };

  /**
   * PER-5. This was `requests.forEach((r) => approve(r))` — every request
   * fired in parallel, each read the same pre-approval seat count, and each
   * one that hit the limit raised its own toast and pushed the paywall. Five
   * pending requests on a full free tier meant five error toasts and the
   * paywall stacked five deep.
   *
   * Sequential, and it stops at the first refusal: once the gym is out of
   * seats the next person cannot fit either, so continuing only produces
   * noise. Whoever was approved before the wall stays approved.
   */
  const approveAll = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    let approved = 0;
    try {
      for (const r of requests) {
        const outcome = await approveOne(r);
        if (outcome === 'ok') {
          approved += 1;
          continue;
        }
        if (outcome === 'limit') {
          toast.error(
            approved > 0
              ? `${approved} kişi onaylandı, kalanlar sırada — üye limitine ulaştın.`
              : 'Üye limitine ulaştın, kimse onaylanamadı.',
          );
          router.push('/paywall');
          return;
        }
        toast.error(`${requesterLabel(r)} onaylanamadı, tekrar deneyin.`);
        return;
      }
      if (approved > 0) toast.success(`${approved} kişi onaylandı`);
    } finally {
      setBulkBusy(false);
    }
  };

  const reject = (r: TenantMembership) =>
    confirmDestructive({
      title: 'Katılım isteğini reddet',
      message: `${requesterLabel(r)} salonuna alınmayacak. İstek geri getirilemez; tekrar katılmak isterse yeniden başvurmalı.`,
      confirmLabel: 'Reddet',
      onConfirm: () => void doReject(r),
    });

  const doReject = async (r: TenantMembership) => {
    setBusyId(r.id);
    try {
      await rejectMembership(r.id);
      toast.success(`${requesterLabel(r)} reddedildi`);
    } catch (e) {
      reportError(e, toast, 'Reddedilemedi, tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Removal is destructive and wide: it takes the member's packages, credits,
   * sessions, check-ins, programs, measurements and workout logs with them.
   * So it asks twice — the first prompt says what will happen, the second
   * makes the admin confirm they meant this specific person. A single tap
   * behind a swipe is far too little friction for that.
   */
  const confirmRemove = (m: TenantMembership) =>
    confirmDestructive({
      title: 'Üyeyi sil',
      message: `${requesterLabel(m)} salondan çıkarılacak. Paketleri, ders hakları, randevuları, ölçümleri ve antrenman kayıtları da silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Devam et',
      onConfirm: () =>
        confirmDestructive({
          title: 'Emin misin?',
          message: `Son onay: ${requesterLabel(m)} ve tüm salon verisi kalıcı olarak silinecek.`,
          confirmLabel: 'Evet, sil',
          onConfirm: () => void doRemove(m),
        }),
    });

  const doRemove = async (m: TenantMembership) => {
    if (!tenantId) return;
    setBusyId(m.id);
    try {
      await removeMemberFromTenant(tenantId, m.userId);
      toast.success(`${requesterLabel(m)} silindi`);
    } catch (e) {
      reportError(e, toast, 'Silinemedi, tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  if (!tenantId) {
    return (
      <AccessGuard
        title="Salon yönetici oturumu gerekli"
        hint="Katılım isteklerini görmek ve onaylamak için bir salonun admin’i olarak giriş yapmalısın."
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={refreshControl}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3">
          İstekler <Text variant="h3" style={{ color: colors.p }}>{requests.length}</Text>
        </Text>
        {requests.length > 0 && (
          <Pressable onPress={() => void approveAll()} disabled={bulkBusy} accessibilityRole="button">
            <Text variant="helper" weight="700" style={{ color: bulkBusy ? colors.sub : colors.p }}>
              {bulkBusy ? 'Onaylanıyor…' : 'Tümünü onayla'}
            </Text>
          </Pressable>
        )}
      </View>

      {failed ? (
        <ErrorNotice message="Onay listesi alınamadı." onRetry={retry} />
      ) : loading ? (
        <ListSkeleton rows={2} />
      ) : requests.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: radius.md, padding: 12, alignItems: 'center' }}>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            Bekleyen istek yok
          </Text>
        </View>
      ) : (
        requests.map((r) => (
          <View key={r.id} style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="helper" weight="900" style={{ color: colors.p }}>
                  {requesterInitials(r)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700" numberOfLines={1}>
                  {requesterLabel(r)}
                </Text>
                <Text variant="label" tone="sub">
                  {r.requestedAt.toLocaleDateString('tr-TR')} tarihinde başvurdu
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              <Pressable
                onPress={() => reject(r)}
                disabled={busyId === r.id}
                style={{ flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: 11, paddingVertical: 8, alignItems: 'center', opacity: busyId === r.id ? 0.5 : 1 }}>
                <Text variant="helper" weight="700" tone="sub">
                  Reddet
                </Text>
              </Pressable>
              <Pressable
                onPress={() => approve(r)}
                disabled={busyId === r.id}
                style={{ flex: 2, backgroundColor: colors.p, borderRadius: 11, paddingVertical: 8, alignItems: 'center', opacity: busyId === r.id ? 0.5 : 1 }}>
                <Text variant="helper" weight="700" tone="onp">
                  ✓ Onayla
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {/* The gym's actual roster. Without this the tab showed only the
          approval queue, so a gym with 51 members and no pending requests
          looked empty. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: spacing.md }}>
        <Text variant="h3">
          Üyeler <Text variant="h3" style={{ color: colors.p }}>{members?.length ?? 0}</Text>
        </Text>
      </View>

      {failed ? null : members === undefined ? (
        <ListSkeleton />
      ) : members.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="Henüz üye yok"
          description="Salon kodunu resepsiyona asın — üyeler kodu girip katılım isteği gönderdiğinde burada onaya düşecek."
        />
      ) : (
        <ListGroup>
          {members.map((m, i) => (
            <SwipeableRow
              key={m.id}
              actions={[
                {
                  icon: 'create-outline',
                  label: 'Düzenle',
                  onPress: () => router.push({ pathname: '/admin/edit-member', params: { membershipId: m.id } }),
                },
                {
                  icon: 'trash-outline',
                  label: 'Sil',
                  destructive: true,
                  onPress: () => confirmRemove(m),
                },
              ]}>
            <ListRow
              last={i === members.length - 1}
              onPress={() => router.push({ pathname: '/admin/member', params: { memberId: m.userId, memberName: requesterLabel(m) } })}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="helper" weight="900" style={{ color: colors.p }}>
                  {requesterInitials(m)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700" numberOfLines={1}>
                  {requesterLabel(m)}
                </Text>
                <Text variant="label" tone="sub" numberOfLines={1}>
                  {m.shortCode ? `Giriş kodu ${m.shortCode}` : 'Giriş kodu atanıyor…'}
                </Text>
              </View>
              <Text tone="sub">›</Text>
            </ListRow>
            </SwipeableRow>
          ))}
        </ListGroup>
      )}
    </ScrollView>
  );
}
