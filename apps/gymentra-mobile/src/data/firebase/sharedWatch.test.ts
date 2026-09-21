import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetSharedWatches, sharedWatch } from './sharedWatch';

/**
 * A stand-in for a Firestore listener: records every `start`, lets the test
 * push values and errors into it, and counts `stop`s.
 */
function fakeSource() {
  const starts: { push: (v: string) => void; fail: (e: unknown) => void; stop: ReturnType<typeof vi.fn> }[] = [];
  const start = (onChange: (v: string) => void, onError: (e: never) => void) => {
    const stop = vi.fn();
    starts.push({ push: onChange, fail: onError as (e: unknown) => void, stop });
    return stop;
  };
  return { starts, start };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  resetSharedWatches();
  vi.useRealTimers();
});

describe('sharedWatch', () => {
  it('iki abone tek dinleyiciyi paylaşır', () => {
    const { starts, start } = fakeSource();
    const a = vi.fn();
    const b = vi.fn();
    sharedWatch('k', start, a);
    sharedWatch('k', start, b);

    expect(starts).toHaveLength(1);
    starts[0].push('x');
    expect(a).toHaveBeenCalledWith('x');
    expect(b).toHaveBeenCalledWith('x');
  });

  it('geç katılana son değeri tekrar oynatır', () => {
    const { starts, start } = fakeSource();
    sharedWatch('k', start, vi.fn());
    starts[0].push('son');

    const late = vi.fn();
    sharedWatch('k', start, late);
    expect(late).toHaveBeenCalledWith('son');
    expect(starts).toHaveLength(1);
  });

  it('DEN-13: hata veren dinleyiciye "Tekrar dene" yeni bir dinleyici başlatır', () => {
    // Firestore, hata veren bir dinleyiciyi bitirir. Eskiden kayıt ölü kalıyor,
    // yeniden abone olan (ekranın "Tekrar dene"si) ona bağlanıp aynı hatayı
    // alıyordu; yeniden deneme hiçbir zaman toparlayamıyordu.
    const { starts, start } = fakeSource();
    const onError = vi.fn();
    const first = sharedWatch('k', start, vi.fn(), onError);
    starts[0].fail({ code: 'unavailable' });
    expect(onError).toHaveBeenCalledTimes(1);

    first(); // ekran hata kutusunu gösterirken aboneliği bırakır ve...
    const onChange = vi.fn();
    sharedWatch('k', start, onChange, onError); // ...tekrar dene ile yeniden abone olur

    expect(starts).toHaveLength(2);
    starts[1].push('toparlandı');
    expect(onChange).toHaveBeenCalledWith('toparlandı');
  });

  it('ölü dinleyici yeniden başlatılırken durdurulur', () => {
    const { starts, start } = fakeSource();
    sharedWatch('k', start, vi.fn(), vi.fn());
    starts[0].fail({ code: 'permission-denied' });

    sharedWatch('k', start, vi.fn(), vi.fn());
    expect(starts[0].stop).toHaveBeenCalledTimes(1);
  });

  it('hata sırasında bağlı kalan diğer ekranlar yeni dinleyiciden değer alır', () => {
    const { starts, start } = fakeSource();
    const stayer = vi.fn();
    sharedWatch('k', start, stayer, vi.fn());
    starts[0].fail({ code: 'unavailable' });

    sharedWatch('k', start, vi.fn(), vi.fn()); // başka bir ekran yeniden dener
    starts[1].push('yeni');

    expect(stayer).toHaveBeenCalledWith('yeni');
  });

  it('start içinde eşzamanlı gelen hata da dinleyiciyi ölü işaretler', () => {
    const stops: ReturnType<typeof vi.fn>[] = [];
    let calls = 0;
    const start = (_c: (v: string) => void, onError: (e: never) => void) => {
      calls += 1;
      (onError as (e: unknown) => void)({ code: 'unavailable' }); // start dönmeden hata
      const stop = vi.fn();
      stops.push(stop);
      return stop;
    };

    sharedWatch('k', start, vi.fn(), vi.fn());
    sharedWatch('k', start, vi.fn(), vi.fn());
    expect(calls).toBe(2);
  });

  it('sağlıklı dinleyiciyi yeniden başlatmaz', () => {
    const { starts, start } = fakeSource();
    sharedWatch('k', start, vi.fn(), vi.fn());
    starts[0].push('x');
    sharedWatch('k', start, vi.fn(), vi.fn());
    expect(starts).toHaveLength(1);
  });

  it('son abone çıkınca 5 sn sonra dinleyiciyi durdurur, arada dönen olursa durdurmaz', () => {
    const { starts, start } = fakeSource();
    const off = sharedWatch('k', start, vi.fn());
    off();
    vi.advanceTimersByTime(4000);
    sharedWatch('k', start, vi.fn()); // ekranlar arası geçiş: aynı dinleyiciyi geri alır
    vi.advanceTimersByTime(10_000);
    expect(starts).toHaveLength(1);
    expect(starts[0].stop).not.toHaveBeenCalled();
  });
});
