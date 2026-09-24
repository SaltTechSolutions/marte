import { beforeEach, describe, expect, it, vi } from 'vitest';

const { onSnapshot } = vi.hoisted(() => ({ onSnapshot: vi.fn() }));

vi.mock('firebase/firestore', () => ({ onSnapshot }));

const { watchConfirmedDoc } = await import('./watch');

type Snap = { exists: () => boolean; metadata: { fromCache: boolean }; data?: () => unknown };

/** Runs `watchConfirmedDoc` and hands back the callbacks Firestore would call. */
function watch() {
  const onChange = vi.fn();
  const onError = vi.fn();
  const map = vi.fn((snap: unknown) => ({ mapped: (snap as { id: string }).id }));
  const unsubscribe = watchConfirmedDoc('Deneme', {} as never, map as never, onChange, onError);
  const [, next, error] = onSnapshot.mock.calls[0] as [unknown, (s: Snap) => void, (e: unknown) => void];
  return { onChange, onError, map, feed: next, fail: error, unsubscribe };
}

beforeEach(() => {
  onSnapshot.mockReset();
  onSnapshot.mockReturnValue(() => {});
});

describe('watchConfirmedDoc', () => {
  it('var olan belgeyi eşleyip iletir, önbellekten de gelse', () => {
    const { onChange, map, feed } = watch();
    feed({ id: 'a', exists: () => true, metadata: { fromCache: true } } as unknown as Snap);
    expect(map).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ mapped: 'a' });
  });

  it('önbellekten gelen "belge yok"u iletmez ve eşleyiciyi çağırmaz', () => {
    // Çevrimdışı ve önbellek boşken belge dinleyicisi exists=false, fromCache=true
    // olayı verir (sözleşme testi). Bu bir cevap değil, cevabın yokluğu (DEN-2, DEN-3).
    const { onChange, map, feed } = watch();
    feed({ exists: () => false, metadata: { fromCache: true } });
    expect(onChange).not.toHaveBeenCalled();
    expect(map).not.toHaveBeenCalled();
  });

  it('sunucunun doğruladığı "belge yok"u null olarak iletir', () => {
    const { onChange, feed } = watch();
    feed({ exists: () => false, metadata: { fromCache: false } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('abonelik hatasını onError\'a iletir', () => {
    const { onError, fail } = watch();
    fail({ code: 'permission-denied', message: 'x' });
    expect(onError).toHaveBeenCalledWith({ code: 'permission-denied', message: 'x' });
  });

  it('Firestore\'un abonelik iptal fonksiyonunu döndürür', () => {
    const stop = vi.fn();
    onSnapshot.mockReturnValue(stop);
    const { unsubscribe } = watch();
    unsubscribe();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
