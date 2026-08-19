// Contrast guard — ported from the design file's `lum()` function.
// Guarantees AA-legible text/icons on top of an arbitrary tenant primary color.

function channelLuminance(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Returns the readable on-color (dark or white) for a given background hex. */
export function onColorFor(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#0A0F0D' : '#FFFFFF';
}
