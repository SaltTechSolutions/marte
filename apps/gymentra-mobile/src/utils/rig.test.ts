// ÜRETİLMİŞ DOSYA — elle düzenleme.
// Kaynak: antrenman-simulatoru v1.0.0 — hangi üretimden geldiği manifest.json'da
// Değişiklik orada yapılır, buraya kopyalanır. Bu dosyayı düzenlemek iki ayrı
// motor doğurur. Bütünlük kontrolü: manifest.json.

import { describe, expect, it } from 'vitest';

import { RIG_ARCHETYPES } from '@/data/rigArchetypes';
import { B, MAX_ANKLE_LIFT, Skeleton, Vec, angleOf, boundsFor, frontPoints, ik, poseAt, showFarLeg, skeleton } from '@/utils/rig';
import { auditExercise, auditLoop, auditSegments } from '@/utils/rigAudit';

const len = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const entries = Object.entries(RIG_ARCHETYPES);

/** Hareket boyunca 21 örnek kare — uçlar kadar aralar da denetleniyor. */
const frames = (key: string): { S: Skeleton; p: ReturnType<typeof poseAt>['p']; at: string }[] => {
  const ex = RIG_ARCHETYPES[key];
  return Array.from({ length: 21 }, (_, i) => {
    const { p } = poseAt(ex, i / 20);
    return { S: skeleton(ex, p), p, at: `${key} @${(i / 20).toFixed(2)}` };
  });
};

describe('rig kinematics', () => {
  it('ters kinematik erişilemeyen hedefte kolu koparmaz', () => {
    const far = ik([0, 0], [0, 900], B.upper, B.fore, 1);
    expect(len([0, 0], far.elbow)).toBeCloseTo(B.upper, 6);
    expect(len(far.elbow, far.hand)).toBeCloseTo(B.fore, 6);
  });

  it('viewBox tekrar boyunca sabit', () => {
    entries.forEach(([key, ex]) => {
      const vb = boundsFor(ex, 'side').split(' ').map(Number);
      expect(vb, key).toHaveLength(4);
      expect(vb[2], `${key} genişlik`).toBeGreaterThan(0);
      expect(vb[3], `${key} yükseklik`).toBeGreaterThan(0);
      expect(boundsFor(ex, 'side'), key).toBe(boundsFor(ex, 'side'));
    });
  });

  it('açı ölçümü D() ile aynı eksende', () => {
    expect(angleOf([0, 0], [0, -10])).toBeCloseTo(0, 6);
    expect(angleOf([0, 0], [10, 0])).toBeCloseTo(90, 6);
    expect(angleOf([0, 0], [0, 10])).toBeCloseTo(180, 6);
  });

  it('kareler sıralı, 0-1 aralığında ve süre makul', () => {
    entries.forEach(([key, ex]) => {
      expect(ex.kf.length, key).toBeGreaterThan(1);
      ex.kf.forEach((k, i) => {
        expect(k.t, `${key}[${i}]`).toBeGreaterThanOrEqual(0);
        expect(k.t, `${key}[${i}]`).toBeLessThanOrEqual(1);
        if (i > 0) expect(k.t, `${key}[${i}] sıra`).toBeGreaterThanOrEqual(ex.kf[i - 1].t);
      });
      expect(ex.kf[0].t, `${key} ilk kare`).toBe(0);
      expect(ex.kf[ex.kf.length - 1].t, `${key} son kare`).toBe(1);
      expect(ex.dur, `${key} süre`).toBeGreaterThan(2000);
    });
  });
});

/**
 * Hareketin DOĞRU yapıldığının denetimi.
 *
 * Bu testler çizimi değil mekaniği koruyor: bir arketipin açıları elle
 * yazılırken kolayca ayak havada bırakılır ya da diz ters bükülür. Otomatik
 * çevrilmiş kareler tam bu yüzden saçmalıyordu.
 */
