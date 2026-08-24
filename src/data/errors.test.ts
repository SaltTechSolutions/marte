import { describe, expect, it, vi } from 'vitest';

import { errorMessage, reportError } from './errors';

const FALLBACK = 'Genel hata mesajı.';

describe('reportError / errorMessage', () => {
  it.each(['functions/failed-precondition', 'functions/invalid-argument', 'functions/permission-denied', 'functions/not-found', 'functions/unauthenticated'])(
    'surfaces the server message for %s',
    (code) => {
      const e = { code, message: 'Yeterli ders kredin yok — 2 kaldı, 3 gerekiyor.' };
      expect(errorMessage(e, FALLBACK)).toBe('Yeterli ders kredin yok — 2 kaldı, 3 gerekiyor.');
    },
  );

  it(
    // The one HttpsError('internal', ...) call site in functions/src carries
    // an English debug string never meant for a user — this must never surface.
    'falls back for functions/internal even though it has a message',
    () => {
      const e = { code: 'functions/internal', message: 'Failed to set admin claim.' };
      expect(errorMessage(e, FALLBACK)).toBe(FALLBACK);
    },
  );

  it('falls back for a raw Firestore SDK error (not one of our callables)', () => {
    const e = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
    expect(errorMessage(e, FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for a plain thrown Error with no code', () => {
    expect(errorMessage(new Error('network request failed'), FALLBACK)).toBe(FALLBACK);
  });

  it('falls back for non-object throws', () => {
    expect(errorMessage('boom', FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it('reportError calls sink.error with the resolved message', () => {
    const sink = { error: vi.fn() };
    reportError({ code: 'functions/failed-precondition', message: 'Bu antrenör artık salonda çalışmıyor.' }, sink, FALLBACK);
    expect(sink.error).toHaveBeenCalledWith('Bu antrenör artık salonda çalışmıyor.');

    reportError(new Error('boom'), sink, FALLBACK);
    expect(sink.error).toHaveBeenCalledWith(FALLBACK);
  });
});
