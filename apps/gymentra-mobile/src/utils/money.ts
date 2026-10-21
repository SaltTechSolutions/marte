/**
 * Lira amounts for people. The wire unit is kuruş (the API stores integers) and the data layer converts to
 * lira with decimals, so 250,50 TL arrives as 250.5. `toLocaleString('tr-TR')` alone prints that as "250,5";
 * a price people read must show both decimals whenever there is a fraction, and none when it is whole.
 */
export function formatLira(n: number): string {
  const fractional = Math.abs(n % 1) > 1e-9;
  return n.toLocaleString('tr-TR', { minimumFractionDigits: fractional ? 2 : 0, maximumFractionDigits: 2 });
}
