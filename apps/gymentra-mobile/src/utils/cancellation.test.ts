import { describe, expect, it } from 'vitest';

import { cancellationConsequence, sessionOutcome, willRefundOnCancel } from './cancellation';

const NOW = new Date(2026, 8, 3, 12, 0, 0);
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600000);

describe('willRefundOnCancel', () => {
  it('salon ayarı yoksa 24 saate düşer — sunucuyla aynı varsayılan', () => {
    expect(willRefundOnCancel(inHours(25), NOW, undefined)).toBe(true);
    expect(willRefundOnCancel(inHours(23), NOW, undefined)).toBe(false);
  });

  it('salonun kendi eşiğini kullanır', () => {
    expect(willRefundOnCancel(inHours(30), NOW, 48)).toBe(false);
    expect(willRefundOnCancel(inHours(30), NOW, 12)).toBe(true);
  });

  it('tam eşikte iade eder — sunucudaki >= ile aynı', () => {
    expect(willRefundOnCancel(inHours(24), NOW, 24)).toBe(true);
  });

  it('geçmiş randevu iade etmez', () => {
    expect(willRefundOnCancel(inHours(-2), NOW, 24)).toBe(false);
  });
});

describe('cancellationConsequence', () => {
  it('kredisi olmayan randevuda iade sözü vermez', () => {
    const msg = cancellationConsequence({ sessionDate: inHours(2), now: NOW, hoursSetting: 24, hasCredit: false });
    expect(msg).toContain('düşmemişti');
  });

  it('geç iptalde salonun kendi süresini söyler', () => {
    const msg = cancellationConsequence({ sessionDate: inHours(5), now: NOW, hoursSetting: 48, hasCredit: true });
    expect(msg).toContain('48 saat');
    expect(msg).toContain('yanacak');
  });

  it('erken iptalde iadeyi kesin söyler', () => {
    const msg = cancellationConsequence({ sessionDate: inHours(72), now: NOW, hoursSetting: 48, hasCredit: true });
    expect(msg).toBe('Ders hakkın iade edilecek.');
  });
});

describe('sessionOutcome', () => {
  it('henüz olmamış randevuya sonuç uydurmaz', () => {
    expect(sessionOutcome({ status: 'scheduled', creditId: 'c' })).toBeNull();
  });

  it('gelmeyende hakkın kullanıldığını söyler', () => {
    expect(sessionOutcome({ status: 'no-show', creditId: 'c' })).toContain('kullanıldı');
  });

  it('kredisiz randevuda hak lafı geçmez', () => {
    expect(sessionOutcome({ status: 'no-show' })).toBe('Gelmedin');
    expect(sessionOutcome({ status: 'cancelled' })).toBe('İptal edildi');
  });

  it('geç iptalde sebebini söyler', () => {
    expect(sessionOutcome({ status: 'cancelled', creditId: 'c', creditRefunded: false, cancelledByRole: 'member' }))
      .toContain('Son iptal saatinden sonra');
  });

  it('salon iptalini üyenin iptalinden ayırır', () => {
    expect(sessionOutcome({ status: 'cancelled', creditId: 'c', creditRefunded: true, cancelledByRole: 'trainer' }))
      .toContain('Salon iptal etti');
  });
});
