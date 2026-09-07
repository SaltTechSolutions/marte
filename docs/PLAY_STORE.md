# Play Console — doldurulacaklar

Kaynak: kodun kendisi (1 Eylül 2026). Tahmin değil; her satır bir dosyaya
dayanıyor. Play Console'a yapıştırmak için hazır.

---

## 0. ÖNCE BU: hedef kitle kararı

Play, mağaza girişinden önce **"Hedef kitle ve içerik"** anketini soruyor ve
cevabı her şeyi belirliyor.

GymEntra artık **18 yaşından küçük üyeleri destekliyor** (MEMBER-5: ebeveyn
onayıyla kayıt). Ankette "13-17" veya "13 yaş altı" yaş aralığını
işaretlersen uygulama Play'in **Families (Aileler) politikası** kapsamına
girer: ayrı içerik derecelendirmesi, reklam kısıtları, ek gizlilik
beyanları ve daha sıkı inceleme.

**Önerim: hedef kitleyi yalnızca `18 ve üzeri` seç.**

Gerekçe: uygulamayı kuran, hesabı açan ve kullanan kişi salon üyesi ya da
yöneticisi. Reşit olmayan üye **kendi başına kayıt olamıyor** — ebeveyn
onayı olmadan kaydı tamamlanmıyor (kural: `guardianApprovedIfMinor`). Yani
uygulama çocuklara pazarlanmıyor, çocuğun verisi ebeveyn üzerinden
işleniyor. Bu, Families kapsamına girmeden doğru beyan.

⚠️ Bu bir hukuki tavsiye değil. Play'in çocuk verisiyle ilgili tanımları
katı; emin değilsen bir avukata sor. Ama teknik gerçek şu: çocuk kaydı
ebeveyn onayına kilitli ve bu kural sunucuda zorlanıyor.

---

## 1. Mağaza girişi

**Uygulama adı** (30 karakter sınırı)
```
GymEntra
```

**Kısa açıklama** (80 karakter sınırı — 71 karakter)
```
Spor salonun cebinde: üyelik, ders programı, randevu ve QR ile hızlı giriş.
```

**Tam açıklama** (4000 karakter sınırı)
```
GymEntra, spor salonunu telefonundan yöneten bir üyelik ve antrenman
uygulamasıdır. Üye, antrenör ve salon yöneticisi aynı uygulamanın içinde,
her biri kendi ekranıyla çalışır.

ÜYE İÇİN

• Üye kartın ve QR kodun her zaman cebinde — salona girişte okut, yeter.
• Paketinin ne zaman bittiğini, kaç ders hakkın kaldığını tek bakışta gör.
• Grup derslerini uygulamadan rezerve et, vazgeçersen yerini bırak.
• Antrenörünün müsait saatlerini gör, özel ders randevunu kendin al.
• Antrenörünün sana yazdığı programı adım adım takip et.
• Kilo ölçümlerini kaydet, zaman içindeki değişimi gör.
• Ödeme bildirimini uygulamadan gönder, onaylandığında haberin olsun.

ANTRENÖR İÇİN

• Çalışma saatlerini tanımla; üyeler yalnızca uygun saatlerden randevu alsın.
• Takvimini gör, randevularını yönet.
• Üyelerine antrenman programı yaz, hazır şablonlardan hızlıca üret.

SALON YÖNETİCİSİ İÇİN

• Katılım isteklerini onayla, üye listeni yönet.
• Paket ve promosyon tanımla, üyelere paket ata.
• Ödemeleri kaydet ve onayla; aylık geliri panelden takip et.
• Ders programını oluştur, eğitmen ve kontenjan ata.
• Salonun çalışma saatlerini, adresini ve iletişim bilgisini düzenle.
• Salonun rengini ve logosunu kendi markanla değiştir.

AİLELER İÇİN

18 yaşından küçük üyeler bir ebeveyne bağlanır. Ebeveyn onayı olmadan kayıt
tamamlanmaz. Ebeveyn, çocuğunun paketini ve randevularını görebilir, onun
adına randevu iptal edebilir ve ödemesini yapabilir. Birden çok çocuğu varsa
tek ödeme yapıp tutarı çocuklar arasında eşit böldürebilir.

GymEntra uygulama içinden ödeme almaz. Ödemeler salonda yapılır; uygulama
yalnızca kaydını tutar.
```

---

