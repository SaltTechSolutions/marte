# GymEntra — Persona Kullanım Testi ve Talep Listesi

**Tarih:** 2 Eylül 2026
**Kapsam:** `gymentra-mobile/src/app/**` (53 ekran), `marte06/functions/src`,
`src/data/types.ts`, `firestore.rules` davranışı.
**Yöntem:** Dört persona için uygulamanın her ekranı, gerçek bir kullanıcının
izleyeceği sırayla adım adım gezildi (kod düzeyinde akış takibi: hangi ekrandan
hangi ekrana gidilebiliyor, hangi buton ne yapıyor, hangi veri gösteriliyor).
Bulgular "bu kişi bunu yapmak isteseydi yapabilir miydi?" sorusuna göre
sınıflandırıldı.

> **Yöntem sınırı — dürüstçe:** Bu tur **canlı cihaz turu değil**. Uygulama
> gerçek bir Firebase projesine (`tarabyamarte`) bağlı; üç rol için onaylı test
> hesabı, EAS dev build ve gerçek veri gerektirir. Aşağıdaki bulgular kodun
> kesin olarak ne yaptığına dayanıyor (ölü buton, eksik ekran, yazılmayan alan
> gibi şeyler koddan kesin görülür). "Bu ekran yavaş / bu yazı küçük" türü
> algısal bulgular bu turda **yok**; onlar için simülatörde canlı tur gerekir.

---

## Personalar

| # | Persona | Kim | Uygulamayı ne için açar |
|---|---|---|---|
| 1 | **Hakan, 42 — Salon Sahibi** | Tarabya'da 180 m² tek şube, 120 üye, 3 antrenör. Muhasebeyi eşi tutuyor, kendisi kapıda. | "Bu ay para kazandım mı, kim gelmedi, kimin parası gecikti?" |
| 2 | **Deniz, 31 — Antrenör** | 14 PT öğrencisi + haftada 6 grup dersi. Telefonu ter içinde, tek eliyle kullanıyor. | "Bugün kimim var, bu adama ne program yazdım, kaç dersi kaldı?" |
| 3 | **Zeynep, 29 — Üye (kadın)** | Ofis çalışanı, haftada 3 gün, akşam 19:00. Grup dersi + ara sıra PT. | "Bu akşam ders var mı, kadın antrenör var mı, kaç hakkım kaldı?" |
| 4 | **Burak, 34 — Üye (erkek)** | 6 yıldır çalışıyor, split program, kilo/PR takıntılı. | "Bugün push günü, geçen sefer kaç kaldırmıştım?" |

---

# 1. Hakan — Salon Sahibi

## Adım adım tur

| # | Adım | Ekran | Ne oldu |
|---|---|---|---|
| 1 | Kayıt ol → salon oluştur | `onboarding/register` → `create-gym` | Sorunsuz. Salon kodu kendi yazdığı değer. |
| 2 | Salon kodunu bul | `admin/settings` → `GymCodeCard` + `gym-qr` | **İyi.** Kod hem kartta hem tam ekran QR olarak var, resepsiyonda gösterilebiliyor. |
| 3 | Çalışma saatlerini gir | `admin/hours` | **İyi.** "Bu saatleri tüm açık günlere uygula" gerçek bir zaman kazandırıcı. |
| 4 | Paketleri tanımla | `admin/packages` → `package-form` | Yetkinlik (entitlement) modeli esnek, fiyat + süre + ders kotası ayrı. |
| 5 | Üye isteklerini onayla | `admin/members` | Tek dokunuş onay + toplu onay var. |
| 6 | Üyeye paket ata | `admin/member` → `assign-package` | Promosyon uygulama ve özet ekranı iyi düşünülmüş. |
| 7 | Ödemeyi kaydet | `admin/member` → `+ Ödeme ekle` | Üye önceden seçili geliyor — doğru kısayol. |
| 8 | "Bu ay ne kazandım?" | `admin/index` | **Duvara çarptı.** Tek bir sayı: bu ay gelir. Başka hiçbir şey yok. |
| 9 | "Kimin parası gecikti?" | — | **Ekran yok.** |
| 10 | "Kimin paketi bitiyor?" | — | **Ekran yok.** (Sunucuda `notifyExpiringPackages` var, ama sahibin göreceği liste yok.) |
| 11 | "Salon en yoğun saat kaç?" | — | **Ekran yok.** Check-in verisi var, hiç raporlanmıyor. |
| 12 | "Yarın kapalıyız" duyurusu | — | **Özellik yok.** Uygulamada hiçbir duyuru/toplu bildirim mekanizması yok. |

## Hakan'ın eksik bulacakları

**H-1 · Raporlama diye bir şey yok. (P0 — sahibin ikinci sorusu cevapsız)**
`admin/index.tsx` dört sayı gösteriyor: bugün giren, aktif üye, bekleyen istek,
bu ay gelir. Bir salon sahibinin ilk gün soracağı şeylerin hiçbirinin cevabı yok:
aylık gelir trendi, üye kazanma/kaybetme (churn), ödeme yöntemi kırılımı
(nakit/havale/kart), katılım oranı, saatlik doluluk, antrenör başına seans.
"Bu ay gelir" bile sadece `createdAt >= ayBaşı && status==='confirmed'` —
tahsil edilmemiş alacak hiç görünmüyor.

