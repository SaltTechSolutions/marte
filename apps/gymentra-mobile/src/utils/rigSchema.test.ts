// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 — hangi üretimden geldiği manifest.json'da
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.

import { describe, expect, it } from 'vitest';

import rawArchetypes from '@/data/rigArchetypes.json';
import rawExercises from '@/data/rigExercises.json';
import rawMuscles from '@/data/rigMuscles.json';
import rawAnatomy from '@/data/rigAnatomy.json';
import rawParts from '@/data/rigBodyParts.json';
import { B } from '@/utils/rig';
import { MUSCLES, groupsOf, labelsOf } from '@/utils/muscles';
import {
  MIN_DUR,
  assertArchetypes,
  validateArchetypes,
  validateAnatomy,
  validateBodyParts,
  validateBundle,
  validateExercises,
  validateMuscles,
} from '@/utils/rigSchema';

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
    expect(validateArchetypes(rawArchetypes)).toEqual([]);
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
    expect(Object.keys(assertArchetypes(rawArchetypes))).toEqual(Object.keys(rawArchetypes));
  });
});

/* -------------------------------------------------------------------------- *
 * Hareket kataloğu ve kas verisi
 * -------------------------------------------------------------------------- */

type Catalog = Record<string, Record<string, unknown>>;
type Muscles = Record<string, Record<string, unknown>>;

const ARCH_KEYS = Object.keys(rawArchetypes);

const catalog = (): Catalog => ({
  'back-squat': { name: 'Back squat', archetype: 'squat' },
  plank: { name: 'Plank', archetype: 'plank_prone' },
});
const musclesOf = (c: Catalog): Muscles =>
  Object.fromEntries(Object.keys(c).map((k) => [k, { status: 'pending', primary: [], secondary: [] }]));

const catErrs = (mutate: (c: Catalog) => void): string[] => {
  const c = catalog();
  mutate(c);
  return validateExercises(c, ARCH_KEYS);
};
const musErrs = (mutate: (m: Muscles) => void): string[] => {
  const c = catalog();
  const m = musclesOf(c);
  mutate(m);
  return validateMuscles(m, Object.keys(c));
};

describe('muscles.ts — uygulamanın kas bölgeleri', () => {
  it('39 bölge, hepsinin Türkçe etiketi ve kaba grubu var', () => {
    expect(Object.keys(MUSCLES)).toHaveLength(39);
    Object.entries(MUSCLES).forEach(([id, r]) => {
      expect(r.label.trim(), id).not.toBe('');
      expect(r.group.trim(), id).not.toBe('');
    });
  });

  it('groupsOf kaba gruba indiriyor, sırayı koruyor, tekrarı atıyor', () => {
    // Çipin işi bu: 39 bölge sığmaz, "Sırt · Trapez · Omuz · Biceps" sığar.
    expect(groupsOf(['lat', 'trapMid', 'deltPost', 'biceps'])).toEqual(['Sırt', 'Trapez', 'Omuz', 'Biceps']);
    expect(groupsOf(['absUpper', 'absMid', 'absLower'])).toEqual(['Karın']);
    expect(groupsOf(['yok-boyle'])).toEqual([]);
  });

  it('labelsOf etiketi veriyor, bilinmeyeni kimliğiyle bırakıyor', () => {
    expect(labelsOf(['lat', 'biceps'])).toEqual(['Kanat kası (lat)', 'Biceps']);
    expect(labelsOf(['yok-boyle'])).toEqual(['yok-boyle']);
  });

  it('sözlük uygulamanın kimlikleriyle aynı — veri o kimliklerle yazıldı', () => {
    const used = new Set<string>();
    Object.values(rawMuscles as Record<string, { primary: string[]; secondary: string[] }>).forEach((m) => {
      m.primary.forEach((x) => used.add(x));
      m.secondary.forEach((x) => used.add(x));
    });
    expect([...used].filter((id) => !MUSCLES[id]), 'sözlükte olmayan kas kullanılmış').toEqual([]);
  });
});

describe('validateExercises — hareket kataloğu', () => {
  it('gerçek katalog geçiyor', () => {
    expect(validateExercises(rawExercises, ARCH_KEYS)).toEqual([]);
  });

  it('en küçük geçerli katalog geçiyor', () => {
    expect(catErrs(() => {})).toEqual([]);
  });

  const cases: [string, (c: Catalog) => void, string][] = [
    ['slug olmayan kimlik', (c) => (c['Back Squat'] = c['back-squat']), 'slug'],
    ['bilinmeyen alan', (c) => (c.plank.renk = 'mavi'), 'bilinmeyen alan'],
    ['name yok', (c) => delete c.plank.name, 'name'],
    ['name boş', (c) => (c.plank.name = '   '), 'name'],
    ['archetype metin değil', (c) => (c.plank.archetype = 7), 'archetype'],
    ['archetype arketiplerde yok', (c) => (c.plank.archetype = 'yok_boyle'), "rigArchetypes.json'da yok"],
    ['aynı ad iki kimlikte', (c) => (c['plank-2'] = { name: 'Plank', archetype: 'plank_prone' }), 'birden fazla kimlikte'],
  ];
  cases.forEach(([name, mutate, needle]) => {
    it(`${name} reddediliyor`, () => {
      const e = catErrs(mutate);
      expect(e.length, `hata bekleniyordu, çıkan: ${JSON.stringify(e)}`).toBeGreaterThan(0);
      expect(e.join(' ')).toContain(needle);
    });
  });

  it('nesne olmayan kök ve boş katalog reddediliyor', () => {
    expect(validateExercises(null, ARCH_KEYS).length).toBeGreaterThan(0);
    expect(validateExercises({}, ARCH_KEYS)[0]).toContain('boş');
  });
});

