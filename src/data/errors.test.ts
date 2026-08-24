import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/react-native', () => ({ captureException: (...args: unknown[]) => captureException(...args) }));

const { errorMessage, reportError } = await import('./errors');

const FALLBACK = 'Genel hata mesajı.';

beforeEach(() => {
  captureException.mockReset();
});

describe('reportError / errorMessage', () => {
  it.each(['functions/failed-precondition', 'functions/invalid-argument', 'functions/permission-denied', 'functions/not-found', 'functions/unauthenticated'])(
    'surfaces the server message for %s',
    (code) => {
      const e = { code, message: 'Yeterli ders kredin yok — 2 kaldı, 3 gerekiyor.' };
      expect(errorMessage(e, FALLBACK)).toBe('Yeterli ders kredin yok — 2 kaldı, 3 gerekiyor.');
      // Expected business-rule output, not a bug — must not spend the free
      // tier's event budget on normal "insufficient credit" outcomes.
      expect(captureException).not.toHaveBeenCalled();
    },
  );

  it(
    // The one HttpsError('internal', ...) call site in functions/src carries
    // an English debug string never meant for a user — this must never surface.
    'falls back for functions/internal even though it has a message',
    () => {
      const e = { code: 'functions/internal', message: 'Failed to set admin claim.' };
      expect(errorMessage(e, FALLBACK)).toBe(FALLBACK);
      // Untrusted (not a deliberate business-rule message) — this IS
      // reported, unlike the trusted cases above.
      expect(captureException).toHaveBeenCalledWith(e);
    },
  );

  it('falls back for a raw Firestore SDK error (not one of our callables) and reports it', () => {
    const e = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    expect(errorMessage(e, FALLBACK)).toBe(FALLBACK);
    expect(captureException).toHaveBeenCalledWith(e);
  });

  it('falls back for a plain thrown Error with no code and reports it', () => {
    const e = new Error('network request failed');
    expect(errorMessage(e, FALLBACK)).toBe(FALLBACK);
    expect(captureException).toHaveBeenCalledWith(e);
  });

  it('falls back for non-object throws and reports them', () => {
    expect(errorMessage('boom', FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(captureException).toHaveBeenCalledWith('boom');
    expect(captureException).toHaveBeenCalledWith(undefined);
  });

  it('reportError calls sink.error with the resolved message and reports only the untrusted case', () => {
    const sink = { error: vi.fn() };
    reportError({ code: 'functions/failed-precondition', message: 'Bu antrenör artık salonda çalışmıyor.' }, sink, FALLBACK);
    expect(sink.error).toHaveBeenCalledWith('Bu antrenör artık salonda çalışmıyor.');
    expect(captureException).not.toHaveBeenCalled();

    const networkError = new Error('boom');
    reportError(networkError, sink, FALLBACK);
    expect(sink.error).toHaveBeenCalledWith(FALLBACK);
    expect(captureException).toHaveBeenCalledWith(networkError);
  });
});
