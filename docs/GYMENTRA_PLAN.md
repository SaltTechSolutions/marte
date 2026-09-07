# GymEntra — Mobil Dönüşüm ve Yayın Planı

_Tarih: 24 Temmuz 2026 — Claude ile birlikte çıkarılan yol haritası_

## Alınan kararlar

| Konu | Karar |
|---|---|
| Mobil çatı | **React Native + Expo + EAS** (mevcut Capacitor/React web kodu referans olarak kullanılacak, UI yeniden yazılacak) |
| Backend | **Firebase kalıyor** (Firestore + Auth + Functions + Storage) |
| White-label | **Tek uygulama + runtime branding** — üye salon koduyla katılınca uygulama o salonun logo/renklerine bürünür |
| Admin paneli | **Mobil uygulamanın içinde**, rol bazlı ekranlar (member / trainer / admin) |
| Gelir modeli | **Freemium**: her salon için ilk 10 üye ücretsiz, sonrası uygulama içi abonelik (Play Billing / StoreKit). **Tarabya Marte muaf** (sınırsız). |
| Store durumu | Google Play hesabı var → önce Android. Apple Developer hesabı sonra açılacak → iOS ikinci faz. |
| Mevcut veri | Tarabya Marte tenant'ı Firestore'da aynen kalır; test/gösterim salonu olarak kullanılır. Yeni salonlar boş başlar. |

## Mevcut durumun envanteri (marte06)

