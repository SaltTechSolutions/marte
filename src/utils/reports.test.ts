import { describe, expect, it } from 'vitest';

import { ClassSession, MemberPackage, Payment, TenantMembership } from '@/data/types';

import {
  attendanceStats,
  daysUntil,
  expiringPackages,
  lapsedMembers,
  memberGrowth,
  monthlyRevenue,
  pendingPayments,
} from './reports';

const NOW = new Date(2026, 8, 3, 12, 0, 0); // 3 Eylül 2026

function payment(p: Partial<Payment>): Payment {
  return {
    id: 'p', tenantId: 't', memberId: 'm', memberName: 'Üye',
    amount: 100, method: 'cash', status: 'confirmed',
    createdAt: NOW, ...p,
  } as Payment;
}

function session(p: Partial<ClassSession>): ClassSession {
  return {
    id: 'c', tenantId: 't', name: 'Ders', trainerName: 'Antrenör',
    date: new Date(2026, 8, 1), durationMinutes: 60, capacity: 10,
    bookedUserIds: [], waitlistUserIds: [], ...p,
  } as ClassSession;
}

function pkg(p: Partial<MemberPackage>): MemberPackage {
  return {
    id: 'mp', tenantId: 't', memberId: 'm', memberName: 'Üye',
    packageId: 'g', packageName: 'Gold', kind: 'membership', entitlements: {},
    listPrice: 100, finalPrice: 100,
    startsAt: new Date(2026, 7, 1), endsAt: new Date(2026, 8, 10),
    frozenDays: 0, freezes: [], status: 'active',
    assignedAt: new Date(2026, 7, 1), assignedBy: 'a', ...p,
  } as MemberPackage;
}

function member(p: Partial<TenantMembership>): TenantMembership {
  return {
    id: 't_m', userId: 'm', tenantId: 't', tenantCode: 'T', tenantName: 'T',
    roles: ['member'], permissions: [], status: 'active', ...p,
  } as TenantMembership;
}

describe('monthlyRevenue', () => {
  it('boş ayı atlamaz — grafikteki boşluk bulgunun kendisi', () => {
    const out = monthlyRevenue([payment({ createdAt: new Date(2026, 8, 2) })], 3, NOW);
    expect(out.map((b) => b.label)).toEqual(['Tem', 'Ağu', 'Eyl']);
    expect(out.map((b) => b.total)).toEqual([0, 0, 100]);
  });

  it('iadeyi düşer, gelire eklemez', () => {
    const out = monthlyRevenue(
      [payment({ amount: 500 }), payment({ amount: 200, kind: 'refund' })],
      1,
      NOW,
    );
    expect(out[0].total).toBe(300);
  });

  it('onaylanmamış ödemeyi saymaz', () => {
    const out = monthlyRevenue([payment({ status: 'pending', amount: 900 })], 1, NOW);
    expect(out[0].total).toBe(0);
  });
});

describe('attendanceStats', () => {
  it('yoklama alınmamış dersi "herkes gelmedi" saymaz', () => {
    const out = attendanceStats(
      [session({ bookedUserIds: ['a', 'b', 'c'] })], // attendance yok
      NOW,
    );
    expect(out.rate).toBeNull();
    expect(out.absent).toBe(0);
    expect(out.unmarkedClasses).toBe(1);
    expect(out.markedClasses).toBe(0);
  });

  it('boş dersi "yoklama alınmadı" diye şikâyet etmez', () => {
    const out = attendanceStats([session({ bookedUserIds: [] })], NOW);
    expect(out.unmarkedClasses).toBe(0);
  });

  it('işaretlenmiş dersten oran çıkarır', () => {
    const out = attendanceStats(
      [session({ bookedUserIds: ['a', 'b', 'c', 'd'], attendance: { a: 'present', b: 'present', c: 'present', d: 'absent' } })],
      NOW,
    );
    expect(out.rate).toBe(0.75);
    expect(out.markedClasses).toBe(1);
  });

  it('gelecekteki dersi hesaba katmaz', () => {
    const out = attendanceStats(
      [session({ date: new Date(2026, 8, 20), bookedUserIds: ['a'] })],
      NOW,
    );
    expect(out.unmarkedClasses).toBe(0);
  });
});

