import { describe, expect, it } from 'vitest';

import {
  allProgramExercises,
  formatLastTime,
  lastCompletedDayId,
  lastTimeFor,
  programDays,
  programSummary,
  suggestedDayId,
} from './program';
import { Program, ProgramDay, WorkoutLog } from './types';

const program = (over: Partial<Program> = {}): Program => ({
  id: 'p1',
  tenantId: 't1',
  memberId: 'm1',
  memberName: 'Üye',
  trainerId: 'tr1',
  name: 'Tam vücut',
  status: 'active',
  exercises: [{ id: 'e1', name: 'Squat', sets: 3, reps: 10, targetWeightKg: 40 }],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...over,
});

const day = (id: string, name: string): ProgramDay => ({
  id,
  name,
  exercises: [{ id: `${id}-e`, name: `${name} hareketi`, sets: 3, reps: 8, targetWeightKg: 50 }],
});

const log = (over: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id: 'l1',
  tenantId: 't1',
  memberId: 'm1',
  programId: 'p1',
  programName: 'Tam vücut',
  startedAt: new Date('2026-02-01'),
  completedAt: new Date('2026-02-01'),
  exerciseLogs: [{ exerciseId: 'e1', name: 'Squat', setsTarget: 3, setsCompleted: 3, weightKg: 60 }],
  ...over,
});

describe('programDays', () => {
  it('tek günlü program tek elemanlı liste olarak okunur', () => {
    const days = programDays(program());
    expect(days).toHaveLength(1);
    expect(days[0].exercises[0].name).toBe('Squat');
  });

  it('çok günlü programda günler olduğu gibi gelir', () => {
    const days = programDays(program({ days: [day('d1', 'Push'), day('d2', 'Pull')] }));
    expect(days.map((d) => d.name)).toEqual(['Push', 'Pull']);
  });
});

describe('suggestedDayId', () => {
  const days = [day('d1', 'Push'), day('d2', 'Pull'), day('d3', 'Legs')];

  it('hiç antrenman yoksa ilk gün', () => {
    expect(suggestedDayId(days, null)).toBe('d1');
  });

  it('son çalışılan günden sonraki gün', () => {
    expect(suggestedDayId(days, 'd1')).toBe('d2');
    expect(suggestedDayId(days, 'd2')).toBe('d3');
  });

  it('son günden sonra başa döner', () => {
    expect(suggestedDayId(days, 'd3')).toBe('d1');
  });

  it('silinmiş bir güne takılı kalmaz', () => {
    expect(suggestedDayId(days, 'artik-yok')).toBe('d1');
  });

  it('gün yoksa null', () => {
    expect(suggestedDayId([], 'd1')).toBeNull();
  });
});

describe('lastCompletedDayId', () => {
  it('yarım kalan antrenman sayılmaz', () => {
    const logs = [
      log({ id: 'a', dayId: 'd1', startedAt: new Date('2026-02-01') }),
      log({ id: 'b', dayId: 'd2', startedAt: new Date('2026-02-03'), completedAt: undefined }),
    ];
    expect(lastCompletedDayId(logs)).toBe('d1');
  });
});

describe('lastTimeFor', () => {
  it('en son tamamlanmış kayıttaki ağırlığı verir', () => {
    const logs = [
      log({ id: 'a', startedAt: new Date('2026-02-01') }),
      log({
        id: 'b',
        startedAt: new Date('2026-02-08'),
        exerciseLogs: [{ exerciseId: 'e1', name: 'Squat', setsTarget: 3, setsCompleted: 4, weightKg: 65 }],
      }),
    ];
    expect(lastTimeFor(logs, { name: 'Squat' })).toEqual({
      weightKg: 65,
      setsCompleted: 4,
      at: new Date('2026-02-08'),
    });
  });

  it('yapılmamış set "geçen sefer" sayılmaz', () => {
    const logs = [log({ exerciseLogs: [{ exerciseId: 'e1', name: 'Squat', setsTarget: 3, setsCompleted: 0, weightKg: 60 }] })];
    expect(lastTimeFor(logs, { name: 'Squat' })).toBeNull();
  });

  it('süren antrenmanın kendisi hesaba katılmaz', () => {
    const logs = [log({ id: 'simdiki' })];
    expect(lastTimeFor(logs, { name: 'Squat' }, 'simdiki')).toBeNull();
  });

  it('isim değişse de kütüphane kimliği tutar', () => {
    const logs = [
      log({
        exerciseLogs: [{ exerciseId: 'e1', name: 'Eski isim', libraryId: 'back-squat', setsTarget: 3, setsCompleted: 3, weightKg: 70 }],
      }),
    ];
    expect(lastTimeFor(logs, { name: 'Yeni isim', libraryId: 'back-squat' })?.weightKg).toBe(70);
  });

  it('kütüphane kimliği olmayan eski kayıtta isim eşleşmesi çalışır', () => {
    const logs = [log()];
    expect(lastTimeFor(logs, { name: 'Squat', libraryId: 'back-squat' })?.weightKg).toBe(60);
  });
});

describe('formatLastTime', () => {
  it('tam sayı ağırlıkta ondalık göstermez', () => {
    expect(formatLastTime({ weightKg: 80, setsCompleted: 3, at: new Date() })).toBe('80 kg × 3 set');
  });

  it('yarım kiloyu korur', () => {
    expect(formatLastTime({ weightKg: 82.5, setsCompleted: 4, at: new Date() })).toBe('82.5 kg × 4 set');
  });
});

describe('programSummary', () => {
  it('tek günlü programda yalnızca egzersiz sayısı', () => {
    expect(programSummary(program())).toBe('1 egzersiz');
  });

  it('çok günlüde bütün günlerin toplamı sayılır', () => {
    // Bu satır eskiden `program.exercises`'i sayıyordu, yani üç günlük bir
    // programı ilk gününün uzunluğu kadar gösteriyordu.
    const p = program({ days: [day('d1', 'Push'), day('d2', 'Pull'), day('d3', 'Legs')] });
    expect(programSummary(p)).toBe('3 gün · 3 egzersiz');
  });

  it('boş programı boş olarak söyler', () => {
    expect(programSummary(program({ exercises: [] }))).toBe('Henüz egzersiz eklenmedi');
  });
});

describe('allProgramExercises', () => {
  it('günlerin egzersizlerini sırayla düzleştirir', () => {
    const p = program({ days: [day('d1', 'Push'), day('d2', 'Pull')] });
    expect(allProgramExercises(p).map((e) => e.name)).toEqual(['Push hareketi', 'Pull hareketi']);
  });
});
