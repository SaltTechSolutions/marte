import type { WatchErrorHandler } from '../firebase/watch';
import { pollWatch, type PollOptions } from './poll';

/**
 * `pollWatch` with the Firebase repos' error-callback type, so a repo function keeps the exact `watch*`
 * signature (`onError?: WatchErrorHandler`) that `typeof fb` demands. The type is only imported (erased),
 * so this file does not load Firebase.
 */
export function watchPoll<T>(
  key: string,
  fetcher: () => Promise<T>,
  onChange: (value: T) => void,
  onError?: WatchErrorHandler,
  options?: PollOptions,
): () => void {
  return pollWatch(key, fetcher, onChange, onError as ((e: unknown) => void) | undefined, options);
}

/** Roles, suspension and revocation should show quickly; the write path invalidates, this is the floor. */
export const FAST_POLL: PollOptions = { intervalMs: 20_000 };
