import * as Linking from 'expo-linking';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

const SITE = 'https://gymentra.salt-tech-apps.com';

/**
 * The terms a subscription is sold under. On iOS that is Apple's standard
 * EULA: our own /terms/ page says nothing about auto-renewal or cancellation,
 * and the App Store description links the same Apple page, so the listing
 * and the purchase screen point at one document. Google has no standard
 * EULA, so Android keeps our page.
 */
const SUBSCRIPTION_TERMS_URL =
  Platform.OS === 'ios' ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/' : `${SITE}/terms/`;

/**
 * Both stores expect the privacy policy and terms to be reachable from
 * inside the app, not only from the store listing. Rendered at the bottom
 * of the per-role settings/profile screens.
 */
export function LegalLinks() {
  const { colors, spacing } = useAppTheme();

  const open = (path: string) => {
    Linking.openURL(`${SITE}${path}`).catch(() => {
      // Opening an external browser can fail (no handler, user cancelled).
      // Nothing actionable for the user here — the links are also in the
      // store listing — so fail quietly rather than throwing.
    });
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.sm }}>
      <Pressable onPress={() => open('/privacy/')} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" tone="sub">
          Gizlilik Politikası
        </Text>
      </Pressable>
      <Text variant="label" style={{ color: colors.line }}>
        |
      </Text>
      <Pressable onPress={() => open('/terms/')} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" tone="sub">
          Kullanım Şartları
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * The notice shown at sign-up (PER-3).
 *
 * KVKK md. 10 requires telling someone what is being collected AT the point
 * of collection; the app previously only exposed the policy from the profile
 * screen, which a new member reaches after handing over their details.
 *
 * A notice rather than a tick-box on purpose. Name and e-mail here are
 * necessary to perform the contract (KVKK md. 5/2-c), which is a lawful basis
 * on its own — a consent checkbox would misdescribe the basis, and spending a
 * checkbox where none is needed devalues the one that will be needed when
 * something genuinely optional (marketing) comes along. Apple 5.1.1 wants the
 * terms reachable before sign-up, which this satisfies.
 */
export function LegalConsentNotice() {
  const { colors, spacing } = useAppTheme();

  const open = (path: string) => {
    Linking.openURL(`${SITE}${path}`).catch(() => {});
  };

  const link = (label: string, path: string) => (
    <Text variant="label" weight="700" style={{ color: colors.pText }} onPress={() => open(path)}>
      {label}
    </Text>
  );

  return (
    <Text variant="label" tone="sub" style={{ textAlign: 'center', lineHeight: 17, marginTop: spacing.xs }}>
      Devam ederek {link('Kullanım Şartları', '/terms/')} ve{' '}
      {link('Gizlilik Politikası', '/privacy/')}&rsquo;nı kabul etmiş olursun.
    </Text>
  );
}

/**
 * Terms and privacy links on the subscription purchase screen.
 *
 * Guideline 3.1.2 wants both reachable from the screen that sells an
 * auto-renewable subscription, not only from settings. The first 1.0
 * submission was rejected for the missing EULA link in the listing; the
 * purchase screen had the same gap.
 */
export function SubscriptionLegalLinks() {
  const { colors } = useAppTheme();

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
      <Pressable
        onPress={() => open(SUBSCRIPTION_TERMS_URL)}
        hitSlop={8}
        accessibilityRole="link"
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" weight="700" style={{ color: colors.pText }}>
          Kullanım Koşulları (EULA)
        </Text>
      </Pressable>
      <Text variant="label" style={{ color: colors.line }}>
        |
      </Text>
      <Pressable
        onPress={() => open(`${SITE}/privacy/`)}
        hitSlop={8}
        accessibilityRole="link"
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="label" weight="700" style={{ color: colors.pText }}>
          Gizlilik Politikası
        </Text>
      </Pressable>
    </View>
  );
}
