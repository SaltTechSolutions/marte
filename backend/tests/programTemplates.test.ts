import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { auditTemplates, MIN_WEEKLY_SETS } = require('../scripts/programTemplateAudit.cjs');

/**
 * Program şablonlarının bilimsel dürüstlük denetimi.
 *
 * Kurallar `scripts/programTemplateAudit.cjs`'de; aynı modül `seed` betiğinde
 * de çalışıyor, yani burada kırmızı olan şey üretime yazılamıyor. Bu ikilik
 * bilerek: kural yalnızca testte çalışsaydı, betiği elle çalıştıran kişi onu
 * atlayabilirdi.
 *
 * Testlerin yarısı kuralın SUSTUĞUNU doğruluyor (gerçek veri temiz), yarısı
 * KONUŞTUĞUNU (bozulmuş veri yakalanıyor). İkincisi olmadan bir kural sessizce
 * ölebiliyor — bu depoda `rigAudit`'in `ayak` kuralı tam olarak böyle ömrü
 * boyunca hiç ateşlemeden yaşadı.
 */

const SEED = JSON.parse(readFileSync(join(import.meta.dirname, '../scripts/program_templates.seed.json'), 'utf8'));
const MUS = JSON.parse(readFileSync(join(import.meta.dirname, '../scripts/exercise_muscles.json'), 'utf8'));

/** Derin kopya: probların birbirinin verisini bozmaması için. */
const kopya = () => JSON.parse(JSON.stringify(SEED));
/** Tek şablonu yamalar ve denetimden geçirir. */
const dene = (id: string, yama: Record<string, unknown>): string[] => {
  const s = kopya();
  const t = s.templates.find((x: { id: string }) => x.id === id);
  expect(t, `${id} bulunamadı`).toBeTruthy();
  Object.assign(t, yama);
  return auditTemplates(s, MUS).filter((e: string) => e.startsWith(`şablon "${id}"`));
};

describe('gerçek veri temiz', () => {
  it('19 şablonun hepsi denetimden geçiyor', () => {
    expect(auditTemplates(SEED, MUS)).toEqual([]);
  });

  it('her şablonun sınırları yazılı', () => {
    SEED.templates.forEach((t: { id: string; limits: string[] }) => {
      expect(t.limits?.length, `${t.id} limits`).toBeGreaterThan(0);
    });
  });

  it('kaynakça anahtarları çözülüyor', () => {
    const keys = Object.keys(SEED.sources);
    expect(keys.length).toBeGreaterThan(0);
    SEED.templates.forEach((t: { id: string; sources: string[] }) => {
      t.sources.forEach((k) => expect(keys, `${t.id} → ${k}`).toContain(k));
    });
  });
});

describe('kurallar bozuk veride ateşliyor', () => {
  it('limits silinince yakalanıyor', () => {
    expect(dene('core-beginner', { limits: [] })[0]).toContain('limits boş olamaz');
  });

  it('vaat edilen bölgesel yağ kaybı yakalanıyor', () => {
    // Gerçek tehlike bu: inkâr değil İDDİA. Cümlede inkâr işareti yok.
    const e = dene('abs-beginner', { summary: 'Bu program karın yağını eritir ve beli inceltir.' });
    expect(e.join(' ')).toContain('yanlış yönlendiren ifade');
  });

  it('inkâr eden aynı cümle serbest', () => {
    // Karşı kontrol. Bu olmadan kural "her şeye kızan" hâle gelir ve ürünün
    // dürüst cümlelerini yazılamaz yapardı.
    expect(dene('abs-beginner', { summary: 'Karın yağı bölgesel olarak eritilemez.' })).toEqual([]);
  });

  it('aşırı kesinlik yakalanıyor', () => {
    expect(dene('fullbody-beginner', { progression: 'Bu programla kesinlikle kilo verirsin.' }).join(' '))
      .toContain('aşırı kesinlik');
  });

  it('kaynaksız şablon yakalanıyor', () => {
    expect(dene('desk-beginner', { sources: [] })[0]).toContain('sources boş olamaz');
  });

  it('olmayan künyeye yapılan atıf yakalanıyor', () => {
    expect(dene('desk-beginner', { sources: ['olmayan-kaynak'] })[0]).toContain('kök kaynakçada yok');
  });

  it('hipertrofi şablonunda eksik hacim yakalanıyor', () => {
    // Bu kuralın geldiği yerde yakaladığı gerçek hata da buydu: adı bir kası
    // vaat eden paket o kasa yeterli set vermiyordu.
    const az = kopya().templates.find((x: { id: string }) => x.id === 'arms-intermediate');
    az.days.forEach((d: { exercises: { sets: number }[] }) => d.exercises.forEach((e) => { e.sets = 1; }));
    const s = kopya();
    s.templates[s.templates.findIndex((x: { id: string }) => x.id === 'arms-intermediate')] = az;
    const e = auditTemplates(s, MUS).filter((x: string) => x.includes('arms-intermediate'));
    expect(e.length, 'hacim uyarısı bekleniyordu').toBeGreaterThan(0);
    expect(e.join(' ')).toContain(`en az ${MIN_WEEKLY_SETS}`);
  });

  it('hipertrofi şablonu targets yazmadan geçemiyor', () => {
    expect(dene('glutes-beginner', { targets: [] })[0]).toContain('targets yazmak zorunda');
  });

  it('sessionsPerWeek gün sayısının katı değilse yakalanıyor', () => {
    expect(dene('glutes-beginner', { sessionsPerWeek: 3 })[0]).toContain('tam katı olmalı');
  });

  it('kas eşleme tablosunda olmayan hareket satırı yakalanıyor', () => {
    // Hacim sessizce eksik sayılmasın: tanınmayan satır 0 set katkı verir ve
    // şablon olduğundan zayıf görünürdü.
    const s = kopya();
    const t = s.templates.find((x: { id: string }) => x.id === 'glutes-beginner');
    t.days[0].exercises[0].name = 'Uydurma hareket';
    expect(auditTemplates(s, MUS).join(' ')).toContain('kas eşleme tablosunda yok');
  });
});
