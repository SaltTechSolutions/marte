/** Test-only helpers shared by the package / promotion / payment repo tests. */

/** Subscribes to a `watch*`-style function and resolves with its next value (or rejects with its error), then unsubscribes. */
export function nextValue<T>(
  subscribe: (onChange: (value: T) => void, onError: (error: unknown) => void) => () => void,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let stop: () => void = () => {};
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stop();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('nextValue: timed out'))), timeoutMs);
    stop = subscribe(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
    if (done) stop();   // the callback fired synchronously, before `stop` was assigned
  });
}

/** Keeps a live subscription and lets a test await its Nth delivery. */
export function collect<T>(subscribe: (onChange: (value: T) => void, onError: (error: unknown) => void) => () => void) {
  const values: T[] = [];
  const waiters: { n: number; resolve: () => void }[] = [];
  const stop = subscribe(
    (v) => {
      values.push(v);
      waiters.filter((w) => values.length >= w.n).forEach((w) => w.resolve());
    },
    () => {},
  );
  return {
    values,
    stop,
    /** Resolves once `n` values have been delivered (rejects after `timeoutMs`). */
    until: (n: number, timeoutMs = 4000) =>
      values.length >= n
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`collect: only ${values.length}/${n} values after ${timeoutMs}ms`)), timeoutMs);
            waiters.push({ n, resolve: () => { clearTimeout(t); resolve(); } });
          }),
  };
}
