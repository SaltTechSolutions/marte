# Firestore -> D1 veri aktarım aracı (F4)

Bu dizindeki araçlar Firestore'daki GymEntra verisini D1'e taşımak içindir. **Hiçbiri kendi
başına hiçbir yere bağlanıp yazmaz.** Ne wrangler çalıştırırlar, ne Cloudflare'e erişirler, ne de
Firestore'a yazarlar. Ürettikleri komutları ekrana basarlar; çalıştırmak operatörün işidir.

> **Üretim D1'ine yazmak sahibin (Tarkan'ın) açık onayını ister.** Bu runbook'taki "ÜRETİM"
> adımlarının hiçbiri onay olmadan çalıştırılmaz. Önce STAGING, her zaman.

| Dosya | Ne yapar |
|---|---|
| `export-firestore.mjs` | Firestore'dan **salt-okunur** döküm alır; koleksiyon başına bir JSONL |
| `transform.mjs` | Dökümü D1 `INSERT` dosyalarına çevirir; `report.json` ve `id-map.json` üretir |
| `reconcile.mjs` | D1'e yüklenen veriyi dökümle karşılaştırır, çek başına PASS/FAIL |
| `lib/specs-core.mjs`, `lib/specs-activity.mjs` | **Tablo tablo eşleme.** Yeni sütun = bir satır |
| `../../test/migrate.test.ts`, `../../test/fixtures/migrate/` | Testler ve elle yazılmış örnek dokümanlar |

## 0. Hazırlık

- Node 22.5 veya üstü (`node:sqlite` kullanılır; yerel doğrulama için). `api/` içinden çalıştırın.
- Yalnızca dışa aktarım için `firebase-admin` gerekir. **Bağımlılık olarak eklenmedi**
  (`api/package.json` değişmedi); yalnızca bu iş için, kaydetmeden kurun:

  ```bash
  cd api && npm i --no-save firebase-admin
  ```

  Sonraki `npm install` / `npm ci` bunu siler; dışa aktarımdan hemen önce kurun.
- Kimlik: `gcloud auth application-default login` (ADC) **ya da** `--credentials servis-hesabi.json`.
  Hesaba yalnızca okuma rolü verin (`roles/datastore.viewer`; `--with-auth` için ek olarak
  `roles/firebaseauth.viewer`). Yazma yetkisi olan bir hesapla çalıştırmayın: araç yazmaz,
  ama yetki vermemek en sağlam güvencedir.
- Dökümün ve `id-map.json`'ın **kişisel veri** içerdiğini unutmayın. Depo dışında bir dizinde
  (ör. `~/migration/2026-10-rehearsal/`) tutun, git'e eklemeyin, iş bitince silin.

## 1. Prova dökümü (üretime dokunmaz)

```bash
cd api
node scripts/migrate/export-firestore.mjs --project tarabyamarte --out ~/migration/rehearsal-1 --with-auth
```

- `--project` zorunludur ve varsayılanı yoktur; araç projeyi yazdırır. `FIRESTORE_EMULATOR_HOST`
  tanımlıysa emülatörden döküm almamak için reddeder.
- Çıktı: `tenants.jsonl`, `tenant_memberships.jsonl`, ... ve `tenants__private.jsonl`
  (`tenants/{id}/private/*`, her satırda `__tenantId`), `manifest.json` (sayılar, zaman).
  Timestamp'ler `{"__ts": ms}`, doküman kimliği `__id`.
- `--with-auth`: yalnızca üyeliği/velisi olan uid'ler için Auth kaydı (ad, e-posta, oluşturulma
  zamanı) `auth_users.jsonl`'e yazılır. Tam kullanıcı listesi **alınmaz** (proje marte06 ile
  ortak), parola özeti istenmez/yazılmaz. Bu dosya olmadan da çalışır; o zaman silinmiş
  hesapları ayırt edemez (bkz. "Bilinmeyenler").
- Çalışırken yazılan veri **anlık görüntü değildir** (sayfa sayfa okunur). Tutarlı döküm yalnızca
  dondurma penceresinde (adım 6) alınabilir.

## 2. Dönüştürme ve rapor

