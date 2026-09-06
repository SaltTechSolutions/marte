import { describe, expect, it } from 'vitest';

import raw from '../data/rigArchetypes.json';
import { B } from '../src/rig';
import { MIN_DUR, assertArchetypes, validateArchetypes } from '../src/rigSchema';

/**
 * Şema doğrulamasının testleri.
 *
 * `rigAudit` hareketin MEKANİĞİNİ denetler; burası verinin ŞEKLİNİ. İkisi ayrı
 * sorular: mekanik denetim elinde düzgün biçimli bir hareket olduğunu
 * varsayıyor, `mode: "supin"` yazan bir JSON ona hiç ulaşamadan motorun içinde
 * `undefined.length` olarak patlıyordu.
 *
 * Her reddetme sınıfının kendi testi var. Bir kural eklenip testi yazılmazsa
 * bu dosya sessiz kalır — o yüzden kural sayısı kadar test tutmak elle
 * korunan bir söz; ROM bantlarındaki gibi otomatik değil, çünkü reddetmeler
 * tek bir tablodan gelmiyor.
 */

/**
 * Geçerli tek arketiplik en küçük veri. Her test bunu bozarak ilerliyor.
 *
 * Tipler bilerek gevşek: doğrulayıcı `unknown` alıyor ve buradaki işin tamamı
 * ona bozuk veri beslemek. Dar bir fixture tipi, test etmek istediğimiz
 * bozmaları derleme zamanında engellerdi.
 */
type Kare = { t: unknown; tr: unknown; p: Record<string, unknown> };
type Fixture = { x: Record<string, unknown> & { kf: Kare[] } };

const ok = (): Fixture => ({
  x: {
    mode: 'stand',
    arm: 'angles',
    bar: null,
    bend: 1,
    dur: 3000,
    kf: [
      { t: 0, tr: 'Başlangıç', p: { shinA: 180, thighA: 180 } },
      { t: 1, tr: 'Bitiş', p: { shinA: 180, thighA: 180 } },
    ],
  },
});

/** Bozan bir yamayı uygulayıp çıkan hata mesajlarını verir. */
const errs = (mutate: (d: Fixture) => void): string[] => {
  const d = ok();
  mutate(d);
  return validateArchetypes(d);
};

describe('rigSchema — geçerli veri', () => {
  it('gerçek rigArchetypes.json geçiyor', () => {
    expect(validateArchetypes(raw)).toEqual([]);
  });

  it('en küçük geçerli arketip geçiyor', () => {
    expect(validateArchetypes(ok())).toEqual([]);
  });

  it('isteğe bağlı alanlar yazılınca da geçiyor', () => {
    expect(
      errs((d) => {
        Object.assign(d.x, { load: 'dumbbell', prop: 'bench', view: 'front', note: 'not', hideFarLeg: true, hideFarArm: false });
      }),
    ).toEqual([]);
  });
});

describe('rigSchema — kök', () => {
  it('nesne olmayan kök reddediliyor', () => {
    [null, 42, 'x', [], undefined].forEach((v) => {
      expect(validateArchetypes(v).length, String(v)).toBeGreaterThan(0);
    });
  });

  it('boş nesne reddediliyor', () => {
    expect(validateArchetypes({})[0]).toContain('boş veri');
  });

  it('nesne olmayan arketip reddediliyor', () => {
    expect(validateArchetypes({ x: 5 })[0]).toContain('nesne değil');
  });
});

describe('rigSchema — arketip alanları', () => {
  const cases: [string, (d: Fixture) => void, string][] = [
    ['bilinmeyen alan', (d) => (d.x.foo = 1), 'bilinmeyen alan'],
    ['geçersiz mode', (d) => (d.x.mode = 'supin'), 'mode'],
    ['geçersiz arm', (d) => (d.x.arm = 'aci'), 'arm'],
    ['geçersiz bar', (d) => (d.x.bar = 'sirt'), 'bar'],
    ['geçersiz bend', (d) => (d.x.bend = 0), 'bend'],
    ['dur eksik', (d) => delete d.x.dur, 'dur'],
    ['dur çok kısa', (d) => (d.x.dur = MIN_DUR), 'dur'],
    ['geçersiz load', (d) => (d.x.load = 'kettlebell'), 'load'],
    ['geçersiz prop', (d) => (d.x.prop = 'sandalye'), 'prop'],
    ['geçersiz view', (d) => (d.x.view = 'ust'), 'view'],
    ['note metin değil', (d) => (d.x.note = 5), 'note'],
    ['hideFarLeg boolean değil', (d) => (d.x.hideFarLeg = 'evet'), 'hideFarLeg'],
    ['hideFarArm boolean değil', (d) => (d.x.hideFarArm = 1), 'hideFarArm'],
  ];
  cases.forEach(([name, mutate, needle]) => {
    it(`${name} reddediliyor`, () => {
      const e = errs(mutate);
      expect(e.length, `hata bekleniyordu, çıkan: ${JSON.stringify(e)}`).toBeGreaterThan(0);
      expect(e.join(' ')).toContain(needle);
    });
  });

  it('dur sınırın bir üstünde kabul ediliyor', () => {
    // Sınırın kendisi reddediliyor (`<= MIN_DUR`); testin sınırı hangi yönde
    // kestiğini sabitlemek, eşik oynayınca haber almanın tek yolu.
    expect(errs((d) => (d.x.dur = MIN_DUR + 1))).toEqual([]);
  });
});

