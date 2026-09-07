import { describe, expect, it } from 'vitest';

import {
  EXERCISES,
  MUSCLE_LABELS,
  NAME_TO_EXERCISE,
  POSE_ARCHETYPES,
  exerciseById,
  exerciseByName,
} from './exerciseLibrary';

describe('exercise library', () => {
  it('every alias points at a real exercise (or explicitly at nothing)', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const [name, id] of Object.entries(NAME_TO_EXERCISE)) {
      if (id !== null) expect(ids, `"${name}" → ${id}`).toContain(id);
    }
  });

  it('every exercise references an archetype that exists', () => {
    for (const e of EXERCISES) {
      expect(POSE_ARCHETYPES[e.archetype], `${e.id} → ${e.archetype}`).toBeDefined();
    }
  });

  it('every named muscle can actually be shaded', () => {
    for (const e of EXERCISES) {
      for (const m of [...e.primary, ...e.secondary]) {
        expect(MUSCLE_LABELS[m], `${e.id} → ${m}`).toBeDefined();
      }
    }
  });

  it('a muscle is never both primary and secondary for one exercise', () => {
    for (const e of EXERCISES) {
      const overlap = e.primary.filter((m) => e.secondary.includes(m));
      expect(overlap, e.id).toEqual([]);
    }
  });

  it('ids are unique', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });

  it('resolves a programme line by its exact template wording', () => {
    expect(exerciseByName('Goblet squat (hafif dumbbell)')?.id).toBe('goblet-squat');
    expect(exerciseByName('Romanian deadlift (dumbbell)')?.id).toBe('rdl');
  });

  it('returns null for lines that are deliberately not single movements', () => {
    // A cardio block and a one-line circuit are programming instructions, not
    // movements with a start and an end pose — the screen says so rather than
    // guessing at a page for them.
    expect(exerciseByName('Isınma: hafif kardiyo')).toBeNull();
    expect(
      exerciseByName('Devre: goblet squat → şınav → dumbbell row → kettlebell swing → mountain climber'),
    ).toBeNull();
  });

  it('falls back to a contains-match for a hand-typed variant', () => {
    expect(exerciseByName('Bench press (geniş tutuş)')?.id).toBe('bench-press');
  });

  it('handles missing input without throwing', () => {
    expect(exerciseByName(undefined)).toBeNull();
    expect(exerciseById(undefined)).toBeNull();
    expect(exerciseById('nope')).toBeNull();
  });

  it('poses carry the review flag until a trainer has checked them', () => {
    // Guards the promise the detail screen makes on screen. Flip these to true
    // per exercise as a certified trainer signs each one off.
    expect(EXERCISES.every((e) => e.poseReviewed === false)).toBe(true);
  });
});