**H-2 · Ödemesi geciken üye listesi yok. (P0)**
Ödeme kaydı bir defter (`payments`), ama "kimin borcu var" sorusu bu defterden
türetilmiyor. Paket atanınca bir borç kaydı oluşmuyor — paket ile ödeme
birbirine bağlı değil. Sahip, kimin ödediğini üye üye açarak öğreniyor.
**Talep:** paket atamasında "tahsil edildi mi?" alanı + panelde "ödemesi
bekleyenler" listesi.

**H-3 · Yaklaşan paket bitişleri listesi yok. (P1)**
Yenileme, bir salonun gelirinin çoğu. Bugün sahibin bunu görmesinin yolu yok.
**Talep:** "14 gün içinde bitenler" listesi + tek dokunuşla "yenileme teklifi
gönder" (`propose-package-change` zaten var, sadece giriş noktası eksik).

**H-4 · Ders programı tekrarlamıyor. (P1 — en can sıkıcı elle iş)**
`admin/classes.tsx` her dersi **tek seferlik bir kayıt** olarak oluşturuyor
(`createClass` tek `date` alıyor). Haftada 20 dersi olan bir salon 3 aylık
programı kurmak için ~240 kayıt girmek zorunda.
**Talep:** "her Salı 19:00, 12 hafta" — seri ders oluşturma ve seriyi topluca
iptal/erteleme.

**H-5 · Derse kimin kayıtlı olduğu hiçbir yerde görünmüyor. (P1)**
Ders satırı `3/10 dolu` diyor ama **isim listesi hiçbir ekranda yok**.
Yoklama alma da yok. Kapasitesi dolan dersin kimlerden oluştuğunu ne sahip ne
antrenör görebiliyor.
**Talep:** ders detayı → katılımcı listesi + yoklama (geldi/gelmedi) işaretleme.

**H-6 · Üye listesinde arama yok. (P1)**
Antrenör ekranında arama var (`trainer/index.tsx`), **admin roster'ında yok**
(`admin/members.tsx`). 120 üyeli salonda sahip kaydırarak arıyor. Üstelik
`watchActiveMembers` limitsiz — tüm üyeler her açılışta çekiliyor.
**Talep:** admin üye listesine arama + sayfalama; ayrıca duruma göre filtre
(paketi biten / borçlu / yeni).

**H-7 · "Tümünü onayla" limit dolduğunda bozuluyor. (P2 — hata)**
`admin/members.tsx:191` → `requests.forEach((r) => approve(r))`. Paralel
çalışıyor ve her biri ayrı ayrı limit kontrolü yapıyor. Ücretsiz limitte 5
bekleyen istek varsa: 5 hata toast'ı ve **5 kez üst üste paywall'a itiliyor**.
**Talep:** sıralı işle, limit dolunca döngüyü kes, tek mesaj göster.

**H-8 · Dondurma ve iptal politikası ayarlanamıyor. (P1)**
`MemberPackage.status` tipinde `'frozen'` var — **hiçbir ekran yazmıyor.**
`tenants.cancellationHours` sunucuda okunuyor (`sessions.ts:302`) —
**düzenleyecek yönetici ekranı yok**, sabit 24 varsayılıyor.
Tatile çıkan/sakatlanan üyenin paketini durdurmanın yolu yok; sahip ya elle
tarih uzatıyor ya üyeyi kaybediyor.
**Talep:** paket dondurma (kaç gün, kaç kez) + iptal süresi ayarı + iade politikası.

**H-9 · Üyeden uygulama içi tahsilat yok. (P2 — bilinçli olabilir, ama beklenir)**
Ödeme defteri tamamen manuel. iyzico/POS entegrasyonu yok, otomatik yenileme
yok, e-fatura/dekont çıktısı yok. IAP yalnızca salonun **kendi** GymEntra
aboneliği için. Sahip "üyeler karttan kendisi ödesin" isteyecektir.

**H-10 · Duyuru / toplu mesaj yok. (P1)**
"Yarın bakım nedeniyle kapalıyız", "Ocak kampanyası başladı" — uygulamada
duyuru diye bir kavram yok. Promosyon tanımlanıyor ama **üye promosyonu hiç
görmüyor**; promosyon yalnızca admin paket atarken uyguladığı bir indirim.
**Talep:** duyuru gönderme (push + ana ekranda kart) ve kampanyanın üyeye
görünmesi.

**H-11 · Tek şube. (P3)**
Bir `tenant` = bir salon. İkinci şube ayrı salon kodu, ayrı üye listesi, ayrı
abonelik demek. Büyümek isteyen sahip için tavan.

**H-12 · Personel tarafı yüzeysel. (P2)**
`admin/staff` yalnızca "antrenör yap / kapıda üye kabulü ver" yapıyor.
Vardiya, izin, seans başına prim, antrenör performansı yok.

## Hakan'ın fazla/gereksiz bulacakları

