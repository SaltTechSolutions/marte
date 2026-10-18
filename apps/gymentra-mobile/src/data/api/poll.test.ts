import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listeners: ((s: string) => void)[] = [];
const state = { current: 'active' };
vi.mock('react-native', () => ({
  AppState: {
    get currentState() { return state.current; },
    addEventListener: (_: string, fn: (s: string) => void) => { listeners.push(fn); return { remove: () => listeners.splice(listeners.indexOf(fn), 1) }; },
  },
}));

const { pollWatch, invalidate, stopAllPollers } = await import('./poll');

beforeEach(() => { vi.useFakeTimers(); state.current = 'active'; listeners.length = 0; });
afterEach(() => vi.useRealTimers());

describe('pollWatch', () => {
  it('forwards a value, skips identical payloads, forwards changes', async () => {
    let v = { n: 1 };
    const onChange = vi.fn();
    const stop = pollWatch('k', async () => v, onChange, undefined, { intervalMs: 1000, jitter: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    v = { n: 2 };
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('reports an error once per streak, backs off, and recovers', async () => {
    let fail = true;
    const onError = vi.fn(); const onChange = vi.fn();
    const stop = pollWatch('k', async () => { if (fail) throw new Error('x'); return 1; }, onChange, onError, { intervalMs: 1000, jitter: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);   // 1st retry after interval*2
    await vi.advanceTimersByTimeAsync(4000);
    expect(onError).toHaveBeenCalledTimes(1);
    fail = false;
    await vi.advanceTimersByTimeAsync(8000);
    expect(onChange).toHaveBeenCalledWith(1);
    stop();
  });

  it('does not poll while the app is hidden, refreshes on foreground, and invalidate(prefix) refreshes matches only', async () => {
    const a = vi.fn(async () => Date.now()); const b = vi.fn(async () => Date.now());
    const stopA = pollWatch('tenant:1:members', a, vi.fn(), undefined, { intervalMs: 60_000, jitter: 0 });
    const stopB = pollWatch('tenant:2:members', b, vi.fn(), undefined, { intervalMs: 60_000, jitter: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
    invalidate('tenant:1');
    await vi.advanceTimersByTimeAsync(0);
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([2, 1]);
    state.current = 'background';
    await vi.advanceTimersByTimeAsync(120_000);
    expect(a.mock.calls.length).toBe(2);       // hidden: nothing
    state.current = 'active';
    listeners.forEach((l) => l('active'));
    await vi.advanceTimersByTimeAsync(0);
    expect(a.mock.calls.length).toBe(3);
    stopA(); stopB();
  });

  it('stop() ends polling and detaches the listener', async () => {
    const f = vi.fn(async () => 1);
    const stop = pollWatch('k', f, vi.fn(), undefined, { intervalMs: 1000, jitter: 0 });
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
  });

  it('stopAllPollers() ends every poller at once (sign-out)', async () => {
    const f = vi.fn(async () => 1);
    pollWatch('a', f, vi.fn(), undefined, { intervalMs: 1000, jitter: 0 });
    pollWatch('b', f, vi.fn(), undefined, { intervalMs: 1000, jitter: 0 });
    await vi.advanceTimersByTimeAsync(0);
    stopAllPollers();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f).toHaveBeenCalledTimes(2);
    expect(listeners).toHaveLength(0);
  });
});
