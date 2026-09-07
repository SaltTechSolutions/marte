# Gizlilik beyanları — Apple App Privacy ve Google Play Veri güvenliği

App Store Connect → GymEntra → **App Privacy** ve Play Console → Uygulama
içeriği → **Veri güvenliği** bölümlerinde işaretlenecek cevaplar. İki mağaza
da bu bölümü API'ye açmıyor; konsoldan doldurulur.

**İkisi aynı gerçeği anlatmalı.** Farklı beyan etmek incelemede göze çarpar
ve her iki yönde de (eksik ya da fazla beyan) politika ihlalidir. Koda yeni
bir veri alanı girdiğinde bu dosya, App Privacy ve Veri güvenliği birlikte
güncellenir.

Cevaplar **koddan** çıkarıldı, tahminle değil. Kaynak dosyalar her satırın
yanında.

## Önce iki genel cevap

- **Takip (tracking) var mı? → HAYIR.** Hiçbir veri reklam veya başka
  şirketlerin verisiyle eşleştirme amacıyla kullanılmıyor. Uygulamada reklam
  SDK'sı, analitik SDK'sı ve reklam kimliği yok. Bu yüzden ATT izin ekranı da
  gerekmiyor.
- **Konum toplanıyor mu? → HAYIR.** Uygulama konum izni istemiyor.

## Toplanan veriler

Her satır için Apple üç şey soruyor: **amaç**, **kimliğe bağlı mı**,
**takip için mi**. Aksi yazmadıkça amaç *App Functionality*, kimliğe bağlı
*Evet*, takip *Hayır*.

| Apple kategorisi | Veri türü | Ne | Nerede |
|---|---|---|---|
| Contact Info | Name | Üyenin adı, salon personeline görünür | `tenant_memberships.userDisplayName` |
| Contact Info | Email Address | Hesap kimliği | Firebase Auth |
| Contact Info | Phone Number | Üye profili (isteğe bağlı) | `tenant_memberships.phone` |
| Health & Fitness | **Health** | Kilo, göğüs/bel/kol ölçüsü, boy | `MeasurementEntry`, `heightCm` |
| Health & Fitness | **Fitness** | Antrenman kayıtları (hareket, set, ağırlık, süre), salona giriş kayıtları | `WorkoutLog`, `checkins` |
| User Content | Photos or Videos | Profil fotoğrafı | `uploadMemberPhoto` |
| User Content | Other User Content | Antrenörün üye hakkındaki notu, salon duyuruları | `member_notes`, `announcements` |
| Identifiers | User ID | Firebase kullanıcı kimliği | Firebase Auth |
| Identifiers | Device ID | Bildirim jetonu | `pushTokenRepo` |
| Purchases | Purchase History | Abonelik durumu | RevenueCat |
| Diagnostics | Crash Data | Çökme yığını — **kimliğe bağlı DEĞİL** | Sentry (`_layout.tsx`) |
| Other Data | Other Data Types | Doğum tarihi (18 yaş altı veli onayı için) | `tenant_memberships.birthDate` |

## Toplanmayanlar — bilerek

- **Performance Data:** Sentry `tracesSampleRate: 0` ile kurulu, yalnızca
  çökme gönderiyor.
- **Product Interaction / Usage Data:** analitik SDK'sı yok.
- **Payment Info:** kart bilgisi hiç görülmüyor. Salonun ödeme defteri elle
  tutulan bir kayıt; para hareketi uygulamanın dışında.
- **HealthKit / telefonun sağlık verisi:** okunmuyor, eşleştirilmiyor.
- **Location, Contacts, Browsing History, Search History, Sensitive Info,
  Audio Data, Gameplay Content, Emails or Text Messages.**

## Sık karıştırılan nokta

"Telefonun sağlık verisine dokunmuyoruz" doğru ama Apple'ın sorduğu şey
verinin NEREDEN geldiği değil, NE olduğu. Üyenin uygulamaya girdiği kilo ve
vücut ölçüleri Apple'ın taksonomisinde **Health**, antrenman kayıtları
**Fitness** sayılıyor. Bunları "toplamıyoruz" diye beyan etmek, incelemecinin
Gelişim ekranında gördüğü şeyle çelişir.

## Play karşılığı — Veri güvenliği taksonomisi

Google'ın kategorileri Apple'ınkiyle birebir örtüşmüyor. Karşılıklar:

| Apple | Play |
|---|---|
| Name, Email Address, Phone Number | Kişisel bilgiler → Ad, E-posta adresi, Telefon numarası |
| Other Data Types (doğum tarihi) | Kişisel bilgiler → **Diğer bilgiler** |
| User ID | Kişisel bilgiler → Kullanıcı kimlikleri *(tek "paylaşılan" kalem — Firebase)* |
| Health | Sağlık ve fitness → Sağlık bilgisi |
| Fitness | Sağlık ve fitness → Fitness bilgisi |
| Photos or Videos | Fotoğraflar ve videolar → **Fotoğraflar** *(isteğe bağlı)* |
| Other User Content | Uygulama etkinliği → **Kullanıcı tarafından oluşturulan diğer içerikler** |
| Purchase History, Other Financial Info | Finansal bilgiler → İşlem geçmişi |
| Device ID | Cihaz veya diğer kimlikler |
| Crash Data | Uygulama bilgileri ve performansı → Kilitlenme günlükleri |

Play tarafında **bilerek işaretlenmeyenler** (5 Eylül 2026'da kaldırıldı,
çünkü koda karşılığı yok):

- **Kullanıcı ödeme bilgileri** — kart bilgisi hiç görülmüyor; salonun ödeme
  defteri elle tutulan bir kayıt, para hareketi uygulamanın dışında.
- **Teşhisler** ve **uygulama performansıyla ilgili diğer veriler** — Sentry
  `tracesSampleRate: 0`, yalnızca çökme gönderiyor.
- **Uygulama işlemleri** — analitik SDK'sı yok.

## Üçüncü taraf SDK'ları

Apple, SDK'ların topladığını da senin beyanına dahil ediyor:

- **Firebase** (Auth, Firestore, Storage) — yukarıdaki verilerin saklandığı yer.
- **Sentry** — yalnızca çökme verisi, kimliğe bağlı değil.
- **RevenueCat** — abonelik durumu ve satın alma geçmişi.