```bash
node scripts/migrate/transform.mjs --in ~/migration/rehearsal-1 --out ~/migration/sql-1 \
     --db gymentra-staging --env staging
```

Araç önce SQL'i bellekte bir SQLite'a (migration'lardan kurulu, foreign key'ler AÇIK) uygular;
kural ihlali varsa **dosya yazmadan** durur. Sonra `data-0001.sql ...` (her biri en çok 500
ifade; `--chunk N`), `reset-STAGING-ONLY.sql`, `report.json`, `id-map.json` yazar ve elle
çalıştırılacak wrangler komutlarını **basar** (çalıştırmaz).

**`report.json`'ı okumadan hiçbir şeyi uygulamayın.** İçinde:

| Bölüm | Anlamı |
|---|---|
| `orphans` | Var olmayan bir kayda bağlı doküman (üyeliği olmayan üyenin kredisi, kredisi olmayan rezervasyon, ...). **SQL'e girmez**, operatör karar verir |
| `invalid` | D1'in tutamayacağı değer (`used > total`, kesirli tutar, geçersiz tarih, bilinmeyen durum). SQL'e girmez |
| `conflicts` | Aynı salon kodu birden çok salonda (Firestore tekilliği zorlamıyordu); en eskisi kalır |
| `warnings` | Veri kalır ama dikkat ister (`legacy-role`, `roles-defaulted`, `short-code-duplicate`, `payment-of-deleted-account`, ...) |
| `counters` | Firestore'daki sayaç ile yeniden hesaplanan fark (`drift: true`) |
| `unmapped` | Hiçbir sütuna/JSON'a girmeyen alan — beklenmiyorsa şema değişmiştir |
| `dropped` | Bilerek taşınmayan kopyalar ve atılan aynalar (sayılı) |
| `skipped`, `unknownCollections` | Atlanan (legacy marte06, bilinmeyen alt doküman) ve dökümde olan ama tanınmayan koleksiyonlar |
| `schemaNotes` | Migration'larda olup aracın doldurmadığı tablolar |

`report.clean: false` ise (orphan/invalid/conflict var) **kasıtlı bir karar vermeden** ilerlemeyin.

## 3. STAGING'e uygula

Staging D1 üretimden ayrıdır (`wrangler.jsonc` → `env.staging`). Migration'ların staging'de
uygulandığını doğrulayın (`wrangler d1 migrations list gymentra-staging --env staging --remote`),
sonra komutları **elle** çalıştırın:

```bash
# isteğe bağlı: önceki provanın verisini boşaltır. YALNIZCA STAGING.
wrangler d1 execute gymentra-staging --env staging --remote --file ~/migration/sql-1/reset-STAGING-ONLY.sql
# sırayla, hepsi:
wrangler d1 execute gymentra-staging --env staging --remote --file ~/migration/sql-1/data-0001.sql
wrangler d1 execute gymentra-staging --env staging --remote --file ~/migration/sql-1/data-0002.sql
...
```

- Dosyalar **sırayla** uygulanmalı: ebeveyn tablolar önce (kullanıcılar, salonlar, üyelikler, ...).
  D1 foreign key'leri uygular; sıra bozulursa ifade reddedilir.
- `INSERT OR REPLACE` bilerek kullanılmaz (REPLACE çocuk satırları CASCADE ile siler). Yarıda
  kalan bir yüklemeden sonra çözüm: reset dosyası (yalnızca staging) ve baştan.
- Staging'de Worker'ın test kullanımıyla oluşmuş satırlar reset ile silinir; bu istenen davranıştır.

## 4. Mutabakat (reconcile)

```bash
node scripts/migrate/reconcile.mjs --print-commands --db gymentra-staging --env staging --d1 ~/migration/d1-dump-1
# basılan komutları elle çalıştırın (hepsi yalnızca SELECT; her biri bir JSON dosyası yazar), sonra:
node scripts/migrate/reconcile.mjs --export ~/migration/rehearsal-1 --d1 ~/migration/d1-dump-1
```

