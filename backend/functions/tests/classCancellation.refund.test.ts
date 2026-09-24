import * as admin from 'firebase-admin';
import { beforeEach, describe, expect, it } from 'vitest';

import { refundCancelledClass } from '../src/classCancellation';
import { clearFirestore, timestampDaysFromNow } from './helpers';

const TENANT = 't1';
const CLASS_ID = 'class-1';

async function seedCredit(id: string, memberId: string, overrides: Record<string, unknown> = {}) {
  await admin
    .firestore()
    .doc(`member_credits/${id}`)
    .set({
      tenantId: TENANT,
      memberId,
      kind: 'groupClass',
      source: 'purchase',
      total: 8,
      used: 3,
      status: 'active',
      expiresAt: timestampDaysFromNow(30),
      ...overrides,
    });
}

/** The data of a `classes` doc as it was the moment before staff deleted it. */
function deletedClass(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    name: 'Pilates',
    date: timestampDaysFromNow(2),
    durationMinutes: 60,
    capacity: 10,
    bookedUserIds: ['m1', 'm2'],
    waitlistUserIds: [],
    bookingCredits: { m1: 'credit-m1', m2: 'credit-m2' },
    ...overrides,
  };
}

const used = async (id: string) => (await admin.firestore().doc(`member_credits/${id}`).get()).data()?.used;
const marker = async (memberId: string) =>
  (await admin.firestore().doc(`class_cancellation_refunds/${CLASS_ID}_${memberId}`).get()).data();

