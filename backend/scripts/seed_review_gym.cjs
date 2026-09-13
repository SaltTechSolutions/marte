'use strict';

/**
 * App Review satın alma salonu — ÜCRETSİZ planda, abonelik alanı YOK.
 *
 * Neden ayrı salon: Supergym-88 `grandfathered` abonelikte
 * (`subscription.status: 'active'`) ve paywall aktif abonelikli salonda satın
 * alma seçeneklerini hiç göstermiyor, yalnızca "Aboneliğin aktif" diyor
 * (apps/gymentra-mobile/src/app/paywall.tsx). App Review ilk aboneliği
 * incelerken satın alma akışını görmek zorunda; Supergym'le göremezdi.
 * Supergym'in planını değiştirmek de olmazdı: 20 üyesiyle ücretsiz sınırın
 * üstüne düşer ve tanıtım ekranları (üye onaylama vb.) bozulurdu.
 *
 * Yazdıkları uygulamanın `createTenantWithOwner` akışının AYNISI
 * (apps/gymentra-mobile/src/data/firebase/tenantRepo.ts): tenant dokümanı +
 * sahibinin aktif `admin` üyeliği. `activeMemberCount`/`activeAdminCount`
 * (syncActiveMemberCount) ve `shortCode` (assignMembershipShortCode)
 * tetikleyicilerle gelir; burada elle yazılmaz, yoksa tetikleyiciyle yarışır.
 *
 * Bilerek yazılmayan: varsayılan paket kataloğu (uygulamada da "best-effort",
 * yöneticinin boş katalogla salonu çalışır) ve üye/antrenör. İnceleme için
 * gereken tek şey yöneticinin Salon → GymEntra Pro yoluyla paywall'a
 * ulaşması.
 *
 * RevenueCat `appUserID` olarak tenant kimliğini kullanıyor; sandbox satın
 * alması `revenueCatWebhook` üzerinden BU salonun `subscription` alanına
 * yazar. İnceleme sonrası salon yeniden ücretsize dönsün diye `--reset`
 * yalnızca o alanı siler.
 *
 *   node scripts/seed_review_gym.cjs                  # kuru çalıştırma
 *   node scripts/seed_review_gym.cjs --apply          # yaz
 *   node scripts/seed_review_gym.cjs --reset --apply  # subscription alanını sil (tekrar ücretsiz)
 *   node scripts/seed_review_gym.cjs --purge --apply  # salonu, üyeliği ve hesabı sil
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge');
const RESET = process.argv.includes('--reset');

// Deterministik kimlik: script yeniden çalıştırılabilir, ikinci salon basmaz.
const TENANT_ID = 'review-gym-iap';
const TENANT_CODE = 'INCELEME-10';
const TENANT_NAME = 'İnceleme Salonu';
const OWNER = {
  email: 'yonetici@gymentra-inceleme.test', // RFC 2606 — asla gerçek bir alan adı olamaz
  name: 'Deniz Yönetici',
};
const REVIEW_PASSWORD = 'Inceleme2026!';

initializeApp({ credential: cert(require(path.resolve(__dirname, '../secrets/serviceAccount.json'))) });
const db = getFirestore();
const auth = getAuth();

const tenantRef = db.collection('tenants').doc(TENANT_ID);

async function resolveOwner() {
  try {
    const u = await auth.getUserByEmail(OWNER.email);
    if (APPLY) await auth.updateUser(u.uid, { password: REVIEW_PASSWORD, displayName: OWNER.name });
    return { uid: u.uid, created: false };
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    if (!APPLY) return { uid: 'DRYRUN_owner', created: true };
    const u = await auth.createUser({ email: OWNER.email, password: REVIEW_PASSWORD, displayName: OWNER.name, emailVerified: true });
    return { uid: u.uid, created: true };
  }
}

async function run() {
  console.log('İNCELEME SALONU — ' + (APPLY ? 'YAZILIYOR' : 'KURU ÇALIŞTIRMA (--apply ile yaz)'));
  console.log('Salon: ' + TENANT_ID + ' (' + TENANT_CODE + ')\n');

  // Kod çakışması: uygulama da `CODE_TAKEN` ile reddediyor. Kendi dokümanımız hariç.
  const clash = (await db.collection('tenants').where('code', '==', TENANT_CODE).get()).docs.filter((d) => d.id !== TENANT_ID);
  if (clash.length) throw new Error(TENANT_CODE + ' kodu başka bir salonda kullanılıyor: ' + clash.map((d) => d.id).join(', '));

  const existing = await tenantRef.get();

  if (RESET) {
    const sub = existing.exists ? existing.data().subscription : undefined;
    console.log('Mevcut subscription: ' + (sub ? JSON.stringify(sub) : '(yok — zaten ücretsiz)'));
    if (sub && APPLY) {
      await tenantRef.update({ subscription: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      console.log('subscription alanı silindi — salon yeniden ücretsiz planda.');
    }
    return;
  }

  if (PURGE) {
    let uid = null;
    try { uid = (await auth.getUserByEmail(OWNER.email)).uid; } catch (e) { if (e.code !== 'auth/user-not-found') throw e; }
    const ms = (await db.collection('tenant_memberships').where('tenantId', '==', TENANT_ID).get()).docs;
    console.log('Silinecek: tenant ' + (existing.exists ? '1' : '0') + ', üyelik ' + ms.length + ', auth hesabı ' + (uid ? '1' : '0'));
    if (!APPLY) { console.log('Kuru çalıştırma — hiçbir şey silinmedi.'); return; }
    for (const d of ms) await d.ref.delete();
    await db.recursiveDelete(tenantRef);
    if (uid) await auth.deleteUser(uid);
    console.log('Silindi.');
    return;
  }

  const owner = await resolveOwner();
  console.log('Yönetici: ' + OWNER.email + ' (' + (owner.created ? 'yeni' : 'mevcut') + '), parola: ' + REVIEW_PASSWORD);

  if (existing.exists && existing.data().subscription) {
    // Sandbox satın alması salonu Pro yapmışsa paywall yine satın almayı
    // gizler; bunu sessizce ezmek yerine söylüyoruz.
    console.log('UYARI: salonun subscription alanı dolu (' + JSON.stringify(existing.data().subscription) + ') — paywall satın almayı göstermez. --reset --apply ile temizle.');
  }

  const tenantData = {
    name: TENANT_NAME,
    code: TENANT_CODE,
    branding: { appName: TENANT_NAME, primaryColor: '#14B8A6', accentColor: '#3B82F6', themeMode: 'dark' },
    ownerUid: owner.uid,
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  };
  const membershipData = {
    userId: owner.uid,
    tenantId: TENANT_ID,
    tenantCode: TENANT_CODE,
    tenantName: TENANT_NAME,
    status: 'active',
    roles: ['admin'],
    permissions: [],
    userDisplayName: OWNER.name,
    userEmail: OWNER.email,
    requestedAt: FieldValue.serverTimestamp(),
    approvedAt: FieldValue.serverTimestamp(),
    demoSeed: 'review-gym',
  };

  console.log('\nFirestore yazımları:');
  console.log('  tenants/' + TENANT_ID + (existing.exists ? '  (mevcut, birleştirilir)' : '  (yeni)'));
  console.log('  tenant_memberships/' + TENANT_ID + '_' + owner.uid);
  console.log('  subscription alanı: YAZILMAZ (ücretsiz plan)\n');

  if (!APPLY) { console.log('Kuru çalıştırma — hiçbir şey yazılmadı.'); return; }

  // Uygulamadaki gibi iki ayrı yazım, önce tenant.
  await tenantRef.set(tenantData, { merge: true });
  await db.collection('tenant_memberships').doc(TENANT_ID + '_' + owner.uid).set(membershipData, { merge: true });
  console.log('Bitti.');
}

run().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
