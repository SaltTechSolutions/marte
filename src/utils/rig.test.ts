import { describe, expect, it } from 'vitest';

import { EXERCISES } from '@/data/exerciseLibrary';
import { RIG_ARCHETYPES } from '@/data/rigArchetypes';
import { B, GROUND, Skeleton, Vec, angleOf, boundsFor, frontPoints, frontTrunk, ik, poseAt, skeleton } from './rig';

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
  it('segment boyları hareket boyunca sabit kalır', () => {
    // Eski motorun asıl kusuru buydu: ara karelerde gövde uzuyordu.
    entries.forEach(([key]) => {
      frames(key).forEach(({ S, at }) => {
        expect(len(S.pelvis, S.knee), `${at} uyluk`).toBeCloseTo(B.thigh, 3);
        expect(len(S.knee, S.ankle), `${at} baldır`).toBeCloseTo(B.shin, 3);
        expect(len(S.hipF, S.kneeF), `${at} uzak uyluk`).toBeCloseTo(B.thigh, 3);
        expect(len(S.pelvis, S.lumbar), `${at} bel`).toBeCloseTo(B.lumbar, 3);
        expect(len(S.lumbar, S.thorax), `${at} gövde`).toBeCloseTo(B.thorax, 3);
      });
    });
  });

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
  it('hiçbir eklem zeminin altına geçmez', () => {
    entries.forEach(([key]) => {
      frames(key).forEach(({ S, at }) => {
        (Object.keys(S) as (keyof Skeleton)[]).forEach((k) => {
          const v = S[k];
          if (!v || k === 'bar') return;
          expect(v[1], `${at} ${k} zeminin altında`).toBeLessThanOrEqual(GROUND + 14);
        });
      });
    });
  });

  it('ayakta yapılan hareketlerde basan ayak yerden kalkmaz', () => {
    entries
      .filter(([, ex]) => ex.mode === 'stand')
      .forEach(([key]) => {
        frames(key).forEach(({ S, p, at }) => {
          expect(S.ankle[1] + p.ankleLift, `${at} basan ayak`).toBeCloseTo(GROUND - 12, 3);
        });
      });
  });

  it('yere basan modlarda temas noktası zeminde', () => {
    entries
      .filter(([, ex]) => ex.mode === 'quad' || ex.mode === 'supine')
      .forEach(([key]) => {
        frames(key).forEach(({ S, at }) => {
          const lowest = Math.max(S.ankle[1], S.ankleF[1], S.knee[1], S.kneeF[1], S.hand[1], S.handF[1], S.pelvis[1], S.head[1]);
          expect(lowest, `${at} yere temas`).toBeGreaterThan(GROUND - 30);
        });
      });
  });

  it('asılı hareketlerde eller barda, ayaklar havada', () => {
    entries
      .filter(([, ex]) => ex.mode === 'hang')
      .forEach(([key]) => {
        frames(key).forEach(({ S, at }) => {
          expect(S.hand[1], `${at} el barda`).toBeLessThan(140);
          expect(S.ankle[1], `${at} ayak havada`).toBeLessThan(GROUND - 20);
        });
      });
  });

  it('diz insan aralığında bükülür ve ters yöne kırılmaz', () => {
    const flex = (S: Skeleton) => {
      const thigh = angleOf(S.pelvis, S.knee);
      const shin = angleOf(S.knee, S.ankle);
      let d = ((shin - thigh) % 360 + 360) % 360;
      if (d > 180) d -= 360;
      return d;
    };
    entries.forEach(([key, ex]) => {
      frames(key).forEach(({ S, at }) => {
        const d = flex(S);
        // Diz en fazla ~150° bükülür. İşaret yalnızca ayakta anlamlı: orada
        // zincir ayaktan yukarı kurulduğu için ters işaret dizin geri
        // kırılması demek. Yatarak/asılı kurulan zincirlerde işaret dönüyor.
        expect(Math.abs(d), `${at} diz açısı`).toBeLessThan(155);
        if (ex.mode === 'stand') expect(d, `${at} diz yönü`).toBeGreaterThan(-14);
      });
    });
  });

  it('dirsek ters yöne kırılmaz', () => {
    entries
      // Ters kinematik dirseği zaten `bend` ile tek yöne kilitliyor; burada
      // açıyla çizilen kollar denetleniyor.
      .filter(([, ex]) => ex.arm === 'angles')
      .forEach(([key]) => {
        frames(key).forEach(({ S, at }) => {
          const upper = angleOf(S.sh, S.elbow);
          const fore = angleOf(S.elbow, S.hand);
          let d = ((fore - upper) % 360 + 360) % 360;
          if (d > 180) d -= 360;
          expect(Math.abs(d), `${at} dirsek açısı`).toBeLessThan(160);
        });
      });
  });

  it('gövde kendi üstüne katlanmaz: baş kalçadan uzak durur', () => {
    entries.forEach(([key]) => {
      frames(key).forEach(({ S, at }) => {
        expect(len(S.pelvis, S.head), `${at} gövde uzunluğu`).toBeGreaterThan(90);
      });
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

  it('desteğe yaslanan hareketlerde omuz yerinde kalır', () => {
    // Hip thrust ve köprüde kalça yükselir, omuz sehpada/yerde kalır. Gövde
    // açısı buna göre açılmazsa figür desteğinden kopup havaya kalkıyor.
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

  it('önden görünümde gövde elipsi çizilebilir ölçüde', () => {
    // Yarıçap işaretli farktan hesaplanıyordu: ayakta duran figürde göğüs
    // belin ÜSTÜNDE olduğu için değer negatife düşüyor ve SVG elipsi hiç
    // çizmiyordu — önden bakışta gövde boş kalıyordu.
    entries.forEach(([key, ex]) => {
      frames(key).forEach(({ S, p, at }) => {
        const trunk = frontTrunk(frontPoints(ex, p, S));
        expect(trunk.ry, `${at} gövde yarıçapı`).toBeGreaterThan(0);
        expect(trunk.rx, `${key} gövde genişliği`).toBeGreaterThan(0);
      });
    });
  });

  it('önden görünümde kol omuzdan çıkmaz', () => {
    // İki ayrı kusur bu testin altında: omuz silkmede omuz yükselip kol
    // yerinde kalınca üst kol uzuyordu; bant açmanın başında eller gövdeye
    // yakınken dirsek omzun içine gömülüp kol yok oluyordu.
    entries
      .filter(([, ex]) => ex.view === 'front')
      .forEach(([key, ex]) => {
        frames(key).forEach(({ S, p, at }) => {
          const F = frontPoints(ex, p, S);
          [F.L, F.R].forEach((side) => {
            const upper = len(side.sh, side.elbow);
            expect(upper, `${at} üst kol`).toBeGreaterThan(30);
            expect(upper, `${at} üst kol`).toBeLessThan(110);
            expect(len(side.elbow, side.hand), `${at} ön kol`).toBeLessThan(120);
          });
        });
        // Omuz silkmede kolun boyu hiç değişmemeli: kol omuzdan sarkıyor.
        if (key === 'shrug_front') {
          const lens = frames(key).map(({ S, p }) => {
            const F = frontPoints(ex, p, S);
            return len(F.R.sh, F.R.elbow);
          });
          expect(Math.max(...lens) - Math.min(...lens), 'omuz silkme kol boyu').toBeLessThan(1);
        }
      });
  });

  it('yanal hareketlerde el gerçekten yana açılır', () => {
    (['lateral_raise_front', 'band_pull_apart_front', 'band_ext_rotation_front', 'hinged_fly'] as const).forEach((key) => {
      const ex = RIG_ARCHETYPES[key];
      const widths = Array.from({ length: 21 }, (_, i) => poseAt(ex, i / 20).p.hxF);
      expect(Math.max(...widths) - Math.min(...widths), `${key} açılma`).toBeGreaterThan(40);
    });
  });
});