- **Promosyonlar (`admin/promotions`)** — üye tarafında hiçbir karşılığı
  olmadığı için bugün sadece "atarken uygulanan indirim". Bu haliyle ayrı bir
  ekranı ve ayrı bir veri modelini hak etmiyor; paket atama ekranındaki bir
  "indirim uygula" alanı aynı işi görüyordu. Ya üyeye görünür kampanyaya
  dönüşmeli ya sadeleşmeli.
- **Tema (koyu/açık) seçimini salonun yapması** — üyenin telefonunun temasını
  salon sahibinin seçmesi doğru değil. Marka rengi salonun, tema modu üyenin
  tercihi olmalı.
- **Antrenör takvimleri ekranı** (`admin/calendar`) sahibin günlük işi değil;
  ayarların altında doğru yerde ama panelde yeri yok — şu an doğru konumda.

---

# 2. Deniz — Antrenör

## Adım adım tur

| # | Adım | Ekran | Ne oldu |
|---|---|---|---|
| 1 | Giriş → Üyeler | `trainer/index` | Arama + "Programsız" filtresi + sıralama var. **İyi tasarlanmış.** |
| 2 | Kapıda üye kabul | `checkin` | Yetkisi varsa listenin en üstünde. QR + 6 haneli kod fallback. **Çok iyi.** |
| 3 | Üyeye program yaz | `trainer/member` → `builder` | Otomatik kaydediliyor, taslak/aktif ayrımı net. |
| 4 | Egzersiz ekle | `builder` | **10 sabit egzersiz.** Kendi egzersizini ekleyemiyor. |
| 5 | Takvim | `trainer/calendar` | Ay görünümü + gün listesi + devral. İyi. |
| 6 | Randevu ekle | `trainer/calendar` | Saat/dakika Stepper ile. **Çakışma kontrolü yok.** |
| 7 | Çalışma saatleri | `trainer/availability` | Günde tek pencere; salon saatlerine kenetli. Mantıklı. |
| 8 | "Bu üyenin kaç dersi kaldı?" | `trainer/member` | **Cevap yok — ekranda paket/kredi bilgisi hiç yok.** |
| 9 | "Grup dersime kim yazıldı?" | — | **Ekran yok.** Antrenör grup dersini ne görebiliyor ne yönetebiliyor. |
| 10 | "Üyeye not düşeyim" | — | **Alan yok.** |
| 11 | "Bu üyeyi arayayım" | — | **Telefon numarası antrenöre görünmüyor.** |

## Deniz'in eksik bulacakları

**D-1 · Antrenör üyenin paketini/kalan hakkını göremiyor. (P0 — günlük soru)**
`trainer/member.tsx` üç şey gösteriyor: program, antrenman özeti, ölçümler.
Paket, kalan özel ders, paket bitiş tarihi **yok**. Aynı bilgi admin ekranında
(`admin/member.tsx`) var. Üye "kaç dersim kaldı?" diye antrenöre soruyor,
antrenör cevap veremiyor.
**Talep:** antrenör üye kartına salt-okunur paket + kalan kredi + bitiş tarihi.

**D-2 · Grup dersi antrenörün elinde değil. (P0)**
Ders programı yalnızca `canManageGym` (admin) ekranında. Antrenör:
kendi dersini oluşturamıyor, saatini değiştiremeyip iptal edemiyor, **kimin
kayıtlı olduğunu göremiyor**, yoklama alamıyor. Ders satırındaki `trainerName`
serbest metin/chip — antrenörün `userId`'sine bağlı değil, yani "benim
derslerim" diye bir sorgu bile yazılamaz.
**Talep:** `ClassSession.trainerId` alanı + antrenör için "Derslerim" sekmesi +
katılımcı listesi + yoklama.

**D-3 · Üyeye not alanı yok. (P1)**
Sakatlık ("sol diz menisküs"), hedef ("düğüne 8 kilo"), kontrendikasyon —
antrenörün aklında tutması gereken her şey uygulamanın dışında.
**Talep:** üye başına antrenör notu (üyeye kapalı, ekip içine açık).

**D-4 · Randevu çakışması engellenmiyor. (P1 — veri bütünlüğü)**
`ptSessionRepo.ts:22` — `createPtSession` doğrudan `setDoc` yapıyor.
Ne mevcut randevularla çakışma, ne antrenörün kendi çalışma saatleri, ne
salonun açık olup olmadığı kontrol ediliyor. Üye tarafındaki `bookPtSessions`
callable'ı bunları kontrol ediyor; **antrenörün kendi eklediği randevu
kontrolsüz.** Aynı saate iki üye yazılabilir.
**Talep:** antrenör tarafındaki oluşturmayı da aynı callable'a taşı.

**D-5 · "Gelmedi" (no-show) durumu yok. (P1)**
`PtSessionStatus` = `scheduled | completed | cancelled`. Gelmeyen üye için
antrenör ya "Tamamla" (yalan) ya "İptal et" (kredi iade edilir, salon zarar
eder) demek zorunda.
**Talep:** `no-show` durumu — hak yanar, üyeye bildirilir, rapora girer.

