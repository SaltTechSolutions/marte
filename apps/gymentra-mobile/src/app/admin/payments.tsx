import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import { confirmPayment, rejectPayment, recordPayment, reversePayment, watchPaymentsForTenant } from '@/data/firebase/paymentRepo';
import { Payment, PaymentMethod, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Nakit', bank_transfer: 'Banka Transferi', card: 'Kredi Kartı' };

function formatAmount(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}

/** Manual payment ledger — admin enters what they received, confirms/rejects member-submitted notices. */
function memberLabel(m: TenantMembership): string {
  return m.userDisplayName || m.userEmail || 'Üye';
}

export default function AdminPayments() {
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { activeMembership, user } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  // undefined until the first snapshot; [] means no payments were ever logged.
  const [payments, setPayments] = useState<Payment[] | undefined>(undefined);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  // `null` = untouched, so the route param still decides. Derived rather
  // than synced in an effect: the param is knowable at render time.
  const [addingOverride, setAddingOverride] = useState<boolean | null>(null);
  const [memberOverride, setMemberOverride] = useState<{ value: TenantMembership | null } | null>(null);
  const [memberQuery, setMemberQuery] = useState('');

  // Arriving from a member's detail screen: the person is already decided,
  // so the form opens on them and the search never appears. This is the
  // short path — picking a member out of a list is the step worth skipping.
  const { memberId: presetMemberId } = useLocalSearchParams<{ memberId?: string }>();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Correcting a payment asks for a reason rather than just confirming: the
  // member is told about it, and "düzeltildi" with no explanation invites the
  // phone call the notification was supposed to prevent.
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    return watchPaymentsForTenant(tenantId, setPayments, () => setFailed(true));
  }, [tenantId, retryKey]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers, () => setFailed(true));
  }, [tenantId, retryKey]);

  const retry = () => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  const presetMember = useMemo(
    () => (presetMemberId ? (members.find((m) => m.userId === presetMemberId) ?? null) : null),
    [members, presetMemberId],
  );
  // An explicit tap always wins; until then the route param stands.
  const selectedMember = memberOverride ? memberOverride.value : presetMember;
  const adding = addingOverride ?? !!presetMember;

  /** Capped: an unfiltered or very loose query would rebuild the same wall
   *  this search replaced. */
  const memberMatches = useMemo(() => {
    const q = memberQuery.trim().toLocaleLowerCase('tr');
    if (!q) return [];
    return members.filter((m) => memberLabel(m).toLocaleLowerCase('tr').includes(q)).slice(0, 6);
  }, [members, memberQuery]);

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  const pending = (payments ?? []).filter((p) => p.status === 'pending');
  const history = (payments ?? []).filter((p) => p.status !== 'pending');

  const resetForm = () => {
    setAddingOverride(false);
    setMemberOverride({ value: null });
    setAmount('');
    setMethod('cash');
    setNote('');
  };

  const save = async () => {
    const amountNum = Number(amount.replace(',', '.'));
    if (!selectedMember || !amountNum || amountNum <= 0 || saving) return;
    setSaving(true);
    try {
      await recordPayment({
        tenantId,
        memberId: selectedMember.userId,
        memberName: selectedMember.userDisplayName || selectedMember.userEmail || 'Üye',
        amount: amountNum,
        method,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      resetForm();
      toast.success(`${amountNum} ₺ ödeme kaydedildi`);
    } catch (e) {
      reportError(e, toast, 'Ödeme kaydedilemedi, tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  };

  const askReversalReason = (p: Payment) => {
    setReversing(p);
    setReversalReason('');
  };

  const doReverse = async () => {
    if (!reversing || !reversalReason.trim() || !user) return;
    setBusyId(reversing.id);
    try {
      await reversePayment({ payment: reversing, reason: reversalReason.trim(), reversedBy: user.uid });
      toast.success('Düzeltme kaydedildi, üyeye bildirildi');
      setReversing(null);
      setReversalReason('');
    } catch (e) {
      reportError(e, toast, 'Düzeltilemedi, tekrar dene.');
    } finally {
      setBusyId(null);
    }
  };

  const confirm = async (id: string) => {
    setBusyId(id);
    try {
      await confirmPayment(id);
    } catch (e) {
      reportError(e, toast, 'Ödeme onaylanamadı, tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = (id: string, memberName: string, amount: number) =>
    confirmDestructive({
      title: 'Ödeme bildirimini reddet',
      message: `${memberName} adlı üyenin ${amount} ₺ tutarındaki bildirimi reddedilecek. Bu karar geri alınamaz.`,
      confirmLabel: 'Reddet',
      onConfirm: () => void doReject(id),
    });

  const doReject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectPayment(id);
    } catch (e) {
      reportError(e, toast, 'Ödeme reddedilemedi, tekrar deneyin.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <KeyboardAwareScroll contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.lg }}>
      <Text variant="h3">Ödemeler</Text>

      {pending.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="sub">
            BEKLEYEN ONAYLAR ({pending.length})
          </Text>
          {pending.map((p) => (
            <View key={p.id} style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.warn, borderRadius: radius.md, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="helper" weight="700">
                  {p.memberName}
                </Text>
                <Text variant="helper" weight="900">
                  {formatAmount(p.amount)}
                </Text>
              </View>
              <Text variant="label" tone="sub">
                {METHOD_LABEL[p.method]}
                {/* A parent paying for a child: the entry belongs to the
                    child's ledger, so without this the admin sees a 300₺
                    notice from a member who never walked in to pay it. */}
                {p.submittedByName ? ` · ${p.submittedByName} ödedi` : ''}
                {p.note ? ` · ${p.note}` : ''}
              </Text>
              {p.paymentGroupId && (
                <Text variant="label" style={{ color: colors.sub }}>
                  Bu bildirim birden fazla çocuk için yapılan tek ödemenin parçası.
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label={busyId === p.id ? '…' : 'Onayla'} compact style={{ flex: 1 }} disabled={busyId === p.id} onPress={() => confirm(p.id)} />
                <Button label="Reddet" variant="ghost" compact style={{ flex: 1 }} disabled={busyId === p.id} onPress={() => reject(p.id, p.memberName, p.amount)} />
              </View>
            </View>
          ))}
        </View>
      )}

      {adding ? (
        <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, gap: 10 }}>
          <Text variant="helper" weight="700">
            Ödeme kaydı ekle
          </Text>
          {/* Was every member as a wrapped chip — at 51 members that buried
              the amount field under a wall the admin had to scroll past, and
              it only got worse as the gym grew. Nothing is listed until
              something is typed. */}
          {selectedMember ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="helper" weight="700" style={{ flex: 1 }} numberOfLines={1}>
                {memberLabel(selectedMember)}
              </Text>
              <Button
                label="Değiştir"
                variant="ghost"
                compact
                onPress={() => {
                  setMemberOverride({ value: null });
                  setMemberQuery('');
                }}
              />
            </View>
          ) : (
            <>
              <TextField placeholder="Üye ara (ad veya e-posta)" value={memberQuery} onChangeText={setMemberQuery} autoCapitalize="none" />
              {memberQuery.trim().length > 0 &&
                (memberMatches.length === 0 ? (
                  <Text variant="label" tone="sub">
                    Eşleşen üye yok.
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {memberMatches.map((m) => (
                      <Chip key={m.id} label={memberLabel(m)} onPress={() => setMemberOverride({ value: m })} />
                    ))}
                  </View>
                ))}
            </>
          )}
          <TextField placeholder="Tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Nakit" selected={method === 'cash'} onPress={() => setMethod('cash')} />
            <Chip label="Banka Transferi" selected={method === 'bank_transfer'} onPress={() => setMethod('bank_transfer')} />
            <Chip label="Kredi Kartı" selected={method === 'card'} onPress={() => setMethod('card')} />
          </View>
          <TextField placeholder="Not (opsiyonel)" value={note} onChangeText={setNote} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={resetForm} disabled={saving} />
            <Button label={saving ? '…' : 'Kaydet'} style={{ flex: 1 }} disabled={saving || !selectedMember || !amount} onPress={save} />
          </View>
        </View>
      ) : (
        <Button label="+ Ödeme ekle" critical onPress={() => setAddingOverride(true)} />
      )}

      {reversing && (
        <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.warn, borderRadius: radius.md, padding: 12, gap: 10 }}>
          <Text variant="helper" weight="700">
            Ödemeyi düzelt — {reversing.memberName}, {formatAmount(reversing.amount)}
          </Text>
          <Text variant="label" tone="sub">
            Kayıt silinmez. Aynı tutarda bir düzeltme kaydı yazılır, orijinali üstü çizili
            kalır ve ciro kendiliğinden düzelir. Üye bilgilendirilir.
          </Text>
          <TextField
            placeholder="Gerekçe — örn. tutar yanlış girildi"
            value={reversalReason}
            onChangeText={setReversalReason}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setReversing(null)} disabled={busyId === reversing.id} />
            <Button
              label={busyId === reversing.id ? '…' : 'Düzeltmeyi kaydet'}
              style={{ flex: 1 }}
              disabled={!reversalReason.trim() || busyId === reversing.id}
              onPress={doReverse}
            />
          </View>
        </View>
      )}

      <Text variant="label" tone="sub">
        GEÇMİŞ
      </Text>
      {failed ? (
        <ErrorNotice message="Ödeme listesi alınamadı." onRetry={retry} />
      ) : payments === undefined ? (
        <ListSkeleton rows={3} avatar={false} />
      ) : history.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="Henüz kayıtlı ödeme yok"
          description="Tahsil ettiğin ödemeleri buraya işledikçe üyenin geçmişi ve salonun cirosu birikmeye başlar."
        />
      ) : (
        <View style={{ gap: 8 }}>
          {history.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surf, borderRadius: radius.md, padding: 12 }}>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700">
                  {p.memberName}
                </Text>
                <Text variant="label" tone="sub">
                  {p.kind === 'reversal' ? 'Düzeltme kaydı' : METHOD_LABEL[p.method]}
                  {p.submittedByName ? ` · ${p.submittedByName} ödedi` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                </Text>
                {p.reversalReason ? (
                  <Text variant="label" style={{ color: colors.warn }}>
                    {p.reversedAt ? 'Düzeltildi' : 'Gerekçe'}: {p.reversalReason}
                  </Text>
                ) : null}
              </View>
              <Text
                variant="helper"
                weight="900"
                // A cancelled row keeps its original figure — struck through
                // rather than rewritten, so the correction stays visible.
                style={
                  p.reversedAt
                    ? { textDecorationLine: 'line-through', color: colors.sub }
                    : p.kind === 'reversal'
                      ? { color: colors.danger }
                      : undefined
                }>
                {p.kind === 'reversal' ? '−' : ''}
                {formatAmount(p.amount)}
              </Text>
              {p.status === 'confirmed' && p.kind !== 'reversal' && !p.reversedAt && (
                <Pressable
                  onPress={() => askReversalReason(p)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Bu ödemeyi düzelt">
                  <Ionicons name="create-outline" size={17} color={colors.sub} />
                </Pressable>
              )}
              <View style={{ backgroundColor: colors.surf2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text variant="label" weight="600" style={{ color: p.status === 'confirmed' ? colors.ok : colors.danger }}>
                  {p.status === 'confirmed' ? 'Onaylandı' : 'Reddedildi'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </KeyboardAwareScroll>
  );
}