describe('expiringPackages', () => {
  it('status "active" olsa da süresi geçmişi yaklaşan sayma', () => {
    const out = expiringPackages([pkg({ endsAt: new Date(2026, 7, 1), status: 'active' })], NOW, 14);
    expect(out).toHaveLength(0);
  });

  it('en yakın biten başta', () => {
    const out = expiringPackages(
      [
        pkg({ id: 'gec', endsAt: new Date(2026, 8, 12) }),
        pkg({ id: 'erken', endsAt: new Date(2026, 8, 5) }),
      ],
      NOW,
      14,
    );
    expect(out.map((e) => e.pkg.id)).toEqual(['erken', 'gec']);
    expect(out[0].daysLeft).toBe(2);
  });

  it('ufkun ötesini almaz', () => {
    expect(expiringPackages([pkg({ endsAt: new Date(2026, 9, 30) })], NOW, 14)).toHaveLength(0);
  });
});

describe('lapsedMembers', () => {
  it('geçerli paketi olanı listelemez', () => {
    const out = lapsedMembers([member({ userId: 'm' })], [pkg({ memberId: 'm' })], NOW);
    expect(out).toHaveLength(0);
  });

  it('paketi bitmiş üyeyi yakalar', () => {
    const out = lapsedMembers(
      [member({ userId: 'm', userDisplayName: 'Ela' })],
      [pkg({ memberId: 'm', endsAt: new Date(2026, 7, 20) })],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].lastPackageName).toBe('Gold');
  });

  it('hiç paketi olmayanı en sona koyar — o yeni üye olabilir', () => {
    const out = lapsedMembers(
      [member({ userId: 'yeni', userDisplayName: 'Yeni' }), member({ userId: 'eski', userDisplayName: 'Eski' })],
      [pkg({ memberId: 'eski', endsAt: new Date(2026, 7, 20) })],
      NOW,
    );
    expect(out.map((l) => l.memberId)).toEqual(['eski', 'yeni']);
    expect(out[1].endedAt).toBeNull();
  });

  it('en yeni paketi baz alır, ilkini değil', () => {
    const out = lapsedMembers(
      [member({ userId: 'm' })],
      [
        pkg({ id: 'eski', memberId: 'm', endsAt: new Date(2026, 6, 1) }),
        pkg({ id: 'yeni', memberId: 'm', endsAt: new Date(2026, 9, 1) }),
      ],
      NOW,
    );
    expect(out).toHaveLength(0);
  });
});

describe('pendingPayments', () => {
  it('en eski bekleyeni bulur', () => {
    const out = pendingPayments([
      payment({ id: 'a', status: 'pending', amount: 100, createdAt: new Date(2026, 8, 1) }),
      payment({ id: 'b', status: 'pending', amount: 250, createdAt: new Date(2026, 7, 20) }),
      payment({ id: 'c', status: 'confirmed', amount: 900 }),
    ]);
    expect(out.count).toBe(2);
    expect(out.total).toBe(350);
    expect(out.oldest?.id).toBe('b');
  });
});

describe('memberGrowth', () => {
  it('katılımı onay ayına yazar', () => {
    const out = memberGrowth(
      [
        member({ userId: '1', approvedAt: new Date(2026, 8, 2) }),
        member({ userId: '2', approvedAt: new Date(2026, 7, 15) }),
        member({ userId: '3', approvedAt: new Date(2026, 8, 3) }),
      ],
      3,
      NOW,
    );
    expect(out.map((b) => b.total)).toEqual([0, 1, 2]);
  });

  it('onay yoksa başvuru tarihine düşer', () => {
    const out = memberGrowth([member({ userId: '1', requestedAt: new Date(2026, 8, 1) })], 1, NOW);
    expect(out[0].total).toBe(1);
  });
});

describe('daysUntil', () => {
  it('gün içindeki kalanı 1 sayar, 0 değil', () => {
    expect(daysUntil(new Date(2026, 8, 3, 23, 0), NOW)).toBe(1);
  });
});
