import { describe, expect, it } from 'vitest';

import { draftFromEntries, MEASURE_START, startValue } from './measurement';
import { MeasurementEntry } from './types';

const entry = (over: Partial<MeasurementEntry> = {}): MeasurementEntry => ({
  id: 'e1',
  tenantId: 't1',
  memberId: 'm1',
  recordedAt: new Date('2026-09-01'),
  weightKg: 82,
  ...over,
});

describe('draftFromEntries', () => {
  it('DEN-4: ilk ölçümde hiçbir alan dolu gelmez, gizli varsayılan kaydedilmez', () => {
    // Form eskiden 75 kg / 100 / 85 / 35 ile açılıyordu; yalnızca kilosunu
    // kaydetmek isteyen üye göğüs, bel ve kol için de uydurma değer yazıyordu.
    expect(draftFromEntries(undefined)).toEqual({ weightKg: null, chestCm: null, waistCm: null, armCm: null });
    expect(draftFromEntries([])).toEqual({ weightKg: null, chestCm: null, waistCm: null, armCm: null });
  });

  it('son kaydın yalnızca girilmiş alanlarını taşır', () => {
    const draft = draftFromEntries([entry({ weightKg: 80, waistCm: 90 })]);
    expect(draft).toEqual({ weightKg: 80, chestCm: null, waistCm: 90, armCm: null });
  });

  it('yalnızca en yeni kayda bakar, eski kayıttaki alanı geri getirmez', () => {
    // Üye göğüs ölçümünü sonradan bırakmış olabilir; kendiliğinden geri gelmesin.
    const draft = draftFromEntries([entry({ id: 'yeni', weightKg: 80 }), entry({ id: 'eski', chestCm: 101 })]);
    expect(draft.chestCm).toBeNull();
  });
});

describe('startValue', () => {
  it('en yeni girilmiş değeri kullanır, o kayıt en yeni olmasa bile', () => {
    const entries = [entry({ id: 'yeni', weightKg: 80 }), entry({ id: 'eski', chestCm: 101 })];
    expect(startValue(entries, 'chestCm')).toBe(101);
  });

  it('daha önce hiç girilmediyse genel başlangıç değerine düşer', () => {
    expect(startValue([entry()], 'armCm')).toBe(MEASURE_START.armCm);
    expect(startValue(undefined, 'weightKg')).toBe(MEASURE_START.weightKg);
  });

  it('kilo her kayıtta var, en yeni kaydınki gelir', () => {
    expect(startValue([entry({ weightKg: 79 }), entry({ weightKg: 85 })], 'weightKg')).toBe(79);
  });
});
