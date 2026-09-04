import { describe, expect, test } from 'vitest';

import { PoseFrame } from '@/data/exerciseLibrary';

import { easeInOutCubic, facing, farJoint, interpolate, mirrorX, repPhase } from './pose';

const A: PoseFrame = { head: [150, 46], shoulder: [150, 70], elbow: [134, 96], wrist: [138, 68], hip: [152, 134], knee: [152, 172], ankle: [150, 206], toe: [174, 206], bar: [146, 66] };
const B: PoseFrame = { ...A, hip: [130, 166], knee: [170, 176], bar: [142, 96], farKnee: [108, 190], farAnkle: [90, 204], farToe: [76, 200] };

describe('interpolate', () => {
  test('t=0 başlangıç, t=1 bitiş', () => {
    expect(interpolate(A, B, 0).hip).toEqual([152, 134]);
    expect(interpolate(A, B, 1).knee).toEqual([170, 176]);
  });
  test('ortada tam orta nokta', () => {
    expect(interpolate(A, B, 0.5).hip).toEqual([141, 150]);
  });
  test('uzak uzuv verisi yoksa yakının 4 px gerisi', () => {
    expect(farJoint(A, 'knee')).toEqual([148, 172]);
  });
  test('uzak uzuv verisi varsa kendisi, ve karışıma girer', () => {
    expect(interpolate(A, B, 1).farKnee).toEqual([108, 190]);
    expect(interpolate(A, B, 0).farKnee).toEqual([148, 172]);
  });
  test('izometrik (end null) her t için aynı kare', () => {
    expect(interpolate(A, null, 0.7)).toEqual(interpolate(A, null, 0));
  });
});

describe('facing', () => {
  test('dik figür ayak parmağı yönüne bakar', () => {
    expect(facing(A)).toEqual([1, 0]);
    expect(facing({ ...A, toe: [126, 206] })).toEqual([-1, 0]);
  });
  test('sırtüstü (eller havada) yukarı bakar — bench press', () => {
    expect(facing({ head: [100, 138], shoulder: [120, 144], hip: [198, 148], wrist: [118, 90], ankle: [230, 204], toe: [248, 204] })).toEqual([0, -1]);
  });
  test('yüzüstü / dört ayak (eller yerde) başın olduğu yöne bakar — cat-cow ters bakmasın', () => {
    // parmak uçları geride (132 < 150) ama baş sağda: yön sağ olmalı
    expect(facing({ head: [248, 120], shoulder: [216, 138], hip: [150, 148], wrist: [216, 204], ankle: [150, 204], toe: [132, 206] })).toEqual([1, 0]);
  });
  test('açık yön iskeleti ezer — hip thrust kolları aşağıda ama sırtüstü', () => {
    expect(facing({ head: [70, 150], shoulder: [92, 152], hip: [132, 180], wrist: [92, 196], ankle: [168, 206], toe: [190, 206] }, 'up')).toEqual([0, -1]);
    expect(facing({ ...A }, 'front')).toBe('front');
  });
  test('ayna', () => {
    expect(mirrorX([176, 102], 150)).toEqual([124, 102]);
  });
});

describe('repPhase', () => {
  test('uçlarda bekler, ortada ilerler, geri döner', () => {
    expect(repPhase(0, 1000, 200)).toBe(0);
    expect(repPhase(700, 1000, 200)).toBeCloseTo(0.5);
    expect(repPhase(1300, 1000, 200)).toBe(1);
    expect(repPhase(1900, 1000, 200)).toBeCloseTo(0.5);
  });
  test('easing uçlarda sabit, ortada 0.5', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
});