**D-6 · İzin/tatil girilemiyor. (P1)**
`TrainerAvailability.exceptions` alanı veri modelinde var, ekran her kayıtta
`exceptions: []` gönderiyor (`availability.tsx:116`). Antrenör 3 gün izne
çıkarsa haftalık saatlerini kapatıp geri açmaktan başka yolu yok — geri açmayı
unutursa randevu alınamaz hale gelir.
**Talep:** tarih bazlı istisna (izin günü / o gün farklı saat).

**D-7 · Gün içinde tek pencere. (P2)**
Öğle arası (`10:00–13:00` + `16:00–21:00`) modellenemiyor. Veri modeli
`TimeWindow[]` destekliyor, ekran ilkini alıyor.

**D-8 · Seri randevu yok. (P2)**
"Her Cuma 08:00, 8 hafta" — PT'nin standart satış şekli. Tek tek 8 kez
girilmesi gerekiyor.

**D-9 · Antrenörün üyeyle iletişim kanalı yok. (P2)**
Telefon numarası `TenantMembership.phone` alanında var ama antrenör ekranında
gösterilmiyor. Mesajlaşma da yok. "Bugün 20 dakika geç kalacağım" demenin yolu
uygulamanın dışında.

**D-10 · Antrenör kendi kazancını göremiyor. (P2)**
`trainer/profile` seans sayısını gösteriyor, karşılığını göstermiyor. Prim/hak
ediş takibi yok.

**D-11 · Antrenman detayı görünmüyor. (P2)**
`WorkoutLog.exerciseLogs` her egzersizin set/kg/süresini tutuyor ama
`trainer/member.tsx` sadece **toplam sayı ve toplam süre** gösteriyor.
Antrenörün programı ayarlaması için lazım olan tek veri (üye hedef ağırlığı
tutturabildi mi?) ekranda yok.

## Deniz'in fazla bulacakları

- **Takvim paylaşımı (`calendar_shares`)** — 3 antrenörlü salonda "sen yokken
  kim devralsın" akışı ağır kalıyor; admin zaten her takvimi görüp devredebiliyor.
  Tek kişilik/iki kişilik salonlarda hiç kullanılmayacak.
- **`trainer/programs` sekmesi** — `trainer/index` zaten "Programsız" filtresi
  veriyor; programlar sekmesi aynı veriyi ikinci kez, üye adına göre listeliyor.
  İki sekme yerine tek liste + filtre yeterdi.

---

# 3. Zeynep — Üye (Kadın)

## Adım adım tur

| # | Adım | Ekran | Ne oldu |
|---|---|---|---|
| 1 | Kayıt ol | `onboarding/register` | Ad, e-posta, şifre. **KVKK/açık rıza onayı yok. "Şifremi unuttum" yok.** |
| 2 | Salona katıl | `onboarding/gym-code` | QR okut ya da kod yaz. Salonun rengi anında uygulanıyor — **çok iyi an.** |
| 3 | Onay bekle | `onboarding/pending` | "Salonu ara" butonu **hiçbir şey yapmıyor** (`pending.tsx:76`, `onPress` yok). |
| 4 | Onaylandı | `onboarding/approved` | QR kart + kutlama. İyi. |
| 5 | Ana ekran | `member/index` | Paket kartı, yaklaşan randevu, ödeme durumu. Derli toplu. |
| 6 | Ders programına bak | `member/classes` | Ay takvimi + gün listesi. **Katıl butonu "Kilitli".** |
| 7 | PT randevusu al | `member/trainers` | **Antrenör listesi: sadece ad + jenerik ikon.** Cinsiyet, uzmanlık, foto, bio yok. |
| 8 | Ölçüm gir | `member/progress` | Stepper. 75 kg'dan başlıyor. |
| 9 | Bilgilerini tamamla | `member/edit-profile` | Ad, telefon, doğum tarihi. **Fotoğraf yok, cinsiyet yok.** |

## Zeynep'in eksik bulacakları

**Z-1 · Cinsiyet diye bir alan yok — bütün kadın odaklı ihtiyaç bunun üstüne kurulu. (P0)**
`grep -i "gender|cinsiyet"` → `src`, `functions`, `SCHEMA.md` üçünde birden
**sıfır sonuç.** Bunun doğrudan sonuçları:
- **Kadınlara özel saat/seans modellenemiyor.** `OpeningHours` günde tek
  pencere; "Salı 10:00–14:00 kadınlara özel" diye bir kavram yok. Türkiye'de
  bu, karma salonların çoğunda fiilen uygulanan bir şey.
- **Kadın antrenör filtresi yok.** `member/trainers.tsx` sadece isim listeliyor.
  Zeynep PT alırken en çok sorduğu soruyu uygulamada soramıyor; ad soyaddan
  tahmin etmek zorunda.
