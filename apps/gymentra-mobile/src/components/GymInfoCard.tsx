import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Pressable, View } from 'react-native';

import { OpeningHours, TenantContact } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

import { Card } from './Card';
import { Text } from './Text';

const DAYS: { key: string; label: string }[] = [
  { key: '1', label: 'Pazartesi' },
  { key: '2', label: 'Salı' },
  { key: '3', label: 'Çarşamba' },
  { key: '4', label: 'Perşembe' },
  { key: '5', label: 'Cuma' },
  { key: '6', label: 'Cumartesi' },
  { key: '0', label: 'Pazar' },
];

/**
 * The gym as a member needs it: when it is open, where it is, how to reach it.
 *
 * The admin could enter contact details before this existed, which made them
 * write-only — nobody could read what was saved.
 *
 * Renders nothing at all when the gym has filled none of it in: an empty card
 * headed "Salon bilgileri" is worse than no card, it reads as broken.
 */
export function GymInfoCard({
  hours,
  address,
  contact,
}: {
  hours?: OpeningHours;
  address?: string;
  contact?: TenantContact;
}) {
  const { colors, spacing } = useAppTheme();
  const today = String(new Date().getDay());

  const hasHours = !!hours && Object.keys(hours).length > 0;
  if (!hasHours && !address && !contact?.phone && !contact?.email) return null;

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text variant="label" tone="sub">
        SALON BİLGİLERİ
      </Text>

      {hasHours && (
        <View style={{ gap: 3 }}>
          {DAYS.map((d) => {
            const w = hours![d.key];
            const isToday = d.key === today;
            return (
              <View key={d.key} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text
                  variant="label"
                  weight={isToday ? '700' : undefined}
                  tone={isToday ? undefined : 'sub'}>
                  {d.label}
                  {isToday ? ' · bugün' : ''}
                </Text>
                <Text
                  variant="label"
                  weight={isToday ? '700' : undefined}
                  tone={w ? undefined : 'sub'}
                  style={w && isToday ? { color: colors.ok } : undefined}>
                  {w ? `${w.open} – ${w.close}` : 'Kapalı'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {address ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Ionicons name="location-outline" size={15} color={colors.sub} />
          <Text variant="label" tone="sub" style={{ flex: 1 }}>
            {address}
          </Text>
        </View>
      ) : null}

      {contact?.phone ? (
        <Pressable
          onPress={() => Linking.openURL(`tel:${contact.phone!.replace(/\s/g, '')}`)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Ionicons name="call-outline" size={15} color={colors.pText} />
          <Text variant="label" weight="700" style={{ color: colors.pText }}>
            {contact.phone}
          </Text>
        </Pressable>
      ) : null}

      {contact?.email ? (
        <Pressable
          onPress={() => Linking.openURL(`mailto:${contact.email}`)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Ionicons name="mail-outline" size={15} color={colors.pText} />
          <Text variant="label" weight="700" style={{ color: colors.pText }}>
            {contact.email}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
