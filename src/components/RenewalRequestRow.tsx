import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { requestRenewal, watchMyRenewalRequest, withdrawRenewal } from '@/data/firebase/renewalRequestRepo';
import { RenewalRequest } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

import { Button } from './Button';
import { Text } from './Text';
import { useToast } from './Toast';

/** Ask within this many days of the end — the renewal conversation, started by the member. */
const RENEWAL_WINDOW_DAYS = 7;

/**
 * "Yenileme talebi gönder" under the package card (PER-15).
 *
 * Shown only when it makes sense to ask — no live package, or one ending
 * within a week. The member had been staring at "salon yöneticisi
 * atadığında görünür" with no way to say "I want to keep coming"; the
 * request is that sentence, and the admin's panel picks it up. It closes
 * itself when a package is assigned, so the member never has to tidy it.
 */
export function RenewalRequestRow({ tenantId, endsAt }: { tenantId: string; endsAt: Date | null }) {
  // Sampled once per mount: the question is "should we offer to renew", and
  // that answer must not flicker with the clock while the screen is open.
  const [now] = useState(() => Date.now());
  const daysLeft = endsAt ? Math.ceil((endsAt.getTime() - now) / 86400000) : null;
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const toast = useToast();
  const [req, setReq] = useState<RenewalRequest | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchMyRenewalRequest(tenantId, user.uid, setReq);
  }, [tenantId, user]);

  if (!user || req === undefined) return null;
  const shouldOffer = daysLeft === null || daysLeft <= RENEWAL_WINDOW_DAYS;
  const pending = req?.status === 'pending';
  if (!shouldOffer && !pending) return null;

  const send = async () => {
    setBusy(true);
    try {
      await requestRenewal({ tenantId, memberId: user.uid, memberName: user.displayName || user.email || 'Üye' });
      toast.success('Talebin salona iletildi');
    } catch (e) {
      reportError(e, toast, 'Talep gönderilemedi, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawRenewal(tenantId, user.uid);
    } catch (e) {
      reportError(e, toast, 'Geri çekilemedi, tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
      <View style={{ flex: 1 }}>
        <Text variant="helper" weight="700">
          {pending ? 'Yenileme talebin iletildi' : daysLeft === null ? 'Devam etmek ister misin?' : 'Paketin bitmek üzere'}
        </Text>
        <Text variant="label" tone="sub">
          {pending ? 'Salon seninle iletişime geçecek.' : 'Salona haber ver, yeni paketini hazırlasın.'}
        </Text>
      </View>
      <Button
        label={busy ? '…' : pending ? 'Geri çek' : 'Yenileme talebi'}
        variant={pending ? 'ghost' : 'secondary'}
        compact
        disabled={busy}
        onPress={pending ? withdraw : send}
      />
      {pending ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.p }} /> : null}
    </View>
  );
}
