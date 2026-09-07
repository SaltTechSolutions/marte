import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { leaveTenant } from '@/data/firebase/membershipRepo';
import { canManageGym } from '@/data/membership';
import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

/**
 * Ends this person's membership of the gym — separate from deleting their
 * account: someone may leave one gym and join another while keeping their
 * measurements and workout history.
 *
 * Hidden for admins: they could be the gym's last one, and rules can't count
 * the remaining admins. Transferring ownership is a flow of its own.
 */
export function LeaveGymButton() {
  const router = useRouter();
  const { spacing } = useAppTheme();
  const { activeMembership } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!activeMembership || canManageGym(activeMembership)) return null;

  const run = async () => {
    setBusy(true);
    try {
      await leaveTenant(activeMembership.id);
      // The membership listener drops it from 'active', which sends the
      // router back to the join screen on its own.
      router.replace('/onboarding/gym-code');
    } catch {
      Alert.alert('Ayrılınamadı', 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    Alert.alert(
      `${activeMembership.tenantName} salonundan ayrıl`,
      'Üyeliğin sona erecek; QR kartın ve programların bu salonda geçersiz olacak.\n\nÖlçümlerin ve antrenman geçmişin hesabında kalır. Salon kodunu girerek tekrar katılabilirsin.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Ayrıl', style: 'destructive', onPress: run },
      ],
    );
  };

  return (
    <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
      <Pressable onPress={confirm} disabled={busy} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="helper" tone="sub" style={{ opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Ayrılınıyor…' : 'Salondan ayrıl'}
        </Text>
      </Pressable>
    </View>
  );
}
