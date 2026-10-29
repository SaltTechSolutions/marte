# Üretimi sıfırdan açma — runbook

Durum: **hazırlık, hiçbir adım çalıştırılmadı.** Sahip kararı (2026-10-29): uygulamayı kullanan aktif kullanıcı yok,
eski verinin önemi yok, Firebase verisine erişilmeyecek. Üretim **boş D1 + boş R2 + yeni uygulama** olarak açılır;
salonlar ve hesaplar uygulamadan sıfırdan oluşturulur (`POST /v1/tenants`, `api/src/tenants.ts`). Kimlik sağlayıcı
Firebase Auth olarak kalır; Firestore/Functions/Storage api kipindeki uygulama tarafından kullanılmaz.

Bu dosya eskiden "veri taşımalı tek seferde geçiş" runbook'uydu. O sürümden **iptal edilenler** (veri yok, gerek yok):
Firestore export/import/reconcile, dondurma penceresi ve salt-okunur kurallar, Cloud Scheduler `pause` ve callable
invoker kaldırma, zorunlu güncelleme / eski istemci duyurusu, Android kullanıcı sorusu, RevenueCat webhook
tamponlama, 21:05 UTC penceresi kaygısı, Time Travel yer imi, mağaza sürümünü "bekletme". Taşıma araçları
(`api/scripts/migrate/`) ileride bir taşıma ya da staging sıfırlaması için repoda durur.

**Kurallar.** Her adım ayrı bir "ONAY"dır: sahibin o adım için açık "başlat" mesajı gerekir, tek bir genel onay
sonrakilere genellenmez. Komutlar `api/` içinden çalışır ve her `wrangler` komutu `--env production` taşır
(üst seviye bilerek yer tutucudur, çıplak `wrangler deploy` başarısız olmalı). Önce `npx wrangler whoami` ile doğru
hesabı gör. **Hiçbir değer yazdırılmaz, loglanmaz, repoya girmez**; secret değerlerini sahibi kendisi yazar.
Wrangler sürümü 4.151.0 (bu belgedeki bayraklar `--help` ile bu sürümde doğrulandı).

| Kim | Anlamı |
|---|---|
| Sahip | Tarkan: değeri yazar, panelde tıklar, mağaza/RevenueCat işi |
| Ajan | komutu çalıştırır ve okuyarak doğrular, ama yalnız sahibin o adım için "başlat" demesinden sonra |

## 0. Önkoşul kontrolü (onay gerekmez, salt-okunur)
- [ ] `cd api && npx tsc --noEmit && npx vitest run && REAL_D1=1 npx vitest run --maxWorkers=3`
- [ ] Mobil: `cd apps/gymentra-mobile && npm run typecheck && npm run lint && npm test`, bir de `EXPO_PUBLIC_BACKEND=api npm test`
- [ ] Panelde (salt-okunur, sahip): Workers **Paid** planı (Free planda istek başına 50 alt istek sınırı ve hesapta 5 cron
      var; staging 3 + üretim 3 = 6 cron). `gymentra-api` adı boş mu. `salt-tech-apps.com` bölgesi aynı hesapta mı.
- [ ] `npx wrangler whoami` doğru hesabı gösteriyor. (Hesap kimliği repoya yazılmaz.)

