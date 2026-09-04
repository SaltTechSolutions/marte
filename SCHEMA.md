# GymEntra — Veri Şeması Referansı

> **Bu dosya sürekli okunmak için değildir.** Yalnızca veritabanı şeması,
> koleksiyon ilişkileri, güvenlik kuralı veya sorgu/index işi yapılırken
> açılır. Rutin UI/ekran çalışmasında okumaya gerek yoktur.
>
> **Şema değişirse bu dosya aynı commit içinde güncellenir.** Kod ile bu
> dosya çeliştiğinde kod doğrudur; dosya hemen düzeltilmelidir.

**Firebase projesi:** `tarabyamarte` (marte06 web uygulamasıyla ortak)
**Bölge:** Cloud Functions `europe-west1`
**İstemci:** Firebase JS SDK v12 (native SDK **değil** — RN'de disk
kalıcılığı yok, bkz. `plan.md` P2-2)

**Kaynak dosyalar**
| Ne | Nerede |
|---|---|
| TypeScript tipleri | `gymentra-mobile/src/data/types.ts` |
| Firestore → tip dönüşümleri | `gymentra-mobile/src/data/firebase/convert.ts` |
| Sorgu/yazma katmanı | `gymentra-mobile/src/data/firebase/*Repo.ts` |
| Güvenlik kuralları | `marte06/firestore.rules` |
| Composite indexler | `marte06/firestore.indexes.json` |
| Storage kuralları | `marte06/storage.rules` |
| Cloud Functions | `marte06/functions/src/index.ts` |

---

## Genel kurallar

**Çok kiracılılık (multi-tenancy).** Her salon bir `tenant`. GymEntra
koleksiyonlarının tamamında `tenantId` alanı vardır ve her sorgu
`where('tenantId','==',...)` ile başlar. Kiracı izolasyonu güvenlik
kurallarıyla zorlanır — istemciye güvenilmez.

**Deterministik doküman kimlikleri.** Tekilliği kurallarla zorlamak ve
`get()` ile ucuz kontrol yapabilmek için bazı koleksiyonlarda id hesaplanır:

| Koleksiyon | Doküman kimliği |
|---|---|
| `tenant_memberships` | `{tenantId}_{userId}` |
| `calendar_shares` | `{tenantId}_{ownerTrainerId}_{viewerTrainerId}` |
| `push_tokens` | Expo push token'ının kendisi |
| `exercise_reports` | otomatik (salt-yazılır) |
| diğerleri | Firestore otomatik id |

**Tarihler.** Firestore `Timestamp` olarak yazılır, `convert.ts` içindeki
`toDate()` ile JS `Date`'e çevrilir. Yazarken `serverTimestamp()` tercih
edilir (istemci saati güvenilmez).

**Veritabanında olmayan şey: hareket kütüphanesi.** 38 hareketin adı (3 Eylül 2026: makine/kablo hareketleri çıkarıldı; halter, dumbbell, bench, bant ve vücut ağırlığı kaldı),
kas haritası, poz kareleri ve anlatımı `gymentra-mobile/src/data/exerciseLibrary.ts`
içinde **istemci tarafında sabit veri** olarak duruyor — Firestore'da bir
`exercises` koleksiyonu yok ve olmamalı: içerik uygulamayla birlikte
sürümleniyor, salona göre değişmiyor ve çevrimdışı çalışması gerekiyor. Salon
kendi hareketini ekleyemez; o istendiğinde ayrı bir karar (bkz. plan.md B-7).
Dosya üretilendir, kaynağı `marte06/scripts/build_exercise_library.py`.

**Gömülü diziler.** `programs.exercises`, `workout_logs.exerciseLogs`,
`classes.bookedUserIds` alt koleksiyon değil, gömülü dizidir: sınırlı
boyutlu ve daima bütün olarak okunup yazılıyorlar. Kısmi güncelleme yok —
dizi bütünüyle yeniden yazılır.

---

## Varlık ilişkileri

```
                    ┌──────────┐
                    │  tenants │  (salon / beyaz etiket kiracı)
                    └────┬─────┘
                         │ tenantId
     ┌───────────────────┼───────────────────────────┬───────────────┐
     │                   │                           │               │
┌────▼──────────────┐ ┌──▼──────┐  ┌──────────┐  ┌───▼──────────┐ ┌──▼─────────────┐
│ tenant_memberships│ │ classes │  │ payments │  │ gym_packages │ │ calendar_shares│
│  (üye/antrenör/   │ │ (grup   │  │ (manuel  │  │ (satılabilir │ │ (antrenör→     │
│   yönetici)       │ │  ders)  │  │  defter) │  │  katalog)    │ │  antrenör izin)│
└────┬──────────────┘ └─────────┘  └──────────┘  └──────────────┘ └────────────────┘
     │ userId (= Firebase Auth uid)
     │
     ├──► checkins        (salona giriş kaydı)
     ├──► programs        (antrenör yazar, üyeye atanır)
     │       └──► workout_logs  (üyenin programı uygulaması)
     ├──► measurements    (vücut ölçümleri)
     ├──► pt_sessions     (birebir randevu)
     ├──► push_tokens     (cihaz bildirim jetonu)
     ├──► exercise_reports (personel sorun bildirimi, salt-yazılır)
     └──► member_packages (gym_packages'tan atanmış, hakları kopyalar)
             ├──► member_credits      (ders/grup dersi kota bakiyesi)
             └──► member_entitlements (güncel paketin tek-dokümanlık hak önbelleği — kural bunu okur)
```

**Kritik nokta:** `userId` her yerde **Firebase Auth uid**'dir,
`tenant_memberships` doküman kimliği değil. Tek istisna `checkins.membershipId`
alanıdır (QR yükü olarak üyelik doküman kimliğini taşır).

`promotions` diyagrama çizilmedi (yer darlığı) ama `gym_packages`'ın
kiracı-kapsamlı bir kardeşi: `tenants` altında yaşar, hiçbir koleksiyona
FK ile bağlı değildir — etkisi yalnızca atama anında `member_packages`'a
düz değer olarak kopyalanır.

---

## Koleksiyonlar

### `tenants` — salon
| Alan | Tip | Not |
|---|---|---|
| `code` | string | Katılım kodu, BÜYÜK HARF (ör. `TARABYA-01`). **Tekillik kurallarla zorlanmıyor** |
| `name` | string | |
| `branding` | map | `{ appName, primaryColor, accentColor, logoUrl?, themeMode? }` |
| `ownerUid` | string | Oluşturan kullanıcı; create'te `auth.uid`'e kilitli, sonra değişmez |
| `address` | string? | Katılım akışında gösterilir; herkese açık olması bilinçli |
| `cancellationHours` | number? | PT randevu iptalinde kredi iadesi sınırı — yoksa varsayılan 24. Henüz yönetici ayarları ekranı yok, alan elle/backfill ile yazılır (PKG-11, Faz 1.9) |
| `activeMemberCount` / `activeAdminCount` | number | **Sunucu sahipli.** `syncActiveMemberCount` her üyelik yazımında yeniden sayar, `reconcileMirrors` haftalık düzeltir. Kurallar sayamaz, bu yüzden ücretsiz kademe sınırı (`activeMemberCount`) ve **3 yönetici sınırı** (`activeAdminCount`, `withinAdminLimit`) buradan okunur. Eksik sayaç "sınırın altında" okunur — eski salon kilitlenmez; `scripts/backfill_active_admin_count.cjs` gerçek sayıyı bir kez yazar |

| `createdAt` / `updatedAt` | Timestamp | |

