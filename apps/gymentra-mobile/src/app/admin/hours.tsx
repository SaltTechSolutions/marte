import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { TimeStepper } from '@/components/TimeStepper';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { updateTenantOpeningHours } from '@/data/firebase/tenantRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { DayHours, OpeningHours, Tenant } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/** Monday first — the week the gym actually thinks in. Keys stay `getDay()`
 *  numbers so a `Date` maps straight onto the map without a lookup table. */
const DAYS: { key: string; label: string }[] = [
  { key: '1', label: 'Pazartesi' },
  { key: '2', label: 'Salı' },
  { key: '3', label: 'Çarşamba' },
  { key: '4', label: 'Perşembe' },
  { key: '5', label: 'Cuma' },
  { key: '6', label: 'Cumartesi' },
  { key: '0', label: 'Pazar' },
];

const DEFAULT_WINDOW: DayHours = { open: '08:00', close: '22:00' };

export default function AdminHours() {
  const { activeMembership, activeTenant } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  if (!tenantId || !activeTenant) {
    return (
      <AccessGuard
        title="Salon yönetici oturumu gerekli"
        hint="Çalışma saatlerini yalnızca salonun yöneticisi düzenleyebilir."
      />
    );
  }

  return <HoursForm tenantId={tenantId} tenant={activeTenant} />;
}

/**
 * Weekly opening hours.
 *
 * Two jobs: members see when they can walk in, and trainer availability is
 * clamped to these windows. A trainer may work at any hour the gym is open,
 * but cannot offer a bookable slot while it is shut.
 *
 * One day is expanded at a time. Seven rows with two steppers each would be
 * fourteen controls on one screen; the gym edits one day and leaves.
 */
function HoursForm({ tenantId, tenant }: { tenantId: string; tenant: Tenant }) {
  const { colors, spacing, radius } = useAppTheme();
  const toast = useToast();

  const [hours, setHours] = useState<OpeningHours>(() => tenant.openingHours ?? {});
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const setDay = (key: string, value: DayHours | null) => {
    setHours((h) => ({ ...h, [key]: value }));
    setDirty(true);
  };

  /** Most gyms run one window six or seven days a week, so filling the rest by
   *  hand is six repetitions of the same work. Closed days stay closed. */
  const applyToAll = (source: DayHours) => {
    setHours((h) => {
      const next: OpeningHours = {};
      for (const d of DAYS) next[d.key] = h[d.key] === null ? null : { ...source };
      return next;
    });
    setDirty(true);
    toast.success('Tüm açık günlere uygulandı');
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateTenantOpeningHours(tenantId, hours);
      setDirty(false);
      toast.success('Çalışma saatleri kaydedildi');
    } catch (e) {
      reportError(e, toast, 'Kaydedilemedi, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Text variant="label" tone="sub">
        Üyeler bu saatleri görür. Antrenörler de yalnızca bu saatler içinde
        randevu açabilir.
      </Text>

      {DAYS.map((d) => {
        const value = hours[d.key];
        const expanded = openDay === d.key;
        const closed = value === null || value === undefined;
        return (
          <Card key={d.key} style={{ gap: expanded ? spacing.sm : 0 }} outlineColor={expanded ? colors.p : undefined}>
            <Pressable
              onPress={() => setOpenDay(expanded ? null : d.key)}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text variant="helper" weight="700">
                  {d.label}
                </Text>
                <Text variant="label" tone={closed ? 'sub' : undefined} style={closed ? undefined : { color: colors.ok }}>
                  {closed ? 'Kapalı' : `${value.open} – ${value.close}`}
                </Text>
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.sub} />
            </Pressable>

            {expanded && (
              <View style={{ gap: spacing.sm }}>
                <Pressable
                  onPress={() => setDay(d.key, closed ? { ...DEFAULT_WINDOW } : null)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: !closed }}
                  style={{
                    borderWidth: 1.5,
                    borderColor: closed ? colors.line : colors.p,
                    backgroundColor: closed ? 'transparent' : colors.p,
                    borderRadius: radius.md,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}>
                  <Text variant="helper" weight="700" tone={closed ? 'sub' : 'onp'}>
                    {closed ? 'Bu gün kapalı — açmak için dokun' : 'Açık'}
                  </Text>
                </Pressable>

                {!closed && (
                  <>
                    <Text variant="label" tone="sub">
                      AÇILIŞ
                    </Text>
                    <TimeStepper value={value.open} onChange={(open) => setDay(d.key, { ...value, open })} step={30} />
                    <Text variant="label" tone="sub">
                      KAPANIŞ
                    </Text>
                    <TimeStepper value={value.close} onChange={(close) => setDay(d.key, { ...value, close })} step={30} />
                    <Pressable onPress={() => applyToAll(value)} accessibilityRole="button">
                      <Text variant="helper" weight="700" style={{ color: colors.pText, textAlign: 'center' }}>
                        Bu saatleri tüm açık günlere uygula
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </Card>
        );
      })}

      <Button
        label={saving ? 'Kaydediliyor…' : 'Kaydet'}
        critical
        disabled={saving || !dirty}
        onPress={save}
      />
    </ScrollView>
  );
}
