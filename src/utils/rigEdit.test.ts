import { describe, expect, it } from 'vitest';

import { RIG_ARCHETYPES } from '@/data/rigArchetypes';
import { RigExercise, Vec, angleOf, fillPose, poseAt, skeleton } from './rig';
import { applyPatch, dragHandles, dragJoint } from './rigEdit';

const dist = (a: Vec, b: Vec) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Sürükleme sonrası eklemin hedefe ne kadar yaklaştığı. */
const dragTo = (ex: RigExercise, joint: Parameters<typeof dragJoint>[2], target: Vec) => {
  const p = poseAt(ex, 0).p;
  const S = skeleton(ex, p);
  const patch = dragJoint(ex, S, joint, target);
  const next = skeleton(ex, fillPose({ ...p, ...patch }));
  return { patch, next };
};

describe('rigEdit — sürükleyerek poz verme', () => {
  const squat = RIG_ARCHETYPES.squat;

  it('dizi çekmek baldırı hedefe doğru döndürür', () => {
    // Kemik boyu sabit: eklem hedefin ÜSTÜNE değil, hedefe bakan ışına
    // oturur. Doğru ölçü mesafe değil yön.
    const S = skeleton(squat, poseAt(squat, 0).p);
    const target: Vec = [S.knee[0] + 40, S.knee[1] + 10];
    const { next } = dragTo(squat, 'knee', target);
    expect(angleOf(next.ankle, next.knee)).toBeCloseTo(angleOf(S.ankle, target), 3);
    expect(dist(next.ankle, next.knee)).toBeCloseTo(100, 3);
  });

  it('kalçayı çekmek çömelme derinliğini verir ve ayak yerde kalır', () => {
    const S = skeleton(squat, poseAt(squat, 0).p);
    const target: Vec = [S.pelvis[0] - 30, S.pelvis[1] + 70];
    const { next } = dragTo(squat, 'pelvis', target);
    // Erişilebilir bir hedefte kalça hedefe oturur; ayak bileği kımıldamaz.
    expect(dist(next.pelvis, target)).toBeLessThan(2);
    expect(next.ankle[1]).toBeCloseTo(S.ankle[1], 6);
  });

  it('erişilemeyecek kadar uzak hedefte bacak kopmaz', () => {
    const S = skeleton(squat, poseAt(squat, 0).p);
    const { next } = dragTo(squat, 'pelvis', [S.pelvis[0], S.pelvis[1] - 900]);
    expect(dist(next.ankle, next.knee)).toBeCloseTo(100, 3);
    expect(dist(next.knee, next.pelvis)).toBeCloseTo(105, 3);
  });

  it('ayakta basan ayak sürüklenemez', () => {
    expect(dragJoint(squat, skeleton(squat, poseAt(squat, 0).p), 'ankle', [0, 0])).toEqual({});
    expect(dragHandles(squat, skeleton(squat, poseAt(squat, 0).p)).map((h) => h.joint)).not.toContain('ankle');
  });

  it('gövde kendi kemiğini döndürür, bel kımıldamaz', () => {
    const S = skeleton(squat, poseAt(squat, 0).p);
    const target: Vec = [S.thorax[0] + 50, S.thorax[1] + 20];
    const { next } = dragTo(squat, 'thorax', target);
    expect(angleOf(next.lumbar, next.thorax)).toBeCloseTo(angleOf(S.lumbar, target), 3);
    expect(next.lumbar[0]).toBeCloseTo(S.lumbar[0], 6);
  });

  it('ters kinematikli kolda el hedefi omuza göre yazılır', () => {
    const press = RIG_ARCHETYPES.seated_overhead_press;
    const S = skeleton(press, poseAt(press, 0).p);
    const target: Vec = [S.sh[0] + 10, S.sh[1] - 100];
    const patch = dragJoint(press, S, 'hand', target);
    expect(patch.hx).toBeCloseTo(10, 6);
    expect(patch.hy).toBeCloseTo(-100, 6);
  });

  it('yerde duran elde yalnızca yatay hedef değişir', () => {
    const plank = RIG_ARCHETYPES.plank_prone;
    const S = skeleton(plank, poseAt(plank, 0).p);
    const patch = dragJoint(plank, S, 'hand', [S.sh[0] + 40, 10]);
    expect(patch.hx).toBeCloseTo(40, 6);
    expect(patch.hy).toBeUndefined();
  });

  it('uzak bacak ayrı çözülür', () => {
    const lunge = RIG_ARCHETYPES.unilateral_lunge;
    const S = skeleton(lunge, poseAt(lunge, 0.5).p);
    const target: Vec = [S.kneeF[0] - 20, S.kneeF[1] + 30];
    const patch = dragJoint(lunge, S, 'kneeF', target);
    expect(patch.thighF).toBeDefined();
    expect(patch.thighA).toBeUndefined();
  });

  it('asılı figürde el sürüklenemez, kalça gövdeyi döndürür', () => {
    const hang = RIG_ARCHETYPES.hanging_knee_raise;
    const S = skeleton(hang, poseAt(hang, 0).p);
    expect(dragHandles(hang, S).map((h) => h.joint)).not.toContain('hand');
    expect(dragJoint(hang, S, 'pelvis', [S.pelvis[0] + 30, S.pelvis[1]]).torso).toBeDefined();
  });
});

describe('applyPatch', () => {
  it('açıları 0-360 arasına indirger ve tek ondalığa yuvarlar', () => {
    expect(applyPatch({}, { thighA: -12.34 }).thighA).toBe(347.7);
    expect(applyPatch({}, { torso: 372.51 }).torso).toBe(12.5);
  });

  it('kaydırma alanlarını tam sayı tutar', () => {
    expect(applyPatch({}, { hx: 12.7, ankleLift: 41.2 })).toEqual({ hx: 13, ankleLift: 41 });
  });

  it('dokunulmayan alanları korur', () => {
    expect(applyPatch({ shinA: 178, torso: 5 }, { torso: 40 })).toEqual({ shinA: 178, torso: 40 });
  });
});
