import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { KeyboardAwareScroll } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { Chip } from '@/components/Chip';
import { Text } from '@/components/Text';
import { useToast } from '@/components/Toast';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { submitGroupPaymentNotice, submitPaymentNotice, watchPaymentsForMember } from '@/data/firebase/paymentRepo';
import { watchMyChildren } from '@/data/firebase/membershipRepo';
import { splitAmount } from '@/utils/splitAmount';
import { Payment, PaymentMethod, TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';

const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Nakit', bank_transfer: 'Banka Transferi', card: 'Kredi Kartı' };
const STATUS_LABEL: Record<Payment['status'], string> = { pending: 'Onay bekliyor', confirmed: 'Onaylandı', rejected: 'Reddedildi' };

function formatAmount(n: number): string {
  return `₺${n.toLocaleString('tr-TR')}`;
}

/** Member's own payment history + "I sent this" notice for the admin to confirm. */
export default function MemberPayments() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();
  const { user, activeMembership } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;

  // undefined until the first snapshot lands.
  const [payments, setPayments] = useState<Payment[] | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Which children this payment covers. Empty = paying for yourself, which is
  // what the screen has always done and stays the default.
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [children, setChildren] = useState<TenantMembership[]>([]);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchPaymentsForMember(tenantId, uid, setPayments, () => setFailed(true));
  }, [tenantId, uid, retryKey]);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMyChildren(tenantId, uid, setChildren);
  }, [tenantId, uid]);

  if (!tenantId || !user) return <View style={{ flex: 1 }} />;

  const payerName = user.displayName || user.email || 'Üye';
  const linkedChildren = children.filter((c) => c.guardianStatus === 'approved');
  const selectedChildren = linkedChildren.filter((c) => selectedChildIds.includes(c.userId));
  const amountNum = Number(amount.replace(',', '.'));
  // Previewed before sending, because "eşit bölünecek" is a promise about
  // someone's money and the odd kuruş should not be a surprise afterwards.
  const shares =
    selectedChildren.length > 0 && amountNum > 0 ? splitAmount(amountNum, selectedChildren.length) : [];

  const toggleChild = (childId: string) =>
    setSelectedChildIds((ids) => (ids.includes(childId) ? ids.filter((i) => i !== childId) : [...ids, childId]));

  const submit = async () => {
    if (!amountNum || amountNum <= 0 || saving) return;
    setSaving(true);
    try {
      if (selectedChildren.length > 0) {
        await submitGroupPaymentNotice({
          tenantId,
          children: selectedChildren.map((c) => ({
            memberId: c.userId,
            memberName: c.userDisplayName || c.userEmail || 'Üye',
          })),
          totalAmount: amountNum,
          method,
          submittedBy: user.uid,
          submittedByName: payerName,
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        toast.success(
          selectedChildren.length === 1
            ? 'Bildirimin salona iletildi, onay bekleniyor.'
            : `${selectedChildren.length} çocuk için ayrı ayrı kaydedildi, onay bekleniyor.`,
        );
      } else {
        await submitPaymentNotice({
          tenantId,
          memberId: user.uid,
          memberName: payerName,
          amount: amountNum,
          method,
          ...(note.trim() ? { note: note.trim() } : {}),
        });
        toast.success('Bildirimin salona iletildi, onay bekleniyor.');
      }
      setAdding(false);
      setAmount('');
      setNote('');
      setSelectedChildIds([]);
    } catch (e) {
      reportError(e, toast, 'Bildirim gönderilemedi, tekrar deneyin.');
    } finally {
      setSaving(false);
    }
  };

  return (
      <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => safeBack(router, '/member')}>
            <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
          </Pressable>
          <Text variant="h3">Ödemelerim</Text>
        </View>

        <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
          {adding ? (
            <View style={{ backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, gap: 10 }}>
              <Text variant="helper" weight="700">
                Ödeme bildir
              </Text>
              <TextField placeholder="Tutar (₺)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Nakit" selected={method === 'cash'} onPress={() => setMethod('cash')} />
                <Chip label="Banka Transferi" selected={method === 'bank_transfer'} onPress={() => setMethod('bank_transfer')} />
            <Chip label="Kredi Kartı" selected={method === 'card'} onPress={() => setMethod('card')} />
              </View>
              {linkedChildren.length > 0 && (
                <>
                  <Text variant="label" tone="sub">
                    KİMİN İÇİN
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {linkedChildren.map((c) => (
                      <Chip
                        key={c.userId}
                        label={c.userDisplayName || c.userEmail || 'Üye'}
                        selected={selectedChildIds.includes(c.userId)}
                        onPress={() => toggleChild(c.userId)}
                      />
                    ))}
                  </View>
                  <Text variant="label" tone="sub">
                    {selectedChildren.length === 0
                      ? 'Hiçbiri seçili değil — ödeme kendi adına kaydedilir.'
                      : shares.length > 0
                        ? `Tutar eşit bölünüp ayrı ayrı kaydedilecek: ${shares
                            .map((v, i) => `${selectedChildren[i].userDisplayName || 'Üye'} ${v.toFixed(2)}₺`)
                            .join(' · ')}`
                        : 'Tutarı gir, nasıl bölüneceğini burada göstereceğim.'}
                  </Text>
                </>
              )}
              <TextField placeholder="Not (opsiyonel) — örn. dekont referansı" value={note} onChangeText={setNote} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Vazgeç" variant="ghost" style={{ flex: 1 }} onPress={() => setAdding(false)} disabled={saving} />
                <Button label={saving ? '…' : 'Gönder'} style={{ flex: 1 }} disabled={saving || !amount} onPress={submit} />
              </View>
            </View>
          ) : (
            <Button label="+ Ödeme bildir" critical onPress={() => setAdding(true)} />
          )}

          {failed ? (
            <ErrorNotice
              message="Ödeme geçmişin alınamadı."
              onRetry={() => { setFailed(false); setRetryKey((k) => k + 1); }}
            />
          ) : payments === undefined ? (
            <ListSkeleton rows={2} avatar={false} />
          ) : payments.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="Henüz bir ödeme kaydın yok"
              description="Ödemeni yaptıktan sonra buradan bildir; salon onayladığında geçmişinde görünecek."
            />
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
        </KeyboardAwareScroll>
      </View>
  );
}
