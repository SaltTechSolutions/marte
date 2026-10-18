import type { WatchErrorHandler } from '../firebase/watch';
import { pollWatch } from './poll';

/**
 * `pollWatch` with the Firebase repos' error-callback type, so a repo function keeps the exact `watch*`
 * signature (`onError?: WatchErrorHandler`) the screens and `typeof fb` expect. The type is only
 * imported, never executed, so this file does not load Firebase.
 */
export function watchPoll<T>(
  key: string,
  fetcher: () => Promise<T>,
  onChange: (value: T) => void,
  onError?: WatchErrorHandler,
): () => void {
  return pollWatch(key, fetcher, onChange, onError as ((e: unknown) => void) | undefined);
}

/**
 * A `watch*` whose data the Worker cannot serve yet. It must not hand the screen an empty list as if the
 * data were empty: the screen's error callback gets a clear Error (and the function returns a no-op
 * unsubscribe); with no callback it throws, which is loud on purpose.
 */
export function unavailableWatch(what: string, onError?: WatchErrorHandler): () => void {
  const error = new Error(`GAP(api): ${what}`);
  if (!onError) throw error;
  onError(error as never);
  return () => {};
}
