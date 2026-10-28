import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { ROLE_HOME, isMembershipPending, primaryRole } from '@/data/membership';
import { signOutAndForget } from '@/services/signOut';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

import { Button } from './Button';
import { Text } from './Text';

/**
 * The "you can't be here" state, with a way out.
 *
 * Every role surface used to render a bare lock icon and a sentence when the
 * membership didn't grant access. That is a dead end: the tab bar only moves
 * between screens of the same locked surface, so a user who landed on the
 * wrong one — or whose membership was revoked — had no route back and no way
 * to sign out. AGENTS.md §2: no locked flows.
 *
 * Two escapes, in order of how likely they are to be what the user wants:
 * their own home surface (when the membership does grant *some* role), and
 * signing out (always).
 */
export function AccessGuard({ title, hint }: { title: string; hint?: string }) {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { activeMembership, authLoading, membershipLoading, user } = useAuth();
  const [leaving, setLeaving] = useState(false);

  const home = primaryRole(activeMembership);

  const leave = () =>
    confirmDestructive({
      title: 'Çıkış yap',
      message: 'Oturumun kapatılacak. Tekrar giriş yapman gerekecek.',
      confirmLabel: 'Çıkış yap',
      onConfirm: () => {
        setLeaving(true);
        // The auth listener drives navigation; if sign-out fails we re-enable
        // the button rather than stranding the user on a spinner.
        signOutAndForget().catch(() => setLeaving(false));
      },
    });

  // A cold start from a deep link or a push tap mounts this screen directly and skips the launcher
  // (`app/index.tsx`), the only place that waits for auth and membership. Until they resolve,
  // `activeMembership` is null, which is indistinguishable from "no access": showing the lock for a state that
  // clears itself (and offering sign-out as the way out) was the bug. Nothing gated is rendered meanwhile, so
  // this still fails closed; the flags always end (first auth callback, `finally` in AuthContext.loadMembership).
  if (isMembershipPending({ authLoading, user, membershipLoading, activeMembership })) {
    return (
      <View
        accessible
        accessibilityLabel="Yükleniyor"
        accessibilityState={{ busy: true }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator color={colors.sub} />
      </View>
    );
  }

  // No <Screen> wrapper: every role layout already renders one, and
  // react-native-safe-area-context applies the top inset again when nested.
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md }}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Ionicons name="lock-closed-outline" size={28} color={colors.sub} />
        <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
          {title}
        </Text>
        {hint ? (
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            {hint}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        {home ? <Button label="Ana ekranıma dön" onPress={() => router.replace(ROLE_HOME[home])} /> : null}
        <Button
          label={leaving ? '…' : 'Çıkış yap'}
          variant={home ? 'ghost' : 'primary'}
          disabled={leaving}
          onPress={leave}
        />
      </View>
    </View>
  );
}
