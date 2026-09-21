import { mix } from './deriveColor';
import type { Palette } from './tokens';

/**
 * Where the text-field outline sits between the field's own surface and the
 * text colour. `line` is a hairline for dividers — 1.26:1 against `surf` in the
 * default dark palette — and drew an empty field as an unbordered gap.
 * WCAG 1.4.11 wants 3:1 for the boundary of an input; `theme/fieldBorder.test.ts`
 * holds every shipped palette and a sweep of derived brands to it.
 */
export const FIELD_BORDER_MIX = 0.55;

export function fieldBorderColor(palette: Pick<Palette, 'surf' | 'txt'>): string {
  return mix(palette.surf, palette.txt, FIELD_BORDER_MIX);
}