describe('validateMuscles — kas verisi', () => {
  it('gerçek kas verisi geçiyor', () => {
    expect(validateMuscles(rawMuscles, Object.keys(rawExercises))).toEqual([]);
  });

  it('yazılmış (authored) kayıt geçiyor', () => {
    expect(
      musErrs((m) => {
        m.plank = { status: 'authored', primary: ['absMid'], secondary: ['oblique'], source: 'antrenör incelemesi', reviewed: true };
      }),
    ).toEqual([]);
  });

  const cases: [string, (m: Muscles) => void, string][] = [
    ['eksik hareket', (m) => delete m.plank, 'eksik hareket'],
    ['katalogda olmayan hareket', (m) => (m['yok-boyle'] = { status: 'pending', primary: [], secondary: [] }), 'katalogda olmayan'],
    ['bilinmeyen alan', (m) => (m.plank.not = 'x'), 'bilinmeyen alan'],
    ['geçersiz status', (m) => (m.plank.status = 'belki'), 'status'],
    ['primary dizi değil', (m) => (m.plank.primary = 'abs'), 'primary metin dizisi'],
    ['secondary dizi değil', (m) => (m.plank.secondary = 3), 'secondary metin dizisi'],
    [
      'bilinmeyen kas kimliği',
      (m) => (m.plank = { status: 'authored', primary: ['karin'], secondary: [], source: 'x', reviewed: false }),
      'bilinmeyen kas',
    ],
    [
      'aynı kas iki kez',
      (m) => (m.plank = { status: 'authored', primary: ['absMid', 'absMid'], secondary: [], source: 'x', reviewed: false }),
      'iki kez yazılmış',
    ],
    [
      'hem birincil hem ikincil',
      (m) => (m.plank = { status: 'authored', primary: ['absMid'], secondary: ['absMid'], source: 'x', reviewed: false }),
      'hem birincil hem ikincil',
    ],
    [
      'authored ama birincil yok',
      (m) => (m.plank = { status: 'authored', primary: [], secondary: ['absMid'], source: 'x', reviewed: false }),
      'birincil kas yazılmamış',
    ],
    [
      'authored ama source yok',
      (m) => (m.plank = { status: 'authored', primary: ['absMid'], secondary: [], reviewed: false }),
      'source (kaynak notu) yok',
    ],
    ['pending ama kas yazılmış', (m) => (m.plank.primary = ['absMid']), 'status authored olmalı'],
    [
      'authored ama reviewed yok',
      (m) => (m.plank = { status: 'authored', primary: ['absMid'], secondary: [], source: 'x' }),
      'reviewed',
    ],
    ['pending ama reviewed yazılmış', (m) => (m.plank.reviewed = false), 'pending ama reviewed'],
    ['pending ama source yazılmış', (m) => (m.plank.source = 'x'), 'pending ama source'],
  ];
  cases.forEach(([name, mutate, needle]) => {
    it(`${name} reddediliyor`, () => {
      const e = musErrs(mutate);
      expect(e.length, `hata bekleniyordu, çıkan: ${JSON.stringify(e)}`).toBeGreaterThan(0);
      expect(e.join(' ')).toContain(needle);
    });
  });
});

describe('validateBundle — devir paketi', () => {
  it('depodaki gerçek paket geçiyor', () => {
    expect(validateBundle({ archetypes: rawArchetypes, exercises: rawExercises, muscles: rawMuscles })).toEqual([]);
  });

  it('anahtar sürüklenmesi yakalanıyor', () => {
    // Ayrı dosya seçiminin (karar d7ad5288) açık bıraktığı tek risk buydu ve
    // zorunlu kılınan azaltma da bu kontroldü.
    const drift: Muscles = JSON.parse(JSON.stringify(rawMuscles));
    drift['walking-lunges'] = drift['walking-lunge'];
    delete drift['walking-lunge'];
    const e = validateBundle({ archetypes: rawArchetypes, exercises: rawExercises, muscles: drift });
    expect(e.join(' ')).toContain('walking-lunge');
  });

  it('katalogdaki her hareket gerçek bir arketibe bağlı', () => {
    Object.entries(rawExercises as Record<string, { archetype: string }>).forEach(([id, e]) => {
      expect(Object.keys(rawArchetypes), `${id}`).toContain(e.archetype);
    });
  });

  it('34 hareket, 31 arketip — arketip birden çok harekete hizmet edebiliyor', () => {
    // 30 -> 31: `worlds-greatest-stretch` (Lunge + gövde rotasyonu)
    // `unilateral_lunge`tan ayrılıp kendi arketibine (`lunge_reach`) taşındı.
    // Paylaştıkları çizim düz bir hamleydi; o hareketin tanımlayıcı evreleri
    // — gövdenin öne katlanıp elin yere inmesi, sonra kolun yukarı uzanması —
    // hiç görünmüyordu.
    expect(Object.keys(rawExercises)).toHaveLength(34);
    expect(Object.keys(rawArchetypes)).toHaveLength(31);
    const used = new Set(Object.values(rawExercises as Record<string, { archetype: string }>).map((e) => e.archetype));
    expect(used.size, 'her arketip en az bir harekete bağlı olmalı').toBe(31);
  });
});

