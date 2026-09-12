import { describe, expect, it } from 'vitest';

import { ExistingSession, findOverlap } from '../src/sessions';

/**
 * PER-6. The defect this guards: a trainer's calendar accepted two members
 * in one hour, because the only conflict check was a deterministic document
 * id — which sees an identical start time and nothing else.
 */
const HOUR = 60 * 60000;
/** 2026-09-10 10:00 local. */
const TEN = new Date(2026, 8, 10, 10, 0, 0, 0).getTime();

function session(startMs: number, durationMinutes = 60, over: Partial<ExistingSession> = {}): ExistingSession {
  return { id: `s${startMs}`, startMs, durationMinutes, ...over };
}

describe('findOverlap', () => {
  it('aynı saatte başlayan randevuyu yakalar', () => {
    expect(findOverlap([session(TEN)], TEN, 60)?.id).toBe(`s${TEN}`);
  });

  it('mevcut randevunun içinde başlayan yeni randevuyu yakalar', () => {
    // 10:00–11:00 duruyor, 10:30 isteniyor — eski kontrol bunu göremiyordu.
    expect(findOverlap([session(TEN)], TEN + HOUR / 2, 60)).toBeDefined();
  });

  it('mevcut randevuyu içine alan yeni randevuyu yakalar', () => {
    // 10:30–11:00 duruyor, 10:00–12:00 isteniyor.
    expect(findOverlap([session(TEN + HOUR / 2, 30)], TEN, 120)).toBeDefined();
  });

  it('arka arkaya randevuları çakışma saymaz', () => {
    // 10:00–11:00 bitiyor, 11:00 başlıyor: normal ardışık ders.
    expect(findOverlap([session(TEN)], TEN + HOUR, 60)).toBeUndefined();
  });

  it('iptal edilmiş randevu yer tutmaz', () => {
    expect(findOverlap([session(TEN, 60, { status: 'cancelled' })], TEN, 60)).toBeUndefined();
  });

  it('gelmedi ve tamamlandı yer tutar', () => {
    // Geçmiş bir kaydın üstüne yazmak da çakışmadır; yalnızca iptal serbest
    // bırakır.
    expect(findOverlap([session(TEN, 60, { status: 'no-show' })], TEN, 60)).toBeDefined();
    expect(findOverlap([session(TEN, 60, { status: 'completed' })], TEN, 60)).toBeDefined();
  });

  it('bu çağrıda yazılan kayıtları kendisiyle çakıştırmaz', () => {
    const ignore = new Set([`s${TEN}`]);
    expect(findOverlap([session(TEN)], TEN, 60, ignore)).toBeUndefined();
  });

  it('süresi olmayan eski kayıtları 60 dakika sayar', () => {
    const legacy = { id: 'eski', startMs: TEN, durationMinutes: 0 } as ExistingSession;
    expect(findOverlap([legacy], TEN + HOUR / 2, 30)).toBeDefined();
    expect(findOverlap([legacy], TEN + HOUR, 30)).toBeUndefined();
  });

  it('uzak saatleri rahat bırakır', () => {
    expect(findOverlap([session(TEN)], TEN + 3 * HOUR, 60)).toBeUndefined();
  });
});
