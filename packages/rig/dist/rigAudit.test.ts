// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 — hangi üretimden geldiği manifest.json'da
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.

import { describe, expect, it } from 'vitest';

import { RIG_ARCHETYPES } from '@/data/rigArchetypes';
import { RigExercise, RigPose, fillPose, poseAt, skeleton } from '@/utils/rig';
import { ROM_BANDS, auditExercise, auditFrame, auditLoop } from '@/utils/rigAudit';

/**
 * ROM bantlarının ATEŞLEDİĞİNİ doğrulayan testler.
 *
 * Bu depoda `ayak` kuralı ömrü boyunca ölüydü: 1848 örnekte hiç tetiklenmedi ve
 * hiçbir test yakalamadı, çünkü bütün denetim testleri `toEqual([])` diyor —
 * hepsi kuralın SUSTUĞUNU doğruluyor, hiçbiri KONUŞTUĞUNU doğrulamıyordu.
 * Aşağıdaki harita her bandın gerçekten çalıştığını kanıtlıyor; bandı olup
 * probu olmayan bir kayıt eklemek testi düşürüyor.
 */
type Bound = 'lo' | 'hi';
const key = (label: string, b: Bound) => `${label}:${b}`;

/** Bandı ihlal eden poz yaması ve hangi arketip üstünde denendiği. */
const PROBES: Record<string, { ex: RigExercise; patch: Partial<RigPose> }> = {
  // Diz kendi üstüne katlanamaz.
  [key('diz', 'hi')]: { ex: RIG_ARCHETYPES.squat, patch: { thighA: 180, shinA: 350 } },
  // Diz ters yöne kırılamaz; işaret yalnızca ayakta anlamlı.
  [key('diz ters yönde', 'lo')]: { ex: RIG_ARCHETYPES.squat, patch: { thighA: 180, shinA: 155 } },
  // Uzak bacak da aynı sınıra tabi — görünür olduğu hareketlerde.
  [key('uzak diz', 'hi')]: { ex: RIG_ARCHETYPES.unilateral_lunge, patch: { thighF: 180, shinF: 350 } },
  // Uzak diz de ters yöne kırılamaz. Bu sınır bir süre YOKTU ve `carry`nin
  // 30° geriye bükülen dizi denetimden sessizce geçiyordu.
  [key('uzak diz ters yönde', 'lo')]: { ex: RIG_ARCHETYPES.unilateral_lunge, patch: { thighF: 180, shinF: 155 } },
  // Ayak bileği kaval kemiğine bu kadar katlanamaz (dorsi fleksiyon).
  [key('bilek', 'lo')]: { ex: RIG_ARCHETYPES.squat, patch: { ankle: -50 } },
  // Parmak ucu bu kadar uzatılamaz (plantar fleksiyon).
  [key('bilek', 'hi')]: { ex: RIG_ARCHETYPES.squat, patch: { ankle: 70 } },
  // Uzak bilek de aynı sınırlara tabi. Bu bant EKLENMEDEN ÖNCE model bileği
  // hiç taşımıyordu: ayak yönü kip başına sabitti ve baldırı takip etmiyordu,
  // o yüzden `bulgarian_split_squat`ta uzak bilek −116°ye kadar dönüyor ve
  // hiçbir kural görmüyordu.
  [key('uzak bilek', 'lo')]: { ex: RIG_ARCHETYPES.unilateral_lunge, patch: { ankleF: -50 } },
  [key('uzak bilek', 'hi')]: { ex: RIG_ARCHETYPES.unilateral_lunge, patch: { ankleF: 70 } },
  // Parmak eklemi kırılmaz: ekstansiyon 70°, fleksiyon 30° ötesi.
  [key('parmak', 'lo')]: { ex: RIG_ARCHETYPES.squat, patch: { toe: -45 } },
  [key('parmak', 'hi')]: { ex: RIG_ARCHETYPES.squat, patch: { toe: 85 } },
  [key('uzak parmak', 'lo')]: { ex: RIG_ARCHETYPES.unilateral_lunge, patch: { toeF: -45 } },
  [key('uzak parmak', 'hi')]: { ex: RIG_ARCHETYPES.unilateral_lunge, patch: { toeF: 85 } },
  // Ön kol pazuya gömülemez. Ters kinematikli kolda açı POZDA YOK, iskeletten
  // geliyor: el hedefini omzun üstüne koymak dirseği tam katlıyor.
  [key('dirsek', 'hi')]: { ex: RIG_ARCHETYPES.seated_overhead_press, patch: { hx: 4, hy: 0 } },
  // Kalça öne bu kadar bükülemez.
  [key('kalça', 'hi')]: { ex: RIG_ARCHETYPES.squat, patch: { torso: 0, thighA: 20 } },
  // Kalça geriye bu kadar açılamaz.
  [key('kalça', 'lo')]: { ex: RIG_ARCHETYPES.squat, patch: { torso: 0, thighA: 225 } },
  // Gövde öne bu kadar katlanamaz.
  [key('gövde', 'hi')]: { ex: RIG_ARCHETYPES.squat, patch: { torso: 0, thoraxA: 100 } },
  // Gövde geriye bu kadar açılamaz.
  [key('gövde', 'lo')]: { ex: RIG_ARCHETYPES.squat, patch: { torso: 0, thoraxA: -50 } },
};

