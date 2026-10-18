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