## 2. Veri güvenliği (Data Safety) formu

App Store'daki App Privacy beyanıyla **birebir aynı** olmalı; Play ikisi
arasındaki farkı sorun sayabiliyor.

| Veri türü | Toplanıyor? | Amaç | Zorunlu mu | Nerede |
|---|---|---|---|---|
| Ad | Evet | Uygulama işlevi, hesap yönetimi | Zorunlu | `tenant_memberships.userDisplayName` |
| E-posta | Evet | Hesap yönetimi, kimlik doğrulama | Zorunlu | Firebase Auth |
| Telefon | Evet | Uygulama işlevi (salon iletişimi) | İsteğe bağlı | `tenant_memberships.phone` |
| Doğum tarihi | Evet | Uygulama işlevi (18 yaş altı tespiti) | İsteğe bağlı | `tenant_memberships.birthDate` |
| Sağlık ve fitness | Evet | Uygulama işlevi | İsteğe bağlı | `measurements.weightKg`, `workout_logs` |
| Diğer finansal bilgi | Evet | Uygulama işlevi (ödeme defteri) | İsteğe bağlı | `payments.amount` |
| Uygulama etkileşimleri | Evet | Uygulama işlevi | Zorunlu | `checkins` (salona giriş kaydı) |
| Cihaz kimliği | Evet | Bildirimler | İsteğe bağlı | `push_tokens` (Expo push token) |
| Kilitlenme günlükleri | Evet | Tanılama | Zorunlu | GlitchTip (Sentry protokolü) |

**Diğer sorular:**
- Veriler üçüncü taraflarla **paylaşılıyor mu?** → **Hayır.** Firebase ve
  GlitchTip hizmet sağlayıcı; Play'in tanımında bu "paylaşım" değil,
  "işleme".
- Veriler **aktarımda şifreleniyor mu?** → **Evet** (HTTPS/TLS).
- Kullanıcı **verisinin silinmesini isteyebiliyor mu?** → **Evet**,
  uygulama içinden (`deleteMyAccount` callable, Hesabım → Hesabımı sil).

⚠️ **Eksik:** Play ayrıca uygulama dışından erişilebilen bir **hesap silme
URL'i** istiyor. `gymentra.salt-tech-apps.com` şu anda her yola ana sayfayı
döndürüyor — `/privacy/` ve `/terms/` dışında sayfa yok. Doğrulandı:
uydurma bir yol da aynı sayfayı veriyor. **Bir hesap silme talep sayfası
eklenmeli.** Bu, mağaza girişini tamamlamanın önündeki somut engel.

---

## 3. İçerik derecelendirme anketi

Kategori: **Yardımcı program / Üretkenlik** (oyun değil).

Beklenen cevaplar — hepsi "Hayır": şiddet, cinsellik, küfür, uyuşturucu,
kumar, korku öğesi, kullanıcılar arası serbest iletişim (uygulamada
kullanıcıların birbirine serbest mesaj yazdığı bir alan yok), konum
paylaşımı, kişisel bilgi paylaşımı.

Beklenen sonuç: **3+ / Everyone**.

---

## 4. Hâlâ üretilmesi gereken materyaller

Bunlar iç testte gerekmiyor, üretime çıkarken gerekiyor:

- **Uygulama simgesi** 512×512 PNG (elimizdeki adaptive icon'dan üretilir)
- **Öne çıkan grafik** 1024×500 PNG
- **Telefon ekran görüntüleri** — en az 2, önerilen 4-8. Simülatörden değil,
  gerçek veriyle dolu ekranlardan alınmalı: Bugün ekranı, üye kartı/QR,
  ders programı, antrenör takvimi, yönetici paneli.
- **Kategori:** Sağlık ve Fitness
- **İletişim e-postası** (zorunlu), web sitesi, gizlilik politikası URL'i

---

## 5. Sıra

1. Hedef kitle anketi → `18 ve üzeri` (§0)
2. İçerik derecelendirme anketi (§3) — kısa, hemen yapılır
3. Veri güvenliği formu (§2)
4. **Hesap silme sayfası** siteye eklenir ← tek gerçek blokaj
5. Mağaza girişi metinleri (§1)
6. Görseller (§4)
7. Üretim sürümü

İç test (elimizdeki AAB) bunların **hiçbirini** beklemiyor — Android'i
bugün cihazda test edebilirsin.