describe('rig hareket denetimi', () => {
  // Kurallar rigAudit.ts'te: aynı kurallar editörde de canlı çalışıyor, yani
  // burada geçen bir arketip editörde de temiz görünüyor.
  it('her arketip mekanik denetimden geçer', () => {
    entries.forEach(([key, ex]) => {
      const issues = auditExercise(ex);
      expect(issues.map((i) => `@${i.t.toFixed(2)} ${i.rule}: ${i.message}`), key).toEqual([]);
    });
  });

  it('her hareketin döngüsü kapanır', () => {
    entries.forEach(([key, ex]) => {
      expect(auditLoop(ex).map((i) => i.message), key).toEqual([]);
    });
  });

  it('segment boyları hiçbir karede değişmez', () => {
    entries.forEach(([key, ex]) => {
      expect(auditSegments(ex).map((i) => i.message), key).toEqual([]);
    });
  });

  it('tek taraflı hareketler iki bacağı ayrı çalıştırır', () => {
    // Hamle, step-up ve Bulgar split squat'ın tanımı bu: kareler uzak bacağı
    // açıkça yazmazsa iki bacak aynı işi yapar ve hareket çift bacaklı olur.
    //
    // Ölçü iki ayak arasındaki TOPLAM mesafe, yalnız dikey fark değil. Dikey
    // ölçü bir hatayı doğruluyordu: hamlede iki ayak da yerdedir ve YATAY
    // ayrışır, ama `unilateral_lunge`ın arka ayağı dipte 59px havada
    // durduğu için dikey fark yüksek çıkıyor ve test geçiyordu. Ayak yere
    // indirilince dikey fark 24px'e düştü — hareket düzeldiği hâlde test
    // kırıldı. Yanlış olan eksendi.
    ['unilateral_lunge', 'step_up', 'bulgarian_split_squat', 'bird_dog'].forEach((key) => {
      const spread = frames(key).map(({ S }) => Math.hypot(S.ankle[0] - S.ankleF[0], S.ankle[1] - S.ankleF[1]));
      expect(Math.max(...spread), `${key} iki bacak ayrışması`).toBeGreaterThan(100);
    });
  });

  it('omuz silkmede kol boyu hiç değişmez', () => {
    // Kol omuzdan sarkar: omuz yükselince kol da yükselir.
    const ex = RIG_ARCHETYPES.shrug_front;
    const lens = frames('shrug_front').map(({ S, p }) => {
      const F = frontPoints(ex, p, S);
      return Math.hypot(F.R.elbow[0] - F.R.sh[0], F.R.elbow[1] - F.R.sh[1]);
    });
    expect(Math.max(...lens) - Math.min(...lens), 'omuz silkme kol boyu').toBeLessThan(1);
  });

  it('desteğe yaslanan hareketlerde omuz yerinde kalır', () => {
    (['hip_thrust', 'glute_bridge'] as const).forEach((key) => {
      const ys = frames(key).map(({ S }) => S.thorax[1]);
      expect(Math.max(...ys) - Math.min(...ys), `${key} omuz kayması`).toBeLessThan(12);
      const hips = frames(key).map(({ S }) => S.pelvis[1]);
      expect(Math.max(...hips) - Math.min(...hips), `${key} kalça yükselmesi`).toBeGreaterThan(30);
    });
  });

  it('topuk kalkışında ayak boyunu aşmaz', () => {
    const lifts = frames('calf_raise').map(({ p }) => p.ankleLift);
    expect(Math.max(...lifts), 'topuk yüksekliği').toBeGreaterThan(20);
    expect(Math.max(...lifts), 'topuk parmak ucunun uzanabildiğinden fazla kalkmamalı').toBeLessThanOrEqual(MAX_ANKLE_LIFT);
  });

  it('uzak bacak yalnızca kendi hareketi varsa görünür', () => {
    // Kural: ikinci bacak birincinin kopyasıysa çizimde bilgi taşımıyor.
    const gorunur = entries.filter(([, ex]) => showFarLeg(ex)).map(([k]) => k);
    // `lunge_reach` listeye `unilateral_lunge`tan ayrılınca katıldı: hamlede
    // iki bacak apayrı iş yapıyor, arka bacak uzanıp diz yere iniyor.
    expect(gorunur.sort()).toEqual(['bird_dog', 'bulgarian_split_squat', 'carry', 'lunge_reach', 'step_up', 'unilateral_lunge']);
    // Yan plank'ta bacaklar bilerek üst üste: ayrı hareket değil, gizli.
    expect(showFarLeg(RIG_ARCHETYPES.side_plank)).toBe(false);
    expect(showFarLeg(RIG_ARCHETYPES.squat)).toBe(false);
  });

  it('elle yazılan değer kuralı ezer', () => {
    // Kuralın dışına çıkmak gerektiğinde kare verisi son sözü söyler.
    expect(showFarLeg({ ...RIG_ARCHETYPES.squat, hideFarLeg: false })).toBe(true);
    expect(showFarLeg({ ...RIG_ARCHETYPES.unilateral_lunge, hideFarLeg: true })).toBe(false);
  });

  it('uzak uzvu gizlemek figürü kımıldatmaz', () => {
    // Gizleme yalnızca çizim kararı: iskelet, yere oturma ve kadraj aynı
    // kalmalı, yoksa gizlemeyi açan kişi hareketi de değiştirmiş olur.
    const base = RIG_ARCHETYPES.squat;
    const hidden = { ...base, hideFarLeg: true, hideFarArm: true };
    for (let i = 0; i <= 10; i++) {
      const p = poseAt(base, i / 10).p;
      const a = skeleton(base, p);
      const b = skeleton(hidden, poseAt(hidden, i / 10).p);
      (Object.keys(a) as (keyof typeof a)[]).forEach((k) => {
        expect(b[k], `${k} @${i}`).toEqual(a[k]);
      });
    }
    expect(boundsFor(hidden, 'side')).toBe(boundsFor(base, 'side'));
  });

  it('gizli uzuv denetimde kusur sayılmaz', () => {
    // Çizilmeyen bir uzvun zeminin altında olması görünür bir hata değil.
    // Uzak bacağı dümdüz aşağı çevir: çömelmenin dibinde ayak zeminin altına iner.
    const sunk = {
      ...RIG_ARCHETYPES.squat,
      kf: RIG_ARCHETYPES.squat.kf.map((k) => ({ ...k, p: { ...k.p, thighF: 180, shinF: 180 } })),
    };
    expect(auditExercise(sunk).some((i) => i.message.includes('F'))).toBe(true);
    expect(auditExercise({ ...sunk, hideFarLeg: true }).some((i) => i.message.includes('kneeF') || i.message.includes('ankleF'))).toBe(false);
  });

  it('yanal düzlem hareketleri önden okunur', () => {
    ['lateral_raise_front', 'arm_circles_front', 'band_pull_apart_front', 'band_ext_rotation_front', 'shrug_front', 'hinged_fly'].forEach(
      (key) => {
        expect(RIG_ARCHETYPES[key].view, `${key} düzlem`).toBe('front');
      },
    );
  });

  it('yanal hareketlerde el gerçekten yana açılır', () => {
    (['lateral_raise_front', 'band_pull_apart_front', 'band_ext_rotation_front', 'hinged_fly'] as const).forEach((key) => {
      const ex = RIG_ARCHETYPES[key];
      const widths = Array.from({ length: 21 }, (_, i) => poseAt(ex, i / 20).p.hxF);
      expect(Math.max(...widths) - Math.min(...widths), `${key} açılma`).toBeGreaterThan(40);
    });
  });
});

