import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { watchMemberAddress } from '@/data/firebase/memberAddressRepo';
import { FEATURES } from '@/data/features';
import { MemberAddress, TenantMembership } from '@/data/types';

import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

function formatBirthDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Text variant="label" tone="sub" style={{ width: 92 }}>
        {label}
      </Text>
      <Text variant="helper" tone={value ? undefined : 'sub'} style={{ flex: 1 }} selectable>
        {value || '—'}
      </Text>
    </View>
  );
}

/**
 * What the gym's admin sees of a member's contact details (14 Oct 2026):
 * phone, e-mail, birth date, address.
 *
 * Editing is offered only for a member the admin added by hand (`managed`).
 * Someone who signed up with their own account owns these details — the gym
 * reads them, and the card says so rather than showing a button the rules
 * would refuse. The address is read from its own document: a trainer is not
 * allowed to see it, and this card is only mounted on the admin screen.
 */
export function MemberContactCard({
  tenantId,
  memberId,
  membership,
  onEdit,
}: {
  tenantId: string;
  memberId: string;
  membership: TenantMembership | null | undefined;
  onEdit: () => void;
}) {
  const [address, setAddress] = useState<MemberAddress | null | undefined>(undefined);
  const [addressFailed, setAddressFailed] = useState(false);

  useEffect(() => {
    // The address document's rules are not deployed while the flag is off.
    if (!FEATURES.managedMembers) return;
    return watchMemberAddress(tenantId, memberId, setAddress, () => setAddressFailed(true));
  }, [tenantId, memberId]);

  if (!membership) return null;

  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="label" tone="sub">
          KİŞİ BİLGİLERİ
        </Text>
        {FEATURES.managedMembers && (
          <Text variant="label" tone="sub">
            {membership.managed ? 'elle eklendi' : 'üyenin kendi girdiği'}
          </Text>
        )}
      </View>
      <Row label="Telefon" value={membership.phone} />
      <Row label="E-posta" value={membership.userEmail} />
      <Row label="Doğum tarihi" value={membership.birthDate ? formatBirthDate(membership.birthDate) : undefined} />
      {FEATURES.managedMembers && (
        <Row
          label="Adres"
          value={addressFailed ? 'Yüklenemedi' : address === undefined ? 'Yükleniyor…' : (address?.address ?? undefined)}
        />
      )}
      {membership.managed || !FEATURES.managedMembers ? (
        <Button label="Bilgileri düzenle" variant="secondary" compact onPress={onEdit} />
      ) : (
        <Text variant="label" tone="sub">
          Bu bilgileri üye kendisi yönetir; yalnızca görebilirsin.
        </Text>
      )}
    </Card>
  );
}
