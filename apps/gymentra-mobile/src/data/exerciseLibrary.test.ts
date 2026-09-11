import { describe, expect, it } from 'vitest';

import { LIBRARY_GROUPS } from './exerciseGroups';
import { RIG_ARCHETYPES } from './rigArchetypes';
import {
  EXERCISES,
  exerciseNames,
  MUSCLE_LABELS,
  NAME_TO_EXERCISE,
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

  // Against RIG_ARCHETYPES, not POSE_ARCHETYPES: the detail screen looks the
  // key up in the rig table and hands the result straight to RigFigure, so a
  // key missing THERE is a crash. POSE_ARCHETYPES is the older static-frame
  // table and nothing outside this file reads it any more.
  it('every exercise references a rig archetype that exists', () => {
    for (const e of EXERCISES) {
      expect(RIG_ARCHETYPES[e.archetype], `${e.id} → ${e.archetype}`).toBeDefined();
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

  // The browsing taxonomy is hand-written (exerciseGroups.ts) while EXERCISES is
  // generated, so nothing kept the two in step. Both readers — the library
  // screen and the programme builder's picker — drop an unknown id silently
  // (`.filter(e => e !== null)`), so a movement listed in a group but missing
  // from the library is invisible with no error anywhere. That is exactly how
  // twelve machine and cable movements went missing when they were dropped
  // from the generator on 3 Sep 2026 and the groups were left behind.
  it('every group id is a real exercise', () => {
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const group of LIBRARY_GROUPS) {
      for (const id of group.ids) expect(ids, `${group.label} → ${id}`).toContain(id);
    }
  });

  it('every exercise is shelved in exactly one group', () => {
    const shelved = LIBRARY_GROUPS.flatMap((g) => g.ids);
    for (const e of EXERCISES) {
      expect(shelved.filter((id) => id === e.id), e.id).toHaveLength(1);
    }
  });

  // The gym floor uses two vocabularies for the same movement — the English
  // loanword and the Turkish description — and which one a trainer knows is
  // an accident of where they trained. Both resolve, both are searched.
  it('the counterpart name resolves to the same movement', () => {
    expect(exerciseByName('Bacak presi')?.id).toBe('leg-press');
    expect(exerciseByName('Kalça itişi')?.id).toBe('hip-thrust');
    expect(exerciseByName('Topuk yükseltme')?.id).toBe('calf-raise');
    expect(exerciseByName('Leg press')?.id).toBe('leg-press');
  });

  it('a counterpart name is never just the primary name again', () => {
    for (const e of EXERCISES) {
      if (e.trAlt) expect(e.trAlt.toLocaleLowerCase('tr'), e.id).not.toBe(e.tr.toLocaleLowerCase('tr'));
    }
  });

  it('exerciseNames carries every name the movement answers to', () => {
    const legPress = exerciseById('leg-press')!;
    // Türkçe adlar 11 Eylül 2026'da antrenör düzeltmesiyle tarif edici hâle
    // geldi ("Leg press" → "Makinede bacak itiş"); salon adı `trAlt`/`en`'de.
    expect(exerciseNames(legPress)).toEqual(['Makinede bacak itiş', 'Bacak presi', 'Leg press']);
    // Karşılığı olmayan hareket uydurma bir ad taşımıyor.
    expect(exerciseById('plank')!.trAlt).toBeUndefined();
    expect(exerciseNames(exerciseById('plank')!)).toHaveLength(2);
  });

  it('poses carry the review flag until a trainer has checked them', () => {
    // Guards the promise the detail screen makes on screen. Flip these to true
    // per exercise as a certified trainer signs each one off.
    expect(EXERCISES.every((e) => e.poseReviewed === false)).toBe(true);
  });
});