Çıkış kodu 1 ise en az bir çek FAIL/MISSING'dir. Kontroller: salon sayaçları, üyelik durum ve rol
dağılımı, yönetilen üye / veli sayısı, ders ve rezervasyon (kredi destekli sayısı), ödeme
(salon × durum × tür için adet ve toplam), kredi (tür × durum için adet, toplam, kullanılan),
paketler ve atama toplamları, ölçüm, program, antrenman günlüğü, check-in, PT, vb.

"Beklenen" değer, `transform`'un yazdığı satırlardan hesaplanır (yani raporda dışlananlar
çıktıktan sonra). Dışlananlar her çalıştırmada ayrıca listelenir ve onaylı ödeme toplamı
**ham dökümden bağımsız** hesaplanıp karşılaştırılır; fark varsa `WARN` basılır. Yeşil bir
reconcile, küçülmüş bir aktarımı gizleyemez.

Yeşil reconcile **veri doğruluğunun kanıtı değildir**: sayıları ve toplamları doğrular, alan
içeriğini değil. Staging'de gerçek bir hesapla uygulamayı açıp (`/v1/me` aynı iç kimliği
vermeli, ders/paket/ödeme ekranları dolu olmalı) elle bakın.

## 5. Dondurma penceresi (sahibin onayıyla)

Tek yazma otoritesi kuralı (docs/CLOUDFLARE-GECIS.md): kesimden sonra eski istemciler Firebase'e
yazamaz. Pencereyi başlatmak (zorunlu güncelleme, Firestore yazma kapatma) **üretim değişikliğidir
ve sahibin onayını ister**; bu araçlar bunu yapmaz. Pencere boyunca Firestore yazıları durmuş
olmalı, çünkü adım 6'daki döküm ancak o zaman tutarlıdır.

## 6. Son döküm -> ÜRETİM (SAHİBİN AÇIK ONAYI GEREKİR)

1. Dondurmadan sonra yeniden: `export-firestore.mjs` (yeni dizin) -> `transform.mjs` (yeni dizin).
2. `report.json`'ı provayla karşılaştırın; beklenmeyen yeni orphan/invalid/unmapped yoksa devam.
3. Üretim D1'inin **boş** olduğunu doğrulayın (`SELECT count(*) FROM tenants/users/memberships/payments` = 0).
   Boş değilse DURUN; reset dosyasını üretimde **asla** çalıştırmayın.
4. Önce üretim D1'in yedeğini alın (`wrangler d1 export`), sonra sahibin onayıyla `data-*.sql`
   dosyalarını sırayla uygulayın.
5. `reconcile.mjs --print-commands` (üretim DB adıyla) -> çalıştır -> `reconcile.mjs`. Tüm çekler PASS olmadan
   Worker trafiği açılmaz.

## Geri alma: dürüst durum

- **D1 yazmaları açılmadan önce** (prova, staging, hatta üretime yükleme sonrası ilk reconcile):
  geri almak kolay. Firestore'a hiç dokunulmadı; staging reset dosyasıyla boşaltılır, üretim için
  yeni/boş bir D1 ya da (sahibin onayıyla) silme gerekir.
- **Uygulama D1'e yazmaya başladıktan sonra** otomatik bir geri alma **yoktur**. Firestore ile D1
  ayrışır; D1'deki yeni yazmaları Firestore'a geri taşıyan bir ters aktarım betiği **yazılmadı**.
  Elde: ileri düzeltme; Cloudflare'in D1 Time Travel özelliğiyle D1'i eski bir ana döndürmek
  (kesimden sonraki D1 yazmalarını kaybettirir; bu görevde denenmedi, kullanmadan önce Cloudflare
  belgesinden doğrulayın); Firestore tarafında PITR (7 gün, docs/BACKUP.md) yalnızca kesimden
  **önceki** kaynağı kurtarır. DNS'i geri almak rollback değildir (docs/CLOUDFLARE-GECIS.md).
- Bu yüzden asıl güvence: prova + reconcile + dondurma penceresi + "boş üretim D1".

## Alan eşleme kararları (sahibin dikkatine)