⚠️ **İletişim bilgisi bu dokümana yazılmaz.** Salon dokümanı her oturum açmış
kullanıcıya okunabilir (kodla katılım). Hassas alanlar
`tenants/{id}/private/{docId}` alt koleksiyonuna gider — okuma
`isTenantMember`, yazma `isTenantAdmin`.

**Kurallar:** okuma = her oturum açmış kullanıcı (kodla katılım için).
Yazma = kiracı yöneticisi; `ownerUid` ve `code` değişmez. Silme kapalı.

`subscription` alanı **yalnızca sunucu tarafından** yazılır:
`revenueCatWebhook` (RevenueCat → Apple/Google makbuz doğrulaması) veya elle
müdahale. Kural istemcinin bu alana dokunmasını engelliyor — ücretsiz kademe
sınırı bu alanı okuduğu için, yazabilen istemci kendine sınırsız üye yazardı.

⚠️ `name` değişince `tenant_memberships.tenantName` kopyaları da güncellenmeli.
Bunu `syncTenantNameToMemberships` (onDocumentWritten, `tenants/{tenantId}`)
yapıyor — yalnızca ad gerçekten değiştiyse çalışır, yoksa her marka
düzenlemesi tüm listeyi yeniden yazardı. 450'lik batch'lerle yazıyor.

### `tenants/{id}/private/contact` — salon iletişim bilgisi
| Alan | Tip | Not |
|---|---|---|
| `phone` | string? | Boş bırakılırsa alan silinir |
| `email` | string? | Boş bırakılırsa alan silinir |
| `updatedAt` | Timestamp | |

Yönetici ayarları ekranından yazılır (`updateTenantContact`, `merge: true`).
Okuma salon üyesine açık, yazma yalnızca yöneticide.

**Küresel `admin` claim'i GymEntra koleksiyonlarında geçerli değildir**
(plan.md P1-6). Beyaz etiket üründe platform süper-kullanıcısı olmaz; destek
erişimi Admin SDK üzerinden Cloud Function ile yapılır. Legacy marte06
koleksiyonları kendi `isAdmin()` kontrollerini korur.

---

### `tenant_memberships` — kullanıcının bir salondaki rolü
**Doküman kimliği: `{tenantId}_{userId}`**

| Alan | Tip | Not |
|---|---|---|
| `userId` | string | Firebase Auth uid |
| `tenantId` | string | |
| `tenantCode` / `tenantName` | string | Denormalize kopya |
| `guardianId` | string? | Ebeveynin uid'si (MEMBER-5b). Yalnızca `requestGuardian`/`respondToGuardian` callable'ları yazar; beş `update` kuralının hiçbiri bu alanları `hasOnly` listesine almadığı için istemci yazamaz |
| `guardianName` | string? | Denormalize kopya — kaynak değişince güncellenmeli |
| `guardianStatus` | string? | `pending` / `approved` / `rejected`. **`status`'tan ayrı bir eksen**: `status` salonun cevabı, bu ebeveynin cevabı. Tek alana sıkıştırmak "hangi onay eksik" sorusunu cevapsız bırakır |
| `guardianConsentAt` / `guardianConsentVersion` | Timestamp? / string? | KVKK: reşit olmayanın verisini işlemek ebeveyn onayı gerektirir, onay kayıt altına alınır |
| `roles` | `MembershipRole[]` | **Bir kullanıcının bir salonda birden çok rolü olabilir** (küçük salonda sahip genelde antrenör de). Roller örtük değildir, açıkça verilir. Tek doğruluk kaynağı — eski tekil `role` alanı 27 Ağustos 2026'da tamamen kaldırıldı (`scripts/drop_legacy_role_field.cjs`). |
| `permissions` | `MembershipPermission[]` | Yöneticinin devrettiği dar yetenekler. Şu an tek değer: `'checkin'`. |
| `status` | `'pending' \| 'active' \| 'rejected' \| 'suspended'` | |
| `userDisplayName` / `userEmail` | string? | Denormalize — istemci başka kullanıcının Auth profilini okuyamaz, onay ekranı bu kopyaya muhtaç |
| `shortCode` | string? | 6 haneli elle giriş kodu (kiracı içinde tekil) |
| `phone` / `birthDate` | string? / Timestamp? | Yalnızca marte06'dan taşınan üyelerde — bkz. aşağı |
| `requestedAt` / `approvedAt` | Timestamp | |

**Kurallar:** okuma = kendisi veya kiracı personeli (`isTenantStaff`);
ayrıca aynı salonun **aktif üyesi**, o salonun `roles` içinde `trainer`
bulunan kayıtlarını okuyabilir — PKG-8'in randevu akışı "antrenör seç" ile
başlıyor, listenin randevu alan kişiye görünmesi gerekiyor. Bilinçli olarak
dar: üye hâlâ salonun diğer **üyelerini** listeleyemez.
Create = yalnızca kendisi için `roles: ['member']`/`pending`; istisna:
kiracıyı yeni kuran `ownerUid` kendine `roles: ['admin']`/`active` verebilir.
Update = dört ayrı yol:
1. **Yönetici**: yalnızca `status`, `approvedAt`, `roles`, `permissions` —
   ayrıca **yönetici kendi `admin` rolünü düşüremez** (salonu yönetimsiz
   bırakmasın). **`admin` rolü VERMEK `tenants.activeAdminCount < 3` ister**
   (`withinAdminLimit`); sınır yalnızca rolü veren yazımda çalışır — zaten
   yönetici olan birinin başka bir alanı düzenlenirken ya da yöneticiliği
   alınırken sınır bakılmaz. Kurucu korunmaz: herkes eşit (karar,
   3 Eylül 2026).
2. **Kişinin kendisi — ayrılma**: `active` → `left`, yalnızca `status` ve
   `leftAt`. Yöneticiler hariç (salonun son yöneticisi olabilir).
3. **Kişinin kendisi — yeniden başvuru (P0-6)**: `left`/`rejected` →
   `pending`, `roles: ['member']` ve `permissions: []` zorunlu. Onay yine
   yöneticide. `suspended` bu yoldan geçemez (askı yöneticinin kararıdır).
   **`shortCode` değiştirilemez** — `assignMembershipShortCode` yalnızca
   `onDocumentCreated` olduğu için üzerine yazılırsa bir daha atanmaz.
4. **Yönetici — temel bilgi düzeltmesi**: yalnızca `userDisplayName`,
   `phone`, `birthDate`. 1. yoldan ayrı tutuldu çünkü o kural her yazımda
   `status` doğruluyor; henüz `pending` bir kayıtta salt profil düzenlemesi
   buna takılırdı.

**Silme = `false`.** Üye çıkarma `removeMemberFromTenant` callable'ından
geçer: cascade sekiz koleksiyonda başkasının dokümanlarına dokunuyor, bu
yetki istemciye verilmez. Tek salona kapsamlı — kişinin başka salondaki
verisi ve Firebase hesabı korunur. `deleteMyAccount` aynı cascade listesini
paylaşır (kişi tamamen ayrılıyorsa salon kapsamı olmadan).

**Rol anlamları**
- `member` — üye. Kendi kartı, programı, ölçümü, ödemesi.
- `trainer` — antrenör. Üye listesi, program yazma, kendi PT takvimi.
- `admin` — salon yöneticisi. Onaylar, ödeme defteri, markalaşma, dersler,
  tüm antrenör takvimlerini gözetleme.

**Roller örtük değildir.** Yönetici otomatik olarak antrenör sayılmaz —
antrenörlük yapmayan bir sahibin navigasyonunda PT takvimi olmaz. Aynı kişi
ikisini de yapıyorsa `roles: ['admin','trainer']` açıkça verilir.

