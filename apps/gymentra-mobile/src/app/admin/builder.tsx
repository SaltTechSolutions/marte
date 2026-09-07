import React from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { useAuth } from '@/context/AuthContext';
import { canManageGym } from '@/data/membership';

import { ProgramBuilderScreen } from '../trainer/builder';

/**
 * The admin writing a member's programme.
 *
 * Rules have always allowed it — `programs` is writable by tenant staff, not
 * only trainers — but there was no screen: the builder lives under `trainer/`
 * and pushing an admin into that route group swaps the whole tab bar
 * mid-task. Rendering it from an `admin/` route keeps their navigation
 * intact, the same call `admin/calendar` made.
 *
 * In a small studio the owner IS the coach, so "only trainers write
 * programmes" was never a rule of the business, just a gap in the screens.
 */
export default function AdminBuilder() {
  const { activeMembership } = useAuth();

  if (!canManageGym(activeMembership)) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ProgramBuilderScreen />
    </View>
  );
}