1. **Para birimi — karara bağlandı (18 Ekim 2026): D1 ve API'de tam sayı KURUŞ.** Uygulama tutarları lira
   olarak girer ve gösterir; istemci sınırda 100 ile çarpar/böler. Bu yüzden araç varsayılan olarak
   **`--money-scale 100`** kullanır: Firestore'daki lira değerleri (`99.5` dahil) kuruşa çevrilir (tüm tutarlar:
   `payments.amount`, `member_packages.final_price`, `data` içinde `price`, `listPrice`, `priceDelta`,
   `refundAmount`, `currentSummary.price`, `proposedSummary.price` ve yalnızca `amountDiscount`
   promosyonun `value`'su). `reconcile.mjs` aynı bayrağı alır ve aynı varsayılana sahiptir. `--money-scale 1`
   yalnızca özel durumlar içindir; üretimde kullanma. Kuruştan küçük kesir (`99.505`) `invalid` olur.
2. **Orphan = dışlanır.** İstisna: `memberDeletedAt` işaretli ödemeler (hesabı silinmiş üyenin
   anonimleştirilmiş defter satırı) **tutulur**; üyelik satırı yoktur, `member_id` tutarlı iç
   kimliktir. Bunun dışında üyeliği olmayan üyenin her kaydı orphan'dır.
3. **Kullanıcılar.** Firestore'da `users` yok. `users` satırı: her üyelik sahibi + yalnızca
   başka yerde geçen gerçek hesaplar (üyeliği olmayan **veli**, salon sahibi, push token ve
   ayar sahibi). Veli için satır şart: yoksa ilk girişte yeni bir iç kimlik doğar ve çocukla bağı
   kopar. `auth_users.jsonl` varsa ve uid orada yoksa, yalnızca-referans uid için satır açılmaz
   (silinmiş hesap diriltilmez).
4. **Kimlik.** `u` + `sha256('firebase:' + uid)` ilk 20 hex; `mm…` kimlikleri aynen kalır
   (zaten iç kimlik). İçinde uid geçen belge kimlikleri iç kimliğe çevrilir: `renewal_requests`
   (`{tenantId}_{uid}`; API bu kimlikle upsert yapar), `pt_sessions` (`{tenantId}_{trainerId}_{ms}`),
   `class_cancellation_refunds`. Eski -> yeni eşleme `id-map.json > docs`.
5. **`payments.kind` yoksa `charge` yazılır** (Firestore böyle okurdu; D1 ters kayıt sorgusu
   `kind = 'charge'` arar).
6. **Sayaçlar** (`active_member_count`, `active_admin_count`, `active_assignment_count`) taşınan
   satırlardan yeniden hesaplanır (yalnızca `active` + `member`/`admin` rolü; atama sayacı
   `active`+`frozen`). `promotions.redeemed` olduğu gibi kalır; taşınan atamalarla uyuşmazsa
   `promotion-redeemed-drift` uyarısı.
7. **Rol.** `roles` yoksa eski tekil `role` okunur (`legacy-role` uyarısı). İkisi de yoksa en az
   yetki: `["member"]` (`roles-defaulted`). Tanınmayan rol atılır.
8. **Rezervasyon zamanı bilinmiyor.** Firestore'da yok; `class_bookings.created_at` = ders
   `createdAt`'i (yoksa başlangıcı) + dizi sırası (ms). Sıra korunur, saat gerçek değildir.
   Bekleme listesi aynı kuralla.
