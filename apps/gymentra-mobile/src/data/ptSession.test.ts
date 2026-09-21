import { describe, expect, it } from 'vitest';

import { upcomingScheduled } from './ptSession';
import { PtSession, PtSessionStatus } from './types';

const session = (id: string, status: PtSessionStatus, day: number): PtSession => ({
  id,
  tenantId: 't1',
  trainerId: 'tr1',
  trainerName: 'Antrenör',
  memberId: 'm1',
  memberName: 'Üye',
  date: new Date(2026, 9, day, 10, 0),
  durationMinutes: 60,
  status,
  createdAt: new Date(2026, 8, 1),
  updatedAt: new Date(2026, 8, 1),
});

describe('upcomingScheduled', () => {
  it('yalnızca hâlâ geçerli randevuları bırakır', () => {
    const all = [
      session('a', 'scheduled', 1),
      session('b', 'cancelled', 2),
      session('c', 'completed', 3),
      session('d', 'no-show', 4),
      session('e', 'scheduled', 5),
    ];
    expect(upcomingScheduled(all).map((s) => s.id)).toEqual(['a', 'e']);
  });

  it('sırayı bozmaz', () => {
    const all = [session('a', 'scheduled', 1), session('b', 'scheduled', 2)];
    expect(upcomingScheduled(all).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('DEN-7: ilk sıradaki iptal edilmiş randevu "sıradaki randevu" olmaz', () => {
    // İptal belgeyi silmiyor, status'ü 'cancelled' yapıyor; tarihi ileride
    // olduğu için sorguda ilk sırada kalıyordu ve ana ekran onu basıyordu.
    const all = [session('iptal', 'cancelled', 1), session('gercek', 'scheduled', 3)];
    expect(upcomingScheduled(all)[0].id).toBe('gercek');
  });

  it('hepsi iptalse boş döner', () => {
    expect(upcomingScheduled([session('a', 'cancelled', 1)])).toEqual([]);
  });
});
