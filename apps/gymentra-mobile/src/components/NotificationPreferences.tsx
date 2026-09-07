import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { setNotificationPreference, watchUserSettings } from '@/data/firebase/userSettingsRepo';
import { reportError } from '@/data/errors';
import { NOTIFICATION_CATEGORIES, NotificationCategory } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

import { Card } from './Card';
import { Text } from './Text';
import { useToast } from './Toast';

/** Küçük bir aç/kapa — Switch yerine, tema rengini alan tek bir çizim. */
function Toggle({ on }: { on: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        width: 46,
        height: 28,
        borderRadius: 14,
        padding: 3,
        backgroundColor: on ? colors.p : colors.surf2,
        alignItems: on ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
      }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? colors.bg0 : colors.sub }} />
    </View>
  );
}

/**
 * Which notifications this person wants (P4-3).
 *
 * The same component on all three profile screens, because the preference
 * belongs to the person and not to the role they are currently wearing —
 * an owner who also coaches would otherwise have to find it twice.
 *
 * Consent and access notifications (ebeveyn onayı, katılım isteği) are not
 * listed: they are steps in a flow rather than announcements, and silencing
 * one leaves the flow unfinishable. The server enforces that too — the
 * `account` category ignores preferences entirely.
 *
 * Writes go straight through on tap, with the switch moving first and rolling
 * back if the write fails. A preferences screen with a save button invites
 * people to change three switches and leave without pressing it.
 */
export function NotificationPreferences() {
  const { user } = useAuth();
  const { colors, spacing } = useAppTheme();
  const toast = useToast();
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState<NotificationCategory | null>(null);

  useEffect(() => {
    if (!user) return;
    return watchUserSettings(user.uid, (s) => setPrefs(s.push));
  }, [user]);

  if (!user) return null;

  const isOn = (key: NotificationCategory) => prefs?.[key] !== false;

  const toggle = async (key: NotificationCategory) => {
    const next = !isOn(key);
    setPrefs((p) => ({ ...(p ?? {}), [key]: next }));
    setBusy(key);
    try {
      await setNotificationPreference(user.uid, key, next);
    } catch (e) {
      setPrefs((p) => ({ ...(p ?? {}), [key]: !next }));
      reportError(e, toast, 'Tercih kaydedilemedi, tekrar dene.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label" tone="sub">
        BİLDİRİMLER
      </Text>
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {NOTIFICATION_CATEGORIES.map((c, i) => (
          <Pressable
            key={c.key}
            onPress={() => toggle(c.key)}
            disabled={prefs === null || busy === c.key}
            accessibilityRole="switch"
            accessibilityState={{ checked: isOn(c.key) }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 11,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.line,
              opacity: prefs === null ? 0.5 : 1,
            }}>
            <View style={{ flex: 1 }}>
              <Text variant="helper" weight="700">
                {c.title}
              </Text>
              <Text variant="label" tone="sub">
                {c.detail}
              </Text>
            </View>
            <Toggle on={isOn(c.key)} />
          </Pressable>
        ))}
      </Card>
      <Text variant="label" tone="sub" style={{ marginBottom: spacing.xs }}>
        Ebeveyn onayı ve katılım istekleri her zaman gönderilir — bunlar bildirim
        değil, tamamlanması gereken adımlar.
      </Text>
    </View>
  );
}