**Yetenek kontrolü ekranlarda ham karşılaştırmayla yapılmaz.** Tek doğruluk
kaynağı `gymentra-mobile/src/data/membership.ts`:
`canManageGym` · `canCheckIn` · `canCoach` · `canOverseeCalendars` ·
`isStaff` · `primaryRole`.

**Sorgu notu:** rol filtreleri `where('roles','array-contains', …)` şeklinde.
Bu, `(tenantId, status, roles CONTAINS)` composite index'ini gerektirir.

**`phone` / `birthDate` — yalnızca göç edilen üyelerde (20 Ağustos 2026).**
WEB-2 taşıması (bkz. aşağıdaki WEB bölümü) yalnızca ad/e-posta/rol
kopyaladı; telefon ve doğum günü marte06'nın `members` koleksiyonunda kaldı.
`marte06/scripts/backfill_member_contact_info.cjs` (Admin SDK, kural
atlar — bilerek: yeni üye kaydında bu alanlar hiç toplanmıyor, self-servis
yazma yolu yok) `memberUid` üzerinden eşleştirip kopyalıyor. **Kural
değişikliği yok** — okuma zaten tüm doküman için kendisi/kiracı personeli
kapsamında.

---

### `classes` — grup dersi (tek seferlik oluşum, tekrarlayan seri değil)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` | string | |
| `name` / `trainerName` | string | `trainerName` denormalize metin, uid değil |
| `date` | Timestamp | |
| `durationMinutes` / `capacity` | number | |
| `bookedUserIds` | string[] | Auth uid dizisi |
| `waitlistUserIds` | string[] |
| `trainerId` | string? | Dersi veren antrenörün uid'si (PER-8) |
| `attendance` | map? | `{uid: 'present' \| 'absent'}` (PER-8) |
| `seriesId` | string? | Tekrarlayan dersin oluşumlarını bağlar (PER-10) |
| `bookingCredits` | map? | `{uid: creditId}` — kotalı rezervasyonu hangi kredinin ödediği (PER-9) |

**Kurallar:** okuma **ve** yazma salona aktif üyelik gerektirir
(`isTenantMember`) — çapraz kiracı sızıntısı kapatıldı. Yazma = kiracı
yöneticisi **veya** üyenin kendi uid'ini tek bir dizide ekleyip çıkarması
(`isSelfArrayAdd`/`isSelfArrayRemove`). Kapasite kural düzeyinde kontrol
edilir. Bekleme listesinden otomatik yükseltme `promoteFromClassWaitlist`
Cloud Function'ı ile yapılıyor (P2-8, çözüldü).

**`bookedUserIds`'e EKLEME ayrıca PKG-4'ün hak kontrolünden geçer** —
`canBookGroupClass()`, `member_entitlements` önbelleğinde
`groupClasses.unlimited == true` var mı diye bakar. **Çıkarma (iptal) hiçbir
zaman gated değil** — `isSelfArrayRemove` tek başına yeterli; bir üyenin
paketi değişse bile önceden yaptığı rezervasyonu iptal edebilmesi gerekir.

**Sorgu notu:** istemci yalnızca bugünden itibaren ve `limit(100)` ile
dinliyor.

**Index:** `tenantId ASC, date ASC`

---

**Antrenör sahipliği ve yoklama (PER-8).** `trainerId` dersi kimin verdiğini
söyler; `trainerName` serbest metin olduğu için "benim derslerim" sorgusu
onsuz yazılamıyordu. Kurallar: antrenör yalnızca `trainerId == uid` olan
dersi oluşturur/düzenler/siler, ve düzenlerken `tenantId` ile `trainerId`
sabit — kendi dersini düzenlemek, onu başka salona taşımanın ya da bir
meslektaşa devretmenin yolu olmamalı. Devretmek yönetici işi.

`attendance` **üç durumlu**: kayıt yoksa "işaretlenmedi", ki bu `'absent'`
ile aynı şey değil. "Kimse yoklama almadı" ile "gelmedi" farklı olgular;
ikisini birleştiren bir rapor yalan söyler. Yoklama alınmamış bir dersi
"herkes gelmemiş" diye saymamak için raporlama bu ayrımı korumalı.

**Tekrarlayan ders (PER-10).** `seriesId` oluşumları birbirine bağlar.
Oluşumlar **ayrı dokümanlar** olarak kalır, tek bir tekrar kuralı olarak
değil: bir hafta tek başına iptal edilir, taşınır ya da dolar, ve
kural+istisna modeli her okumada "bu hafta gerçek mi?" sorusunu cevaplamak
zorunda kalır. Kimlik yalnızca "dönemin kalanını iptal et" ifade edilebilsin
diye var. Seri iptali **yalnızca ileriye** çalışır — geçmiş oluşumlar
yaşandı, silmek yoklamalarını da götürürdü.

**Kotalı rezervasyon (PER-9).** `bookingCredits` hangi kredinin hangi yeri
ödediğini tutar, böylece iptal aynı krediyi geri verir — üyenin o anki
bakiyesine bakıp tahmin etmez. Kotalı rezervasyon ve iptal `bookGroupClass` /
`cancelGroupClassBooking` callable'larından geçer; krediyi düşürmek ve yeri
almak tek atomik adım olmalı ve kurallar aritmetik yapamaz. **Sınırsız**
haklar mevcut doğrudan istemci yazımında kalır (bkz. `classes` kuralları).

---

### `checkins` — salona giriş kaydı (değiştirilemez)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `userId` | string | |
| `membershipId` | string | `{tenantId}_{userId}` — QR yükü |
| `accessReason` | `'ok' \| 'no-package' \| 'no-session-today' \| 'frozen'` | Neden içeri alındığı (PKG-3) — `'ok'` dışındakiler personelin "yine de kabul et" ile geçtiği durumlar |
| `checkedInAt` | Timestamp | |

**Kurallar:** okuma/create = `canCheckIn(tenantId)` — yani yönetici **veya**
`permissions` içinde `'checkin'` olan personel. Üye kendi kendine giriş
yapamaz; personel okutmalı. Update/delete kapalı. **Mükerrer kayıt
engellenir** — aynı üye 60 dakika içinde tekrar okutulursa
`already-checked-in` döner (istemci tarafında, `checkinRepo.ts`; kuralda
değil — bu bir sayım sorgusu, kurallar sayamaz).

**`accessReason` (20 Ağustos 2026, PKG-3):** check-in artık üyenin aktif
paketini/kredisini okuyup karar veriyor. `'ok'` değilse **giriş yine de
yapılıyor** — kapıda kararı personel verir, uygulama engellemez — ama sebep
buraya yazılıyor ki sonradan "kaç kişi paketsiz alındı" raporlanabilsin.
Bkz. `checkinRepo.ts`'deki `resolveAccess`.

**Index:** `tenantId ASC, checkedInAt ASC`

---