/** Tabloda tanımlı her sınır bir prob istiyor. */
const requiredProbes = ROM_BANDS.flatMap((b) => [
  ...(b.hi !== undefined ? [key(b.label, 'hi')] : []),
  ...(b.lo !== undefined ? [key(b.label, 'lo')] : []),
]);

describe('ROM bantları', () => {
  it('her bandın her sınırı için bir prob var', () => {
    // Bant eklendiğinde prob eklemeyi unutmak = ölü kural. Bu test onu engelliyor.
    expect(requiredProbes.filter((k) => !PROBES[k]), 'probu olmayan sınırlar').toEqual([]);
    expect(Object.keys(PROBES).filter((k) => !requiredProbes.includes(k)), 'karşılığı olmayan problar').toEqual([]);
  });

  requiredProbes.forEach((k) => {
    const [label, bound] = k.split(':');
    it(`${label} (${bound === 'hi' ? 'üst' : 'alt'} sınır) bozuk pozda ateşliyor`, () => {
      const probe = PROBES[k];
      const band = ROM_BANDS.find((b) => b.label === label)!;
      const base = poseAt(probe.ex, 0).p;
      const issues = auditFrame(probe.ex, fillPose({ ...base, ...probe.patch }));
      const hit = issues.filter((i) => i.rule === band.rule && i.message.startsWith(label + ' '));
      expect(hit.length, `${k} için uyarı bekleniyordu, çıkan: ${JSON.stringify(issues.map((i) => i.message))}`).toBeGreaterThan(0);
    });
  });

  it('meşru pozlar ateşlemiyor', () => {
    // Karşı kontrol: prob olmadan aynı arketipler temiz kalmalı, yoksa test
    // "her şeye kızan" bir kuralı da geçirir.
    (['squat', 'unilateral_lunge', 'bench_press'] as const).forEach((k) => {
      const ex = RIG_ARCHETYPES[k];
      const issues = auditFrame(ex, poseAt(ex, 0).p).filter((i) => ['diz', 'dirsek', 'kalça', 'gövde'].includes(i.rule));
      expect(issues.map((i) => i.message), `${k} temiz olmalı`).toEqual([]);
    });
  });
});