describe('rigSchema — kareler', () => {
  const cases: [string, (d: Fixture) => void, string][] = [
    ['kf dizi değil', (d) => (d.x.kf = {} as unknown as Kare[]), 'kf dizisi yok'],
    ['tek kare', (d) => (d.x.kf = [d.x.kf[0]]), 'en az iki kare'],
    ['kf elemanı nesne değil', (d) => (d.x.kf[1] = 7 as unknown as Kare), 'nesne değil'],
    ['t sayı değil', (d) => (d.x.kf[1].t = '1'), 'geçersiz (0..1)'],
    ['t aralık dışı', (d) => (d.x.kf[1].t = 1.5), 'geçersiz (0..1)'],
    ['tr metin değil', (d) => (d.x.kf[1].tr = 3), 'tr metin olmalı'],
    ['p nesne değil', (d) => (d.x.kf[1].p = null as unknown as Record<string, unknown>), 'p nesne değil'],
    ['bilinmeyen poz alanı', (d) => (d.x.kf[0].p.shinX = 10), 'bilinmeyen alan'],
    ['poz alanı sayı değil', (d) => (d.x.kf[0].p.shinA = 'düz'), 'sayı olmalı'],
    ['ilk kare t≠0', (d) => (d.x.kf[0].t = 0.1), 'ilk kare'],
    ['son kare t≠1', (d) => (d.x.kf[1].t = 0.9), 'son kare'],
  ];
  cases.forEach(([name, mutate, needle]) => {
    it(`${name} reddediliyor`, () => {
      const e = errs(mutate);
      expect(e.length, `hata bekleniyordu, çıkan: ${JSON.stringify(e)}`).toBeGreaterThan(0);
      expect(e.join(' ')).toContain(needle);
    });
  });

  it('zaman geriye giden kare reddediliyor', () => {
    const e = errs((d) => {
      d.x.kf = [
        { t: 0, tr: 'a', p: {} },
        { t: 0.8, tr: 'b', p: {} },
        { t: 0.3, tr: 'c', p: {} },
        { t: 1, tr: 'd', p: {} },
      ];
    });
    expect(e.join(' ')).toContain('geriye gidiyor');
  });
});

describe('rigSchema — ankleLift sınırı', () => {
  it('ayakta ayak boyunu aşan topuk kalkışı reddediliyor', () => {
    const e = errs((d) => (d.x.kf[0].p.ankleLift = B.foot + 1));
    expect(e.join(' ')).toContain('ankleLift');
  });

  it('negatif topuk kalkışı reddediliyor', () => {
    const e = errs((d) => (d.x.kf[0].p.ankleLift = -1));
    expect(e.join(' ')).toContain('ankleLift');
  });

  it('basamakta (prop: box) sınır uygulanmıyor', () => {
    // Basamağa çıkarken yükselten şey ayak değil altındaki kutu; step_up 92px
    // kalkışla bu muafiyet olmadan reddedilirdi.
    const e = errs((d) => {
      d.x.prop = 'box';
      d.x.kf[0].p.ankleLift = 92;
    });
    expect(e).toEqual([]);
  });

  it('ayakta olmayan modda sınır uygulanmıyor', () => {
    const e = errs((d) => {
      d.x.mode = 'bench';
      d.x.kf[0].p.ankleLift = 200;
    });
    expect(e).toEqual([]);
  });
});

describe('rigSchema — hata toplama ve assert', () => {
  it('ilk hatada durmuyor, hepsini topluyor', () => {
    // Elle düzenlenmiş bir dosyada hataları teker teker keşfetmek yavaş.
    const e = errs((d) => {
      d.x.mode = 'supin';
      d.x.arm = 'aci';
      d.x.bend = 0;
    });
    expect(e.length).toBeGreaterThanOrEqual(3);
  });

  it('assertArchetypes geçersiz veride fırlatıyor ve nedenini söylüyor', () => {
    expect(() => assertArchetypes({ x: { mode: 'supin' } })).toThrow(/rigArchetypes\.json geçersiz/);
  });

  it('assertArchetypes geçerli veriyi aynen döndürüyor', () => {
    expect(Object.keys(assertArchetypes(raw))).toEqual(Object.keys(raw));
  });
});
