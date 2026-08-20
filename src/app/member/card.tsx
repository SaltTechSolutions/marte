import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { QRCode } from '@/components/QRCode';
import { StatusBadge } from '@/components/StatusBadge';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchMyCheckins } from '@/data/firebase/checkinRepo';
import { membershipId } from '@/data/firebase/membershipRepo';
import { useAppTheme } from '@/theme/ThemeContext';

/**
 * Member QR card — renders from cache and must work offline (front-desk
 * wifi is unreliable). Friction budget: ≤5s from app-open to scan-ready.
 * QR payload is the tenant_membership doc id — the same value front-desk
 * scanning looks up directly, no extra encoding scheme needed.
 *
 * Account controls (sign out, leave gym, delete account) used to sit below
 * the code. They now live on `member/profile`: destructive actions do not
 * belong one scroll under the thing you hold up at a turnstile, and nobody
 * looks for account settings behind a tab named "Üye Kartım".
 */
export default function MemberCard() {
  const { colors, spacing, tenantName } = useAppTheme();
  const { user, activeMembership, membershipFromCache } = useAuth();
  const uid = user?.uid;
  const tenantId = activeMembership?.status === 'active' ? activeMembership.tenantId : null;
  const qrValue = user && activeMembership ? membershipId(activeMembership.tenantId, user.uid) : 'pending';
  const displayName = user?.displayName || user?.email || 'Üye';

  const [todayEntries, setTodayEntries] = useState<Date[]>([]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    if (!tenantId || !uid) return;
    return watchMyCheckins(tenantId, uid, todayStart, setTodayEntries);
  }, [tenantId, uid, todayStart]);

  const lastEntry = todayEntries[0];

  return (
    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: spacing.lg }}>
      {membershipFromCache && (
        <View style={{ alignSelf: 'stretch', alignItems: 'flex-end', paddingTop: 4 }}>
          <Text variant="label" style={{ color: colors.warn }}>
            ✈ çevrimdışı — kayıtlı kartın
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: membershipFromCache ? 12 : 26 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.p, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="helper" tone="onp" weight="900">
            {tenantName[0]}
          </Text>
        </View>
        <Text variant="h3">{tenantName}</Text>
      </View>

      <View style={{ marginTop: 22 }}>
        <QRCode value={qrValue} />
      </View>

      {activeMembership?.shortCode && (
        <View style={{ marginTop: 14, alignItems: 'center' }}>
          <Text variant="label" tone="sub">
            KAMERA ÇALIŞMIYORSA BU KODU SÖYLE
          </Text>
          <Text variant="h2" weight="900" style={{ letterSpacing: 6, marginTop: 2 }}>
            {activeMembership.shortCode.replace(/(\d{3})(\d{3})/, '$1 $2')}
          </Text>
        </View>
      )}

      <Text variant="h2" style={{ marginTop: 16 }}>
        {displayName}
      </Text>
      <View style={{ marginTop: 4 }}>
        <StatusBadge label="Aktif üyelik" tone="ok" />
      </View>

      {/* Answers "did it actually register?" without walking back to the desk. */}
      <View style={{ marginTop: 12, alignItems: 'center' }}>
        <Text variant="label" tone="sub">
          {lastEntry
            ? `Bugün giriş yapıldı · ${lastEntry.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
            : 'Bugün henüz giriş yapılmadı'}
        </Text>
      </View>

      <View style={{ flex: 1 }} />
    </View>
  );
}
