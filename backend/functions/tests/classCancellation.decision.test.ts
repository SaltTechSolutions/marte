import * as admin from 'firebase-admin';
import { describe, expect, it } from 'vitest';

import { decideRefund, refundTargets } from '../src/classCancellation';

/**
 * The refund DECISIONS of `refundCancelledClass` (DEN-8 / CX-03), with no
 * Firestore behind them, so they run without the emulator. What they cannot
 * show — the transaction, the once-per-(class, member) marker and concurrent
 * runs — is covered by `classCancellation.refund.test.ts`, which needs it.
 */
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);
const at = (offsetMs: number) => admin.firestore.Timestamp.fromMillis(NOW + offsetMs);
const HOUR = 3600_000;

const klass = (over: Record<string, unknown> = {}) => ({
  tenantId: 't1',
  date: at(48 * HOUR),
  bookedUserIds: ['m1', 'm2'],
  waitlistUserIds: [],
  bookingCredits: { m1: 'c1', m2: 'c2' },
  ...over,
});

describe('refundTargets', () => {
  it('başlamamış derste rezerve eden ve kredisi kayıtlı herkesi verir', () => {
    expect(refundTargets(klass(), NOW)).toEqual([
      { memberId: 'm1', creditId: 'c1' },
      { memberId: 'm2', creditId: 'c2' },
    ]);
  });

  it('başlamış ya da geçmiş derste kimseyi vermez', () => {
    expect(refundTargets(klass({ date: at(-60_000) }), NOW)).toEqual([]);
    expect(refundTargets(klass({ date: at(0) }), NOW)).toEqual([]);
  });

  it('ders başlamadan bir saniye önce hâlâ iade eder', () => {
    expect(refundTargets(klass({ date: at(1000) }), NOW)).toHaveLength(2);
  });

  it('bookedUserIds\'te olmayanı vermez: kendi çıkan üyenin bookingCredits kalıntısı', () => {
    expect(refundTargets(klass({ bookedUserIds: ['m2'] }), NOW)).toEqual([{ memberId: 'm2', creditId: 'c2' }]);
  });

  it('bekleme listesindekini ve kredisiz (sınırsız hak) rezerve edeni vermez', () => {
    const k = klass({
      bookedUserIds: ['m1', 'unlimited'],
      waitlistUserIds: ['waiting'],
      bookingCredits: { m1: 'c1', waiting: 'c9' },
    });
    expect(refundTargets(k, NOW)).toEqual([{ memberId: 'm1', creditId: 'c1' }]);
  });

  it('bookingCredits yoksa ya da bozuksa boş döner, hata vermez', () => {
    expect(refundTargets(klass({ bookingCredits: undefined }), NOW)).toEqual([]);
    expect(refundTargets(klass({ bookingCredits: { m1: '', m2: 42 } }), NOW)).toEqual([]);
  });

  it('tarihi olmayan belge için boş döner', () => {
    expect(refundTargets(klass({ date: undefined }), NOW)).toEqual([]);
  });
});

describe('decideRefund', () => {
  const credit = (over: Record<string, unknown> = {}) => ({
    tenantId: 't1',
    memberId: 'm1',
    kind: 'groupClass',
    total: 8,
    used: 3,
    status: 'active',
    ...over,
  });

  it('harcanmış hakkı bir azaltır', () => {
    expect(decideRefund(credit({ used: 3 }), 't1', 'm1')).toEqual({ outcome: 'refunded', patch: { used: 2 } });
  });

  it('tükenmiş krediyi yeniden aktif yapar', () => {
    expect(decideRefund(credit({ total: 8, used: 8, status: 'exhausted' }), 't1', 'm1')).toEqual({
      outcome: 'refunded',
      patch: { used: 7, status: 'active' },
    });
  });

  it('süresi dolmuş (expired) krediyi canlandırmaz', () => {
    expect(decideRefund(credit({ used: 3, status: 'expired' }), 't1', 'm1').patch).toEqual({ used: 2 });
  });

  it('hiç harcanmamış krediyi negatife düşürmez', () => {
    expect(decideRefund(credit({ used: 0 }), 't1', 'm1')).toEqual({ outcome: 'nothing-to-refund', patch: null });
  });

  it('used sayı değilse dokunmaz (NaN üretmez)', () => {
    expect(decideRefund(credit({ used: undefined }), 't1', 'm1')).toEqual({ outcome: 'nothing-to-refund', patch: null });
  });

  it('kredi belgesi yoksa dokunmaz', () => {
    expect(decideRefund(undefined, 't1', 'm1')).toEqual({ outcome: 'credit-missing', patch: null });
  });

  it('başka üyenin, başka salonun ya da başka türün kredisine dokunmaz (sahte bookingCredits)', () => {
    expect(decideRefund(credit({ memberId: 'baskasi' }), 't1', 'm1').outcome).toBe('credit-mismatch');
    expect(decideRefund(credit({ tenantId: 'baska-salon' }), 't1', 'm1').outcome).toBe('credit-mismatch');
    expect(decideRefund(credit({ kind: 'ptLesson' }), 't1', 'm1').outcome).toBe('credit-mismatch');
    expect(decideRefund(credit({ memberId: 'baskasi' }), 't1', 'm1').patch).toBeNull();
  });
});
