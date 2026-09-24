import {
  DocumentReference,
  DocumentSnapshot,
  FirestoreError,
  onSnapshot,
  Query,
  QuerySnapshot,
} from 'firebase/firestore';
import * as Sentry from '@sentry/react-native';

/**
 * Optional error callback every `watch*` repo function accepts as its last
 * argument. Screens that can show an error state pass one; screens that
 * can't still get the console warning below rather than failing silently.
 */
export type WatchErrorHandler = (error: FirestoreError) => void;

/**
 * A dropped listener is invisible without this. `onSnapshot`'s third
 * argument is the only way to learn that a subscription died — omit it and a
 * permission-denied or network failure leaves the screen stuck on its
 * initial empty state forever, with nothing in the logs either.
 *
 * Always reported to Sentry (plan-eng-review Faz 2.2), unlike
 * `data/errors.ts`'s selective capture — a dropped subscription is never
 * expected business behavior the way "yeterli kredin yok" is, so there's no
 * "trusted, skip it" case here.
 */
function report(context: string, error: FirestoreError, onError?: WatchErrorHandler) {
  console.warn(`[firestore] ${context} aboneliği düştü: ${error.code} — ${error.message}`);
  Sentry.captureException(error, { tags: { watchContext: context } });
  onError?.(error);
}

/** Subscribe to a query, mapping each snapshot before handing it to the screen. */
export function watchQuery<T>(
  context: string,
  query: Query,
  map: (snapshot: QuerySnapshot) => T,
  onChange: (value: T) => void,
  onError?: WatchErrorHandler,
) {
  return onSnapshot(
    query,
    (snapshot) => onChange(map(snapshot)),
    (error) => report(context, error, onError),
  );
}

/** Subscribe to a single document. */
export function watchDoc<T>(
  context: string,
  ref: DocumentReference,
  map: (snapshot: DocumentSnapshot) => T,
  onChange: (value: T) => void,
  onError?: WatchErrorHandler,
) {
  return onSnapshot(
    ref,
    (snapshot) => onChange(map(snapshot)),
    (error) => report(context, error, onError),
  );
}

/**
 * A document listener that only reports ANSWERS.
 *
 * Offline and with nothing cached, a document listener still fires once with
 * `exists() === false, fromCache === true`. On React Native that is every cold
 * start without signal, because the JS SDK's cache lives in memory. It is the
 * absence of an answer, not "the document does not exist"; forwarded as `null`
 * it made AuthProvider drop the membership and write that null over the
 * on-disk card (DEN-2, pinned by `firestoreOffline.contract.test.ts`).
 *
 * So `onChange(null)` here means the SERVER says the document is gone. A
 * cache-only miss is dropped, and a document that exists is forwarded even
 * when it comes from the cache. Use this, not `watchDoc`, for a document the
 * app already holds a cached copy of and would otherwise overwrite.
 */
export function watchConfirmedDoc<T>(
  context: string,
  ref: DocumentReference,
  map: (snapshot: DocumentSnapshot) => T,
  onChange: (value: T | null) => void,
  onError?: WatchErrorHandler,
) {
  return onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.exists()) onChange(map(snapshot));
      else if (!snapshot.metadata.fromCache) onChange(null);
    },
    (error) => report(context, error, onError),
  );
}
