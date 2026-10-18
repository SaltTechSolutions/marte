/**
 * Money is an INTEGER IN KURUŞ everywhere in the API and in D1 (1 TL = 100). The client converts at its
 * boundary; this is the one place the server turns kuruş into something a person reads (push texts).
 */

/** "₺250,50" for 25050; whole liras print without decimals ("₺250"). Always tr-TR grouping ("₺1.250,50"). */
export function formatTl(kurus: number): string {
  const whole = Number.isInteger(kurus / 100);
  return '₺' + (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