describe('dirsek kuralı ters kinematikli kolda da çalışıyor (T2)', () => {
  // Eski kural `ex.arm === 'angles'` kapısındaydı ve 30 arketipin 8'inde hiç
  // çalışmıyordu. Kapı kalktı; kaynak da pozdan iskelete taşındı, çünkü ters
  // kinematikli kolda poz `upperA`/`foreA` taşımıyor ve pozdan okunan açı
  // sabit 0 çıkıyor.
  const dirsek = ROM_BANDS.find((b) => b.label === 'dirsek')!;
  const ik = Object.entries(RIG_ARCHETYPES).filter(([, ex]) => ex.arm === 'ik');
  const floor = Object.entries(RIG_ARCHETYPES).filter(([, ex]) => ex.arm === 'floor');

  it('bandın hiçbir hareket için atlaması yok', () => {
    // T2'nin doğrudan iddiası: kapı yok, band 30/30 harekette değerlendiriliyor.
    expect(dirsek.skip, 'dirsek bandında skip olmamalı').toBeUndefined();
    // 8 -> 9: `lunge_reach` ters kinematik kullanıyor, çünkü elin yere inip
    // sonra başın üstüne uzanması hedef konumuyla anlatılıyor, açıyla değil.
    expect(ik.length + floor.length, 'arm != angles olan hareket sayısı').toBe(9);
  });

  ik.forEach(([k, ex]) => {
    it(`${k}: el omza gömülünce dirsek uyarısı çıkıyor`, () => {
      const p = fillPose({ ...poseAt(ex, 0).p, hx: 4, hy: 0 });
      const issues = auditFrame(ex, p).filter((i) => i.rule === 'dirsek');
      expect(issues.length, `dirsek uyarısı bekleniyordu, çıkan: ${JSON.stringify(auditFrame(ex, p).map((i) => i.message))}`).toBeGreaterThan(0);
    });
  });

  floor.forEach(([k, ex]) => {
    it(`${k}: yerde duran elde dirsek 160°'ye geometrik olarak ULAŞAMIYOR`, () => {
      // `arm: 'floor'` iken el yere çivili ve `hy` yok sayılıyor; omuz yere
      // ancak ~127px yaklaşabiliyor, 160° ise 27px istiyor. Band çalışıyor ama
      // bu üç harekette ihlal edilemez. Ölçüm: hx -260..260 süpürmesinde en
      // büyük dirsek açısı plank_prone 51°, quadruped_spine 59°, rollout 21°.
      // Bu test o tavanı sabitliyor: geometri değişirse burada haber veriyor.
      let max = 0;
      for (let hx = -260; hx <= 260; hx += 4) {
        const p = fillPose({ ...poseAt(ex, 0).p, hx });
        max = Math.max(max, ...auditFrame(ex, p).filter((i) => i.rule === 'dirsek').map(() => 999), 0);
      }
      expect(max, `${k} için dirsek uyarısı beklenmiyordu`).toBe(0);
    });
  });
});

describe('tutuş kuralı — el barı tutuyor mu', () => {
  // `bar: 'hands'` olanlarda tutuş yapı gereği garanti: bar elin konumuna
  // çiziliyor. `bar: 'back'` ise bar GÖVDEDEN hesaplanıyor ve elin ona ulaşıp
  // ulaşmadığını hiçbir şey kontrol etmiyordu.
  it('sırttaki barı tutmayan el yakalanıyor', () => {
    const ex = RIG_ARCHETYPES.squat;
    // Kolu bardan uzaklaştır: üst kolu aşağı sarkıt.
    const p = fillPose({ ...poseAt(ex, 0).p, upperA: 180, foreA: 180 });
    const issues = auditFrame(ex, p).filter((i) => i.rule === 'tutuş');
    expect(issues.length, `tutuş uyarısı bekleniyordu, çıkan: ${JSON.stringify(auditFrame(ex, p).map((i) => i.message))}`).toBeGreaterThan(0);
  });

  it('gerçek squat verisi tutuş kuralından geçiyor', () => {
    const ex = RIG_ARCHETYPES.squat;
    expect(auditExercise(ex).filter((i) => i.rule === 'tutuş')).toEqual([]);
  });

  it('bar elde olan hareketlerde tutuş zaten garanti', () => {
    Object.entries(RIG_ARCHETYPES)
      .filter(([, ex]) => ex.bar === 'hands')
      .forEach(([k, ex]) => {
        for (let i = 0; i <= 10; i++) {
          const p = poseAt(ex, i / 10).p;
          const S = skeleton(ex, p);
          expect(Math.hypot(S.hand[0] - S.bar![0], S.hand[1] - S.bar![1]), k).toBeLessThan(0.001);
        }
      });
  });
});

