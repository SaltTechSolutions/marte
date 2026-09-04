import { describe, expect, it } from 'vitest';

import { EXERCISES } from '@/data/exerciseLibrary';
import { RIG_ARCHETYPES } from '@/data/rigArchetypes';
import { B, GROUND, angleOf, boundsFor, ik, poseAt, skeleton } from './rig';

const len = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);

describe('rig kinematics', () => {
  it('segment boyları hareket boyunca sabit kalır', () => {
    // Eski motorun asıl kusuru buydu: ara karelerde gövde uzuyordu.
    Object.entries(RIG_ARCHETYPES).forEach(([key, ex]) => {
      for (let i = 0; i <= 10; i++) {
        const S = skeleton(ex, poseAt(ex, i / 10).p);
        expect(len(S.pelvis, S.knee), `${key} uyluk`).toBeCloseTo(B.thigh, 3);
        expect(len(S.knee, S.ankle), `${key} baldır`).toBeCloseTo(B.shin, 3);
        expect(len(S.pelvis, S.lumbar), `${key} bel`).toBeCloseTo(B.lumbar, 3);
        expect(len(S.lumbar, S.thorax), `${key} gövde`).toBeCloseTo(B.thorax, 3);
      }
    });
  });

  it('ayakta yapılan hareketlerde ayak yere basar', () => {
    Object.entries(RIG_ARCHETYPES)
      .filter(([, ex]) => ex.mode === 'stand')
      .forEach(([key, ex]) => {
        for (let i = 0; i <= 10; i++) {
          const S = skeleton(ex, poseAt(ex, i / 10).p);
          expect(S.ankle[1], `${key} ayak bileği`).toBeCloseTo(GROUND - 12, 3);
        }
      });
  });

  it('ters kinematik erişilemeyen hedefte kolu koparmaz', () => {
    const far = ik([0, 0], [0, 900], B.upper, B.fore, 1);
    expect(len([0, 0], far.elbow)).toBeCloseTo(B.upper, 6);
    expect(len(far.elbow, far.hand)).toBeCloseTo(B.fore, 6);
  });

  it('viewBox tekrar boyunca sabit ve pozitif ölçülü', () => {
    Object.entries(RIG_ARCHETYPES).forEach(([key, ex]) => {
      const vb = boundsFor(ex, 'side').split(' ').map(Number);
      expect(vb, key).toHaveLength(4);
      expect(vb[2], `${key} genişlik`).toBeGreaterThan(0);
      expect(vb[3], `${key} yükseklik`).toBeGreaterThan(0);
      expect(boundsFor(ex, 'side')).toBe(boundsFor(ex, 'side'));
    });
  });

  it('her hareketin arketipi kuklada tanımlı', () => {
    EXERCISES.forEach((e) => {
      expect(RIG_ARCHETYPES[e.archetype], `${e.id} → ${e.archetype}`).toBeDefined();
    });
  });

  it('açı ölçümü D() ile aynı eksende', () => {
    expect(angleOf([0, 0], [0, -10])).toBeCloseTo(0, 6);
    expect(angleOf([0, 0], [10, 0])).toBeCloseTo(90, 6);
    expect(angleOf([0, 0], [0, 10])).toBeCloseTo(180, 6);
  });

  it('her arketipin kareleri sıralı ve 0-1 aralığında', () => {
    Object.entries(RIG_ARCHETYPES).forEach(([key, ex]) => {
      expect(ex.kf.length, key).toBeGreaterThan(1);
      ex.kf.forEach((k, i) => {
        expect(k.t, `${key}[${i}]`).toBeGreaterThanOrEqual(0);
        expect(k.t, `${key}[${i}]`).toBeLessThanOrEqual(1);
        if (i > 0) expect(k.t, `${key}[${i}] sıra`).toBeGreaterThanOrEqual(ex.kf[i - 1].t);
      });
      expect(ex.dur, `${key} süre`).toBeGreaterThan(500);
    });
  });
});