### `programs` — antrenman programı
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` / `trainerId` | string | Hepsi Auth uid |
| `memberName` | string | Denormalize |
| `name` | string | |
| `status` | `'draft' \| 'active'` | |
| `exercises` | ProgramExercise[] | Gömülü: `{ id, name, sets, reps, targetWeightKg }` |
| `createdAt` / `updatedAt` | Timestamp | |

**Hareket kütüphanesi bağı (PER-19).** Antrenör `trainer/builder`'daki
seçiciden bir hareket eklediğinde `name` alanına kütüphanenin Türkçe adı
yazılır (ör. `Goblet squat`). Anlatım ekranı bu **isimden** çözülür
(`exerciseByName`), ayrı bir `exerciseId` alanı **yoktur**.

⚠️ **Bunun bedeli:** antrenör ismi elle düzenlerse bağ kopar ve üye o
hareketin anlatımını kaybeder — sessizce, hata vermeden. Kalıcı çözüm
`ProgramExercise.exerciseId` alanı eklemek; PER-17'nin model değişikliğiyle
birlikte yapılmalı (plan.md Kuşak 3). O zamana kadar `exerciseByName` önce
tam eşleşme, sonra gevşek "içeriyor" eşleşmesi deniyor.

**Kurallar:** okuma = programın üyesi veya kiracı personeli. Yazma = kiracı
personeli; `tenantId` ve `memberId` değişmez.

**İş kuralı:** üye başına aynı anda en fazla bir `draft` + bir `active`
program beklenir (`findOrCreateDraftProgram` bunu varsayar) — ancak kurallarla
zorlanmıyor.

---

### `workout_logs` — üyenin bir programı uygulaması
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` / `programId` | string | |
| `programName` | string | Denormalize |
| `startedAt` | Timestamp | |
| `completedAt` | Timestamp? | Yoksa antrenman sürüyor |
| `exerciseLogs` | ExerciseLog[] | `{ exerciseId, name, setsTarget, setsCompleted, weightKg, durationSeconds? }` |

`durationSeconds`: egzersiz başına **aktif** süre (duraklatılan süre hariç).
Kalori/gelişim raporlaması bu alana dayanacak. Eski kayıtlarda yok —
tüketiciler `completedAt - startedAt`'e düşmeli.

**Kurallar:** okuma = üyenin kendisi veya kiracı personeli. Create = yalnızca
kendisi için. Update = yalnızca `exerciseLogs` + `completedAt`. Silme kapalı.

**Index:** `tenantId ASC, memberId ASC, startedAt ASC`

---

### `measurements` — vücut ölçümü (yalnızca ekleme)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` | string | |
| `weightKg` | number | Zorunlu |
| `chestCm` / `waistCm` / `armCm` | number? | |
| `recordedAt` | Timestamp | |

**Kurallar:** okuma = üyenin kendisi veya kiracı personeli. Create = yalnızca
kendisi için. **Update/delete kapalı** — geçmiş düzeltilemez.

**Index:** `tenantId ASC, memberId ASC, recordedAt DESC`

---

### `payments` — manuel ödeme defteri
> ⚠️ **Uygulama hiçbir zaman kart/banka bilgisi işlemez.** Ödeme salon ile üye
> arasında uygulama dışında gerçekleşir; burası yalnızca kayıt defteridir.
> ⚠️ `firestore.rules` içinde bu yol için **iki ayrı match bloğu** var
> (legacy marte06 + GymEntra). Firestore bunları OR'lar (plan.md P1-2).

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` | string | |
| `memberName` | string | Denormalize |
| `amount` | number | > 0 |
| `method` | `'cash' \| 'bank_transfer'` | |
| `status` | `'pending' \| 'confirmed' \| 'rejected'` | |
| `kind` | `'charge' \| 'refund'` | **PKG-6, 20 Ağustos 2026.** Yoksa `'charge'` sayılır (geriye dönük uyumlu). Tutar her zaman pozitif — yön `kind` taşır, negatif tutar raporlamayı kirletir |
| `note` | string? | |
| `createdAt` / `confirmedAt` | Timestamp | |
| `submittedBy` / `submittedByName` | string? | Parayı fiilen veren kişi, kayıt sahibi üyeden farklıysa (MEMBER-5e). Ebeveyn çocuk için öderken `memberId` çocuk kalır — defter çocuk bazında doğru kalmalı — bu alan ebeveyni yazar |
| `paymentGroupId` | string? | Tek bir ödeme eyleminden doğan kayıtları birbirine bağlar. 900₺ üç çocuğa bölününce defterde üç satır olur; bu olmadan salon bunu üç ayrı ödemeden ayırt edemez |

**Akış:** Yönetici girerse doğrudan `confirmed`. Üye bildirirse `pending` →
yönetici `confirmed`/`rejected` yapar. **İstisna:** bir paket düşürmesinin
oransal iadesi (PKG-6) `approvePackageChange` callable'ı tarafından
doğrudan `confirmed` + `kind:'refund'` olarak yazılır — istemci hiç yazmaz.

**Index:** `tenantId ASC, createdAt DESC` ve `tenantId ASC, memberId ASC, createdAt DESC`

---

### `gym_packages` — satılabilir paket kataloğu (PKG-1)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` | string | |
| `name` | string | Serbest metin — "Gold", "8 Ders". Koda gömülü tip değil |
| `kind` | `'membership' \| 'lessons'` | |
| `price` | number | |
| `durationDays` | number? | `membership` için zorunlu |
| `lessonCount` / `lessonValidityDays` | number? | `lessons` için |
| `entitlements` | map | `{ gymAccess, groupClasses?, ptLessons? }` — bkz. aşağı |
| `freezePolicy` | map? | `{ minDays, maxCount }` — `membership` için |
| `activeAssignmentCount` | number | **Sunucu sahipli.** İstemci asla yazamaz — kilit buna dayanır |
| `supersedesId` | string? | Yeni sürümse eskiye bağ |
| `isActive` / `sortOrder` | | |
| `createdAt` / `updatedAt` | Timestamp | |

**Haklar (`entitlements`) — sabit tip değil, adlandırılmış hak çantası:**
```
{ gymAccess: true,
  groupClasses: { unlimited: true } | { count, periodDays },  // yoksa hak yok
  ptLessons:    { count, periodDays } }                        // yoksa hak yok
```
Ekranlar `entitlements.ptLessons != null` diye sorar, paketin `name`'ini
`"Gold"` ile karşılaştırmaz — admin içeriği değiştirebildiği için isim hiçbir
şey garanti etmez.

**Değişmezlik — satılmış paket donar:** `activeAssignmentCount > 0` iken
kural yalnızca `isActive`/`sortOrder` değişimine izin verir. İçerik
değiştirmek isteyen admin `createPackageVersion` ile yeni sürüm açar
(`supersedesId` ile eskiye bağlanır); eski kayıt `isActive:false` olur ama
**silinmez** — silinirse ona bağlı `member_packages` kayıtları yetim kalırdı.

**Varsayılan şablonlar tohum veridir, kod sabiti değil.** Yeni salon
açıldığında (`createTenantWithOwner` → `seedDefaultPackages`) üç doküman
yazılır (Silver/Gold/Platinium), o andan sonra salonun malıdır. Uygulama
kodunda `if (name === 'Gold')` gibi bir dal **hiçbir yerde yok.**

**Index:** `tenantId ASC, sortOrder ASC`

---

### `promotions` — zaman sınırlı kampanya (PKG-5)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `name` | | |
| `kind` | `'percentDiscount' \| 'amountDiscount' \| 'bonusDays' \| 'bonusLessons'` | |
| `value` | number | %, ₺, gün veya ders — `kind`'e göre |
| `appliesTo` | string[] | `gym_packages` kimlikleri; boş = tüm paketler |
| `startsAt` / `endsAt` | Timestamp | Kampanya penceresi |
| `maxRedemptions` | number? | Yoksa sınırsız |
| `redeemed` | number | **Sunucu tarafından değil, kural tarafından korunan sayaç** — bkz. aşağı |
| `isActive` | boolean | |

**`gym_packages`'a hiç dokunmaz.** Katalog satılmış içeriği korur
(değişmezlik kuralı); bir kampanya kataloğu değiştirseydi her promosyon
paketin yeni bir sürümünü doğururdu. Bunun yerine etkisi atama anında
`member_packages`'a **düz değer olarak kopyalanır** (`listPrice`,
`finalPrice`, `bonusDays`, `bonusLessons`) — bu doküman sonradan
değişse, kapansa ya da silinse de üyenin aldığı şey değişmez.

