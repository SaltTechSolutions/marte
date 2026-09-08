import { describe, expect, it } from 'vitest';

import { EXERCISES } from './exerciseLibrary';
import { PROGRAMMES, PROGRAMME_IDS, programmeSummary, workingSets } from './programmes';

/**
 * Uygulama tarafındaki bağ testleri.
 *
 * Şema (paketin kendi deposunda) verinin İÇ tutarlılığını denetliyor: sınır
 * yazılmış mı, hacim yeter mi, hareket kimliği motorun kataloğunda var mı.
 * Burada denetlenen şey KÖPRÜ: programın gösterdiği her hareketin uygulamanın
 * kendi kütüphanesinde de bir karşılığı var mı. İki katalog ayrı dosyalar ve
 * ayrı ayrı düzenlenebiliyor; biri ötekini bilmiyor.
 */
describe('hazır programlar', () => {
  const libIds = new Set(EXERCISES.map((e) => e.id));

  it('yükleniyor ve doğrulamadan geçiyor', () => {
    expect(PROGRAMME_IDS.length).toBeGreaterThan(0);
  });

  it('her hareket uygulamanın kütüphanesinde de var — yoksa satır isimsiz çizilir', () => {
    const missing: string[] = [];
    for (const id of PROGRAMME_IDS) {
      const p = PROGRAMMES[id];
      for (const d of p.days) {
        for (const x of d.exercises) if (!libIds.has(x.id)) missing.push(`${id}/${d.id}/${x.id}`);
        for (const w of d.warmup ?? []) if (!libIds.has(w)) missing.push(`${id}/${d.id}/ısınma:${w}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('her programın sınırları dolu — ekranda uyarı kartı boş çıkmamalı', () => {
    for (const id of PROGRAMME_IDS) {
      expect(PROGRAMMES[id].limits.length, id).toBeGreaterThan(0);
    }
  });

  it('özet ve haftalık set sayısı hesaplanabiliyor', () => {
    for (const id of PROGRAMME_IDS) {
      expect(programmeSummary(PROGRAMMES[id])).toMatch(/hafta/);
      expect(workingSets(PROGRAMMES[id])).toBeGreaterThan(0);
    }
  });
});
