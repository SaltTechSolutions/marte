import { describe, expect, it } from 'vitest';

// @ts-expect-error — .mjs araç betiği, tip bildirimi yok
import { BONES, makeTransform, normalizePath } from '../scripts/normalize-part.mjs';

import rawParts from '../data/bodyParts.json';
import { B } from '../src/rig';

/**
 * Yol normalleştiricinin testleri.
 *
 * Bu adımın hatası elle yapıldığında SESSİZ: yanlış origin ya da dönüş parçayı
 * kemiğe yanlış oturtur ama figür yine çizilir. Testler dönüşümü döndürülmüş,
 * ötelenmiş ve ölçeklenmiş kemiklerle sınıyor — kimlik durumu (dx=0) dönüşü
 * hiç çalıştırmadığı için tek başına hiçbir şey kanıtlamıyor.
 */
describe('makeTransform', () => {
  const near = (a: number[], b: number[]) => {
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  };

  it('kemik zaten yerinde: kimlik', () => {
    const T = makeTransform([0, 0], [0, 105], 105);
    near(T([0, 0]), [0, 0]);
    near(T([0, 105]), [0, 105]);
    near(T([20, 50]), [20, 50]);
  });

  it('ötelenmiş kemik orijine geliyor', () => {
    const T = makeTransform([300, 200], [300, 305], 105);
    near(T([300, 200]), [0, 0]);
    near(T([300, 305]), [0, 105]);
  });

  it('yatay kemik +Y ye dönüyor', () => {
    // Kimlik durumunun yakalayamadığı hata sınıfı burada.
    const T = makeTransform([0, 0], [100, 0], 100);
    near(T([100, 0]), [0, 100]);
    near(T([0, -10]), [10, 0]);
  });

  it('ters yöne bakan kemik de doğru dönüyor', () => {
    const T = makeTransform([50, 50], [50, -50], 100);
    near(T([50, -50]), [0, 100]);
  });

  it('boy hedefe ölçekleniyor', () => {
    const T = makeTransform([0, 0], [0, 210], 105);
    near(T([0, 210]), [0, 105]);
    near(T([40, 105]), [20, 52.5]);
  });

  it('sıfır uzunlukta kemik reddediliyor', () => {
    expect(() => makeTransform([5, 5], [5, 5], 105)).toThrow(/aynı nokta/);
  });
});

describe('normalizePath', () => {
  it('kemik başı (0,0), sonu (0,len) oluyor', () => {
    const r = normalizePath('M 300 200 L 340 250 L 300 305 Z', [300, 200], [300, 305], 105);
    expect(r.d.startsWith('M 0 0')).toBe(true);
    expect(r.d).toContain('0 105');
  });

  it('göreli komutlar mutlağa çevriliyor', () => {
    const abs = normalizePath('M 0 0 L 10 20 L 0 100 Z', [0, 0], [0, 100], 100).d;
    const rel = normalizePath('m 0 0 l 10 20 l -10 80 z', [0, 0], [0, 100], 100).d;
    expect(rel).toBe(abs);
  });

  it('H ve V komutları L ye çevriliyor — dönüş altında yatay kalmıyorlar', () => {
    const r = normalizePath('M 0 0 H 20 V 100 Z', [0, 0], [0, 100], 100);
    expect(r.d).not.toMatch(/[HV]/);
    expect(r.d).toContain('L');
  });

  it('yay komutu açık hatayla reddediliyor', () => {
    expect(() => normalizePath('M 0 0 A 10 10 0 0 1 0 100 Z', [0, 0], [0, 100], 100)).toThrow(/Yay komutu/);
  });

  it('ön ve arka genişliği bildiriyor — ayna hatasını görünür kılıyor', () => {
    // +X figürün baktığı yön. Kütle arkada ağır basıyorsa parça aynalanmıştır.
    const r = normalizePath('M 0 0 L 30 50 L 0 100 Z', [0, 0], [0, 100], 100);
    expect(r.front).toBeCloseTo(30, 6);
    expect(r.back).toBeCloseTo(0, 6);
  });

  it('mevcut parça verisi kimlik dönüşümünden bozulmadan geçiyor', () => {
    const parts = (rawParts as { parts: Record<string, { len: number; d: string }> }).parts;
    Object.entries(parts).forEach(([name, q]) => {
      expect(normalizePath(q.d, [0, 0], [0, q.len], q.len).d, name).toBe(q.d);
    });
  });
});

describe('BONES sözlüğü', () => {
  it('motorun kemik boylarıyla birebir aynı', () => {
    // İkisi ayrışırsa script yanlış boya ölçekler ve şema onu reddeder; hata
    // geç ve kafa karıştırıcı olur.
    Object.entries(BONES as Record<string, number>).forEach(([k, v]) => {
      expect(v, k).toBe((B as unknown as Record<string, number>)[k]);
    });
  });
});
