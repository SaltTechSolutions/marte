import { beforeEach, describe, expect, it } from 'vitest';

import { daysFromTemplate, formatDose } from './programTemplate';
import { ProgramTemplate } from './types';

let n = 0;
const newId = () => `id-${++n}`;

const template = (): ProgramTemplate => ({
  id: 'core-beginner',
  tenantId: null,
  category: 'core',
  level: 'beginner',
  title: 'Core Güçlendirme Başlangıç',
  durationMinutes: 15,
  weeklyFrequency: 'Haftada 3-4 gün',
  equipment: ['mat'],
  summary: '…',
  limits: ['Bu bir karın inceltme programı değildir.'],
  sources: ['mcgill'],
  warmup: 'warmup-short',
  days: [
    {
      name: 'Core',
      exercises: [
        { name: 'Plank', type: 'time', sets: 3, durationSeconds: 20, restSeconds: 30, cue: 'Kalçayı sık.', targetWeightKg: null },
        { name: 'Ölü böcek', type: 'reps', sets: 3, reps: 8, restSeconds: 30, cue: 'Bel yere yapışık.', targetWeightKg: null },
        { name: 'Isınma: hafif kardiyo', type: 'time', sets: 1, durationSeconds: 300, restSeconds: 0, cue: '', targetWeightKg: null },
      ],
    },
  ],
});

describe('daysFromTemplate', () => {
  beforeEach(() => (n = 0));

  it('carries the cue, the rest and the hold time a trainer would otherwise retype', () => {
    const [day] = daysFromTemplate(template(), newId);
    expect(day.name).toBe('Core');
    const plank = day.exercises[0];
    expect(plank).toMatchObject({
      name: 'Plank',
      sets: 3,
      type: 'time',
      durationSeconds: 20,
      restSeconds: 30,
      cue: 'Kalçayı sık.',
      libraryId: 'plank',
    });
  });

  it('gives a timed exercise no reps rather than a misleading count', () => {
    const [day] = daysFromTemplate(template(), newId);
    expect(day.exercises[0].reps).toBe(0);
    expect(day.exercises[1].reps).toBe(8);
  });

  it('leaves the weight for the trainer to set in the first session', () => {
    const [day] = daysFromTemplate(template(), newId);
    expect(day.exercises.every((e) => e.targetWeightKg === 0)).toBe(true);
  });

  it('links a line to the library, and links nothing when the line is not a movement', () => {
    const [day] = daysFromTemplate(template(), newId);
    expect(day.exercises[1].libraryId).toBe('dead-bug');
    // Bir kardiyo bloğu tek hareket değil; uydurma bir bağ kurmak,
    // üyeyi alakasız bir anlatım sayfasına götürürdü.
    expect(day.exercises[2].libraryId).toBeUndefined();
  });

  it('mints a distinct id for every day and every line', () => {
    const days = daysFromTemplate(template(), newId);
    const ids = [...days.map((d) => d.id), ...days.flatMap((d) => d.exercises.map((e) => e.id))];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('formatDose', () => {
  it('reads a timed hold as seconds, not as reps', () => {
    expect(formatDose({ sets: 3, reps: 0, type: 'time', durationSeconds: 30 })).toBe('3×30 sn');
  });

  it('reads a loaded or bodyweight line as reps', () => {
    expect(formatDose({ sets: 4, reps: 8, type: 'weight' })).toBe('4×8');
    // Şablon öncesi yazılmış programlarda `type` yok; onlar tekrarlıdır.
    expect(formatDose({ sets: 3, reps: 10 })).toBe('3×10');
  });
});
