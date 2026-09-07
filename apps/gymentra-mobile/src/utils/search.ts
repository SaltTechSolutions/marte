/**
 * Turkish-aware fold for free-text matching.
 *
 * A trainer looking for "Gülşah" types "gulsah", and a plain `toLowerCase()`
 * gets Turkish wrong in both directions: it maps "I" to "i" instead of "ı",
 * and leaves every diacritic in place so the query never matches. Lowercase
 * in the tr locale first, then flatten the accented letters onto their base.
 */
const FOLD: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
};

export function foldTr(value: string): string {
  return value.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c);
}

/** Case- and diacritic-insensitive "contains", for search boxes. */
export function matchesTr(haystack: string, query: string): boolean {
  return foldTr(haystack).includes(foldTr(query));
}

/** Alphabetical order a Turkish reader expects (ç after c, ı before i, ş after s). */
export function compareTr(a: string, b: string): number {
  return a.localeCompare(b, 'tr');
}