describe('sehpaya basan ayak kaymıyor', () => {
  // `bulgarian_split_squat`ta arka ayak sehpanın ÜSTÜNDE durur; hareketi ön
  // bacak yapar. Ama uzak bacak serbest bir zincir: kalça inerken açılar
  // sabit kalırsa ayak sehpanın üstünde kayar. Ölçüldü, kayma 90px'ti ve ayak
  // 150px'lik sehpanın dışına çıkıyordu; arka diz de 10°→15° arası kalıp
  // neredeyse hiç bükülmüyordu, oysa Bulgarian'da arka diz yere doğru iner.
  const ex = RIG_ARCHETYPES.bulgarian_split_squat;

  it('bugünkü veri temiz', () => {
    expect(auditLoop(ex).filter((i) => i.rule === 'temas').map((i) => i.message)).toEqual([]);
  });

  it('ayak kayan veride kural KONUŞUYOR', () => {
    // Düzeltme öncesi hâl: ara kareler yok, dip karesinde arka bacak neredeyse düz.
    const bozuk: RigExercise = {
      ...ex,
      kf: ex.kf
        .filter((k) => k.tr !== 'İniş' && k.tr !== 'Çıkış')
        .map((k) => (k.tr === 'Alt' ? { ...k, p: { ...k.p, thighF: 245, shinF: 260 } } : k)),
    };
    const hit = auditLoop(bozuk).filter((i) => i.rule === 'temas');
    expect(hit.length, `uyarı bekleniyordu, çıkan: ${JSON.stringify(auditLoop(bozuk).map((i) => i.message))}`).toBeGreaterThan(0);
    expect(hit[0].message).toContain('kayıyor');
  });

  it('arka diz gerçekten bükülüyor', () => {
    // Bulgarian'ın tanımı bu: arka diz yere doğru iner. Düz kalırsa hareket
    // ön bacağın tek başına çömelmesine dönüyor.
    const norm = (d: number) => { let x = ((d % 360) + 360) % 360; if (x > 180) x -= 360; return x; };
    const acilar = Array.from({ length: 21 }, (_, i) => {
      const p = poseAt(ex, i / 20).p;
      return norm(p.shinF - p.thighF);
    });
    expect(Math.max(...acilar), 'dipte arka diz belirgin bükülmeli').toBeGreaterThan(80);
    expect(Math.min(...acilar), 'arka diz ters yöne kırılmamalı').toBeGreaterThan(0);
  });
});

/**
 * Denge: ağırlık merkezi destek tabanının dışına çıkınca kural KONUŞMALI.
 * Kural yokken step_up'ta merkez 18px geride, goblet squat dibinde 13px
 * topukların gerisindeydi ve hiçbir şey söylemiyordu.
 */
describe('denge kuralı', () => {
  it('öne devrilen figürü yakalar', () => {
    // Ayakta, gövde 80° öne katlı, kalça geri gitmemiş: merkez parmak ucunun önüne düşer.
    const ex = RIG_ARCHETYPES.hinge;
    const p = fillPose({ ...poseAt(ex, 0).p, shinA: 178, thighA: 183, torso: 85, thoraxA: 80, neckA: 60 });
    const rules = auditFrame(ex, p, 0).map((i) => i.rule);
    expect(rules).toContain('denge');
  });
  it('dik duran figürde susar', () => {
    const ex = RIG_ARCHETYPES.hinge;
    expect(auditFrame(ex, poseAt(ex, 0).p, 0).filter((i) => i.rule === 'denge')).toEqual([]);
  });
});
