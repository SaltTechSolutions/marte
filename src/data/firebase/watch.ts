import {
  DocumentReference,
  DocumentSnapshot,
  FirestoreError,
  onSnapshot,
  Query,
  QuerySnapshot,
} from 'firebase/firestore';

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
 */
function report(context: string, error: FirestoreError, onError?: WatchErrorHandler) {
  console.warn(`[firestore] ${context} aboneliği düştü: ${error.code} — ${error.message}`);
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
