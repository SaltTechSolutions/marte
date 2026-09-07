import { WatchErrorHandler } from './watch';

/**
 * Reference-counted sharing for live queries.
 *
 * Several screens legitimately need the same data — the trainer's Üyeler,
 * Takvim and Profil tabs all watch the gym's member list, and tab screens
 * stay mounted — so without this the app opens three identical listeners and
 * pays for the same documents three times, on every change.
 *
 * Callers see no difference: `watch*` repo functions still take a callback
 * and return an unsubscribe. Underneath, the first caller for a given key
 * opens the real listener and the rest attach to it.
 */

/** Keeps a listener alive briefly after the last screen unmounts, so moving
 * between two tabs that share data doesn't tear down and immediately
 * re-establish the same query. */
const TEARDOWN_GRACE_MS = 5000;

interface Entry {
  subscribers: Set<(value: never) => void>;
  errorHandlers: Set<WatchErrorHandler>;
  stop?: () => void;
  /** Last value seen, replayed to late joiners so they don't flash empty. */
  last?: unknown;
  hasValue: boolean;
  /** Last error seen, replayed to late joiners. A listener that has failed
   *  never produces a value, so without this a screen mounting after the
   *  failure would sit in its loading state forever: it neither starts its
   *  own listener (one already exists) nor receives anything from this one. */
  lastError?: unknown;
  teardown?: ReturnType<typeof setTimeout>;
}

const registry = new Map<string, Entry>();

export function sharedWatch<T>(
  key: string,
  start: (onChange: (value: T) => void, onError: WatchErrorHandler) => () => void,
  onChange: (value: T) => void,
  onError?: WatchErrorHandler,
): () => void {
  let entry = registry.get(key);

  if (!entry) {
    entry = { subscribers: new Set(), errorHandlers: new Set(), hasValue: false };
    registry.set(key, entry);
  }

  // A pending teardown means this key was released moments ago; reclaim it
  // instead of letting the timer kill a listener we are about to use.
  if (entry.teardown) {
    clearTimeout(entry.teardown);
    entry.teardown = undefined;
  }

  const current = entry;
  current.subscribers.add(onChange as (value: never) => void);
  if (onError) current.errorHandlers.add(onError);

  if (!current.stop) {
    current.stop = start(
      (value) => {
        current.last = value;
        current.hasValue = true;
        current.lastError = undefined;
        current.subscribers.forEach((fn) => (fn as (v: T) => void)(value));
      },
      (error) => {
        current.lastError = error;
        current.errorHandlers.forEach((fn) => fn(error));
      },
    );
  } else if (current.hasValue) {
    onChange(current.last as T);
  } else if (current.lastError !== undefined) {
    onError?.(current.lastError as Parameters<WatchErrorHandler>[0]);
  }

  return () => {
    current.subscribers.delete(onChange as (value: never) => void);
    if (onError) current.errorHandlers.delete(onError);
    if (current.subscribers.size > 0) return;

    current.teardown = setTimeout(() => {
      // Re-check: a new subscriber may have arrived while the timer ran.
      if (current.subscribers.size > 0) return;
      current.stop?.();
      registry.delete(key);
    }, TEARDOWN_GRACE_MS);
  };
}

/** Drops every shared listener — used on sign-out so the next account never
 * sees the previous one's cached rows. */
export function resetSharedWatches(): void {
  registry.forEach((entry) => {
    if (entry.teardown) clearTimeout(entry.teardown);
    entry.stop?.();
  });
  registry.clear();
}
