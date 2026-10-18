import { describe, expect, it } from 'vitest';

import { AVATARS } from '@/data/avatars.generated';

import { assertAvatarId, avatarById, CLEAR_AVATAR_LABEL, initialsOf, isAvatarId, memberMark, optionLabel, pickerOptions } from './avatars';

describe('avatarById / isAvatarId', () => {
  it('finds every catalogue id and nothing else', () => {
    for (const a of AVATARS) expect(avatarById(a.id)).toBe(a);
    for (const bad of [undefined, null, '', 'Rock', 'photo', 'rock ', '__proto__', 'constructor']) {
      expect(avatarById(bad)).toBeNull();
      expect(isAvatarId(bad)).toBe(false);
    }
    expect(isAvatarId(42)).toBe(false);
  });
});

describe('initialsOf', () => {
  it('takes up to two initials, uppercased', () => {
    expect(initialsOf('ayşe yılmaz')).toBe('AY');
    expect(initialsOf('  Mehmet  Ali   Kaya ')).toBe('MA');
    expect(initialsOf('Cem')).toBe('C');
  });
  it('falls back to a question mark for an empty name', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });
});

describe('memberMark', () => {
  it('shows the avatar when the id is known', () => {
    const mark = memberMark('Ayşe Yılmaz', 'summit');
    expect(mark.kind).toBe('avatar');
    expect(mark.kind === 'avatar' && mark.avatar.id).toBe('summit');
  });
  it('falls back to initials when there is no id or the id is unknown (a removed avatar must not blank the row)', () => {
    for (const id of [undefined, null, '', 'retired-avatar']) {
      expect(memberMark('Ayşe Yılmaz', id)).toEqual({ kind: 'initials', initials: 'AY' });
    }
  });
});

describe('assertAvatarId', () => {
  it('lets a catalogue id and null (clear) through', () => {
    expect(() => assertAvatarId('rock')).not.toThrow();
    expect(() => assertAvatarId(null)).not.toThrow();
  });
  it('refuses anything else with a Turkish sentence a person can act on', () => {
    for (const bad of ['', 'my-own-image', 'https://x/a.jpg']) {
      try {
        assertAvatarId(bad);
        throw new Error('expected a refusal');
      } catch (e) {
        expect(e).toMatchObject({ code: 'functions/invalid-argument', message: 'Bu avatar seçilemedi, listeden başka bir tane seç.' });
      }
    }
  });
});

describe('pickerOptions', () => {
  it('lists the 12 avatars in catalogue order plus the initials option', () => {
    const { avatars, clear } = pickerOptions(undefined);
    expect(avatars.map((o) => o.id)).toEqual(AVATARS.map((a) => a.id));
    expect(avatars.map((o) => o.name)).toEqual(AVATARS.map((a) => a.name));
    expect(clear).toMatchObject({ id: null, name: CLEAR_AVATAR_LABEL });
  });

  it('exactly one option is selected and its spoken label says so', () => {
    const { avatars, clear } = pickerOptions('rock');
    expect(avatars.filter((o) => o.selected).map((o) => o.id)).toEqual(['rock']);
    expect(clear.selected).toBe(false);
    expect(avatars[0].label).toBe('Kaya, seçili');
    expect(avatars[1].label).toBe(AVATARS[1].name);
    expect(clear.label).toBe(CLEAR_AVATAR_LABEL);
  });

  it('with no avatar (or an unknown one) the initials option is the selected one', () => {
    for (const id of [null, undefined, '', 'retired-avatar']) {
      const { avatars, clear } = pickerOptions(id);
      expect(avatars.some((o) => o.selected)).toBe(false);
      expect(clear.selected).toBe(true);
      expect(clear.label).toBe(`${CLEAR_AVATAR_LABEL}, seçili`);
    }
  });

  it('optionLabel appends the state', () => {
    expect(optionLabel('Kaya', true)).toBe('Kaya, seçili');
    expect(optionLabel('Kaya', false)).toBe('Kaya');
  });
});
