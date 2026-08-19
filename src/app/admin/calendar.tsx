import React from 'react';
import { View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { useAuth } from '@/context/AuthContext';
import { canOverseeCalendars } from '@/data/membership';

import { TrainerCalendarView } from '../trainer/calendar';

/**
 * Admin oversight of every trainer's calendar.
 *
 * The same view lives under `trainer/` for trainers, but pushing an admin
 * into that route group swapped the whole tab bar — mid-way through gym
 * settings the screen turned into the trainer UI. Rendering it from an
 * `admin/` route keeps the admin's own navigation intact.
 */
export default function AdminCalendar() {
  const { user, activeMembership } = useAuth();

  if (!canOverseeCalendars(activeMembership) || !user || !activeMembership) {
    return <AccessGuard title="Salon yönetici oturumu gerekli" />;
  }

  return (
    <View style={{ flex: 1 }}>
      <TrainerCalendarView tenantId={activeMembership.tenantId} isAdmin user={user} />
    </View>
  );
}
