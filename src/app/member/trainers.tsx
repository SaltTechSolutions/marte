import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { ListSkeleton } from '@/components/ListSkeleton';
import { ListGroup, ListRow } from '@/components/ListRow';
import { Text } from '@/components/Text';
import { useAuth } from '@/context/AuthContext';
import { watchActiveTrainers } from '@/data/firebase/membershipRepo';
import { TenantMembership } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

/** Step 1 of PKG-8's booking flow: pick who to book, then the next screen
 *  picks when. Whether that trainer has actually opened any hours yet is
 *  the next screen's problem, not this list's — a trainer with no hours
 *  set still needs to be findable, otherwise "why can't I see my coach"
 *  reads as a bug. */
export default function MemberTrainers() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { activeTenant } = useAuth();
  const [trainers, setTrainers] = useState<TenantMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!activeTenant) return;
    return watchActiveTrainers(
      activeTenant.id,
      (t) => {
        setTrainers(t);
        setLoading(false);
      },
      () => {
        setLoading(false);
        setFailed(true);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenant?.id]);

  if (failed) return <ErrorNotice message="Antrenör listesi yüklenemedi." />;
  if (loading) return <ListSkeleton rows={4} />;
  if (trainers.length === 0)
    return <EmptyState icon="people-outline" title="Henüz antrenör yok" description="Bu salonda kayıtlı antrenör bulunmuyor." />;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      <ListGroup>
        {trainers.map((t, i) => (
          <ListRow
            key={t.id}
            last={i === trainers.length - 1}
            onPress={() =>
              router.push({
                pathname: '/member/book-session',
                params: { trainerId: t.userId, trainerName: t.userDisplayName ?? 'Antrenör' },
              })
            }>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surf2, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person-outline" size={17} color={colors.txt} />
            </View>
            <Text variant="helper" weight="700" style={{ flex: 1 }}>
              {t.userDisplayName ?? 'Antrenör'}
            </Text>
            <Text tone="sub">›</Text>
          </ListRow>
        ))}
      </ListGroup>
    </ScrollView>
  );
}
