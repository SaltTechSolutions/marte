# Arka ucu Cloudflare'e taşıma — taslak (15 Ekim 2026)

**Durum:** öneri, onay bekliyor. Hiçbir kod yazılmadı.
**Sebep (kullanıcı):** tüm yeni projeler Cloudflare'de, GymEntra tek istisna; bu
karışıklık yaratıyor. Maliyet bir sebep değil (üretim projesi zaten Blaze'de ve
kullanım küçük).
**Neden şimdi:** gerçek kullanıcı ve veri çok az; taşımanın en ucuz zamanı bu.

## Bugünün ölçüsü (taşınacak şey)

| | Firebase | Boyut |
|---|---|---|
| Veri | Firestore | 28 koleksiyon |
| Yetki | `firestore.rules` + `storage.rules` | 1.311 satır, 250 kural testi |
| Sunucu | Cloud Functions | 4.374 satır: 28 callable, 31 Firestore tetikleyici, 9 zamanlanmış, 2 webhook |
| Mobil veri katmanı | `src/data/firebase/` | 38 dosya, 5.028 satır, 49 canlı dinleyici |
| Giriş | Firebase Auth (e-posta, Google, Apple) | 7 dosya |
| Dosya | Storage | 1 dosya (profil fotoğrafı) |

## Hedef mimari

- **API:** tek Hono Worker, özel alan adı (`*.salt-tech-apps.com`; `workers.dev`
  bazı Türk ISS'lerinde engelli, bkz. pb-cloudflare).
- **Veri:** D1. Çok kiracılı: her tabloda `tenant_id`. Paket/kredi/ödeme gibi
  ilişkisel veri Firestore'da ayna belge ve sayaç fonksiyonlarıyla (`reconcileMirrors`,
  `syncActiveMemberCount`) yürütülüyordu; SQL'de bunlar sorguya dönüşür.
