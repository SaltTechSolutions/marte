import { describe, expect, it } from 'vitest';

import { createEventBudget, DEFAULT_LIMITS, signatureOf } from './eventBudget';

const err = (type: string, value: string) => ({ exception: { values: [{ type, value }] } });

describe('signatureOf', () => {
  it('aynı tür + aynı sebep aynı imza', () => {
    expect(signatureOf(err('TypeError', "x of undefined"))).toBe(signatureOf(err('TypeError', 'x of undefined')));
  });

  it('tür ayrıysa imza da ayrı', () => {
    expect(signatureOf(err('TypeError', 'aynı'))).not.toBe(signatureOf(err('RangeError', 'aynı')));
  });

  it('istisnasız olay mesajından imzalanır', () => {
    expect(signatureOf({ message: 'kural reddetti' })).toBe('msg|kural reddetti');
  });

  it('hiçbir alanı olmayan olaylar tek kovaya düşer', () => {
    // Ayırt edilemeyeni ayrı saymak sınırı hiç uygulamamak olurdu.
    expect(signatureOf({})).toBe(signatureOf({}));
  });
});

describe('createEventBudget', () => {
  it('aynı arızayı sınıra kadar geçirir, sonra susturur', () => {
    const allow = createEventBudget({ perSignature: 3, perSession: 25 });
    const loop = () => allow(err('TypeError', 'render patladı'));
    expect([loop(), loop(), loop()]).toEqual([true, true, true]);
    expect([loop(), loop(), loop()]).toEqual([false, false, false]);
  });

  it('gürültülü hata sessiz olanı susturmaz', () => {
    // Bu, sınırın neden imza başına olduğunun kendisi: 10 kez atan bir ekran
    // varken ilk kez görülen başka bir hata hâlâ raporlanabilmeli.
    const allow = createEventBudget({ perSignature: 2, perSession: 25 });
    for (let i = 0; i < 10; i += 1) allow(err('TypeError', 'gürültü'));
    expect(allow(err('RangeError', 'sessiz'))).toBe(true);
  });

  it('her seferinde yeni imza üreten döngüyü oturum tavanı durdurur', () => {
    const allow = createEventBudget({ perSignature: 3, perSession: 5 });
    const results = Array.from({ length: 8 }, (_, i) => allow(err('Error', `zaman damgası ${i}`)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(results.slice(5)).toEqual([false, false, false]);
  });

  it('oturum tavanı yalnızca gönderilenleri sayar', () => {
    // Susturulan tekrarlar tavanı yemezse, bir döngüden sonra hâlâ yeni
    // hatalara yer kalır.
    const allow = createEventBudget({ perSignature: 1, perSession: 3 });
    for (let i = 0; i < 20; i += 1) allow(err('TypeError', 'döngü'));
    expect(allow(err('RangeError', 'yeni'))).toBe(true);
    expect(allow(err('EvalError', 'bir tane daha'))).toBe(true);
    expect(allow(err('URIError', 'tavan doldu'))).toBe(false);
  });

  it('bütçeler birbirinden bağımsız', () => {
    const a = createEventBudget({ perSignature: 1, perSession: 1 });
    const b = createEventBudget({ perSignature: 1, perSession: 1 });
    expect(a(err('Error', 'x'))).toBe(true);
    expect(a(err('Error', 'x'))).toBe(false);
    expect(b(err('Error', 'x'))).toBe(true);
  });

  it('varsayılan sınırlar makul', () => {
    expect(DEFAULT_LIMITS.perSignature).toBeLessThan(DEFAULT_LIMITS.perSession);
  });
});
