import { describe, expect, it } from 'vitest';

import { RIG_ARCHETYPES } from '../src/archetypes';
import { RigExercise, RigPose, fillPose, poseAt, skeleton } from '../src/rig';
import { ROM_BANDS, auditExercise, auditFrame } from '../src/rigAudit';

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
  // Uzak diz de ters yöne kırılamaz. Bu bant 11 Eylül 2026'da eklendi ve
  // eklendiği anda İKİ gerçek arketibi yakaladı (`carry` −30°,
  // `unilateral_lunge` −26.8°): büyüklük bandı mutlak değer aldığı için ters
  // bükülme yıllarca görünmedi, figür arkadan sakat görünüyordu.
  [key('uzak diz ters yönde', 'lo')]: { ex: RIG_ARCHETYPES.unilateral_lunge, patch: { thighF: 180, shinF: 155 } },
  // Ön kol pazuya gömülemez. Ters kinematikli kolda açı POZDA YOK, iskeletten
  // geliyor: el hedefini omzun üstüne koymak dirseği tam katlıyor.
  [key('dirsek', 'hi')]: { ex: RIG_ARCHETYPES.seated_overhead_press, patch: { hx: 4, hy: 0 } },
  // Kalça öne bu kadar bükülemez.
  [key('kalça', 'hi')]: { ex: RIG_ARCHETYPES.squat, patch: { torso: 0, thighA: 20 } },
  // Kalça geriye bu kadar açılamaz — işaret yalnızca AYAKTA anlamlı olduğu
  // için prob da ayakta duran bir arketipte.
  [key('kalça geriye açılma', 'lo')]: { ex: RIG_ARCHETYPES.squat, patch: { torso: 0, thighA: 225 } },
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

describe('elle kaydırma denetimin dışına çıkamıyor', () => {
  // `bodyDy` figürü yerden kesebiliyor. Bu daha önce yapısal olarak
  // imkânsızdı (yere oturtma her karede temas noktasını zemine çekiyordu),
  // o yüzden kural da yoktu.
  it('gövdeyi yukarı kaydırmak "figür havada" uyarısı veriyor', () => {
    const havada = { ...RIG_ARCHETYPES.squat, bodyDy: -40 };
    const uyari = auditExercise(havada).filter((i) => i.rule === 'temas');
    expect(uyari.length, 'uyarı bekleniyordu').toBeGreaterThan(0);
    expect(uyari[0].message).toContain('havada');
  });

  it('kaydırma yokken aynı arketip temiz', () => {
    expect(auditExercise(RIG_ARCHETYPES.squat).filter((i) => i.rule === 'temas')).toEqual([]);
  });

  it('basamakta basan ayak kutunun üstünde, uyarı yok', () => {
    expect(auditExercise(RIG_ARCHETYPES.step_up).filter((i) => i.rule === 'temas')).toEqual([]);
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
    // T2'nin doğrudan iddiası: kapı yok, band her arketipte değerlendiriliyor.
    expect(dirsek.skip, 'dirsek bandında skip olmamalı').toBeUndefined();
    expect(ik.length + floor.length, 'arm != angles olan hareket sayısı').toBe(11);
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
