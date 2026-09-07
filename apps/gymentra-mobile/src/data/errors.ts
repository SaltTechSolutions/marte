import * as Sentry from '@sentry/react-native';

/**
 * plan-eng-review Faz 2.1 (Q1). A Cloud Functions `httpsCallable` rejection
 * carries the exact Turkish sentence the server wrote — e.g.
 * `bookPtSessions` throwing `HttpsError('failed-precondition', 'Yeterli
 * ders kredin yok — 2 kaldı, 3 gerekiyor.')` — meant for the user to read.
 * Every `catch {}` across the app used to discard it and show a generic
 * "tekrar dene", so a member who tapped "Randevu al" with no credit left
 * saw the same unhelpful message as a dropped network connection, forever.
 *
 * A raw Firestore SDK error ("permission-denied", not localized) is the
 * opposite — AGENTS.md: "Teknik jargon ve hata kodu kullanıcıya
 * gösterilmez." Only surface `.message` for the specific callable codes
 * our own functions deliberately throw with human-authored Turkish text
 * (see `backend/functions/src/*.ts`'s own `HttpsError` call sites) —
 * `'functions/internal'` is excluded on purpose: the one place it's thrown
 * server-side carries an English debug string, never meant for a user.
 */
const TRUSTED_CALLABLE_CODES = new Set([
  'functions/failed-precondition',
  'functions/invalid-argument',
  'functions/permission-denied',
  'functions/not-found',
  'functions/unauthenticated',
]);

function trustedCallableMessage(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const code = (e as { code?: unknown }).code;
  const message = (e as { message?: unknown }).message;
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return TRUSTED_CALLABLE_CODES.has(code) ? message : null;
}

interface ErrorSink {
  error: (message: string) => void;
}

/**
 * plan-eng-review Faz 2.2. A trusted callable message (kredi yetersiz,
 * yetkisiz antrenör, ...) is expected business-rule output, not a bug —
 * reporting every one of those to Sentry would spend the free tier's
 * monthly event budget on normal user behavior instead of actual failures.
 * Only the *un*trusted path — a raw Firestore error, a network failure, an
 * unhandled exception — is genuinely something nobody meant to happen, so
 * only that gets captured.
 */
function maybeCapture(e: unknown, trusted: string | null): void {
  if (trusted == null) Sentry.captureException(e);
}

/**
 * Drop-in replacement for `toast.error(fallback)` inside a `catch`. Shows
 * the server's own message when it's one of ours; otherwise the screen's
 * fallback, same as before. Reports the unexpected case to Sentry.
 */
export function reportError(e: unknown, sink: ErrorSink, fallback: string): void {
  const trusted = trustedCallableMessage(e);
  maybeCapture(e, trusted);
  sink.error(trusted ?? fallback);
}

/**
 * Same decision, for screens that keep an inline result/state object
 * instead of a toast (e.g. `checkin.tsx`'s scan result card).
 */
export function errorMessage(e: unknown, fallback: string): string {
  const trusted = trustedCallableMessage(e);
  maybeCapture(e, trusted);
  return trusted ?? fallback;
}
