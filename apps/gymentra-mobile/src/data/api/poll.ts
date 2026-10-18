import { AppState } from 'react-native';

/**
 * "Live" data without sockets: poll, plus refresh on foreground and on explicit invalidation (a push
 * signal or the app's own write). Decision of 15 Oct 2026 (docs/CLOUDFLARE-GECIS.md): polling + push signal,
 * no WebSocket / Durable Object.
 *
 *  - an unchanged payload is NOT forwarded (screens do not re-render for nothing);
 *  - errors back off exponentially (capped) and are reported once per streak; the next success resets;
 *  - `invalidate(prefix)` refreshes every active poller whose key starts with the prefix;
 *  - a hidden app (AppState != active) does not poll; coming back refreshes immediately.
 */
export interface PollOptions {
  intervalMs?: number;
  /** 0..1 fraction of the interval randomised so devices do not poll in lockstep. */
  jitter?: number;
}

const DEFAULT_INTERVAL = 30_000;
const MAX_BACKOFF = 5 * 60_000;

interface Poller { key: string; refresh: () => void }
const active = new Set<Poller>();

export function invalidate(prefix = ''): void {
  active.forEach((p) => p.key.startsWith(prefix) && p.refresh());
}

export function pollWatch<T>(
  key: string,
  fetcher: () => Promise<T>,
  onChange: (value: T) => void,
  onError?: (error: unknown) => void,
  options: PollOptions = {},
): () => void {
  const interval = options.intervalMs ?? DEFAULT_INTERVAL;
  const jitter = options.jitter ?? 0.2;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: string | undefined;
  let failures = 0;
  let inFlight = false;
  let dirty = false;

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, ms);
  };
  const nextDelay = () =>
    failures > 0 ? Math.min(interval * 2 ** failures, MAX_BACKOFF) : interval * (1 + (Math.random() * 2 - 1) * jitter);

  async function tick() {
    if (stopped) return;
    if (AppState.currentState !== 'active') return schedule(interval);   // hidden: skip, check again later
    if (inFlight) { dirty = true; return; }
    inFlight = true;
    try {
      const value = await fetcher();
      if (stopped) return;
      failures = 0;
      const serialised = JSON.stringify(value);
      if (serialised !== last) {
        last = serialised;
        onChange(value);
      }
    } catch (e) {
      if (stopped) return;
      if (failures === 0) onError?.(e);          // once per streak
      failures += 1;
    } finally {
      inFlight = false;
      if (!stopped) {
        if (dirty) { dirty = false; schedule(0); } else schedule(nextDelay());
      }
    }
  }

  const poller: Poller = { key, refresh: () => schedule(0) };
  active.add(poller);
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') poller.refresh(); });
  schedule(0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    active.delete(poller);
    sub.remove();
  };
}