- **Kadınlara özel grup dersi işaretlenemiyor.** Ders sadece ad + eğitmen + saat.
- **Salon raporlarında cinsiyet kırılımı yok** (Hakan'ın da işine yarardı).

**Talep:** `TenantMembership.gender` (opsiyonel, üyenin kendi beyanı) +
antrenör listesinde filtre + ders/saat için "kadınlara özel" bayrağı.
*(Not: KVKK'da cinsiyet özel nitelikli veri değil ama yine de opsiyonel ve
açık rızayla toplanmalı, "belirtmek istemiyorum" seçeneği olmalı.)*

**Z-2 · Grup dersi rezervasyonu satın alınmış olsa bile çalışmıyor. (P0 — parası ödenmiş özellik)**
`member/classes.tsx:33` — `canJoinGroupClass` yalnızca
`entitlements.groupClasses.unlimited === true` ise izin veriyor. "Ayda 8 grup
dersi" gibi **kotalı** paket alan üye "Kilitli" görüyor ve
*"Kotalı grup dersi rezervasyonu yakında aktif olacak"* yazısıyla karşılaşıyor.
Yani salon bir paketi satabiliyor, üye o paketi kullanamıyor.
**Talep:** kota tüketen rezervasyon callable'ı (PT tarafındaki
`bookPtSessions` deseninin aynısı).

**Z-3 · Ders hatırlatıcısı yok. (P1)**
Sunucuda 11 bildirim fonksiyonu var; hiçbiri "dersin 1 saat sonra" demiyor.
Ders iptalinde haber veriliyor ama dersin kendisi hatırlatılmıyor.
**Talep:** ders/randevu öncesi hatırlatma + üye tarafında saat seçimi.

**Z-4 · Bildirim tercihi yok. (P1 — KVKK/GDPR beklentisi de var)**
`notificationPrefs` diye bir alan yok. Push açık/kapalı bile yapılamıyor;
tek yol telefonun sistem ayarları. Bildirim sayısı 11'e çıkmış durumda.

**Z-5 · Şifremi unuttum yok. (P0 — kilitlenme)**
`sendPasswordResetEmail` kod tabanında hiç geçmiyor. E-posta+şifre ile
kaydolan bir üye şifresini unutursa uygulamaya giremez ve kendi başına
çözemez. Google/Apple ile girenler etkilenmez.

**Z-6 · Kayıtta KVKK açık rıza / kullanım şartları onayı yok. (P0 — yasal)**
`LegalLinks` bileşeni var ama yalnızca **profil ekranlarının altında**.
Kayıt anında onay kutusu yok. Türkiye'de kişisel veri işleme aydınlatması
kayıt anında sunulmalı.

