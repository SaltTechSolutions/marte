import { describe, expect, it } from 'vitest';

import { RIG_ARCHETYPES } from '../src/archetypes';
import { B, MAX_ANKLE_LIFT, SEAT_Y, Skeleton, Vec, angleOf, boundsFor, frontPoints, ik, poseAt, showFarLeg, skeleton } from '../src/rig';
import { auditExercise, auditLoop, auditSegments } from '../src/rigAudit';

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

  // Makine hareketleri (bacak presi, lat pulldown, oturarak kürek…) modelde
  // yoktu, çünkü "makinede oturuyor" diye bir kök nokta yoktu. `seat` onu
  // ekliyor: kalça koltuk yüksekliğinde SABİT durur ve zemine oturtulmaz —
  // bacak presinde ayak zaten havadadır, oraya çekilseydi figür kayardı.
  it('oturan modda kalça koltuk yüksekliğinde sabit kalır', () => {
    const ex = {
      mode: 'seat' as const, arm: 'angles' as const, bar: null,
      bend: 0, dur: 3000,
      kf: [
        { t: 0, tr: 'başla', p: { thighA: 90, shinA: 180, torso: 0 } },
        { t: 1, tr: 'bitir', p: { thighA: 90, shinA: 120, torso: 0 } },
      ],
    };
    for (let i = 0; i <= 4; i++) {
      const { p } = poseAt(ex, i / 4);
      // Kadraj kaydırması yatayda; dikeyde kalça oynamamalı.
      expect(skeleton(ex, p).pelvis[1], `@${i / 4}`).toBeCloseTo(SEAT_Y, 6);
    }
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
    ['unilateral_lunge', 'step_up', 'bulgarian_split_squat', 'bird_dog'].forEach((key) => {
      const spread = frames(key).map(({ S }) => Math.abs(S.ankle[1] - S.ankleF[1]));
      expect(Math.max(...spread), `${key} iki bacak ayrışması`).toBeGreaterThan(40);
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
    // Sırtüstü ikisi de çapraz çalışıyor: ölü böcekte uzak bacak uzanırken
    // yakın bacak masa üstünde kalır, McGill curl-up'ta bir diz bükük diğeri düz.
    expect(gorunur.sort()).toEqual([
      'bird_dog', 'bulgarian_split_squat', 'carry', 'curl_up_supine', 'dead_bug_supine', 'step_up', 'unilateral_lunge',
    ]);
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
