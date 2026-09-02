import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { getMembership } from '@/data/firebase/membershipRepo';
import { findOrCreateDraftProgram, watchActiveProgramForMember } from '@/data/firebase/programRepo';
import { cancelPackageAssignment, watchMemberCredits, watchMemberPackages } from '@/data/firebase/memberPackageRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { MemberCredit, MemberPackage, Program, TenantMembership } from '@/data/types';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { reportError } from '@/data/errors';
import { useAppTheme } from '@/theme/ThemeContext';

function formatDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusTone(status: MemberPackage['status']): 'ok' | 'warn' | 'sub' {
  if (status === 'active') return 'ok';
  if (status === 'frozen') return 'warn';
  return 'sub';
}

const STATUS_LABEL: Record<MemberPackage['status'], string> = {
  active: 'Aktif',
  frozen: 'Donduruldu',
  expired: 'Süresi doldu',
  cancelled: 'İptal edildi',
};

/**
 * A member's packages and quota balances, reached by tapping their row in
 * the roster. `getMembership` + the two live watches run in parallel — none
 * of the three blocks on the others, so contact info shows up as soon as
 * it's ready even if the package list is still loading.
 */
export default function AdminMemberDetail() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const { memberId, memberName } = useLocalSearchParams<{ memberId: string; memberName: string }>();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [membership, setMembership] = useState<TenantMembership | null | undefined>(undefined);
  const [packages, setPackages] = useState<MemberPackage[] | undefined>(undefined);
  const [ptCredits, setPtCredits] = useState<MemberCredit[]>([]);
  const [groupCredits, setGroupCredits] = useState<MemberCredit[]>([]);
  const toast = useToast();
  const [failed, setFailed] = useState(false);
  // Undoing an assignment tells the member about it, so the admin says why.
  const [cancelling, setCancelling] = useState<MemberPackage | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [openingProgram, setOpeningProgram] = useState(false);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    getMembership(tenantId, memberId).then(setMembership);
  }, [tenantId, memberId, retryKey]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchMemberPackages(tenantId, memberId, setPackages, () => setFailed(true));
  }, [tenantId, memberId, retryKey]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchMemberCredits(tenantId, memberId, 'ptLesson', setPtCredits);
  }, [tenantId, memberId]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchMemberCredits(tenantId, memberId, 'groupClass', setGroupCredits);
  }, [tenantId, memberId]);

  useEffect(() => {
    if (!tenantId || !memberId) return;
    return watchActiveProgramForMember(tenantId, memberId, setProgram);
  }, [tenantId, memberId]);

  if (!tenantId || !memberId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  const name = memberName || 'Üye';
  const ptRemaining = ptCredits.reduce((sum, c) => sum + (c.total - c.used), 0);
  const groupRemaining = groupCredits.reduce((sum, c) => sum + (c.total - c.used), 0);
  const soonestPt = ptCredits[0];
  const soonestGroup = groupCredits[0];

  const askCancelReason = (p: MemberPackage) => {
    setCancelling(p);
    setCancelReason('');
  };

  const doCancelAssignment = async () => {
    if (!cancelling || !cancelReason.trim()) return;
    setBusy(true);
    try {
      await cancelPackageAssignment(cancelling.id, cancelReason.trim());
      toast.success('Paket ataması geri alındı');
      setCancelling(null);
      setCancelReason('');
    } catch (e) {
      // The callable's own message is the useful one — it names how many
      // upcoming appointments are blocking the undo.
      const message = (e as { message?: string }).message;
      reportError(e, toast, message || 'Geri alınamadı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" weight="900" style={{ color: colors.p }}>
            {name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {name}
          </Text>
          {(membership?.phone || membership?.birthDate) && (
            <Text variant="label" tone="sub" numberOfLines={1}>
              {[membership.phone, membership.birthDate ? formatDate(membership.birthDate) : null].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>

      <Button
        label="+ Paket ata"
        onPress={() => router.push({ pathname: '/admin/assign-package', params: { memberId, memberName: name } })}
      />

      {/* Recording a payment starts from the person, not from the ledger —
          the admin is already looking at them, so the member-picking step
          disappears entirely (ADMIN-6). */}
      <Button
        label="+ Ödeme ekle"
        variant="secondary"
        onPress={() => router.push({ pathname: '/admin/payments', params: { memberId } })}
      />

      {/* Writing a programme was a trainer-only screen, never a trainer-only
          rule — in a small studio the owner is the coach. Reuses the same
          find-or-create as the trainer's side, so tapping twice reopens the
          existing draft instead of littering the list with empty ones. */}
      <Button
        label={
          openingProgram
            ? '…'
            : program === undefined
              ? 'Program yükleniyor…'
              : program
                ? 'Programı düzenle'
                : '+ Program ata'
        }
        variant="secondary"
        disabled={openingProgram || program === undefined}
        onPress={() => {
          if (!user || openingProgram) return;
          const run = async () => {
            setOpeningProgram(true);
            try {
              const programId =
                program?.id ??
                (await findOrCreateDraftProgram({ tenantId, trainerId: user.uid, memberId, memberName: name }));
              router.push({ pathname: '/admin/builder', params: { programId } });
            } catch (e) {
              reportError(e, toast, 'Program açılamadı, tekrar dene.');
            } finally {
              setOpeningProgram(false);
            }
          };
          void run();
        }}
      />

      {program ? (
        <Text variant="label" tone="sub">
          Aktif program: {program.name} · {program.exercises.length} egzersiz
        </Text>
      ) : program === null ? (
        <Text variant="label" tone="sub">
          Bu üyenin aktif programı yok.
        </Text>
      ) : null}

      {(ptRemaining > 0 || groupRemaining > 0) && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ptRemaining > 0 && (
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="h3">{ptRemaining}</Text>
              <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                kalan özel ders
              </Text>
              {soonestPt && (
                <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                  {formatDate(soonestPt.expiresAt)}&apos;e kadar
                </Text>
              )}
            </Card>
          )}
          {groupRemaining > 0 && (
            <Card style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="h3">{groupRemaining}</Text>
              <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                kalan grup dersi
              </Text>
              {soonestGroup && (
                <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
                  {formatDate(soonestGroup.expiresAt)}&apos;e kadar
                </Text>
              )}
            </Card>
          )}
        </View>
      )}

      {cancelling && (
        <Card style={{ gap: 10 }} outlineColor={colors.warn}>
          <Text variant="helper" weight="700">
            Paketi geri al — {cancelling.packageName}
          </Text>
          <Text variant="label" tone="sub">
            Kayıt silinmez, iptal edildi olarak işaretlenir ve paketten gelen ders hakları
            geri alınır. Kullanılmış dersler olduğu gibi kalır. Üyeye bildirilir.
          </Text>
          <TextField
            placeholder="Gerekçe — örn. yanlış üyeye atandı"
            value={cancelReason}
            onChangeText={setCancelReason}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} disabled={busy} onPress={() => setCancelling(null)} />
            <Button
              label={busy ? '…' : 'Geri al'}
              style={{ flex: 1 }}
              disabled={!cancelReason.trim() || busy}
              onPress={doCancelAssignment}
            />
          </View>
        </Card>
      )}

      <Text variant="label" tone="sub" style={{ marginTop: 4 }}>
        PAKETLER
      </Text>

      {failed ? (
        <ErrorNotice message="Paketler alınamadı." onRetry={() => { setFailed(false); setRetryKey((k) => k + 1); }} />
      ) : packages === undefined ? (
        <ListSkeleton rows={2} avatar={false} />
      ) : packages.length === 0 ? (
        <EmptyState icon="pricetags-outline" title="Henüz paket atanmadı" description="Yukarıdaki düğmeyle bu üyeye bir paket atayabilirsin." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {packages.map((p) => {
            const card = (
              <Card key={p.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Text variant="body" weight="900">
                    {p.packageName}
                  </Text>
                  <Text variant="body" weight="900" style={{ color: colors.p }}>
                    {p.finalPrice.toLocaleString('tr-TR')} ₺
                  </Text>
                </View>
                <Text variant="helper" tone="sub">
                  {formatDate(p.startsAt)} → {formatDate(p.endsAt)}
                </Text>
                {p.cancellationReason ? (
                  <Text variant="label" style={{ color: colors.warn }}>
                    Geri alındı: {p.cancellationReason}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <StatusBadge label={STATUS_LABEL[p.status]} tone={statusTone(p.status)} />
                  {p.status === 'active' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      {/* Undo sits next to Değiştir because they answer two
                          different questions: "this member needs a different
                          package" versus "this package should never have been
                          assigned". Mixing them loses the distinction. */}
                      <Pressable
                        onPress={() => askCancelReason(p)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Bu paket atamasını geri al">
                        <Text variant="label" style={{ color: colors.danger }}>
                          Geri al
                        </Text>
                      </Pressable>
                      <Text variant="label" style={{ color: colors.p }}>
                        Değiştir ›
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            );
            // Only an active holding can be swapped — a swap replaces what's
            // currently in effect, so an already-cancelled/expired row has
            // nothing live to propose changing.
            return p.status === 'active' ? (
              <Pressable
                key={p.id}
                onPress={() =>
                  router.push({
                    pathname: '/admin/propose-package-change',
                    params: { memberId, memberName: name, currentAssignmentId: p.id },
                  })
                }>
                {card}
              </Pressable>
            ) : (
              card
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