**`redeemed` — nadir görülen bir durum: Cloud Function'sız güvenli sayaç.**
`gym_packages.activeAssignmentCount` gibi diğer tüm sayaçlar bir Cloud
Function gerektiriyordu çünkü kurallar *sorgu* yapamaz (kaç doküman şu
paketi işaret ediyor?). Burada öyle bir sorguya gerek yok — `redeemed` tek
bir dokümanda tutulan düz bir sayı, kural onu **"tam +1 ve tavanın altında"**
diye doğrudan doğrulayabilir (`classes.bookedUserIds.size() <= capacity`
ile aynı desen). `assignPackageToMember` bunu bir `runTransaction` içinde
yapıyor — iki admin aynı kampanyayı aynı anda uygularsa Firestore'un kendi
atomiklik garantisi devreye giriyor.

**Kurallar:** okuma = kiracı personeli (üyeler görmüyor — v1'de üye yüzlü
promosyon vitrini yok). Yazma: `create` yalnızca kiracı yöneticisi,
`redeemed:0` zorunlu. `update` iki yoldan biri: ya yalnızca `redeemed` tam
+1 hareket eder (ve tavanın altında kalır), ya da `redeemed` hiç
değişmeden başka alanlar serbestçe düzenlenir. Silme serbest — `gym_packages`
gibi bir kilit yok, çünkü etkisi zaten kopyalanmış.

**Uyumsuz `kind`/paket eşleşmesi sessiz bir no-op'tur, hata değil.**
`bonusDays` yalnızca `membership` paketinin süresini uzatır, `bonusLessons`
yalnızca `lessons` paketinin kredisine eklenir — biri diğerine uygulanırsa
değer kopyalanır ama hiçbir şeyi değiştirmez. `admin/promotion-form.tsx`
paket seçicisini `kind`'e göre filtreleyerek bunun pratikte hiç
yaşanmamasını sağlıyor.

**Index:** `tenantId ASC, createdAt DESC`

---

### `package_change_requests` — üye onayı bekleyen paket değişimi (PKG-6)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` / `memberName` | | |
| `kind` | `'upgrade' \| 'downgrade' \| 'promotion' \| 'addon'` | Yalnızca etiket — yaptırım karşılaştırmadan gelir, `kind`'den değil |
| `currentPackageAssignmentId` | string? | Değiştirilen `member_packages` dokümanı. **Yoksa saf ekleme** — üyenin o türden hâlâ aktif paketi yok |
| `currentSummary` / `proposedSummary` | map? / map | Yalnızca görüntüleme — `entitlements`, `price`, `endsAt`, `packageName`. Uygulanan gerçek kaynak `proposedPackageId`/`proposedPromotionId` |
| `proposedPackageId` | string | `gym_packages` — apply anında **taze** okunur, bu snapshot'a güvenilmez |
| `proposedPromotionId` | string? | Apply anında hâlâ geçerli mi tekrar kontrol edilir — günler geçmiş olabilir |
| `priceDelta` | number | + ek ücret · − iade · 0 değişmiyor |
| `refundAmount` / `refundBasis` | number? / string? | Oransal iade — hesap aşağıda |
| `note` | string? | |
| `effectiveAt` / `expiresAt` | Timestamp | |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'expired' \| 'cancelled'` | |
| `createdBy` / `createdAt` / `respondedAt` | | |
| `appliedAt` | Timestamp? | **Sunucu sahipli idempotency işareti** — istemci hiç yazmaz |

**Akış:** Admin isteği `pending` olarak yaratır (`member_packages`'a hiçbir
şey yazılmaz) → üyeye push → üye `approvePackageChange` callable'ını çağırır
(`approve: boolean`) → aynı transaction içinde hem isteğin `status`'ü
**hem** gerçek paket değişimi uygulanır (plan-eng-review Faz 1.6 — eski adı
`applyPackageChange`, `onDocumentUpdated` trigger'ıydı).

**Neden bir callable şart — istisna değil, zorunluluk.** `member_packages`
kuralı **hiçbir** client update'ine izin vermiyor, admin dahil (bkz. o
koleksiyonun kendi notu). Bu dokümanın `status` alanına da artık **hiçbir
istemci** yazamıyor (üye dahil) — eski paketi kapatmak, yenisini açmak,
kredi defterini güncellemek, promosyon sayacını artırmak, iade kaydı
düşmek hiçbiri üyenin doğrudan yapabileceği bir şey değil, o yüzden onay
kararının kendisi de aynı güvenilir yerde alınıyor.

**Trigger'dan callable'a geçişin gerçek sebebi:** eski tasarımda üyenin
kendi `status:'approved'` yazımı *anında* başarılı görünüyordu — asıl
paket değişimi ayrı bir trigger'da, o yazımdan *sonra* gerçekleşiyordu.
Trigger hiç çalışmazsa ya da düşerse istek sonsuza kadar "approved"
görünüp hiçbir şey uygulanmamış kalabiliyordu. Şimdi ikisi tek transaction;
üye "onaylandı" sonucunu ancak paket gerçekten değiştiğinde görüyor.

**Apply anında yeniden doğrulanır, oluşturma anındaki kopyaya güvenilmez.**
Admin isteği hazırladıktan günler sonra üye onaylayabilir — bu sürede hedef
paket kilitlenmiş olabilir (önemli değil, içerik zaten donmuş demektir) ama
bağlı promosyon **süresi dolmuş ya da kontenjanı bitmiş** olabilir. Eski
davranış promosyonu **sessizce düşürüp** tam fiyata uyguluyordu — bu
tersine çevrildi (Codex #10): promosyon artık geçerli değilse **tüm swap
reddedilir**, istek `expired` yapılır, admine "teklifi yenile" bildirimi
gider. Üye onayladığı indirimsiz tam fiyata asla geçmez.

**Değiştirilen paketin tenant sınırı ve tekilliği de apply anında
doğrulanır (Codex #7/#8/#9).** Hedef paket, promosyon ve
`currentPackageAssignmentId` isteğin kendi `tenantId`'siyle
karşılaştırılır; `currentPackageAssignmentId` artık `active` değilse
(başka bir onay onu zaten değiştirmişse) istek reddedilir — sessizce
ikinci bir aktif paket basmak yerine. Değiştirilen paketin
`member_credits`'leri de `cancelled` yapılır, yeni paketin kredileriyle
birlikte harcanabilir durumda kalmaz.

**Idempotency yapısal, ayrı bir işaret gerekmiyor.** Onay, isteğin kendi
`pending` durumunu aynı transaction içinde okuyup değiştiriyor — yeniden
denenen/çift tıklanan bir çağrı `approved` (veya `rejected`/`expired`)
okuyup `failed-precondition` ile reddediliyor. `appliedAt` alanı hâlâ
`approved` sonucunda set ediliyor (ne zaman uygulandığının kaydı için),
ama artık davranışı bu alan değil transaction'ın kendisi garanti ediyor.

**Kurallar:** okuma = kendisi veya kiracı personeli. Yazma: `create`
yalnızca kiracı yöneticisi (`createdBy == auth.uid`, `status=='pending'`).
`update`'in **tek** yolu — admin hâlâ `pending` olan bir isteği `cancelled`
yapıp geri çekebilir. Üyenin `status`'e hiçbir yazma yolu yok; onay ve red
ikisi de yalnızca `approvePackageChange` callable'ından geçer. Silme kapalı.

**Süresi geçen teklif — `expirePendingPackageChangeRequests`** (günlük).
Cevapsız kalan bir teklif sonsuza kadar `pending` durmaz; admin'in unuttuğu
bir tuzağa dönüşmesin diye `expired` yapılır.

**Index:** `tenantId + memberId + status + createdAt DESC` (üyenin bekleyen
teklifleri), `status + expiresAt ASC` (günlük süre-dolum taraması).

---

### `member_packages` — bir üyeye atanmış paket (PKG-2)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` / `memberName` | | `memberName` denormalize |
| `packageId` / `packageName` / `kind` / `entitlements` / `freezePolicy` | | Atama anında **kopyalanır** — katalog sonra değişse de bu satır değişmez |
| `listPrice` / `finalPrice` | number | Promosyon yoksa eşit; varsa `finalPrice` indirimli tutar (PKG-5) |
| `promotionId` / `promotionName` / `bonusDays` / `bonusLessons` | | Promosyon uygulandıysa (PKG-5) — `promotions` dokümanının atama anındaki kopyası |
| `startsAt` / `endsAt` | Timestamp | `membership`: `+durationDays`. `lessons`: `+lessonValidityDays` |
| `frozenDays` / `freezes` | number / array | PKG-10, henüz yazılmıyor (`0` / `[]`) |
| `status` | `'active' \| 'frozen' \| 'expired' \| 'cancelled'` | **`status` tek başına güvenilmez** — PKG-12'nin günlük fonksiyonu gelene kadar süresi geçmiş bir paket hâlâ `active` görünebilir. Her zaman `endsAt`'i de kontrol et. |
| `paymentId` | string? | Ödeme defterine bağ |
| `assignedAt` / `assignedBy` | | |

