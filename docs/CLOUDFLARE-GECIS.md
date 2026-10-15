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
- **Giriş:** aşamalı. İlk aşamada Firebase Auth kimlik sağlayıcı olarak kalır,
  Worker ID token'ı doğrular; kendi oturum sistemi ayrı bir kararla gelir.
- **Bildirim:** Expo Push kalır. Android için FCM gerektiğinden küçük bir Firebase
  projesi (Blaze gerekmez) ayakta kalır.

## Aşamalar

| # | İş | Çıkış ölçütü |
|---|---|---|
| F0 | Karar ve tasarım: şema dönüşümü (28 koleksiyon → tablo), canlı veri, giriş, alan adı. Yerel test düzeni (vitest + Miniflare, yerel D1) | Şema belgesi onaylı, bir örnek uç testle çalışıyor |
| F1 | Salt-okunur dilim: Worker + D1 + token doğrulama; salon ve üyelik okuma. Mobilde `src/data/api/` arayüzü, Firebase ile aynı imza | Uygulama bir ekranı yeni uçtan okuyor |
| F2 | Yazma + yetki: kuralların middleware'e taşınması; 250 testin karşılığı | Kural test envanteri %100 karşılandı |
| F3 | Sunucu mantığı: 28 callable → uç, 31 tetikleyici → açık çağrı/Queue, 9 zamanlanmış → Cron | Fonksiyon testlerinin (141) karşılığı geçiyor |
| F4 | Canlı veri ve çevrimdışı (üye kartı önbelleği) | 49 dinleyicinin karşılığı çalışıyor |
| F5 | Geçiş: yeni mağaza sürümü; Firestore → D1 aktarım betiği; eski sürümler için Firebase'i belirli süre açık tut; kapat | Eski projeye trafik sıfır |

Her aşama ayrı onay ister; F5'e kadar üretimde hiçbir şey değişmez.

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

1. **Canlı veri:** Durable Object + WebSocket (gerçek zamanlı, daha çok iş) mı,
   yoklama + push sinyali (basit, birkaç saniye gecikmeli) mi? Salon sahibi
   ekranları için yoklama yeterli görünüyor; ders doluluğu ve üye kartı en çok
   canlı olması gereken yerler.
2. **Giriş:** F1–F4 boyunca Firebase Auth kalsın mı (önerim), yoksa baştan mı?
3. **Alan adı:** `api.gymentra.salt-tech-apps.com` uygun mu?
4. **Mevcut hazır özellik (elle üye, özel not, adres):** Firebase'e deploy edilip
   sonra mı taşınsın, yoksa deploy edilmeden doğrudan Cloudflare'e mi yazılsın?
   Önerim: deploy etme, F2–F3'te taşı. Mağazada olmayan bir özellik için iki kez
   iş yapmanın anlamı yok. Mobil tarafı (ekranlar) repo arayüzü üzerinden olduğu
   için büyük ölçüde korunur.
5. **Sıra:** yeni özellik geliştirmeyi taşıma süresince durduralım mı?
