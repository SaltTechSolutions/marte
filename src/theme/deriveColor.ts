// HSL helpers for deriving a full surface/text ladder from a single tenant
// primary color, so ANY hex a gym owner picks gets a usable theme — not just
// the two hand-tuned palettes (GymEntra/Tarabya) shipped with the design.

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case rn:
        h = 60 * (((gn - bn) / d) % 6);
        break;
      case gn:
        h = 60 * ((bn - rn) / d + 2);
        break;
      default:
        h = 60 * ((rn - gn) / d + 4);
    }
  }
  if (h < 0) h += 360;
  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function hexToHsl(hex: string): Hsl {
  return rgbToHsl(...hexToRgb(hex));
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(...hslToRgb(hsl));
}

/** Same hue/saturation as the source color, at a new lightness (0-1). */
export function tone(hex: string, l: number, satScale = 1): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ h: hsl.h, s: Math.min(1, hsl.s * satScale), l });
}

export function mix(hexA: string, hexB: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(hexA);
  const [br, bg, bb] = hexToRgb(hexB);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Shift hue by degrees, keeping saturation/lightness — used when a tenant has no accentColor. */
export function shiftHue(hex: string, degrees: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ h: (hsl.h + degrees + 360) % 360, s: hsl.s, l: hsl.l });
}
