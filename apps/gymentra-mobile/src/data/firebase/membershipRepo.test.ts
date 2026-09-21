import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocs, getDocsFromServer, onSnapshot } = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDocsFromServer: vi.fn(),
  onSnapshot: vi.fn(),
}));

// The shared stub in vitest.setup.mts has fixed no-op exports; this file needs to
// observe which read the repo chose, so it brings its own.
vi.mock('firebase/firestore', () => {
  class Timestamp {}
  return {
    Timestamp,
    collection: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    serverTimestamp: () => ({}),
    deleteField: () => ({}),
    getCountFromServer: () => ({}),
    getDoc: () => ({}),
    setDoc: () => ({}),
    updateDoc: () => ({}),
    getDocs,
    getDocsFromServer,
    onSnapshot,
  };
});

const { getActiveMemberships, watchMembership } = await import('./membershipRepo');

const membershipDoc = (over: Record<string, unknown> = {}) => ({
  id: 't1_u1',
  data: () => ({
    userId: 'u1',
    tenantId: 't1',
    status: 'active',
    roles: ['member'],
    requestedAt: new Date('2026-09-01'),
    ...over,
  }),
});

beforeEach(() => {
  getDocs.mockReset();
  getDocsFromServer.mockReset();
  onSnapshot.mockReset();
});

describe('getActiveMemberships', () => {
  it('DEN-2: sunucudan okur, önbellekten boş sonuç kabul etmez', async () => {
    // getDocs çevrimdışıyken hata atmıyor, boş ve fromCache bir sonuçla çözülüyor
    // (sözleşme testi: firestoreOffline.contract.test.ts). AuthProvider o boşluğu
    // "üyelik yok" sayıp diskteki kartı siliyordu.
    getDocsFromServer.mockResolvedValue({ docs: [membershipDoc()] });
    const result = await getActiveMemberships('u1');
    expect(result.map((m) => m.tenantId)).toEqual(['t1']);
    expect(getDocsFromServer).toHaveBeenCalledTimes(1);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('sunucuya ulaşılamazsa boş liste döndürmez, hatayı iletir', async () => {
    getDocsFromServer.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(getActiveMemberships('u1')).rejects.toMatchObject({ code: 'unavailable' });
  });
});

describe('watchMembership', () => {
  /** Runs `watchMembership` and returns what the screen would have been told, plus the snapshot feeder. */
  function watch() {
    const onChange = vi.fn();
    watchMembership('t1', 'u1', onChange);
    const next = onSnapshot.mock.calls[0][1] as (snap: unknown) => void;
    return { onChange, feed: next };
  }

  it('DEN-2: önbellekten gelen "belge yok" bilgisini iletmez', () => {
    // Çevrimdışıyken önbellekte olmayan belge exists=false, fromCache=true olayı
    // veriyor. Bu bir cevap değil, cevabın yokluğu: iletilince AuthProvider
    // üyeliği null yapıp önbelleğe yazıyordu.
    const { onChange, feed } = watch();
    feed({ exists: () => false, metadata: { fromCache: true } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sunucunun doğruladığı "belge yok" bilgisini iletir (üyelik gerçekten silindi)', () => {
    const { onChange, feed } = watch();
    feed({ exists: () => false, metadata: { fromCache: false } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('var olan üyeliği iletir, önbellekten de gelse', () => {
    const { onChange, feed } = watch();
    feed({ ...membershipDoc(), exists: () => true, metadata: { fromCache: true } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ tenantId: 't1', status: 'active' });
  });
});