describe('refundCancelledClass (DEN-8 / CX-03)', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('salonun iptal ettiği derste rezerve eden herkesin kotalı hakkını iade eder', async () => {
    await seedCredit('credit-m1', 'm1', { used: 3 });
    await seedCredit('credit-m2', 'm2', { used: 5 });

    const result = await refundCancelledClass(CLASS_ID, deletedClass());

    expect(result).toMatchObject({ refunded: 2, failed: 0 });
    expect(await used('credit-m1')).toBe(2);
    expect(await used('credit-m2')).toBe(4);
  });

  it('iade kaydı bırakır: hangi ders, hangi üye, hangi kredi, sonuç', async () => {
    await seedCredit('credit-m1', 'm1');

    await refundCancelledClass(CLASS_ID, deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-m1' } }));

    expect(await marker('m1')).toMatchObject({
      tenantId: TENANT,
      classId: CLASS_ID,
      className: 'Pilates',
      memberId: 'm1',
      creditId: 'credit-m1',
      outcome: 'refunded',
    });
  });

  it('tükenmiş (exhausted) krediyi yeniden aktif yapar', async () => {
    await seedCredit('credit-m1', 'm1', { total: 8, used: 8, status: 'exhausted' });

    await refundCancelledClass(CLASS_ID, deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-m1' } }));

    const credit = (await admin.firestore().doc('member_credits/credit-m1').get()).data();
    expect(credit).toMatchObject({ used: 7, status: 'active' });
  });

  it('aynı iptal tekrar işlenirse (tetikleyici en az bir kez çalışır) ikinci kez iade etmez', async () => {
    await seedCredit('credit-m1', 'm1', { used: 3 });
    const klass = deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-m1' } });

    await refundCancelledClass(CLASS_ID, klass);
    const second = await refundCancelledClass(CLASS_ID, klass);

    expect(await used('credit-m1')).toBe(2);
    expect(second).toMatchObject({ refunded: 0, skipped: 1 });
  });

  it('eşzamanlı iki işleme de tek iade üretir', async () => {
    await seedCredit('credit-m1', 'm1', { used: 3 });
    const klass = deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-m1' } });

    await Promise.all([refundCancelledClass(CLASS_ID, klass), refundCancelledClass(CLASS_ID, klass)]);

    expect(await used('credit-m1')).toBe(2);
  });

  it('başlamış ya da geçmiş dersi iade etmez: ders yapıldı, hak kullanıldı', async () => {
    await seedCredit('credit-m1', 'm1', { used: 3 });
    const started = admin.firestore.Timestamp.fromMillis(Date.now() - 60_000);

    const result = await refundCancelledClass(
      CLASS_ID,
      deletedClass({ date: started, bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-m1' } }),
    );

    expect(result).toMatchObject({ refunded: 0 });
    expect(await used('credit-m1')).toBe(3);
    expect(await marker('m1')).toBeUndefined();
  });

  it('dersten kendi çıkan üyeyi iade etmez: bookingCredits kalıntısı, bookedUserIds\'te yok', async () => {
    // Üye kuralla kendini bookedUserIds'ten çıkarabiliyor ve haritadaki kayıt
    // kalıyor; o kişi dersi kendisi bıraktı, salon iptali onun hakkını doğurmaz.
    await seedCredit('credit-m1', 'm1', { used: 3 });

    const result = await refundCancelledClass(
      CLASS_ID,
      deletedClass({ bookedUserIds: [], bookingCredits: { m1: 'credit-m1' } }),
    );

    expect(result).toMatchObject({ refunded: 0 });
    expect(await used('credit-m1')).toBe(3);
  });

  it('bekleme listesindekine ve sınırsız hakla rezerve edene (kredi kaydı yok) dokunmaz', async () => {
    await seedCredit('credit-m1', 'm1', { used: 3 });
    const result = await refundCancelledClass(
      CLASS_ID,
      deletedClass({
        bookedUserIds: ['m1', 'unlimited-member'],
        waitlistUserIds: ['waiting-member'],
        bookingCredits: { m1: 'credit-m1' },
      }),
    );

    expect(result).toMatchObject({ refunded: 1 });
    expect(await marker('waiting-member')).toBeUndefined();
    expect(await marker('unlimited-member')).toBeUndefined();
  });

  it('başka üyenin ya da başka salonun kredisini iade etmez (sahte bookingCredits)', async () => {
    // Personel ders belgesine istediği kimliği yazabilir; iade yalnızca o üyenin,
    // aynı salondaki, grup dersi kredisine gider.
    await seedCredit('credit-other', 'someone-else', { used: 3 });
    await seedCredit('credit-foreign', 'm1', { used: 3, tenantId: 'other-tenant' });
    await seedCredit('credit-pt', 'm1', { used: 3, kind: 'ptLesson' });

    await refundCancelledClass(
      CLASS_ID,
      deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-other' } }),
    );
    expect(await used('credit-other')).toBe(3);
    expect((await marker('m1'))?.outcome).toBe('credit-mismatch');

    await clearMarkers();
    await refundCancelledClass(
      CLASS_ID,
      deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-foreign' } }),
    );
    expect(await used('credit-foreign')).toBe(3);

    await clearMarkers();
    await refundCancelledClass(CLASS_ID, deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-pt' } }));
    expect(await used('credit-pt')).toBe(3);
  });

  it('silinmiş krediyle hata vermez, kayda "credit-missing" yazar', async () => {
    const result = await refundCancelledClass(
      CLASS_ID,
      deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-yok' } }),
    );

    expect(result).toMatchObject({ refunded: 0, failed: 0 });
    expect((await marker('m1'))?.outcome).toBe('credit-missing');
  });

  it('hiç harcanmamış krediyi negatife düşürmez', async () => {
    await seedCredit('credit-m1', 'm1', { used: 0 });

    await refundCancelledClass(CLASS_ID, deletedClass({ bookedUserIds: ['m1'], bookingCredits: { m1: 'credit-m1' } }));

    expect(await used('credit-m1')).toBe(0);
    expect((await marker('m1'))?.outcome).toBe('nothing-to-refund');
  });

  it('kaydı olmayan (bookingCredits yok) eski ders belgesinde hata vermez', async () => {
    const klass = deletedClass();
    delete (klass as Record<string, unknown>).bookingCredits;
    await expect(refundCancelledClass(CLASS_ID, klass)).resolves.toMatchObject({ refunded: 0, failed: 0 });
  });
});

async function clearMarkers() {
  const snap = await admin.firestore().collection('class_cancellation_refunds').get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}