9. **Yoklama.** `class_attendance.marked_by` = `migration:firestore`, `marked_at` = ders başlangıcı
   (kimin/ne zaman işaretlediği Firestore'da hiç tutulmadı). Rezervasyonu olmayan üyenin işareti
   orphan.
10. **PT `refund_outcome`** Firestore'daki `creditRefunded` (bool) alanından **türetilir**
    (`refunded` / `late` / `no-credit` / `nothing-to-refund`); kayıt değil çıkarımdır.
    `cancelled_by_role` D1'in izin verdiği kümede kalır (`guardian` dahil).
11. **Abonelik.** `subscription` haritası `subscription_status/plan/platform/expires_at` sütunlarına;
    `subscription_event_at/_event_id` boş bırakılır (RevenueCat sıralama işareti sıfırdan başlar).
    Haritadaki diğer alanlar (ör. `productId`) için sütun yok: `subscription-extra-field` uyarısı.
12. **`member_packages.frozen_until`** (0030 migration notu gereği) `freezes[son].endsAt`'ten.
13. **Salon kodu** büyük harfe çevrilir (`tenant-code-normalised`); yinelenen kod `conflicts`.
    Yinelenen `short_code` ikinci satırda boşaltılır; `height_cm` 100–250 dışıysa boşaltılır.
14. **Taşınmayanlar:** `member_entitlements`, `trainer_busy_slots` (sayılı not), marte06
    koleksiyonları (`members`, `assigned_packages`, ...), `payments` içindeki `tenantId`'siz
    marte06 satırları (atlanır, sayılır), `password_reset_*` (geçici), `tenantCode`/`tenantName`
    kopyaları, `checkins.membershipId` (uid içerir, türetilebilir).
15. **Uid sızıntı denetimi:** SQL'de Firebase uid'i yalnızca `identities.subject` içinde bulunabilir;
    başka yerde görünürse `uid-leak` uyarısı verir.

## Bilinmeyenler (üretim verisi görmeden bilinemeyen)

- Gerçek dokümanlar hiç görülmedi; eşleme `docs/SCHEMA.md`, Cloud Functions ve kurallardan kuruldu.
  Eski (alanlar eklenmeden önceki) dokümanların şekli bilinmiyor; beklenmeyen alanlar `unmapped`'te,
  geçersiz değerler `invalid`'de çıkar.
- D1 sınırları (ifade boyutu, dosya başına süre/hacim, wrangler `--file` davranışı) yerelde
  denenemez; 500 ifade/dosya bir tahmindir. Yalnızca staging D1 gösterir. 100 KB'ı aşan ifade
  `statement-too-large` uyarısı verir.
- `wrangler d1 execute --json` çıktısının biçimi (`[{results:[...], success:true}]`) bilinen
  biçime göre yazıldı, bu makinede wrangler çalıştırılmadı; ayrıştırıcı başlık satırlarını tolere eder.
- Silinmiş Firebase hesaplarını ayırt etmek `--with-auth` ister; yoksa bir push token / ayar / veli
  uid'i için "hesap hâlâ var mı" bilinmez ve satır açılır.
- Mikrosaniye/nanosaniye Timestamp hassasiyeti ms'ye indirilir.
- Profil fotoğrafları **kaldırıldı** (18 Ekim 2026): `photo_url` taşınmaz (NULL), Storage dosyaları taşınmaz; üyeler hazır avatarlardan seçer. Mevcut fotoğrafların silinmesi için `backend/scripts/delete_member_photos.cjs` (dry-run varsayılan).
- Firebase Auth kimlik sağlayıcı olarak kalır; parola/oturum taşınmaz.
- Ters aktarım (D1 -> Firestore) yok.
- Dökümün, dondurma dışında tutarlı olduğu varsayılamaz.

## Yeni migration geldiğinde

`transform.mjs` her çalıştırmada migration'ları gerçekten çalıştırıp şemayı okur ve yazdığı
tablo/sütunları denetler:

- Yazılan bir sütun ya da tablo migration'larda yoksa -> `SchemaMismatchError` (araç durur, test kırılır).
- Migration'larda **default'u olmayan NOT NULL** (ya da PK) bir sütun eklenmiş ve araç onu yazmıyorsa -> aynı hata.
- Yeni **nullable** sütun hata değildir ama boş kalır; taşımak için ilgili tablonun `columns`
  nesnesine **bir satır** ekleyin (`lib/specs-*.mjs`), gerekirse `build` içinde alanı okuyun.
- Yeni tablo hata değildir; `report.schemaNotes` ve CLI çıktısında "doldurulmuyor" diye anılır.
- `class_waitlist` / `class_attendance` migration'larda yoksa veri kaybolmaz: `classes.data` içinde
  iç kimliklerle kalır ve rapora yazılır.

Testler: `cd api && npx tsc --noEmit && npx vitest run test/migrate.test.ts`