describe('validateAnatomy — kas haritası yolları', () => {
  const ok = () => JSON.parse(JSON.stringify(rawAnatomy)) as Record<string, unknown>;

  it('gerçek anatomi verisi geçiyor', () => {
    expect(validateAnatomy(rawAnatomy)).toEqual([]);
  });

  it('sözlükteki her kasın en az bir yolu var', () => {
    // Sözlükte olup yolu olmayan bir kas veride yazılabilir ama ekranda hiç
    // boyanmaz — sessiz kayıp. Denetim bunu yakalıyor.
    const used = new Set<string>();
    (['front', 'back'] as const).forEach((v) => {
      (rawAnatomy[v] as { muscle: string | null }[]).forEach((p) => p.muscle && used.add(p.muscle));
    });
    expect(Object.keys(MUSCLES).filter((id) => !used.has(id))).toEqual([]);
  });

  const cases: [string, (a: Record<string, any>) => void, string][] = [
    ['viewBox yok', (a) => delete a.viewBox, 'viewBox'],
    ['mirror yok', (a) => delete a.mirror, 'mirror'],
    ['front dizisi yok', (a) => (a.front = []), 'front yol dizisi yok'],
    ['d boş', (a) => (a.front[0].d = '  '), 'd boş'],
    ['bilinmeyen kas', (a) => (a.front[3].muscle = 'yok-boyle'), 'bilinmeyen kas'],
    ['bilinmeyen alan', (a) => (a.back[0].renk = 'mavi'), 'bilinmeyen alan'],
    ['yolu silinen kas', (a) => (a.back = a.back.filter((p: any) => p.muscle !== 'lat')), 'hiçbir yolu yok'],
  ];
  cases.forEach(([name, mutate, needle]) => {
    it(`${name} reddediliyor`, () => {
      const a = ok();
      mutate(a as Record<string, any>);
      const e = validateAnatomy(a);
      expect(e.length, `hata bekleniyordu, çıkan: ${JSON.stringify(e.slice(0, 2))}`).toBeGreaterThan(0);
      expect(e.join(' ')).toContain(needle);
    });
  });

  it('validateBundle anatomi verilmezse sessiz, verilirse denetliyor', () => {
    const base = { archetypes: rawArchetypes, exercises: rawExercises, muscles: rawMuscles };
    expect(validateBundle(base)).toEqual([]);
    expect(validateBundle({ ...base, anatomy: rawAnatomy })).toEqual([]);
    expect(validateBundle({ ...base, anatomy: { front: [] } }).length).toBeGreaterThan(0);
  });
});


describe('validateBodyParts — uzuv siluet parçaları', () => {
  const ok = () => JSON.parse(JSON.stringify(rawParts)) as Record<string, any>;

  it('gerçek parça verisi geçiyor', () => {
    expect(validateBodyParts(rawParts, B)).toEqual([]);
  });

  it('her parçanın boyu kemik boyuyla aynı', () => {
    // Boy uyuşmazsa parça kemiğinden kısa ya da uzun çizilir ve eklemde boşluk
    // açılır. Figür yine de çizildiği için bu sessiz bir kusur.
    Object.entries((rawParts as any).parts as Record<string, { len: number }>).forEach(([name, q]) => {
      expect(q.len, name).toBe((B as Record<string, number>)[name]);
    });
  });

  const cases: [string, (a: Record<string, any>) => void, string][] = [
    ['parts yok', (a) => delete a.parts, 'parts nesnesi yok'],
    ['d boş', (a) => (a.parts.thigh.d = '  '), 'd boş'],
    ['len yanlış', (a) => (a.parts.thigh.len = 90), 'eklemde boşluk açılır'],
    ['kemik olmayan ad', (a) => (a.parts.kanat = { len: 10, d: 'M0 0 Z' }), 'bir kemik adı değil'],
    ['bilinmeyen alan', (a) => (a.parts.shin.renk = 'mavi'), 'bilinmeyen alan'],
  ];
  cases.forEach(([name, mutate, needle]) => {
    it(`${name} reddediliyor`, () => {
      const a = ok();
      mutate(a);
      const e = validateBodyParts(a, B);
      expect(e.length, `hata bekleniyordu, çıkan: ${JSON.stringify(e)}`).toBeGreaterThan(0);
      expect(e.join(' ')).toContain(needle);
    });
  });
});
