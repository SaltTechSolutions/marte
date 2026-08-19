import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { submitPaymentNotice, watchPaymentsForMember } from '@/data/firebase/paymentRepo';
import { Payment, PaymentMethod } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Nakit', bank_transfer: 'Banka Transferi' };
const STATUS_LABEL: Record<Payment['status'], string> = { pending: 'Onay bekliyor', confirmed: 'Onaylandı', rejected: 'Reddedildi' };

function formatAmount(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}

/** Member's own payment history + "I sent this" notice for the admin to confirm. */
export default function MemberPayments() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { user, activeMembership } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  const [payments, setPayments] = useState<Payment[]>([]);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchPaymentsForMember(tenantId, uid, setPayments);
  }, [tenantId, uid]);

  if (!tenantId || !user) return <Screen><View /></Screen>;

  const submit = async () => {
    const amountNum = Number(amount.replace(',', '.'));
    if (!amountNum || amountNum <= 0 || saving) return;
    setSaving(true);
    try {
      await submitPaymentNotice({
        tenantId,
        memberId: user.uid,
        memberName: user.displayName || user.email || 'Üye',
        amount: amountNum,
        method,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setAdding(false);
      setAmount('');
      setNote('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => safeBack(router, '/member')}>
            <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
          </Pressable>
          <Text variant="h3">Ödemelerim</Text>
        </View>

        <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
          {adding ? (
            <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, gap: 10 }}>
              <Text variant="helper" weight="700">
                Ödeme bildir
              </Text>
              <TextField placeholder="Tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Nakit" selected={method === 'cash'} onPress={() => setMethod('cash')} />
                <Chip label="Banka Transferi" selected={method === 'bank_transfer'} onPress={() => setMethod('bank_transfer')} />
              </View>
              <TextField placeholder="Not (opsiyonel) — örn. dekont referansı" value={note} onChangeText={setNote} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setAdding(false)} disabled={saving} />
                <Button label={saving ? '…' : 'Gönder'} style={{ flex: 1 }} disabled={saving || !amount} onPress={submit} />
              </View>
            </View>
          ) : (
            <Button label="+ Ödeme bildir" critical onPress={() => setAdding(true)} />
          )}

          {payments.length === 0 ? (
            <Text variant="helper" tone="sub" style={{ textAlign: 'center', marginTop: spacing.lg }}>
              Henüz bir ödeme kaydın yok.
            </Text>
          ) : (
            payments.map((p) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surf, borderRadius: radius.md, padding: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="helper" weight="700">
                    {METHOD_LABEL[p.method]}
                  </Text>
                  <Text variant="label" tone="sub">
                    {p.note || p.createdAt.toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <Text variant="helper" weight="900">
                  {formatAmount(p.amount)}
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surf2,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}>
                  <Text
                    variant="label"
                    weight="600"
                    style={{ color: p.status === 'confirmed' ? colors.ok : p.status === 'rejected' ? colors.danger : colors.warn }}>
                    {STATUS_LABEL[p.status]}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}
