import { describe, expect, it, vi } from 'vitest';

/**
 * Firestore JS SDK'nın çevrimdışı davranışı: DEN-2'nin dayandığı üç varsayım.
 *
 * Gerçek SDK ile, ağ HİÇ açılmadan çalışır (sahte proje kimliği, ilk okumadan
 * önce `disableNetwork`). Kod bu davranışlara göre yazıldı; Firebase
 * yükseltmesi biri değişirse burası kırılır ve `getActiveMemberships` /
 * `watchMembership` yeniden düşünülür. Kurulu sürümde (firestore 4.16.0)
 * 20 Eylül 2026'da elle de doğrulandı.
 *
 * `vitest.setup.mts` bu modülleri sahte bir yığınla değiştiriyor; burada
 * gerçekleri isteniyor.
 */
const app = await vi.importActual<typeof import('firebase/app')>('firebase/app');
const fs = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');

async function offlineDb() {
  const db = fs.initializeFirestore(app.initializeApp({ apiKey: 'fake', projectId: 'demo-offline-contract', appId: 'x' }, 'offline-contract'), {});
  await fs.disableNetwork(db);
  return db;
}

describe('Firestore çevrimdışıyken (önbellek boş)', () => {
  it('getDocs hata atmaz: boş ve fromCache bir sonuçla çözülür', async () => {
    const db = await offlineDb();
    const q = fs.query(fs.collection(db, 'tenant_memberships'), fs.where('userId', '==', 'u1'));
    const snap = await fs.getDocs(q);
    expect(snap.empty).toBe(true);
    expect(snap.metadata.fromCache).toBe(true);
    await fs.terminate(db);
  }, 15000);

  it('getDocsFromServer "unavailable" ile reddeder', async () => {
    const db = await offlineDb();
    const q = fs.query(fs.collection(db, 'tenant_memberships'), fs.where('userId', '==', 'u1'));
    await expect(fs.getDocsFromServer(q)).rejects.toMatchObject({ code: 'unavailable' });
    await fs.terminate(db);
  }, 15000);

  it('belge dinleyicisi exists=false ve fromCache=true olayı verir', async () => {
    const db = await offlineDb();
    const snap = await new Promise<import('firebase/firestore').DocumentSnapshot>((resolve, reject) => {
      const stop = fs.onSnapshot(
        fs.doc(db, 'tenant_memberships', 't1_u1'),
        (s) => {
          stop();
          resolve(s);
        },
        reject,
      );
    });
    expect(snap.exists()).toBe(false);
    expect(snap.metadata.fromCache).toBe(true);
    await fs.terminate(db);
  }, 15000);
});
