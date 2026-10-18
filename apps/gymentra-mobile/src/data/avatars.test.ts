import { describe, expect, it } from 'vitest';

import { AVATAR_IDS as API_AVATAR_IDS, isAvatarId as apiIsAvatarId } from '../../../../api/src/avatars';
import { AVATAR_IDS, AVATARS } from './avatars.generated';

/** Minimal well-formedness check for the generated markup: every tag closes in order, attributes are quoted. */
function assertWellFormed(xml: string) {
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let rest = xml;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [whole, closing, name, , selfClosing] = m;
    rest = rest.replace(whole, '');
    if (closing) expect(stack.pop()).toBe(name);
    else if (!selfClosing) stack.push(name);
  }
  expect(stack).toEqual([]);
  expect(rest).toBe('');   // nothing outside a recognised tag: no stray angle bracket or unquoted attribute
}

describe('avatar catalogue', () => {
  it('has 12 avatars with unique ids, unique Turkish names and unique colours', () => {
    expect(AVATARS).toHaveLength(12);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(12);
    expect(new Set(AVATARS.map((a) => a.name)).size).toBe(12);
    expect(new Set(AVATARS.map((a) => a.color)).size).toBe(12);
    expect([...AVATAR_IDS]).toEqual(AVATARS.map((a) => a.id));
    for (const a of AVATARS) {
      expect(a.id).toMatch(/^[a-z]+$/);
      expect(a.name.trim()).not.toBe('');
      expect(a.personality.trim()).not.toBe('');
      expect(a.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('is exactly the list the Worker accepts (same ids, same order)', () => {
    expect([...AVATAR_IDS]).toEqual([...API_AVATAR_IDS]);
    for (const id of AVATAR_IDS) expect(apiIsAvatarId(id)).toBe(true);
  });

  it('every avatar is a complete 100x100 SVG', () => {
    for (const a of AVATARS) {
      expect(a.xml.startsWith('<svg ')).toBe(true);
      expect(a.xml.endsWith('</svg>')).toBe(true);
      expect(a.xml).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(a.xml).toContain('viewBox="0 0 100 100"');
      assertWellFormed(a.xml);
      // A symbol on the disc in its own colour, and no embedded raster or script.
      expect(a.xml.toLowerCase()).toContain(a.color.toLowerCase());
      expect(a.xml).not.toMatch(/<image|<script|href=|data:/i);
    }
  });
});
