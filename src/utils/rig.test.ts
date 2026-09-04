import { describe, expect, it } from 'vitest';

import { EXERCISES } from '@/data/exerciseLibrary';
import { RIG_ARCHETYPES } from '@/data/rigArchetypes';
import { B, Skeleton, Vec, angleOf, boundsFor, frontPoints, ik, poseAt, skeleton } from './rig';
import { auditExercise, auditSegments } from './rigAudit';

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

  it('her hareketin arketipi kuklada tanımlı', () => {
    EXERCISES.forEach((e) => {
      expect(RIG_ARCHETYPES[e.archetype], `${e.id} → ${e.archetype}`).toBeDefined();
    });
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
    expect(Math.max(...lifts), 'topuk ayak boyunu aşmamalı').toBeLessThanOrEqual(B.foot);
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
