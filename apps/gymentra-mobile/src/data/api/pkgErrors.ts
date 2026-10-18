import { ApiError } from './client';

/**
 * Turkish texts for the package-lifecycle refusals the Worker sends with an ENGLISH `error` and no entry in
 * `api/src/errorMessages.ts` (so the app would only show "Bu işlem şu an yapılamıyor."). The Firebase
 * callables carried the useful sentence ("2 randevu var", "dondurma hakkı doldu"); screens show
 * `e.message` verbatim for these, so the sentence is restored here. A refusal that is not listed passes
 * through untouched. Belongs in the Worker eventually (reported as GAP(api)); harmless once it is there.
 */
const EXACT: Record<string, string> = {
  'only a membership package can be frozen': 'Yalnızca üyelik paketi dondurulabilir.',
  'package is already frozen': 'Paket zaten dondurulmuş.',
  'only an active package can be frozen': 'Yalnızca etkin bir paket dondurulabilir.',
  'an ended package cannot be frozen': 'Sona ermiş ya da sona erecek olarak işaretlenmiş paket dondurulamaz.',
  'this package has no freeze right': 'Bu paketin dondurma hakkı yok.',
  'an expired package cannot be frozen': 'Süresi dolmuş paket dondurulamaz.',
  'days (max 365)': 'En fazla 365 gün dondurulabilir.',
  'assignment changed; retry': 'Paket az önce değişti. Lütfen tekrar dene.',
  'assignment already cancelled': 'Bu paket zaten geri alınmış.',
  'assignment already ended or already marked to end': 'Bu paket zaten sona ermiş ya da sona erecek olarak işaretlenmiş.',
  'an appointment was booked on this package meanwhile; cancel it first': 'Bu arada pakete bağlı bir randevu alındı. Önce onu iptal et.',
  'current assignment is not an active package of this member': 'Değiştirilecek paket artık etkin değil.',
  'the package to replace is no longer active': 'Değiştirilecek paket artık etkin değil.',
  'member, package, current assignment or promotion changed; retry': 'Bilgiler az önce değişti. Lütfen tekrar dene.',
  'package, promotion or current assignment changed; retry': 'Bilgiler az önce değişti. Lütfen tekrar dene.',
  'request is no longer pending': 'Bu teklif artık beklemede değil.',
  'offer expired': 'Teklifin süresi doldu.',
  'proposed package no longer exists': 'Teklif edilen paket artık yok.',
  'cannot reverse': 'Bu ödeme zaten düzeltilmiş ya da düzeltilemez.',
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^freeze quota used up \((\d+) times\)$/, (m) => `Dondurma hakkı doldu (en fazla ${m[1]} kez).`],
  [/^a freeze must be at least (\d+) days$/, (m) => `Bir dondurma en az ${m[1]} gün olmalı.`],
  [/^(\d+) upcoming appointment\(s\) are booked on this package; cancel them first$/, (m) => `Bu pakete bağlı ${m[1]} ileri tarihli randevu var. Önce onları iptal et.`],
];

export function localizePkgError(e: unknown): unknown {
  if (!(e instanceof ApiError) || !e.apiCode) return e;
  const text = EXACT[e.apiCode] ?? PATTERNS.map(([re, f]) => (re.test(e.apiCode!) ? f(e.apiCode!.match(re)!) : null)).find(Boolean);
  return text ? new ApiError(e.status, text, e.apiCode) : e;
}

/** `await localized(apiPost(...))`: same promise, refusals in Turkish. */
export const localized = <T>(p: Promise<T>): Promise<T> => p.catch((e) => { throw localizePkgError(e); });
