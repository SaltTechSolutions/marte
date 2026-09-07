import React from 'react';
import { View } from 'react-native';

import { AppNotification } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

export function NotificationCard({ notification }: { notification: AppNotification }) {
  const { colors, radius } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 9,
        backgroundColor: colors.surf2,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        padding: 12,
      }}>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          backgroundColor: colors.p,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ fontSize: 13 }}>{notification.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="helper" weight="700">
            {notification.title}
          </Text>
          <Text variant="label" tone="sub">
            {notification.time}
          </Text>
        </View>
        <Text variant="helper" tone="sub" style={{ marginTop: 2 }}>
          {notification.body}
        </Text>
      </View>
    </View>
  );
}
