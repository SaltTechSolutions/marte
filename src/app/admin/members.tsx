import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { ErrorNotice } from '@/components/ErrorNotice';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Snackbar } from '@/components/Snackbar';
import { Text } from '@/components/Text';
import {
  approveMembership,
  countActiveMembers,
  rejectMembership,
  watchActiveMembers,
  watchPendingRequests,
} from '@/data/firebase/membershipRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { TenantMembership } from '@/data/types';
import { useAuth } from '@/context/AuthContext';
import { useAppTheme } from '@/theme/ThemeContext';

const FREE_MEMBER_LIMIT = 10;

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
  const { activeMembership } = useAuth();

  // Only a real signed-in tenant admin can act here. No fallback to a demo
  // tenant — approving/rejecting real membership docs isn't something a
  // browsing (non-admin) session should be able to trigger.
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [requests, setRequests] = useState<TenantMembership[]>([]);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  // No tenantId means there's nothing to load — start "loading" only when
  // there's actually a subscription about to kick off.
  const [loading, setLoading] = useState(() => !!tenantId);
  const [snack, setSnack] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const retry = () => {
    setFailed(false);
    setLoading(true);
    setRetryKey((k) => k + 1);
  };

  const approve = async (r: TenantMembership) => {
    if (!tenantId) return;
    setBusyId(r.id);
    try {
      const activeCount = await countActiveMembers(tenantId);
      if (activeCount >= FREE_MEMBER_LIMIT) {
        // The request stays pending on purpose — nobody is turned away, the
        // gym just has to lift its seat limit first. Say so, then show the
        // upgrade screen; silently returning left the admin tapping a button
        // that appeared to do nothing.
        setSnack(`${requesterLabel(r)} sırada bekliyor — üye limitine ulaştın.`);
        router.push('/paywall');
        return;
      }
      await approveMembership(r.id);
      setSnack(`${requesterLabel(r)} onaylandı`);
    } catch (e) {
      // The same limit is enforced in security rules, so a stale client-side
      // count still lands here rather than half-approving anyone.
      const denied = (e as { code?: string }).code?.includes('permission-denied');
      setSnack(denied ? 'Üye limitine ulaştın — yükseltmen gerekiyor.' : 'Onaylanamadı, tekrar deneyin.');
      if (denied) router.push('/paywall');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (r: TenantMembership) => {
    setBusyId(r.id);
    try {
      await rejectMembership(r.id);
      setSnack(`${requesterLabel(r)} reddedildi`);
    } catch {
      setSnack('Reddedilemedi, tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  if (!tenantId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 }}>
        <Text style={{ fontSize: 28 }}>🔒</Text>
        <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
          Salon yönetici oturumu gerekli
        </Text>
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          Katılım isteklerini görmek ve onaylamak için bir salonun admin&rsquo;i olarak giriş yapmalısın.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="h3">
          İstekler <Text variant="h3" style={{ color: colors.p }}>{requests.length}</Text>
        </Text>
        {requests.length > 0 && (
          <Pressable onPress={() => requests.forEach((r) => approve(r))}>
            <Text variant="helper" weight="700" style={{ color: colors.p }}>
              Tümünü onayla
            </Text>
          </Pressable>
        )}
      </View>

      {failed ? (
        <ErrorNotice message="Onay listesi alınamadı." onRetry={retry} />
      ) : loading ? (
        <Text variant="helper" tone="sub">
          Yükleniyor…
        </Text>
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
          Üyeler <Text variant="h3" style={{ color: colors.p }}>{members.length}</Text>
        </Text>
      </View>

      {members.length === 0 ? (
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, borderRadius: radius.md, padding: 12, alignItems: 'center' }}>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            Henüz üye yok — resepsiyona QR asın, ilk üye 1 dakikada gelsin
          </Text>
        </View>
      ) : (
        <ListGroup>
          {members.map((m, i) => (
            <ListRow key={m.id} last={i === members.length - 1}>
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
            </ListRow>
          ))}
        </ListGroup>
      )}

      {snack && <Snackbar message={snack} onAction={() => setSnack(null)} />}
    </ScrollView>
  );
}
