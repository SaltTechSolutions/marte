import { describe, expect, it } from 'vitest';

// Kaynağı METİN olarak okuyoruz: sıra çalışma anında değil kaynakta yaşıyor.
import SRC from './RigFigure.tsx?raw';
import { FRONT_LAYERS, SIDE_LAYERS } from '@/utils/rig';

/**
 * Katman sırası — uygulamanın çizimi simülatörünkiyle aynı sırada mı?
 *
 * Çizim iki depoda ayrı yazılıyor (burada `react-native-svg`, simülatörde
 * tarayıcı SVG'si) ama sıra ayrışamaz: 11 Eylül 2026'da üç katman hatası arka
 * arkaya çıktı ve üçünü de kullanıcı gözle buldu. Sıra artık motorda veri
 * (`SIDE_LAYERS`) ve devirle buraya geliyor; bu test `RigFigure.tsx`'in
 * kaynağındaki `KATMAN` işaretlerini o diziyle karşılaştırıyor.
 *
 * Simülatör tarafındaki eşi `packages/rig/tests/layerOrder.test.ts` — orada
 * editörün iki çizim gövdesi aynı diziyle karşılaştırılıyor. Üçü birden
 * uyduğunda sıra gerçekten tektir.
 */

/** JSX yorumundaki `KATMAN yan: props` → sıradaki katman. */
function layersIn(view: 'yan' | 'ön'): string[] {
  const out: string[] = [];
  for (const m of SRC.matchAll(/KATMAN\s+([\wö+]+):\s*(\w+)/g)) {
    if (m[1].split('+').includes(view)) out.push(m[2]);
  }
  return out;
}

describe('RigFigure katman sırası', () => {
  it('yan görünüm motordaki sırayla aynı', () => {
    expect(layersIn('yan')).toEqual([...SIDE_LAYERS]);
  });

  it('önden görünüm motordaki sırayla aynı', () => {
    expect(layersIn('ön')).toEqual([...FRONT_LAYERS]);
  });

  it('işaretler kaynakta gerçekten var', () => {
    // Regex hiçbir şey bulmazsa yukarıdaki iki test boş diziyi boş diziyle
    // karşılaştırıp sessizce geçerdi.
    expect(SRC.match(/KATMAN/g)?.length ?? 0).toBe(SIDE_LAYERS.length + FRONT_LAYERS.length);
  });
});