- **Yetki:** kurallar → Worker middleware. Rol kontrolü **router seviyesinde,
  merkezi** (playbook: Move'da yazma uçları rolü kontrol etmiyordu). 250 kural
  testinin her biri bir API testine çevrilir; test listesi eksiksiz taşınmadan
  geçiş yapılmaz.
- **Canlı veri:** karar bekliyor (aşağıda). Durable Object + WebSocket ya da
  yoklama + push sinyali.
- **Dosya:** R2, imzalı URL.
- **Zamanlanmış / olay:** Cron Triggers (9) + Queues. **Firestore tetikleyicisinin
  karşılığı yok:** 31 tetikleyicinin her biri, tetikleyen yazmayı yapan uçta
  açıkça çağrılır ya da kuyruğa atılır. Bu en çok dikkat isteyen kısım.
- **Webhook:** RevenueCat → Worker.
- **Giriş:** KARARA BAĞLANDI (15 Ekim 2026): Firebase Auth kimlik
  sağlayıcı olarak kalır, Worker ID token'ı JWKS ile doğrular. **Çıkış yolunu
  açık tutan tasarım şartı:** D1 Firebase uid'ine bağlanmaz. Her kişinin iç
  kimliği (`users.id`) vardır, `identities(provider, subject, user_id)` tablosu
  Firebase uid'ini (ve ileride başka sağlayıcıları) iç kimliğe eşler. Elle eklenen
  üyeler zaten kimliksiz bir iç kimlikle yaşar. Böylece kimlik sağlayıcıyı
  değiştirmek yalnızca doğrulama katmanını ve giriş ekranlarını etkiler.
- **Bildirim:** Expo Push kalır. Android için FCM gerektiğinden küçük bir Firebase
  projesi (Blaze gerekmez) ayakta kalır.

## Strateji: paralel kur, tek seferde geç (15 Ekim 2026 düzeltmesi)

İlk taslak "dilimli geçiş" diyordu: önce bir alan, sonra diğeri, üretimde. **Bu
tutmuyor.** Firestore'daki neredeyse her kural rolü `tenant_memberships`
belgesinden okuyor (`isTenantAdmin` → `get()`). Üyelikler D1'e geçerse geri kalan 27
koleksiyonun kuralı yöneticiyi bulamaz; yalnızca bir parçayı taşıyıp ikisini aynı
anda doğru tutmak (çift yazma) hem karmaşık hem hataya açık. Elle üye özelliğinin
"doğrudan Cloudflare'e yazılması" kararı da bu yüzden tek başına uygulanamaz:
özellik, üyelik alanıyla birlikte taşınır.

Bunun yerine: **yeni arka ucu Firebase'in yanında, üretime dokunmadan kur; mobil veri
katmanını `src/data/api/` arayüzüyle hazırla; hazır olunca yeni mağaza sürümüyle tek
seferde geç.** Aşamalar aşağıda hâlâ *inşa sırası*, üretim dilimi değil. Kullanıcı
sayısı az olduğu için tek seferde geçiş burada ucuz ve güvenli.

Bu arada **üretimdeki uygulama değişmez**: yeni özellikler `src/data/features.ts`
bayrağının arkasında kapalı (`managedMembers: false`), kapalıyken uygulama
deploy edilmiş kuralların izin verdiği eski davranışı korur.

## Aşamalar (inşa sırası)

| # | İş | Çıkış ölçütü |
|---|---|---|
| F0 | Karar ve tasarım: şema dönüşümü (28 koleksiyon → tablo), canlı veri, giriş, alan adı. Yerel test düzeni (vitest + Miniflare, yerel D1) | Şema belgesi onaylı, bir örnek uç testle çalışıyor |
| F1 | Salt-okunur dilim: Worker + D1 + token doğrulama; salon ve üyelik okuma. Mobilde `src/data/api/` arayüzü, Firebase ile aynı imza | Uygulama bir ekranı yeni uçtan okuyor |
| F2 | Yazma + yetki: kuralların middleware'e taşınması; 250 testin karşılığı | Kural test envanteri %100 karşılandı |
| F3 | Sunucu mantığı: 28 callable → uç, 31 tetikleyici → açık çağrı/Queue, 9 zamanlanmış → Cron | Fonksiyon testlerinin (141) karşılığı geçiyor |
| F4 | Canlı veri ve çevrimdışı (üye kartı önbelleği) | 49 dinleyicinin karşılığı çalışıyor |
| F5 | Geçiş: yeni mağaza sürümü; Firestore → D1 aktarım betiği; eski sürümler için Firebase'i belirli süre açık tut; kapat | Eski projeye trafik sıfır |

Her aşama ayrı onay ister; F5'e kadar üretimde hiçbir şey değişmez. Aşamalar
birbirinin üstüne kurulur ama hiçbiri tek başına üretime çıkmaz.

## Playbook'tan gelen dersler (bu işe doğrudan uyan)

- **D1 `batch()` yalnız aynı çağrı içinde atomik.** Birlikte yazılması gereken her
  şey (kredi düş + randevu yaz) tek `batch`'te. Şu an bunlar Firestore transaction.
- **Ayrı staging D1.** Preview'ın üretim D1'ine bağlanması bilinen tuzak.
- **Migration'ı Worker'dan önce, durumu `--remote` listeden oku.**
- **CHECK kısıtı değiştirmek tablo yeniden kurar** (durum/rol enum'ları için şemayı
  ilk günden doğru kur).
- **Parola doğrulama:** Workers'ta PBKDF2 en çok 100.000 tur. E-posta/parola
  girişini kendimiz yazarsak buna göre; kod OTP'si kullanırsak anahtarlı HMAC ve
  doğrulama ucunda hız sınırı.
- **Sınır:** istek başına 10.000 alt istek; toplu işleri (ayna yeniden hesaplama,
  yedek) parçala.
- **Özel alan adı** store'a kayıtlı URL'lerde yeni sürümle değişir; eski yolu kırma.

## Bilerek ertelenenler

- Kendi oturum sistemi (F1–F4 boyunca Firebase Auth kalır).
- Firestore'un çevrimdışı önbelleğiyle birebir eşdeğerlik; yalnızca üye kartı ve
  salon belgesi (DEN-2/DEN-3'te korunan şeyler) için önbellek.
- Elle üye / yönetici notu / adres özelliğinin **Firebase'e deploy edilmesi** (bkz.
  karar 4).

## Kullanıcıdan beklenen kararlar

1. ~~**Canlı veri:**~~ **KARARA BAĞLANDI (15 Ekim 2026): yoklama + push sinyali.**
   Ders doluluğu ve üye kartı en çok canlı olması gereken yerler; oralarda
   yoklama aralığı kısa tutulur, değişiklikte push sinyaliyle anında yenilenir.
   Durable Object + WebSocket gerekirse sonradan eklenir.
2. ~~**Giriş:**~~ **KARARA BAĞLANDI: Firebase Auth kalır** (15 Ekim 2026); Worker ID token'ı JWKS ile doğrular, D1 iç `users.id` kullanır.
3. ~~**Alan adı:**~~ **KARARA BAĞLANDI: `api.gymentra.salt-tech-apps.com`.**
4. ~~**Mevcut hazır özellik (elle üye, özel not, adres):**~~ **KARARA BAĞLANDI
   (15 Ekim 2026): Firebase'e deploy edilmeyecek, Cloudflare'e yazılacak.** Ama
   yukarıdaki strateji notu gereği özellik tek başına değil, üyelik alanıyla
   birlikte taşınır. Bu arada mobil ekranlar `FEATURES.managedMembers` bayrağıyla
   kapalı; kod ve arka uç testleri (kurallar 251, fonksiyon 141) taşınacak
   davranışın belirtimi olarak duruyor.
5. **Sıra:** yeni özellik geliştirmeyi taşıma süresince durduralım mı?

## F0 durumu (15 Ekim 2026)

`api/` iskeleti kuruldu, **deploy edilmedi**: Hono Worker, `migrations/0001_init.sql`
(28 koleksiyon → 29 tablo, bkz. `docs/D1-SEMA.md`), Firebase ID token doğrulama
(JWKS, fail-closed), router düzeyinde rol kapısı, uçlar `/v1/me`, elle üye
oluşturma, yönetici notu. 7 test geçiyor. Testler gerçek workerd/D1 değil,
`node:sqlite` üzerinde koşar (`api/test/d1shim.ts`); D1 sınırları staging D1'de
ayrıca doğrulanmalı. Sırada F1: salt-okunur uçlar ve kural testlerinin portu.