Yeniden kullanılacaklar:
- `src/types/tenant.ts` — Tenant / TenantBranding / TenantMembership modelleri (RN'e taşınacak)
- Firestore güvenlik kuralları + `tests/firestore.rules.test.ts`
- Cloud Functions (`setAdminClaim`, `seedAdminClaims`, `createAuthUserOnNewMember`)
- Backfill scriptleri (`backfill_tarabya_marte_tenant.cjs` vb.)
- İş mantığı ve ekran akışları (React sayfaları RN ekranlarının spesifikasyonu gibi kullanılacak)

Emekliye ayrılacaklar: Capacitor kurulumu (`ios/`, `android/`, capacitor.config.json), mevcut GitHub Actions workflow'ları (EAS tabanlılarıyla değişecek), vite-plugin-pwa.

Mevcut web uygulaması, mobil uygulama yayına girene kadar Tarabya Marte için **çalışır durumda tutulur**.

## Faz 0 — Temel kurulum (≈1 hafta)
- `gymentra-mobile/` altında yeni Expo projesi (TypeScript, Expo Router)
- Kütüphane seçimi: TanStack Query (server state) + Zustand (app state), NativeWind (styling), `@react-native-firebase/*` (Auth/Firestore/Messaging — Expo dev build gerektirir, Expo Go ile çalışmaz; EAS dev build kullanılacak)
- Ortak paket: tenant/member tipleri web'den taşınır
- Tema motoru: `TenantBranding` (logoUrl, primaryColor, accentColor, themeMode) runtime'da uygulanır; varsayılan GymEntra markası (logo SVG'deki #0B0F19 zemin, #10B981→#06B6D4→#3B82F6 gradyanı)
- Logo varlıkları: adaptive icon, splash screen, Play Store listeleme görselleri

## Faz 1 — Auth + tenant çekirdeği (≈2 hafta)
- Firebase Auth ile giriş/kayıt (e-posta + telefon)
- Salon sahibi onboarding: salon oluştur → logo yükle (Storage) → renk seç → salon kodu üretilir
- Üye onboarding: salon koduyla katılım isteği → admin onayı (mevcut TenantMembership akışı)
- Rol bazlı navigasyon (member / trainer / admin sekmeleri)
- Firestore kuralları gözden geçirilir: tüm koleksiyonlar tenant-scoped, yeni tenant'lar Tarabya verisine erişemez (kural testleriyle doğrulanır)

## Faz 2 — Üye deneyimi (≈3-4 hafta)
- Üyelik & paket görünümü, kalan ders/gün sayacı
- Dijital üye kartı + **QR ile giriş/yoklama** (üye QR gösterir, resepsiyon/kiosk okutur; giriş kaydı Firestore'a düşer)
- **Vücut ölçüm & ilerleme**: kilo, yağ oranı, çevre ölçüleri, ilerleme fotoğrafları, hedefe ilerleme grafikleri (mevcut MemberGoalsPage genişletilir)
- **Antrenman programı + egzersiz kütüphanesi**: eğitmen program atar, üye set/tekrar işaretler, geçmiş
- **Ders/randevu rezervasyonu**: grup dersi + PT takvimi, kontenjan, bekleme listesi, iptal kuralları
- Push bildirimleri (FCM): ders hatırlatma, paket bitiş uyarısı, onay bildirimleri

## Faz 3 — Admin/eğitmen deneyimi (≈3-4 hafta)
- Üye yönetimi (liste, profil, sağlık notları, onaylar)
- Paket & ödeme takibi (mevcut Payments modülü mobile taşınır)
- Ders programı & kontenjan yönetimi
- Yoklama/doluluk panosu (QR girişlerinden beslenir)
- Marka ayarları: logo değiştir, renk seç, salon bilgileri
- Eğitmen rolü: kendi üyelerine program atama, seans takvimi

## Faz 4 — Gelir modeli (≈1-2 hafta)
- **RevenueCat** ile Play Billing (ileride StoreKit'i de aynı koddan yönetir)
- Entitlement mantığı: tenant başına aktif üye ≤ 10 → ücretsiz; 11. üyede abonelik zorunlu
- Sınır uygulaması istemcide değil **Cloud Functions + Firestore kurallarında** (üye onayı anında sayaç kontrolü)
- Tarabya Marte tenant'ına `billingExempt: true` bayrağı
- Abonelik durumu ekranı + yükseltme akışı

## Faz 5 — CI/CD (Faz 1'den itibaren paralel kurulur)
- GitHub Actions:
  - PR → lint + typecheck + testler (birim + Firestore kural testleri)
  - `main` → EAS Build (Android) + EAS Submit → **Play internal track**'e otomatik yükleme
  - Tag (`v*`) → production track'e terfi
- **EAS Update (OTA)**: JS-only değişiklikler store onayı beklemeden yayınlanır
- Firestore rules + Functions deploy'u ayrı workflow ile (`firebase deploy --only firestore:rules,functions`)
- Secrets: EAS token, Play service account JSON, Firebase token GitHub Secrets'ta
- Sıralama: internal testing → closed testing → production (hesap bireyselse Play'in 12 test kullanıcısı / 14 gün şartına dikkat)

## Faz 6 — iOS (Android production'dan sonra, ≈2-3 hafta)
- Apple Developer hesabı (99$/yıl) açılır
- EAS zaten iOS build alabiliyor (Mac'siz, bulutta); sertifika/provisioning EAS yönetir
- TestFlight → App Store. Review için demo hesap + Tarabya Marte demo tenant bilgileri hazırlanır
- Apple'ın in-app purchase şartı: iOS'ta da abonelik StoreKit üzerinden (RevenueCat bunu kapsıyor)

## Kaba takvim
- Hafta 1: Faz 0
- Hafta 2-3: Faz 1 (+CI/CD iskeleti)
- Hafta 4-7: Faz 2
- Hafta 8-10: Faz 3 → **Play internal/closed test başlar (Tarabya Marte ile gerçek kullanım)**
- Hafta 11-12: Faz 4 + cila → **Play production**
- Hafta 13-15: Faz 6 (iOS)

## Riskler / notlar
- RN yeniden yazımı en büyük maliyet kalemi; web sayfaları birebir spec olarak kullanılarak hızlandırılır.
- `@react-native-firebase` Expo Go'da çalışmaz → geliştirme EAS dev build ile yapılır (bir kerelik alışkanlık değişimi).
- Google Play, şablon/spam uygulamaları reddedebildiği için tek-uygulama modeli doğru seçim; salon başına ayrı uygulama isteği gelirse Faz 6 sonrası "hibrit premium build" olarak değerlendirilir.
- Üyelerin salona ödediği aidat fiziksel hizmet olduğu için Play Billing'e girmez; komisyon sadece GymEntra SaaS aboneliğinden kesilir.
- Web uygulaması mobil production'a geçince salt-okunur/emekli edilir ya da salon sahipleri için masaüstü tamamlayıcı olarak yaşatılır (ayrı karar).
