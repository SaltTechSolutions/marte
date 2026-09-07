/**
 * Splits one payment equally across several people without losing or inventing
 * a kuruş.
 *
 * Done in integer kuruş, not in lira: 1000 / 3 in floating point is
 * 333.33333333333331, and three of those do not add back up to 1000. The whole
 * point of this function is that they must.
 *
 * The remainder goes to the LAST share rather than being spread around, so the
 * rule is one sentence a gym owner can check by eye: everyone pays the same
 * except the last, who covers the odd kuruş. 1000₺ over three children is
 * 333.33 + 333.33 + 333.34.
 */
export function splitAmount(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const totalKurus = Math.round(total * 100);
  const base = Math.floor(totalKurus / parts);
  const shares = Array(parts).fill(base) as number[];
  shares[parts - 1] += totalKurus - base * parts;
  return shares.map((k) => k / 100);
}
