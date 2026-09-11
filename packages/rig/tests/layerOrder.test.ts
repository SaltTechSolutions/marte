import { describe, expect, it } from 'vitest';

// Kaynağı METİN olarak okuyoruz: sıra çalışma anında değil kaynakta yaşıyor
// (bkz. `SIDE_LAYERS` notu). `?raw` Vite'ın yükleyicisi — `node:fs` yerine
// tercih edildi, bu paketin Node tip bildirimleri yok.
import SRC from '../editor/editor.js?raw';
import { FRONT_LAYERS, LAYER_WHY, SIDE_LAYERS } from '../src/rig';

/**
 * Katman sırası testi — üç çizim gövdesi aynı sırayı kullanıyor mu?
 *
 * ## Neden var
 *
 * 11 Eylül 2026'da üç katman hatası arka arkaya çıktı (halter tabağı gövdenin
 * arkasında, yakın kol kafanın arkasında, sahne eşyası uzak bacağın önünde) ve
 * üçünü de kullanıcı GÖZLE buldu. Hepsi aynı kuralın ihlaliydi — katman sırası
 * yakınlık sırasıdır — ama kural yalnızca yorumlarda yazılıydı, hiçbir yerde
 * veri değildi, o yüzden hiçbir test onu kontrol edemiyordu.
 *
 * Şimdi sıra `SIDE_LAYERS`/`FRONT_LAYERS` olarak `rig.ts`'de veri. Bu test
 * editörün İKİ çizim gövdesini (ana sahne `draw`, telefon önizlemesi
 * `drawPose`) o veriyle karşılaştırıyor. Üçüncü gövde uygulamada:
 * `RigFigure.layers.test.ts` aynı diziyi — devredilen `rig.ts`'den — okuyup
 * aynı şeyi yapıyor.
 *
 * ## Nasıl
 *
 * Çizim kodu diziyi çalışma anında OKUMUYOR (bkz. `SIDE_LAYERS` notu), o
 * yüzden karşılaştırma kaynak üstünden: her katmanın başına bir `KATMAN`
 * işareti konmuş durumda ve test bunların KAYNAKTAKİ SIRASINI okuyor.
 * Çalışma anı sırası değil bu — ama üç gövdenin de birbirinden ayrışmasını
 * yakalıyor, aranan tam olarak buydu.
 *
 * Koşullu katmanlar (`far` yalnızca uzak bacak görünürken) burada görünür
 * kalıyor: işaret kaynakta duruyor, koşul değil sıra denetleniyor.
 */

/** `// KATMAN yan: props` → sıradaki katman. `yan+ön` ikisine birden yazılır. */
function layersIn(src: string, view: 'yan' | 'ön'): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/KATMAN\s+([\wö+]+):\s*(\w+)/g)) {
    if (m[1].split('+').includes(view)) out.push(m[2]);
  }
  return out;
}

/** Üst düzey bir fonksiyonun gövdesi — sonraki üst düzey bildirime kadar. */
function bodyOf(name: string): string {
  const i = SRC.indexOf(`\nfunction ${name}(`);
  expect(i, `${name} bulunamadı`).toBeGreaterThan(-1);
  const j = SRC.indexOf('\n}\n', i);
  return SRC.slice(i, j);
}

describe('katman sırası tek yerde tanımlı', () => {
  it('her katmanın bir gerekçesi yazılı', () => {
    // Gerekçesiz katman = yarın kimsenin savunamayacağı bir sıra.
    const hepsi = [...SIDE_LAYERS, ...FRONT_LAYERS];
    expect(hepsi.filter((k) => !LAYER_WHY[k]), 'gerekçesi olmayan katmanlar').toEqual([]);
    expect(Object.keys(LAYER_WHY).filter((k) => !hepsi.includes(k as never)), 'karşılığı olmayan gerekçeler').toEqual([]);
  });

  it('yan görünüm kuralları sırada tutuyor', () => {
    // Diziyi yeniden sıralamak yetmiyor: kuralı da bozmak gerekiyor. Üç
    // gerçek hata burada kural olarak duruyor.
    const at = (k: string) => SIDE_LAYERS.indexOf(k as never);
    expect(SIDE_LAYERS[0], 'zemin en altta').toBe('floor');
    expect(SIDE_LAYERS[SIDE_LAYERS.length - 1], 'yakın tabak en üstte').toBe('plate');
    for (const uzak of ['fleg', 'farm', 'dbfar']) {
      expect(at(uzak), `${uzak} sahne eşyasının ARKASINDA`).toBeLessThan(at('props'));
    }
    expect(at('props'), 'eşya gövdenin arkasında').toBeLessThan(at('torso'));
    expect(at('torso'), 'yakın bacak gövdenin önünde').toBeLessThan(at('nleg'));
    expect(at('head'), 'yakın kol kafayı örter').toBeLessThan(at('narm'));
    expect(at('narm'), 'ağırlık onu tutan elden sonra').toBeLessThan(at('db'));
  });

  it('önden görünüm kuralları sırada tutuyor', () => {
    const at = (k: string) => FRONT_LAYERS.indexOf(k as never);
    expect(FRONT_LAYERS[0]).toBe('floor');
    expect(at('barback'), 'sırttaki bar figürün arkasında').toBeLessThan(at('side'));
    expect(at('side'), 'gövde uzuvlardan sonra').toBeLessThan(at('trunk'));
    expect(at('trunk')).toBeLessThan(at('head'));
    expect(at('head'), 'elde tutulan bar figürün önünde').toBeLessThan(at('barhands'));
  });
});

describe('editörün iki çizim gövdesi sözleşmeye uyuyor', () => {
  it('ana sahne — yan görünüm', () => {
    expect(layersIn(bodyOf('draw'), 'yan')).toEqual([...SIDE_LAYERS]);
  });

  it('ana sahne — önden görünüm', () => {
    expect(layersIn(bodyOf('draw'), 'ön')).toEqual([...FRONT_LAYERS]);
  });

  it('telefon önizlemesi — yan görünüm', () => {
    // Önizleme yalnızca yandan çiziyor; uygulamada figür orada yan duruyor.
    expect(layersIn(bodyOf('drawPose'), 'yan')).toEqual([...SIDE_LAYERS]);
  });

  it('telefon önizlemesi önden görünüm çizmiyor', () => {
    expect(layersIn(bodyOf('drawPose'), 'ön')).toEqual([]);
  });

  it('işaretler kaynakta gerçekten var', () => {
    // Regex hiçbir şey bulmazsa yukarıdaki testler boş diziyi boş diziyle
    // karşılaştırıp sessizce geçerdi.
    expect(SRC.match(/KATMAN/g)?.length ?? 0).toBeGreaterThanOrEqual(SIDE_LAYERS.length * 2);
  });
});