## 1. D1 oluştur — ONAY (sahip veya ajan; geri alınabilir)
```bash
npx wrangler d1 create gymentra-prod --jurisdiction eu
```
`--jurisdiction` bu sürümde geçerli (`eu | fedramp | us`); verilirse `--location` ipucu yok sayılır. **Jurisdiction oluşturma
anında sabitlenir, sonradan değişmez.** Gizlilik metni "AB" der (bkz. §9). `--update-config` kullanma (dosyanın
yorumlarını bozabilir); çıkan `database_id`'yi `api/wrangler.jsonc` içinde **`env.production`** altındaki
`REPLACE_ON_CREATE` yerine elle yaz ve commit'le. Üst seviyedeki yer tutucuya dokunma.
- Kontrol (id `env.production`'a yazıldıktan sonra): `npx wrangler d1 info gymentra-prod --env production` → jurisdiction `eu`, `num_tables` 0. `npx wrangler d1 list` listede.
  **`--env production` şart:** bayraksız komut üst seviyedeki `gymentra-prod` kaydını (id `REPLACE_ON_CREATE`) çözer ve "bulunamadı" der (wrangler 4.151.0 kaynağında okundu, uzaktan denenmedi).
- Geri alma: `npx wrangler d1 delete gymentra-prod --env production` (boşken kayıp yok), config'te id'yi yer tutucuya döndür.

## 2. Şemayı uygula — ONAY
```bash
npx wrangler d1 migrations apply gymentra-prod --remote --env production
```
Komut uygulanacak migration'ları listeler ve onay ister; her migration hata verirse geri alınır.
- Kontrol: `npx wrangler d1 migrations list gymentra-prod --remote --env production` → "No migrations to apply";
  `npx wrangler d1 info gymentra-prod --env production` → tablo sayısı staging'le aynı (37 idi; karşılaştırma için `npx wrangler d1 info gymentra-staging --env staging`);
  `npx wrangler d1 execute gymentra-prod --remote --env production --command "SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM tenants) t"` → 0, 0.
- Geri alma: D1'i sil ve 1'den yeniden başla (boş).

## 3. R2 bucket oluştur — ONAY
```bash
npx wrangler r2 bucket create gymentra-media-prod --jurisdiction eu
```
(`-J` kısaltması da olur.) Config'teki `"jurisdiction": "eu"` bağlamayla eşleşmeli; jurisdiction'lı bucket'ta sonraki
**her** `r2 bucket ...` komutu da `--jurisdiction eu` ister. Bucket **kilidi (lock) koyma**: logo değişince eski nesne
silinir, kilit altında silme "başarılı" döner ama hiçbir şey yapmaz. r2.dev açık olmamalı: medyayı Worker sunar.
- Kontrol: `npx wrangler r2 bucket info gymentra-media-prod --jurisdiction eu`; `npx wrangler r2 bucket dev-url get gymentra-media-prod --jurisdiction eu` → disabled.
- Geri alma: `npx wrangler r2 bucket delete gymentra-media-prod --jurisdiction eu` (boşken).

## 4. Deploy — ONAY (üretim deploy'u; sahibin açık "deploy et" mesajı)
Temiz `main`, gözden geçirilmiş commit'ten; SHA'yı not et.

**Deploy öncesi iki okuma (ikisi de geçmeden deploy yok):**
1. `grep -c REPLACE_ON_CREATE api/wrangler.jsonc` → tam **2** (bir yorum satırı + üst seviye yer tutucu). Dosya bugün 3 veriyor; 3 ise `env.production` id'si hâlâ yer tutucu, 1. adım eksik. Staging'in kendi gerçek id'si vardır, sayıya girmez. Staging id'sini üretime yapıştırmak da bu sayımı geçer: bu yüzden 2. okuma şart.
2. `npx wrangler d1 info gymentra-prod --env production` → ad `gymentra-prod`, jurisdiction `eu`, `num_tables` 37 (committed id'yi çözer; yanlış ya da staging id'si burada ortaya çıkar).
```bash
npx wrangler deploy --dry-run --env production   # derlenir; bağlamalar DB, MEDIA (eu), FIREBASE_PROJECT_ID, PUBLIC_BASE_URL, API_OPEN="1"
npx wrangler deploy --env production
```
**Terim (her yerde aynı):** bakım modu = `API_OPEN` yok ya da `"1"` dışında bir değer → `/v1/*` 503 `maintenance`; api açık = `API_OPEN="1"`.
`API_OPEN` üretimde `wrangler.jsonc`'ta `"1"` olarak commit'lidir: api açık, ekstra adım yok. (Dry-run
`REPLACE_ON_CREATE` kimliğini denetlemez; 1. adım yapılmadan gerçek deploy'un Cloudflare'de reddedilmesi beklenir, ama denenmedi.)
Bakım modu kod yolu acil durum için durur: `API_OPEN` değerini `"0"` yapıp yeniden deploy edersen `/v1/*` (RevenueCat webhook'u
hariç) 503 `maintenance` döner ve mobil uygulama bunu bakım ekranı olarak gösterir; `"1"`'e döndürüp deploy edince api tekrar açılır.
Özel alan adı `api.gymentra.salt-tech-apps.com` aynı deploy'da `routes` ile oluşur (iki seviyeli alt alan adı: sertifika
**Active** olana kadar 15 dakikaya kadar sürebilir). `*.workers.dev` ve önizleme adresleri kapalıdır
(`workers_dev:false`, `preview_urls:false`; `*.workers.dev` bazı Türk ISS'lerinde engelli).
- Kontrol (dış kapıdan):
  - `dig +short api.gymentra.salt-tech-apps.com` çözülüyor; `curl -vI https://api.gymentra.salt-tech-apps.com/healthz` geçerli sertifika
  - `curl -sS -o /dev/null -w '%{http_code}\n' <url>`: `/healthz` **200**; `/v1/me` **401** (belirteç yok; bakım modunda 503 olurdu);
    `/.dev.vars` ve `/wrangler.jsonc` **404**; `/media/tenants/t/00000000000000000000000000000000.jpg` **404, 500 değil**
    (R2 bağlamasını kanıtlar; `/healthz` D1'e de R2'ye de dokunmaz); `POST /v1/webhooks/revenuecat` **503** (secret yok, fail-closed)
  - `npx wrangler deployments list --env production` yeni dağıtımı gösteriyor
  - iki dakika içinde `npx wrangler tail --env production` (ya da panelde Workers Logs; `observability` açık) dakikalık cron satırını gösteriyor ve satır `"outbox":{"claimed":0` içeriyor (hata/istisna değil). D1 bağlamasını kanıtlayan tek dış-kapı kontrolü budur
  - sahip: Türk mobil hattından, VPN'siz `/healthz` açılıyor
- Geri alma: ilk deploy'da önceki sürüm yoktur, bu yüzden `npx wrangler delete --env production` (sonraki deploy'larda `npx wrangler rollback --env production` önceki sürüme döner) (Worker'ı siler; alan adı rotasını panelden kaldırmak da gerekebilir). Veri yok, kayıp yok.

## 5. Secret'lar — ONAY (sahip değeri kendisi yazar; **Worker deploy edildikten sonra**, yoksa `secret put` boş bir Worker açar)
Değerleri sohbete, repoya, loga yazma. Secret'lar `wrangler.jsonc`'ta bilerek yoktur (panelden yazılan düz değişken bir sonraki deploy'da silinir).
1. `npx wrangler secret put RESEND_API_KEY --env production`
2. `npx wrangler secret put EXERCISE_REPORT_TO --env production` (egzersiz raporlarının gideceği adres; repoda yok). **Boş kalırsa** rapor
   satırı yeniden denenir ve sonunda `dead` olur (rapor kaydedilmiş kalır, e-posta gitmez).
3. RevenueCat webhook'u: sahip yeni bir rastgele değer üretir (Firebase'deki eski token'ı **okumaya gerek yok**). Önce RevenueCat
   panelinde webhook adresini `https://api.gymentra.salt-tech-apps.com/v1/webhooks/revenuecat` yap ve yetkilendirme başlığına
   aynı değeri koy; sonra `npx wrangler secret put REVENUECAT_WEBHOOK_SECRET --env production` (aynı değer).
   Secret girilene kadar Worker 503 döner, RevenueCat yeniden dener; ikisi de koyulduktan sonra RevenueCat'ten "test olayı" gönder.
   RevenueCat'te tek webhook adresi var: bundan sonra staging build'lerinin sandbox olayları da üretime gider (bilinmeyen salon → yok sayılır), yani staging abonelik denemeleri artık güncellenmez. App Review satın alımları sandbox olaydır; webhook'un ortam filtresini kontrol et.
- Kontrol: `npx wrangler secret list --env production` yalnız **adları** gösterir (üçü de var); RevenueCat test olayı **200** (bilinmeyen salon
  olduğundan `ignored`; `billing_events` satırı oluşmaz). Staging'de bugüne kadar secret yoktu, yani Resend ve RevenueCat yolu
  deploy edilmiş bir Worker'da hiç çalışmadı: ilk gerçek deneme burası, sonucu kayda geç.
  E-postanın gerçekten gittiğini 6. adım kanıtlar (bir salon gerekir).
- Geri alma: `npx wrangler secret delete <AD> --env production`; RevenueCat adresini eski haline döndür.

## 6. İlk hesap, demo salon ve App Review hesabı — sahip, uygulamadan
- İlk yönetici hesabı ve salon uygulamadan oluşturulur (`POST /v1/tenants`). Bu **ilk kimlikli üretim isteğidir**; artık
  sakıncası yok (D1 zaten boş ve taşınacak veri yok).
- **App Review için çalışan bir giriş ve bir salon gerekir; mağaza gönderiminden önce üretimde hazır olmalı.** Kurallar:
  1. Uygulamada (`onboarding/register`) **yepyeni** bir e-posta/parola hesabı aç. Parola yeni üretilir ve **yalnız** App Store Connect "App Review Information" notlarına yazılır; repoya, sohbete, loga asla.
  2. Salonu `onboarding/create-gym` ile aynı hesapla kur (tek `POST /v1/tenants` salonu ve yöneticisini birlikte oluşturur).
  3. İsteğe bağlı: üye ve antrenör ekranlarını göstermek için ikinci yeni hesap salon koduyla katılır, yönetici onaylar ve antrenör rolü verir (katılım onaylanana kadar `pending` kalır).
  4. **Repoda yayımlı hiçbir giriş yeniden kullanılmaz:** test hesapları (`apps/gymentra-mobile/AGENTS.md`) ve Supergym demo hesapları (`backend/scripts/README-supergym-demo.md`) public repoda duruyor ve Firebase Auth üretimde de geçerli; onlarla giriş yapan herkes salonun yöneticisi olur.
  5. Salon kodunu inceleme notlarına yaz (Apple ile giriş yapan inceleyici `gym-code` ekranına düşer).
  Not: Supergym tohum betiği (`marte06/scripts/seed_supergym_demo.cjs`, `docs/BUILD.md`) **Firestore'a** yazar, D1'e değil; D1 için tohum betiği yok. Demo salon elle kurulur ya da D1'e tohumlayan ayrı bir iş açılır. Gerçek kişi verisi demo salona girmez.
- Kontrol: sahip demo hesapla cihazda yönetici, üye ve antrenör akışlarını açar; `npx wrangler d1 execute gymentra-prod --remote --env production --command "SELECT count(*) FROM tenants"` ≥ 1.
- **E-posta yolu (5. adımın kanıtı):** demo salondan bir egzersiz raporu gönder, sonra `npx wrangler d1 execute gymentra-prod --remote --env production --command "SELECT kind, status, last_error FROM outbox ORDER BY rowid DESC LIMIT 5"` → `email` satırı birkaç dakika içinde `sent`. `pending` kalır ya da `dead` olursa Resend alan adı/anahtar ya da `EXERCISE_REPORT_TO` yanlıştır.

## 7. Mobil sürüm (mağaza) — ONAY (EAS bulut build ve mağaza gönderimi ayrı onay ister)
Playbook'lar: `pb-expo-eas`, `pb-store-release`; build öncesi `docs/BUILD.md` (yalnız yerel build, JDK tuzağı).
- `apps/gymentra-mobile/eas.json` `production` profili zaten `EXPO_PUBLIC_BACKEND=api` ve
  `EXPO_PUBLIC_API_URL=https://api.gymentra.salt-tech-apps.com` gömer (**build anında**). Paketin içinde
  üretim adresinin geçtiğini, `workers.dev`'in geçmediğini artefakt üzerinde doğrula.
- **`eas update` eas.json'daki `env`'i okumaz** (`docs/BUILD.md`). Bu iki değişken EAS **`production` ortamında** yoksa, ilk `eas update`
  paketi **Firebase kipinde** derler ve api kipindeki binary'nin arka ucunu sessizce geri çevirir. İlk OTA'dan önce, sahip onayıyla
  (dış servis yazımı), düz metin olarak ekle: 
  ```bash
  cd apps/gymentra-mobile
  npx eas env:set production --name EXPO_PUBLIC_BACKEND --value api --visibility plaintext
  npx eas env:set production --name EXPO_PUBLIC_API_URL --value https://api.gymentra.salt-tech-apps.com --visibility plaintext
  ```
  (`eas env:set` bu eas-cli'da mevcut; `env:create` kullanımdan kalkmış.) Sonra OTA'yı `eas update --environment production ...` ile gönder
  ve paketin üretim adresini taşıdığını doğrula. Eski satır "OTA ile açılmaz, çünkü fingerprint değişir" **doğrulanmamış ve büyük olasılıkla yanlıştı**:
  `app.json` `runtimeVersion` politikası `fingerprint`, `app.config.*` yok, env değeri parmak izini muhtemelen değiştirmez. Kesin için
  `npx expo-updates fingerprint:generate`'i iki ortamda karşılaştır (henüz yapılmadı).
- **OTA yalnız EAS'ta derlenmiş binary'lere ulaşır** (`docs/BUILD.md`, `eas update` bölümü): yerelde derlenen mağaza sürümü OTA'yı görmez (`CheckCompleteUnavailable`), bu yüzden düzeltme için yeni build gerekir. Yukarıdaki EAS ortamı adımı OTA kullanılacaksa geçerlidir.
- Android güncellemesi durduruldu (Play'de ilerleme olmadıkça Android'e build/OTA yok); bu sürüm iOS içindir.
- TestFlight/App Store sürümü gerçek hesapla doğrudan üretime bakar; kullanıcı yok, bu yüzden "bekletmeli yayın" gerekmez.
- Geri alma: mağazada sürümü yayından kaldır ya da bir önceki sürümü seçilir tut; OTA için önceki güncellemeye geri dön.

## 8. Firebase'e ne olur (veriye ve kurallara dokunulmaz; zamanlayıcılar için bir öneri var)
Firestore, Functions (callable'lar, `revenueCatWebhook`) ve kurallar **olduğu gibi deploy'lu kalır, kullanılmaz.** İlk aşamada silme, kuralları değiştirme, Functions kaldırma yok.
- **Önerilen, geri alınabilir adım (sahip "başlat" derse):** 6 Cloud Scheduler işini durdur. Yoksa eski Firestore verisinden üretilen "paketin bitiyor" ve ders hatırlatma bildirimleri (`notifyExpiringPackages`, `sendClassReminders`) Firebase-dönemi build'den yerinde güncellenen telefonlara (aynı Expo token Firestore'da duruyor) yeni sistemin bildirimlerinin yanında gelmeye devam eder.
  ```bash
  gcloud scheduler jobs list --project tarabyamarte --location europe-west1
  gcloud scheduler jobs pause <iş-adı> --project tarabyamarte --location europe-west1   # 6 iş için tekrarla
  ```
  Kontrol: `list` çıktısında 6 iş de `PAUSED`. Geri alma: aynı komutla `gcloud scheduler jobs resume <iş-adı> --project tarabyamarte --location europe-west1`. Önerilen: durdur. Sahip durdurmamayı seçerse bu bilinen bir risk olarak kabul edilmiş sayılır (deftere yazılır).
- RevenueCat webhook adresi yeni Worker'a çevrilir (5. adım 3); Firebase'deki `revenueCatWebhook` artık olay almaz.
- **Firebase Auth** kimlik sağlayıcı olarak kalır; **FCM** projesi (Android bildirimi) ve **Storage `tenant-logos/`** aynen kalır.
  "Auth hariç servisleri kapat" artık geçerli bir adım değildir.
- Firebase faturası / projeyi kapatma, Functions'ı kaldırma ve Firestore verisini silme **sonraki, ayrı bir karardır** (ayrı onay);
  silmeden önce Firestore dökümü alınıp alınmayacağına sahip karar verir.
- Eski (Firebase kipi) mağaza sürümlerini kullanan kimse olmadığı varsayılıyor. Biri çıkarsa o istemci boş Firebase'e değil
  artık kullanılmayan veriye yazar; yeni sürüme geçirmekten başka çaresi yok.

## 9. Gizlilik metinleri — mağaza sürümünden ÖNCE (`pb-privacy-legal` playbook'unu yükle)
Bu runbook politikayı **düzenlemez**; `apps/gymentra-site` ve `apps/gymentra-mobile/APP_PRIVACY.md` ayrı işte güncellenir. Metinde şunlar
yer almalı, çünkü api bunları kullanır:
- **Cloudflare** (Workers, D1, R2; barındırma ve günlükler/Workers Logs): veri işleyen taraf, AB jurisdiction'ı (D1 ve R2 `eu`). Firebase
  yalnız **Authentication** (ve FCM bildirim altyapısı) olarak anılır; Firestore/Cloud Storage ibareleri kalkar
  (`apps/gymentra-site/privacy/index.html` ~satır 43, 81, 95; `APP_PRIVACY.md` ~112). Yeni arka uç Firestore/Storage'ı kullanmadığı için eski ibareler yanlış olur.
- **Resend**: e-posta gönderimi (egzersiz raporu e-postaları); alıcı adresi ve rapor içeriği Resend üzerinden geçer, gönderen alan adı bizim.
- **Cloudflare günlükleri**: istek günlükleri (IP, yol, durum) hata ayıklama için tutulur; saklama süresi ve amaç yazılmalı.
- Profil fotoğrafı kaldırıldı (önceki sürümlerden kalan metin) ve hesap silme akışı yeni arka uçta da çalışmalı.
- Mağaza etiketleri (App Store "App Privacy", Play "Data safety") veri türleri aynı kalsa da gözden geçirilir.

## 10. Kesim sonrası izleme
- [ ] İlk 48 saat günde iki kez: `npx wrangler d1 execute gymentra-prod --remote --env production --command "SELECT status, count(*) FROM outbox GROUP BY status"` ( `dead` > 0 ya da eski `pending` ise bak), Workers Logs 5xx.
- [ ] `d1 export` yedeği (`npx wrangler d1 export gymentra-prod --remote --env production --output <repo dışı yol>`), gerçek veri oluşmaya başlayınca; Time Travel her zaman açıktır.
- [ ] Hız sınırı: bölge WAF kuralı (`api.gymentra.salt-tech-apps.com/v1/*`, IP başına) kesimi engellemez, kullanıcı gelmeden yapılması iyi olur (api'de hız sınırı yok).
- [ ] `docs/KARAR-DEFTERI.md` kaydı; her adım sonrası sonucu (hangi komut, ne çıktı) deftere yaz.
