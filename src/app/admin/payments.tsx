import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { watchActiveMembers } from '@/data/firebase/membershipRepo';
import { confirmPayment, rejectPayment, recordPayment, watchPaymentsForTenant } from '@/data/firebase/paymentRepo';
import { Payment, PaymentMethod, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Nakit', bank_transfer: 'Banka Transferi' };

function formatAmount(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}

/** Manual payment ledger — admin enters what they received, confirms/rejects member-submitted notices. */
export default function AdminPayments() {
  const { colors, spacing, radius } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [payments, setPayments] = useState<Payment[]>([]);
  const [members, setMembers] = useState<TenantMembership[]>([]);
  const [adding, setAdding] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TenantMembership | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    return watchPaymentsForTenant(tenantId, setPayments);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    return watchActiveMembers(tenantId, setMembers);
  }, [tenantId]);

  if (!tenantId) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  const pending = payments.filter((p) => p.status === 'pending');
  const history = payments.filter((p) => p.status !== 'pending');

  const resetForm = () => {
    setAdding(false);
    setSelectedMember(null);
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
    } finally {
      setSaving(false);
    }
  };

  const confirm = async (id: string) => {
    setBusyId(id);
    try {
      await confirmPayment(id);
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
                {p.note ? ` · ${p.note}` : ''}
              </Text>
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {members.map((m) => (
              <Chip
                key={m.id}
                label={m.userDisplayName || m.userEmail || 'Üye'}
                selected={selectedMember?.id === m.id}
                onPress={() => setSelectedMember(m)}
              />
            ))}
          </View>
          <TextField placeholder="Tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Nakit" selected={method === 'cash'} onPress={() => setMethod('cash')} />
            <Chip label="Banka Transferi" selected={method === 'bank_transfer'} onPress={() => setMethod('bank_transfer')} />
          </View>
          <TextField placeholder="Not (opsiyonel)" value={note} onChangeText={setNote} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={resetForm} disabled={saving} />
            <Button label={saving ? '…' : 'Kaydet'} style={{ flex: 1 }} disabled={saving || !selectedMember || !amount} onPress={save} />
          </View>
        </View>
      ) : (
        <Button label="+ Ödeme ekle" critical onPress={() => setAdding(true)} />
      )}

      <Text variant="label" tone="sub">
        GEÇMİŞ
      </Text>
      {history.length === 0 ? (
        <Text variant="helper" tone="sub" style={{ textAlign: 'center', marginTop: spacing.md }}>
          Henüz kayıtlı ödeme yok.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {history.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surf, borderRadius: radius.md, padding: 12 }}>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700">
                  {p.memberName}
                </Text>
                <Text variant="label" tone="sub">
                  {METHOD_LABEL[p.method]}
                  {p.note ? ` · ${p.note}` : ''}
                </Text>
              </View>
              <Text variant="helper" weight="900">
                {formatAmount(p.amount)}
              </Text>
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