import { FOOT, GROUND as G2, centerOfMass, footLowestY, footPinned, footSpan, footDirOf as fdo, facingFlip as ff, poseAt as pa2, showFarArm, skeleton as sk2 } from '@/utils/rig';
import { RIG_ARCHETYPES as A2 } from '@/data/rigArchetypes';

describe('yan görünüm saf ortografik', () => {
  it('uzak kalça ve omuz yakının tam arkasında', () => {
    const ex = A2.squat;
    const S = sk2(ex, pa2(ex, 0.5).p);
    expect(S.hipF).toEqual(S.pelvis);
    expect(S.shF).toEqual(S.sh);
  });
  it('özdeş hareket yapan uzak kol çizilmez, çapraz hareketteki çizilir', () => {
    expect(showFarArm(A2.squat)).toBe(false);
    expect(showFarArm(A2.seated_overhead_press)).toBe(false);
    expect(showFarArm(A2.bird_dog)).toBe(true);
  });
});

describe('basılı uzak ayak (plantF)', () => {
  it('iki basılı kare arasında ayak yerinden kıpırdamaz', () => {
    const ex = A2.unilateral_lunge;
    const rel = (t: number) => { const S = sk2(ex, pa2(ex, t).p); return [S.ankleF[0] - S.ankle[0], S.ankleF[1] - S.ankle[1]]; };
    const r0 = rel(0.22);
    for (let t = 0.22; t <= 0.78; t += 0.02) {
      const r = rel(t);
      expect(Math.hypot(r[0] - r0[0], r[1] - r0[1]), `t=${t.toFixed(2)}`).toBeLessThan(1.5);
    }
  });
  it('sehpadaki ayak (Bulgar) hiç kaymaz', () => {
    const ex = A2.bulgarian_split_squat;
    const xs = Array.from({ length: 41 }, (_, i) => sk2(ex, pa2(ex, i / 40).p).ankleF[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1.5);
  });
});

describe('parmak eklemi', () => {
  it('topuk kalkınca ayak topu yerde kalır, parmaklar yere gömülmez', () => {
    const ex = A2.calf_raise;
    let kalkti = 0;
    for (let i = 0; i <= 40; i++) {
      const p = pa2(ex, i / 40).p;
      const S = sk2(ex, p);
      if (!footPinned(ex, p, S, false)) continue;
      kalkti++;
      const low = footLowestY(S.ankle, fdo(ex, p), true, ff(ex.mode));
      expect(Math.abs(low - G2), `t=${(i / 40).toFixed(2)}`).toBeLessThan(1);
    }
    expect(kalkti).toBeGreaterThan(5);
  });
  it('ayak anatomik boyda: 64px ≈ 25.5cm', () => {
    expect(FOOT.toe - FOOT.heel).toBe(64);
    const [lo, hi] = footSpan([0, G2 - FOOT.sole], 90, false, 1);
    expect(hi - lo).toBeGreaterThan(55);
  });
});

describe('ağırlık merkezi', () => {
  it('dik duran figürde iki ayağın arasında ve gövde hizasında', () => {
    const ex = A2.squat;
    const S = sk2(ex, pa2(ex, 0).p);
    const [x, y] = centerOfMass(ex, S);
    const [lo, hi] = footSpan(S.ankle, fdo(ex, pa2(ex, 0).p), false, 1);
    expect(x).toBeGreaterThan(lo);
    expect(x).toBeLessThan(hi);
    expect(y).toBeGreaterThan(S.thorax[1]);
    expect(y).toBeLessThan(S.knee[1]);
  });
});