**Kurallar:** okuma = kendisi veya kiracı personeli. Yazma = yalnızca
`create`, ve yalnızca kiracı yöneticisi (`assignedBy == auth.uid`, hedef
paket `isActive`). **Update/delete tamamen kapalı** — her sonraki geçiş
(dondurma, iptal, süre dolumu, PKG-6'nın değişimi) sunucu sahipli.

**Değişmezlik uyarısı:** bu doğrudan atama yolu (`assignPackageToMember`)
yalnızca **ilk/ek atama** için doğru. PKG-6 (`package_change_requests`)
geldiğinde, zaten paketi olan bir üyenin paketini *değiştirmek* onay akışına
gitmeli — bu fonksiyon o zaman çağrılmamalı.

---

### `member_credits` — kota bakiyesi, kaynağı ne olursa olsun (PKG-2)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` | | |
| `kind` | `'ptLesson' \| 'groupClass'` | Tek defter, iki hak türü |
| `source` | `'purchase' \| 'entitlement'` | Satın alınan ders paketi / periyodik hak |
| `sourcePackageId` | string | **`gym_packages` değil, `member_packages` dokümanı** — hangi atamadan geldiğini bilmek gerekiyor (yenileme fonksiyonu bunu okuyor) |
| `total` / `used` | number | `used` **sunucu sahipli**, istemci hiçbir koşulda yazamaz |
| `startsAt` / `expiresAt` | Timestamp | |
| `status` | `'active' \| 'exhausted' \| 'expired'` | |

**Kurallar:** okuma = kendisi veya kiracı personeli. Yazma = yalnızca
`create` (kiracı yöneticisi, `used == 0` zorunlu). **Update/delete kapalı**
— tüketim (PKG-8) ve iade (PKG-11) henüz yazılmadı, geldiklerinde de
istemciden değil bir callable'dan (Admin SDK) yazacaklar.

**Tüketim sırası:** krediler `expiresAt` artan sırayla harcanır (önce
biteni önce) — bunu uygulayan kod henüz yok (PKG-8), ama sıralama zaten
`watchMemberCredits`'in sorgu sırası.

**`creditRollover`** (günlük, `functions/`, eski adı `renewEntitlementCredits`)
`status in ['active','exhausted']` olan ve süresi dolmuş **her** krediyi
`expired` yapar; `source:'entitlement'` olanlarda ek olarak bir sonraki
dönemi açar — ama yalnızca kaynağı olan `member_packages` hâlâ `active` ve
süresi dolmamışsa. Aksi halde sessizce durur; sona ermiş bir üyelik yeni ders
üretmeye devam etmez. `exhausted` durumu da sorguya dahil: eski hâli yalnızca
`active` sorguladığı için krediyi tüketen üyenin hakkı bir daha hiç
yenilenmiyordu (plan-eng-review Faz 1.2, Codex #2). Eski krediyi
`expired` yapmak ve yeni krediyi açmak **tek transaction'da**, yeni kredinin
kimliği kaynak krediden türetilerek (`{creditId}_next`) — aksi halde ikisi
arası bir çökme hakkı kalıcı siler, yeniden çalıştırma da ikinci bir kredi
basar (Faz 1.3).

---

### `member_entitlements` — bir üyenin GÜNCEL paketinin hak önbelleği (PKG-4)
**Doküman kimliği: `{tenantId}_{memberId}`**

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` | string | |
| `packageId` | string | Kaynak `member_packages` dokümanı |
| `entitlements` | map | Kaynak paketin `entitlements`'ının kopyası |
| `endsAt` | Timestamp | Kaynak paketin `endsAt`'i — **kural bunu `request.time` ile karşılaştırır** |
| `updatedAt` | Timestamp | |

**Neden var:** `classes` rezervasyon kuralı "bu üyenin şu an grup dersi hakkı
var mı?" sorusunu yanıtlamalı ama kurallar sorgu yapamaz — yalnızca
deterministik bir yoldan `get()` edebilir. `getMemberPackages`'ın yaptığı
"üyenin güncel üyelik paketini bul" sorgusunu kural çalıştıramaz; bu yüzden
sonucu tek dokümanlık bir önbellekte tutuyoruz.

**Tazelik — neden `endsAt` kuralda tekrar kontrol ediliyor:** önbellek yalnızca
`member_packages` **yazıldığında** yenileniyor (Cloud Function tetikleyicisi),
zamanın geçmesiyle değil. Süresi dolmuş bir üyelik hiç yazma tetiklemeden
sonsuza kadar `active` görünmeye devam ederdi — kural bu yüzden
`get(...).data.endsAt > request.time` diye ayrıca doğruluyor. Aynı disiplin
check-in'in (PKG-3) doğrudan okuma tercih etmesiyle aynı kökten: denormalize
kopya, kendi kendine bayatlar.

**Tamamen sunucu sahipli** — `syncMemberEntitlements` (Cloud Function,
`member_packages` yazımında tetiklenir) dışında hiçbir yazma yolu yok, ne
istemciden ne başka bir callable'dan. Okuma = kendisi veya kiracı personeli.

**Kotalı (`{count, periodDays}`) grup dersi hakkı şu an rezervasyon
açamıyor** — yalnızca `{unlimited: true}` `classes` yazımını geçiyor. Kredi
tüketen bir callable (PKG-8'in ruhu, ama grup dersleri için ayrı bir akış
gerekiyor) henüz yok; varsayılan şablonlarda da hiçbir paket kotalı grup
dersi taşımıyor, o yüzden bu şu an üretimde erişilemeyen bir dal.

---

### `pt_sessions` — birebir randevu (grup dersinden ayrı)
**Doküman kimliği: `bookPtSessions`'ın yazdıklarında `{tenantId}_{trainerId}_{epochMs}`**
(plan-eng-review Faz 1.5) — antrenör/admin'in oluşturduğu randevularda hâlâ
auto-ID. Sebep: sorgula-sonra-auto-ID-yaz deseni Firestore transaction
izolasyonunun koruduğu bir okuma seti değil; iki eşzamanlı `bookPtSessions`
çağrısı aynı boş sonucu görüp ikisi de yazabiliyordu (phantom read). Aynı
dokümanı okumak, Firestore'un optimistic concurrency'sinin gerçekten
koruduğu garantiyi veriyor.

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `trainerId` / `memberId` | string | |
| `trainerName` / `memberName` | string | Denormalize |
| `originalTrainerId` | string? | İlk devirde bir kez yazılır, sonra korunur |
| `date` | Timestamp | |
| `durationMinutes` | number | |
| `status` | `'scheduled' \| 'completed' \| 'cancelled'` | |
| `creditId` | string? | Hangi `member_credits` dokümanı ödedi — üyenin kendi rezervasyonu (PKG-8). Antrenörün/adminin oluşturduğu randevuda yok. **İstemci `creditId` ile doküman oluşturamaz** — yalnızca `bookPtSessions` callable yazar |
| `createdAt` / `updatedAt` | Timestamp | |

**İptal — yalnızca `cancelPtSession` callable'ından (PKG-11, plan-eng-review
Faz 1.9).** `creditId`'si olan bir dokümanın `status:'cancelled'` yazımı
kuralda **herkese** (admin dahil) kapalı — iade kararı atomik verilmesi
gerektiği için. `status:'completed'` yazımı etkilenmedi, doğrudan yazılabilir.

Politika: antrenör/admin iptali her zaman krediyi iade eder. Üye iptali
yalnızca randevuya en az `tenants/{tenantId}.cancellationHours` (yoksa
varsayılan 24 saat) kala yapılırsa iade eder; daha geç olursa kredi yanar.
Tam tükenmiş (`exhausted`) bir kredi iade edilirse `active`'e geri döner.

**Devir modeli — üç yol:**
1. Kiracı yöneticisi koşulsuz atar (antrenör gelmediğinde).
2. Atanmış antrenör kendi randevusunu düzenler.
3. `calendar_shares` izni olan meslektaş **yalnızca kendine** devralır
   (kural, değişen alanları `trainerId, trainerName, originalTrainerId,
   updatedAt` ile sınırlar).

**Index:** `tenantId ASC, trainerId ASC, date ASC` ve `tenantId ASC, date ASC`

---

### `trainer_availability` — antrenörün haftalık çalışma saatleri (PKG-7)
**Doküman kimliği: `{tenantId}_{trainerId}`**

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `trainerId` | string | |
| `weekly` | `Partial<Record<Weekday, TimeWindow[]>>` | `Weekday = 'mon'..'sun'`, `TimeWindow = {start,end}` (`'HH:mm'`). Gün yoksa o gün kapalı |
| `slotMinutes` | number | Randevu dilim uzunluğu (30/45/60/90) |
| `exceptions` | `AvailabilityException[]` | `{date:'YYYY-MM-DD', closed?, windows?}` — tek günlük istisna (tatil, farklı saat). v1 ekranı bunu hiç yazmıyor, veri modeli hazır |
| `updatedAt` | Timestamp | |

**Kurallar:** okuma her kiracı üyesi (üye randevu ararken görmeli); yazma
yalnızca ilgili antrenörün kendisi veya kiracı admini.

**Boş `weekly` ≠ "her gün kapalı ama tanımlı"** — `hasAnyAvailability()`
bunu "hiç ayarlanmamış" olarak ele alır; üye tarafı bunu düz bir "boş gün
listesi" yerine "antrenör henüz saatlerini tanımlamamış" olarak gösterir.

---

### `trainer_busy_slots` — antrenörün dolu saatleri, kimliksiz (PKG-7/8)
**Doküman kimliği: kaynak `pt_sessions` dokümanının id'si**

| Alan | Tip |
|---|---|
| `tenantId` / `trainerId` | string |
| `date` | Timestamp |
| `durationMinutes` | number |
| `status` | `'scheduled' \| 'completed' \| 'cancelled'` |

Gizlilik amaçlı ayna: `pt_sessions`'ın `memberId`/`memberName` alanları
olmadan sadece "bu saat dolu mu" sorusuna cevap verir — bir üye randevu
ararken başka bir üyenin kiminle, ne zaman göründüğünü göremesin diye.
`syncTrainerBusySlots` Cloud Function'ı `pt_sessions` üzerindeki her
yazımda senkronlar (silme dahil). **İstemci hiçbir zaman yazamaz.**

**Index:** `tenantId ASC, trainerId ASC, date ASC`

---

### `calendar_shares` — antrenörün meslektaşına takvim izni
**Doküman kimliği: `{tenantId}_{ownerTrainerId}_{viewerTrainerId}`**

| Alan | Tip |
|---|---|
| `tenantId` / `ownerTrainerId` / `viewerTrainerId` | string |
| `ownerTrainerName` | string (denormalize) |
| `createdAt` | Timestamp |

Kimlik deterministik olduğu için bir antrenör **yalnızca kendi** takvimini
paylaşabilir (`ownerTrainerId == auth.uid` kuralı). Update kapalı; iptal =
silme.

---

### `push_tokens` — Expo bildirim jetonu
**Doküman kimliği: token'ın kendisi** (yeniden kayıtta doğal tekilleşme)

| Alan | Tip |
|---|---|
| `userId` | string |
| `tenantId` | string |
| `updatedAt` | Timestamp |

**Kurallar:** istemci okuması **kapalı** (`allow read: if false`). Yalnızca
Cloud Functions (Admin SDK) okur. Temizlik mekanizması yok (plan.md P1-7).

---

### `announcements` — salon duyurusu (PER-16)
| Alan | Tip | Not |
|---|---|---|
| `tenantId` | string | |
| `title` / `body` | string | 1–80 / ≤600 karakter |
| `createdBy` / `createdByName` | string | Yazan yönetici |
| `createdAt` / `expiresAt` | Timestamp | `expiresAt` yoksa silinene kadar görünür; varsayılan 14 gün |

**Kurallar:** okuma = salonun aktif üyesi/antrenörü; create = yönetici; **update
kapalı** (yanlış duyuru silinip yeniden yayınlanır — push eski metinle gitti,
düzenleme onu geri çağıramaz); delete = yönetici. `notifyMembersOnAnnouncement`
oluşturulduğunda yazan hariç herkese push (`announcements` kategorisi,
kapatılabilir).

**Index:** `tenantId ASC, createdAt DESC`

---

### `renewal_requests` — üyeden yenileme talebi (PER-15)
**Doküman kimliği: `{tenantId}_{memberId}`** — üye başına en fazla bir açık talep.

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` / `memberName` | | `memberName` denormalize |
| `status` | `'pending' \| 'handled' \| 'withdrawn'` | |
| `note` | string? | ≤ 300 karakter, üyenin mesajı |
| `createdAt` / `handledAt` / `handledBy` | | |

**Kurallar:** üye kendi talebini açar (kimlik sabit) ve geri çeker; personel
okur; yönetici `handled` yapar. **Sunucu da kapatır:** `resolveRenewalOnAssignment`
üyeye yeni `member_packages` yazıldığında bekleyen talebi `handled` yapar —
talep, üyenin istediği şeyin kendisiyle cevaplanır, yöneticinin hatırlaması
gereken ek bir dokunuşla değil. `notifyAdminsOnRenewalRequest` yöneticilere
push (`packages` kategorisi).

**Index:** `tenantId ASC, status ASC`

---

### `member_notes` — antrenörün üye notu (PER-14c)
**Doküman kimliği: `{tenantId}_{memberId}`**

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` | string | Kimliğe sabitlenmiş; kural, alanları düzenleyerek notun başka kişiye/salona taşınmasını engeller |
| `text` | string | 1–2000 karakter. Boş not saklanmaz, doküman silinir |
| `updatedBy` / `updatedByName` | string | Son yazan personel |
| `updatedAt` | Timestamp | |

**Kurallar:** okuma/yazma/silme = kiracı personeli (`isTenantStaff`). **Üye kendi
notunu okuyamaz** — notun varlık sebebi bu (sakatlık, hedef, dikkat edilecekler).
Salon başına üye başına **tek ortak not**, antrenör başına değil: küçük salonda
sahip de çalıştırıyor ve yalnızca yazanın gördüğü bir "dizi kötü" notu kimseyi
korumaz. `removeMemberFromTenant` / `deleteMyAccount` cascade listesinde.

---

### `exercise_reports` — hareket anlatımı sorun bildirimi (PER-19)
| Alan | Tip | Not |
|---|---|---|
| `exerciseId` | string | `exerciseLibrary.ts` içindeki kanonik id (ör. `back-squat`) |
| `exerciseName` | string | Denormalize — kütüphane değişse de raporun neyi anlattığı kalsın |
| `tenantId` | string | Bildirimi gönderen personelin salonu |
| `reportedBy` | string | Auth uid |
| `reportedByName` | string? | Denormalize |
| `reason` | `'pose' \| 'muscles' \| 'text' \| 'other'` | |
| `note` | string | En fazla 500 karakter |
| `createdAt` | Timestamp | |

**Kurallar:** istemci okuması **kapalı** (`allow read: if false`), güncelleme ve
silme de kapalı. Yalnızca ekleme, yalnızca **kiracı personeli**
(`isTenantStaff`), `reportedBy == auth.uid` zorunlu.

**Neden salt-yazılır:** hareket anlatımları uygulamayla birlikte gelen bizim
içeriğimiz, salonun verisi değil. Bir rapor geliştiriciye giden mesajdır;
salonun yöneteceği bir şey olmadığı için besleyecek bir gelen kutusu ekranı
da yok. Ayrıca başka bir salonu adıyla anan raporun o salonda görünmesinin
bir anlamı yok. Okuma Firebase konsolundan ya da Admin SDK ile yapılır — ayrıca
`emailExerciseReport` her yeni raporu Resend üzerinden e-posta olarak
iletir. E-posta **teslimat**tır, kayıt değil: gönderim başarısız olsa da
doküman durur.

**Neden yalnızca personel:** bir pozun hareketi yanlış anlatıp anlatmadığı
antrenörlük kararı; ayrıca her oturum açmış kullanıcıya yazma açmak burayı
spam hedefi yapar.

---

## Legacy koleksiyonlar (marte06 web uygulaması)

GymEntra bunları **kullanmaz**; aynı projede yaşarlar ve kurallar dosyasını
paylaşırlar. Dokunmadan önce marte06 tarafını kontrol et.

`members`, `assigned_packages`, `lessons`, `packages`, `settings`, `branches`
ve `payments` için ikinci (legacy) match bloğu.

---

## Cloud Functions

| Fonksiyon | Tetikleyici | İş |
|---|---|---|
| `setAdminClaim` | onCall | Küresel admin custom claim atar |
| `seedAdminClaims` | onCall | Toplu claim atama |
| `createAuthUserOnNewMember` | `members` create | Legacy (marte06) |
| `notifyOnMembershipApproved` | `tenant_memberships` update | Üyelik onaylandı push'u |
| `notifyOnPaymentStatusChange` | `payments` update | Ödeme onay/ret push'u |
| `notifyOnProgramAssigned` | `programs` update | Program atandı push'u |
| `emailExerciseReport` | `exercise_reports` create | Raporu Resend ile e-posta olarak iletir (PER-19). Anahtar yoksa loglar ve geçer — rapor zaten kayıtlı. |
| `syncPackageAssignmentCount` | `member_packages` yazım | `gym_packages.activeAssignmentCount` senkronu (PKG-1 kilidinin dayanağı) |
| `creditRollover` | zamanlanmış (günlük, 24 saat) | Süresi dolan her krediyi expired yapar; entitlement kaynaklıları bir sonraki döneme yuvarlar, tek transaction'da (PKG-2, eski adı renewEntitlementCredits) |
| `notifyOnPackageChangeRequested` | `package_change_requests` create | Üyeye "paket teklifin var" push'u (PKG-6) |
| `approvePackageChange` | onCall (eski adı `applyPackageChange`, trigger'dı) | Üyenin onay/red kararı; onayda tek transaction'da eski paketi kapatır, yenisini açar, kredi/promosyon/iade işler, tenant sınırı ve çift-onay/tekillik kontrol eder (PKG-6, Faz 1.6) |
| `expirePendingPackageChangeRequests` | zamanlanmış (günlük, 24 saat) | Süresi geçen bekleyen teklifleri `expired` yapar (PKG-6) |
| `syncMemberEntitlements` | `member_packages` yazım | `member_entitlements` önbelleğini günceller — `classes` rezervasyon kuralının tek okumada kontrol edebilmesi için (PKG-4) |
| `syncTrainerBusySlots` | `pt_sessions` yazım (create/update/delete) | `trainer_busy_slots` aynasını senkronlar — kimlik alanları olmadan (PKG-7/8) |
| `reconcileMirrors` | zamanlanmış (haftalık, pazartesi 03:00) | 5 aynayı (`tenants.activeMemberCount`, `tenants.activeAdminCount`, `gym_packages.activeAssignmentCount`, `member_entitlements`, `trainer_busy_slots`) kaynağından yeniden türetip sapmayı düzeltir — trigger'lar hiç tetiklenmezse tek güvence budur (Faz 2.3) |
| `bookPtSessions` | onCall | Üyenin kendi randevusunu alması: müsaitlik + çakışma + kredi yeterliliğini tek transaction'da doğrular, en erken bitecek krediden başlayarak düşer, `pt_sessions` dokümanlarını `creditId` ile yazar (PKG-8) |
| `cancelPtSession` | onCall | Randevu iptali + kredi iade kararı: antrenör/admin her zaman iade, üye yalnızca `cancellationHours` öncesinde iade (PKG-11, Faz 1.9) |

> Bu tablo eksik: `deleteMyAccount`, `assignMembershipShortCode`,
> `promoteFromClassWaitlist`, `syncActiveMemberCount` RM fazında eklendi ama
> hiç yazılmadı. Buraya dokunan bir sonraki kişi tamamlasın.

Push gönderimi Expo API'sine (`exp.host/--/api/v2/push/send`) Node 22'nin
yerleşik `fetch`'i ile yapılır; ek bağımlılık yok.

---

## Şema değiştirirken kontrol listesi

1. `src/data/types.ts` içindeki tipi güncelle.
2. `convert.ts` dönüşümünü güncelle (eksik alanlarda geriye dönük uyumlu ol —
   eski dokümanlarda yeni alan yoktur, `?`/varsayılan kullan).
3. İlgili `*Repo.ts` sorgusunu/yazımını güncelle.
4. `firestore.rules` — yeni alan yazılabilir mi, kim yazabilir?
5. Sorgu eşitlik dışı filtre veya farklı alanda `orderBy` içeriyorsa
   `firestore.indexes.json`'a composite index ekle.
6. **Bu dosyayı güncelle.**
7. `firebase deploy --only firestore:rules,firestore:indexes --dry-run` ile
   doğrula, sonra kullanıcı onayıyla production'a çık.
