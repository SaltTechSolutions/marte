import Ionicons from '@expo/vector-icons/Ionicons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import {
  isRecovery,
  isUnderMaintenance,
  MAINTENANCE_ANNOUNCEMENT,
  MAINTENANCE_MESSAGE,
  MAINTENANCE_STILL,
  MAINTENANCE_TITLE,
  needsReroute,
  resetMaintenance,
  subscribeMaintenance,
} from '@/data/api/maintenance';
import { invalidate } from '@/data/api/poll';
import { signOutAndForget } from '@/services/signOut';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

import { Button } from './Button';
import { Text } from './Text';

/**
 * The one "bakım" screen for the whole app. The Worker's maintenance gate answers every call with
 * 503 `maintenance`; `apiFetch` raises a flag (`data/api/maintenance.ts`) and this overlay covers the
 * navigator while it is up. One place instead of 40 screens. With no disk cache a 503 on `/me` still routes
 * a signed-in member to /onboarding/gym-code UNDER the overlay; the overlay hides it and recovery repairs it.
 *
 * Only for a signed-in user (a late 503 must not cover the register screen). The way out is always there:
 * "Çıkış yap" (AGENTS.md §2, no locked flows). Recovery is by itself: any request that gets through clears
 * the flag (pollers keep probing on their backoff), "Tekrar dene" and coming to the foreground probe now.
 *
 * Known limits: native-stack modals (`gym-qr`, `paywall`) are presented above this view, so they cover it
 * until dismissed (not a lock). `accessibilityViewIsModal` is iOS-only; on Android the back button is
 * swallowed while the overlay shows.
 */
export function MaintenanceGate() {
  const { user } = useAuth();
  // Sign-out clears the flag in `resetApiState` while `user` is still set; clear it again once the user is
  // gone so a late 503 from the old account cannot leave it raised for the next sign-in.
  useEffect(() => {
    if (!user) resetMaintenance();
  }, [user]);
  // Keyed by uid: all overlay state (leaving, retry line) starts fresh for every signed-in account.
  return user ? <MaintenanceOverlay key={user.uid} /> : null;
}

function MaintenanceOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { activeMembership, refreshMembership } = useAuth();
  const visible = useSyncExternalStore(subscribeMaintenance, isUnderMaintenance, isUnderMaintenance);

  const [retrying, setRetrying] = useState(false);
  const [triedOnce, setTriedOnce] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wasVisible = useRef(false);
  const leavingRef = useRef(false);
  const hadMembershipAtStart = useRef(true);
  const refreshRef = useRef(refreshMembership);
  const pathRef = useRef(pathname);
  const hasMembershipRef = useRef(!!activeMembership);
  useEffect(() => {
    refreshRef.current = refreshMembership;
    pathRef.current = pathname;
    hasMembershipRef.current = !!activeMembership;
  });

  // Probing is a plain membership refresh: it goes through `apiFetch`, which clears the flag on any answer.
  const probe = async () => {
    setRetrying(true);
    try {
      await refreshRef.current();
    } finally {
      setRetrying(false);
      setTriedOnce(isUnderMaintenance()); // only a retry that is still closed earns "henüz bitmedi"
    }
  };

  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshRef.current();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      sub.remove();
      back.remove();
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (!wasVisible.current) hadMembershipAtStart.current = hasMembershipRef.current;
      AccessibilityInfo.announceForAccessibility(MAINTENANCE_ANNOUNCEMENT);
    } else if (isRecovery({ wasOn: wasVisible.current, nowOn: false, leaving: leavingRef.current })) {
      // The gate opened: pollers refresh now instead of at their backoff tick. The stack is reset only to
      // repair a misroute made while `/me` was unreadable; otherwise screens keep their unsaved state.
      setTriedOnce(false);
      invalidate();
      void refreshRef.current().finally(() => {
        if (needsReroute({ pathname: pathRef.current, hadMembershipAtStart: hadMembershipAtStart.current })) router.replace('/');
      });
    }
    wasVisible.current = visible;
  }, [visible, router]);

  if (!visible) return null;

  const leave = () =>
    confirmDestructive({
      title: 'Çıkış yap',
      message: 'Oturumun kapatılacak. Tekrar giriş yapman gerekecek.',
      confirmLabel: 'Çıkış yap',
      onConfirm: () => {
        leavingRef.current = true;
        setLeaving(true);
        signOutAndForget().catch(() => {
          leavingRef.current = false;
          setLeaving(false);
        });
      },
    });

  return (
    <View
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: colors.bg0,
          justifyContent: 'center',
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          gap: spacing.md,
        },
      ]}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Ionicons name="construct-outline" size={28} color={colors.sub} />
        <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
          {MAINTENANCE_TITLE}
        </Text>
        <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
          {MAINTENANCE_MESSAGE}
        </Text>
        {triedOnce && !retrying ? (
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            {MAINTENANCE_STILL}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <Button label={retrying ? '…' : 'Tekrar dene'} disabled={retrying} onPress={() => void probe()} />
        <Button label={leaving ? '…' : 'Çıkış yap'} variant="ghost" disabled={leaving} onPress={leave} />
      </View>
    </View>
  );
}
