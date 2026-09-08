import { describe, expect, it } from 'vitest';

import { LIBRARY_GROUPS } from './exerciseGroups';
import { EXERCISES } from './exerciseLibrary';

/**
 * Rafların gerçek hareketleri göstermesi.
 *
 * Kütüphane ekranı grup kimliklerini `exerciseById`den geçirip `null`ları
 * ELİYOR — yani karşılığı olmayan bir kimlik hata vermiyor, sessizce
 * kayboluyor. Bu yüzden 12 hayalet kimlik uzun süre fark edilmeden durdu.
 * Sessiz kaybı gürültülü hâle getiren tek şey bu test.
 */
describe('kütüphane rafları', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));

  it('her raf kimliğinin karşılığı olan bir hareket var', () => {
    const hayalet = LIBRARY_GROUPS.flatMap((g) => g.ids.filter((id) => !ids.has(id)));
    expect(hayalet).toEqual([]);
  });

  it('bir hareket iki rafta birden durmuyor', () => {
    const all = LIBRARY_GROUPS.flatMap((g) => g.ids);
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    expect([...new Set(dupes)]).toEqual([]);
  });

  it('rafsız hareket kalmıyor — kütüphanede görünmeyen hareket erişilemez', () => {
    const shelved = new Set(LIBRARY_GROUPS.flatMap((g) => g.ids));
    const orphan = EXERCISES.map((e) => e.id).filter((id) => !shelved.has(id));
    expect(orphan).toEqual([]);
  });
});