**Z-7 · Üye kendi paketini yenileyemiyor, talep bile edemiyor. (P1)**
Paket yalnızca admin tarafından atanıyor. Üye tarafında "paketimi yenile",
"paket satın al", "bilgi iste" gibi hiçbir aksiyon yok. Paketi biten üye
uygulamada bir duvara bakıyor: *"Aktif paketin yok — salon yöneticisi sana bir
paket atadığında burada görünür."*
**Talep:** en az "yenileme talebi gönder" (admin'e bildirim düşer).

**Z-8 · İptal politikası üyeye yanlış söyleniyor. (P1 — güven sorunu)**
`member/index.tsx:269` ve `member/classes.tsx:158` sabit metin:
*"Randevuya **24 saatten az** kaldıysa dersin iade edilmeyebilir."*
Gerçek eşik `tenants.cancellationHours` (varsayılan 24) — salon 48 yaptıysa
uygulama üyeye **yanlış** bilgi veriyor.
**Talep:** metin salonun gerçek değerinden gelsin; ayrıca paket/üyelik
detayında politika kalıcı olarak yazsın.

**Z-9 · "Salonu ara" ölü buton. (P2 — hata)**
`onboarding/pending.tsx:76`. Üstelik salonun telefonu
`tenants/{id}/private/contact` altında ve **üye henüz üye olmadığı için
okuyamaz**. Yani onay bekleyen üyenin salona ulaşma yolu gerçekten yok.

**Z-10 · Ölçüm girişi zahmetli ve eksik. (P2)**
`progress.tsx` — kilo varsayılanı 75, adım 0,5. 52 kg'lık bir üye ilk ölçümü
için **46 kez** eksi tuşuna basıyor. Ayrıca boy, kalça, basen, vücut yağ
oranı, BMI yok — "Göğüs / Bel / Kol" erkek odaklı bir üçlü.
**Talep:** doğrudan sayı girişi + kalça/basen/boy/yağ oranı + fotoğraflı
ilerleme (isteğe bağlı, gizli).

**Z-11 · Üye kartında gizlilik. (P2)**
`member/card.tsx` QR'ın altında ad soyadı `h2` boyutunda basıyor. Kartı
resepsiyonda başkasına doğru tutarken tam adı okunuyor. Küçük ama gerçek bir
rahatsızlık.
**Talep:** adı isteğe bağlı gizle / baş harflere indir.

**Z-12 · Ders içeriği hakkında hiçbir bilgi yok. (P2)**
Ders satırı: ad, saat, süre, doluluk. Seviye (başlangıç/ileri), açıklama,
"ne getirmeliyim", eğitmenin kim olduğu dışında hiçbir şey yok. Yeni üye hangi
derse gireceğine karar veremiyor.

**Z-13 · Acil durum / güvenlik alanları yok. (P3)**
Acil durumda aranacak kişi, sağlık notu (astım, alerji), sağlık beyanı yok.
Salonlar bunu kağıtta topluyor.

## Zeynep'in fazla bulacakları

- **`member/workout` sekmesi, program yokken bile tab bar'da yer kaplıyor.**
  Grup dersi ağırlıklı üyenin hiç girmeyeceği bir sekme sürekli görünüyor.
- **"Gelişim" ve "Bugün" ekranlarında sayaç tekrarı** — `visits` (salona geliş)
  ve `completedThisWeek` (uygulamada başlatılan antrenman) iki ayrı sayı. Üye
  bu ikisini ayırt etmiyor; ana ekrandaki hedef halkası uygulamada program
  başlatmayan üye için hep %0. QR ile gelip 40 dakika koşan Zeynep
  *"Hedefe 4 antrenman kaldı"* yazısını haksız buluyor.

---

# 4. Burak — Üye (Erkek)

## Adım adım tur

| # | Adım | Ekran | Ne oldu |
|---|---|---|---|
| 1 | QR ile giriş | `member/card` | Çevrimdışı çalışıyor, kısa kod fallback'i var. **Çok iyi.** |
| 2 | Programı aç | `member/workout` | Tek program. "Antrenmana başla". |
| 3 | Antrenman | `member/workout/session` | Set butonları, kg stepper, kronometre, duraklat. Tab bar gizleniyor. **İyi tasarım.** |
| 4 | "Geçen sefer kaç kaldırmıştım?" | — | **Ekranda yok.** |
| 5 | "Hedef kaç tekrar?" | — | **Ekranda yok** — sadece set sayısı var. |
| 6 | Bitir → Gelişim | `member/progress` | Toplam antrenman, toplam süre, kilo grafiği. **Ağırlık gelişimi yok.** |

## Burak'ın eksik bulacakları

**B-1 · Tek aktif program — split yapılamıyor. (P0 — ciddi çalışan üyenin ilk şikâyeti)**
`watchActiveProgramForMember` **tek** aktif program döndürüyor.
Push/Pull/Legs veya Üst/Alt gibi bir bölünmüş program modellenemiyor.
Burak'ın 3 günlük split'i tek bir listeye sıkıştırılmak zorunda — ve her
antrenmanda 18 egzersizin hepsini baştan sona geçmesi gerekiyor.
**Talep:** çok günlü program (A/B/C günleri) + "bugün hangi gün" seçimi.

**B-2 · Ağırlık/PR gelişimi hiçbir yerde gösterilmiyor. (P0 — uygulamanın verisi var, göstermiyor)**
`WorkoutLog.exerciseLogs` her egzersiz için `weightKg` ve `setsCompleted`
tutuyor. `member/progress.tsx` bunları **hiç kullanmıyor** — sadece antrenman
sayısı, toplam süre ve vücut ölçüsü gösteriyor. Yani veri toplanıyor,
kullanıcıya geri verilmiyor.
**Talep:** egzersiz bazlı ağırlık grafiği, kişisel rekor (PR) rozeti, toplam
hacim (set × tekrar × kg) trendi.

**B-3 · Antrenman ekranında bir önceki seans görünmüyor. (P0)**
Ağırlık stepper'ı programdaki `targetWeightKg` ile açılıyor — **geçen hafta
gerçekte ne kaldırdığıyla** değil. Burak her seansta telefonundan not
defterine bakmak zorunda; uygulamanın var olma sebebi bu.
**Talep:** her egzersizin üstünde "geçen sefer: 80 kg × 8,8,7".

**B-4 · Hedef tekrar sayısı ekranda yok. (P1 — hata sayılır)**
`ProgramExercise.reps` tanımlı ve builder'da giriliyor, ama
`workout/session.tsx` yalnızca `setsTarget` gösteriyor. Antrenörün yazdığı
"3×12" bilgisinin "12" kısmı üyeye hiç ulaşmıyor.

**B-5 · Set bazında ağırlık girilemiyor. (P1)**
Egzersiz başına tek `weightKg` var. Piramit set, drop set, ısınma seti
kaydedilemiyor. Gerçekte 60/80/90 kaldıran biri tek sayı yazmak zorunda.
Ayrıca **yapılan tekrar sayısı da kaydedilmiyor** (`setsCompleted` sadece
"kaç set bitti").

**B-6 · Dinlenme sayacı yok. (P1)**
Set arası 90 sn — her ciddi çalışanın kullandığı şey. Sadece toplam süre
kronometresi var.

**B-7 · Egzersiz kütüphanesi 10 kalem ve koda gömülü. (P1)**
`trainer/builder.tsx:17` — `EXERCISE_LIBRARY` sabit dizisi.
Ne antrenör yeni egzersiz tanımlayabiliyor, ne üye. Kardiyo (koşu bandı,
kürek, bisiklet) hiç modellenmiyor: `sets/reps/targetWeightKg` üçlüsü
"30 dakika koşu"yu ifade edemiyor.
**Talep:** salon bazlı egzersiz kütüphanesi + egzersiz tipi (ağırlık / süre /
mesafe) + video/görsel (`session.tsx`'te 54×54 boş gri kutu bir görsel
bekliyor, hiç doldurulmamış).

**B-8 · Haftalık hedef sabit 4. (P2)**
`member/index.tsx:28` — `WEEKLY_TARGET = 4`. Haftada 6 gün çalışan Burak da,
2 gün gelen Zeynep de aynı hedefe göre ölçülüyor. Üye kendi hedefini
belirleyemiyor.

**B-9 · Motivasyon katmanı yok. (P2)**
Seri (streak), rozet, kişisel rekor bildirimi, arkadaş karşılaştırması,
salon lider tablosu — hiçbiri yok. Sadece bir yüzde halkası var.

**B-10 · Antrenman geçmişi listesi yok. (P2)**
Tamamlanan antrenmanlar sayılıyor ama **tek tek görüntülenemiyor**.
"12 Ağustos'ta ne yaptım?" sorusunun cevabı yok.

## Burak'ın fazla bulacakları

- **Vücut ölçüsü kartlarının antrenman verisinden önce gelmesi** — Gelişim
  ekranı Burak için yanlış sıralı: en çok baktığı şey (ağırlık gelişimi) hiç
  yok, en az baktığı şey (göğüs/bel/kol) ekranın ortasında.
- **Ölçüm formundaki 4 stepper** — Burak ayda bir kilo giriyor, göğüs/bel/kol
  hiç girmiyor. Form her açılışta dördünü birden soruyor.

---

# 5. Ortak / rol bağımsız bulgular

| Kod | Bulgu | Etki |
|---|---|---|
| **O-1** | Kayıt ekranında *"Doğum günü, fotoğraf vs. SONRA sorulur"* yazıyor — **sonra hiç sorulmuyor.** Profilde uyarı olarak çıkıyor, profil fotoğrafı ise hiç yok. | Söz verilip tutulmayan akış |
| **O-2** | Telefon numarası kayıtta hiç alınmıyor. Salonun üyeye ulaşma yolu, üye kendi profilinden girmedikçe yok. | Salon işleyişi |
| **O-3** | Çoklu salon üyeliği: kurallar ve veri modeli destekliyor, istemci ilk aktif üyeliği alıp gerisini yok sayıyor. İki salona üye olan kişi ikincisine erişemiyor. | Kilitlenme |
| **O-4** | i18n yok — tüm metinler koda gömülü. | İhracat tavanı |
| **O-5** | Erişilebilirlik: dokunma hedefleri ve `accessibilityLabel` düzenli kullanılmış (**iyi**), ancak dinamik yazı boyutu / ekran okuyucu turu hiç test edilmemiş. | Bilinmiyor |

---

# 6. Önceliklendirilmiş talep listesi

## P0 — İlk sürümde olması gereken (bir persona duvara çarpıyor)

| # | Talep | Kim ister | Nerede |
|---|---|---|---|
| 1 | **Kotalı grup dersi rezervasyonu** — satılan paketin kullanılabilmesi | Zeynep, Hakan | `classes.tsx:33`, yeni callable |
| 2 | **Şifremi unuttum** akışı | Zeynep, Burak | `onboarding/register.tsx` |
| 3 | **Kayıtta KVKK / kullanım şartları onayı** | Yasal | `onboarding/register.tsx` |
| 4 | **Antrenöre üyenin paket + kalan hak bilgisi** | Deniz | `trainer/member.tsx` |
| 5 | **Grup dersinin antrenöre açılması** (`trainerId`, katılımcı listesi, yoklama) | Deniz, Hakan | `admin/classes`, yeni ekran |
| 6 | **Sahibin raporları** — gelir trendi, borçlular, biten paketler, doluluk | Hakan | yeni `admin/reports` |
| 7 | **Cinsiyet alanı + kadın antrenör filtresi + kadınlara özel ders/saat** | Zeynep | `types.ts` → tüm zincir |
| 8 | **Çok günlü (split) program** | Burak | `programRepo`, `workout/*` |
| 9 | **Ağırlık/PR gelişimi ekranı + "geçen sefer" göstergesi** | Burak | `progress.tsx`, `session.tsx` |

## P1 — İlk güncellemede

| # | Talep | Kim ister |
|---|---|---|
| 10 | Seri (tekrarlayan) ders programı | Hakan |
| 11 | Paket dondurma + iptal/iade politikası ayarı | Hakan, Zeynep |
| 12 | Yaklaşan paket bitişleri + tek dokunuş yenileme teklifi | Hakan |
| 13 | Üye tarafında "paketimi yenile / talep gönder" | Zeynep |
| 14 | Ders ve randevu hatırlatıcısı | Zeynep |
| 15 | Bildirim tercihleri (kategori bazlı aç/kapa) | Herkes |
| 16 | Admin üye listesinde arama + filtre + sayfalama | Hakan |
| 17 | Duyuru / toplu bildirim | Hakan |
| 18 | Antrenör: üye notu, no-show, izin günü, randevu çakışma kontrolü | Deniz |
| 19 | Hedef tekrar sayısının antrenman ekranında gösterilmesi | Burak |
| 20 | Set bazında ağırlık + yapılan tekrar kaydı, dinlenme sayacı | Burak |
| 21 | Egzersiz kütüphanesinin salona açılması + kardiyo tipi + görsel | Deniz, Burak |
| 22 | İptal politikası metninin salonun gerçek değerinden gelmesi | Zeynep |

## P2 — Değerli ama engelleyici değil

23. "Tümünü onayla" limit hatası (`members.tsx:191`) · 24. `pending.tsx` ölü
"Salonu ara" butonu · 25. Ölçüm formunda doğrudan sayı girişi + kalça/boy/yağ
oranı · 26. Üye kartında ad gizleme · 27. Ders açıklaması/seviyesi ·
28. Üyenin kendi haftalık hedefini seçmesi · 29. Antrenman geçmişi listesi ·
30. Antrenör–üye iletişim kanalı (en azından telefon) · 31. Antrenör prim
takibi · 32. Profil fotoğrafı · 33. Rozet/seri/motivasyon katmanı ·
34. Gün içinde bölünmüş çalışma saati · 35. Seri PT randevusu

## P3 — Uzak ufuk

36. Çoklu şube · 37. Uygulama içi tahsilat (iyzico/POS) + e-fatura ·
38. i18n · 39. Acil durum/sağlık beyanı alanları · 40. Vardiya ve personel yönetimi

---

# 7. "Fazla" bulunanların özeti

Kaldırılması değil, **bugünkü hâliyle maliyetinin karşılığını vermediği**
tespit edilen şeyler:

| Özellik | Neden fazla | Öneri |
|---|---|---|
| Promosyonlar (ayrı ekran + model) | Üye kampanyayı hiç görmüyor; sadece admin'in atarken uyguladığı indirim | Ya üyeye görünür kampanya olsun ya paket atama içindeki bir alana insin |
| Takvim paylaşımı (`calendar_shares`) | Admin zaten her takvimi devredebiliyor; 2–3 kişilik salonda kullanılmayacak | v1'de gizle, çok antrenörlü salonda aç |
| `trainer/programs` sekmesi | `trainer/index`'teki "Programsız" filtresiyle büyük ölçüde aynı işi yapıyor | Tek liste + filtre |
| Tema modunu salonun seçmesi | Üyenin telefon tercihi salon sahibine ait olmamalı | Marka rengi salonun, tema modu üyenin |
| `member/workout` sekmesinin daima görünmesi | Grup dersi üyesi hiç girmiyor | Program atanınca görünsün ya da "Gelişim" ile birleşsin |

---

# 8. plan.md ile ilişki

Bu turda çıkan bulguların bir kısmı `plan.md`'de zaten açık madde olarak duruyor;
persona testi bunları **doğruladı ve önceliklerini değiştirdi**:

| Bu belge | plan.md karşılığı | Persona etkisi |
|---|---|---|
| H-1 raporlama | Kuşak 2 · madde 5 (P4-5 + PKG-12) | Doğrulandı, **P0'a çıkıyor** — Hakan'ın ikinci sorusu |
| H-8 dondurma/iade | Kuşak 2 · madde 7 (PKG-10 + PKG-11) | Doğrulandı |
| Z-4 bildirim tercihi | Kuşak 3 · madde 8 (P4-3) | Doğrulandı |
| O-3 çoklu salon | Kuşak 3 · madde 9 (P1-8 + P4-6) | Doğrulandı |
| D-8 seri randevu | Kuşak 3 · madde 11 (PKG-9) | Doğrulandı, P2 |
| O-1 profil fotoğrafı | Kuşak 4 · madde 16 | Doğrulandı |
| O-4 i18n | Kuşak 4 · madde 15 (P4-7) | Doğrulandı, P3 |
| **Z-1 cinsiyet / kadın odaklı ihtiyaçlar** | **plan.md'de yok** | **Yeni — Türkiye pazarında P0** |
| **Z-2 kotalı grup dersi** | plan.md'de yok (kod yorumunda "yakında") | **Yeni — satılan özellik çalışmıyor** |
| **B-1/B-2/B-3 antrenman derinliği** | plan.md'de yok | **Yeni — ciddi çalışan üyeyi kaybettiren şey** |
| **D-2 grup dersinin antrenöre kapalı olması** | plan.md'de yok | **Yeni** |
| **Z-5 şifremi unuttum** | plan.md'de yok | **Yeni — kilitlenme** |
| **Z-6 kayıtta KVKK onayı** | plan.md'de yok | **Yeni — yasal** |

---

## Sonraki adım önerisi

En yüksek getirili üç iş, üçü de birbirinden bağımsız:

1. **Z-2 (kotalı grup dersi)** — salon zaten o paketi satıyor, üye kullanamıyor.
   Tek callable, PT tarafında deseni hazır.
2. **D-1 + D-2 (antrenöre paket bilgisi + grup dersi)** — antrenör bugün
   üyenin sorduğu soruların yarısına cevap veremiyor.
3. **H-1 (rapor ekranı)** — veri zaten Firestore'da; eksik olan yalnızca ekran.
