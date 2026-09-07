# TestFlight — Build 18 · test notları

*3 Eylül 2026. Bir önceki build'den bu yana 14 değişiklik girdi.*

Öncelik sırası: **1 → 2 → 3**. Bir numaradakiler daha önce hiç gerçek cihazda
çalışmadı, ikinci gruptakiler simülatörde doğrulandı ama telefonda değil,
üçüncü grup zaten çalışıyordu ve regresyon kontrolü.

---

## 1 · Gerçek cihaz olmadan doğrulanamayanlar

Bunlar simülatörde **hiç** test edilemedi.

### Google ile giriş  ⚠️ en riskli madde
Google Sign-In modülünü, uygulamayı Expo Go'da açılışta düşürdüğü için
tembelleştirdim (`56a62e1`). Native derlemede davranışın değişmemesi gerekiyor
ama **doğrulanmadı** — bu build'in en riskli parçası.

- [ ] "Google ile devam et" → hesap seçici açılıyor mu
- [ ] Giriş tamamlanıyor ve doğru role yönlendiriyor mu
- [ ] Yarıda iptal edersen hata mesajı düzgün mü (çökmemeli)
- [ ] Apple ile giriş de hâlâ çalışıyor mu

### Şifremi unuttum (PER-2)
- [ ] Giriş ekranı → e-posta yaz → "Şifremi unuttum" → mail geliyor mu
- [ ] **Spam'e mi düşüyor?** (ilk gönderimde düştü; itibar ısındıkça
      düzelmesi bekleniyor — bu build gerçek bir ölçüm)
- [ ] HTML gövde düzgün görünüyor mu (yeşil "Şifremi sıfırla" düğmesi)
- [ ] Bağlantı gerçekten şifreyi değiştiriyor mu
- [ ] Hemen ikinci kez iste → *"Az önce istedin. 1 dakika sonra..."* demeli
      (eskiden "gönderildi" deyip hiçbir şey göndermiyordu)
- [ ] Var olmayan bir adres → **aynı** mesajı vermeli (hesap sayımına kapalı)

### Push bildirimi ve QR
Bunlar `preview` imzasıyla denenmişti, production imzasıyla değil.

- [ ] Bildirim izni isteniyor ve bildirim geliyor mu
- [ ] Üye kartı QR'ı resepsiyonda okunuyor mu
- [ ] Kamera ile check-in (`Giriş kabul et`) çalışıyor mu

---

## 2 · Bu turda yazılanlar — simülatörde çalıştı, telefonda görülmedi

### Hareket görselleştirici (PER-19)
46 hareket, kas haritası, başlangıç/bitiş poz kareleri.

- [ ] **Antrenör:** Profil → "Hareket kütüphanesi" → liste, arama, detay
- [ ] **Yönetici:** Salon → "Hareket kütüphanesi"
- [ ] **Üye:** Program sekmesi → "Programımdaki hareketler" —
      *yalnızca kendisine atananları görmeli, 46'yı değil*
- [ ] Detayda ön/arka kas haritası okunuyor mu, küçük ekranda kontrast yeterli mi
- [ ] "Sorun bildir" (yalnızca personel) → gönder → **bize mail gelmeli**
- [ ] Poz çizimleri anlamlı mı — özellikle `pullup`, `bird-dog`, `leg-curl`,
      `reverse-fly`, `cat-cow` (bu beşini düzelttim, gözden geçirilmeli)

### Grup dersi antrenöre açıldı (PER-8)
- [ ] Antrenör → yeni **Dersler** sekmesi → kendi dersleri görünüyor mu
- [ ] Ders açıldığında katılımcı isimleri geliyor mu
- [ ] "Geldi" / "Gelmedi" işaretleniyor mu; işaretliye tekrar dokununca
      temizleniyor mu
- [ ] Başka antrenörün dersi görünmemeli

### Kotalı grup dersi (PER-9)
*Test için kotalı bir paket ("ayda N grup dersi") atanmış bir üye gerekiyor.*

- [ ] Kotalı üye derse katılabiliyor mu (eskiden "Kilitli" diyordu)
- [ ] Hak düşüyor mu
- [ ] Dolu derse katıl → bekleme listesine almalı ve **hak düşmemeli**
- [ ] İptal → iade mesajı doğru mu (erken iptalde iade, geç iptalde değil)

### Seri ders (PER-10)
- [ ] Ders ekle → TEKRAR: 4 hafta → 4 ders aynı gün/saatte oluşuyor mu
- [ ] Seri bir dersi kaydır → İptal et → **"Bu ve sonrakiler" seçeneği
      çıkıyor mu** ⚠️ *bu akış simülatörde tetiklenemedi, hiç çalışırken
      görülmedi*

### Yönetici tarafı
- [ ] Üye listesinde **arama** (PER-12) — "cicek" yazınca "Çiçek" bulmalı
- [ ] Liste alfabetik mi
- [ ] Üye detayı → **"+ Program ata"** (yönetici artık program yazabiliyor)
- [ ] Panelde "aktif üye" sayısı üye listesindeki sayıyla **aynı mı**
      (eskiden 55/50 diye ayrışıyordu)

### Antrenör tarafı
- [ ] Üye detayında **paket ve kalan ders hakkı** görünüyor mu (PER-7)
- [ ] Son 7 günde bitiyorsa uyarı rengine dönüyor mu

### Kuşak 1.5 düzeltmeleri
- [ ] Onay bekleme ekranında **"Salonu ara"** gerçekten arıyor mu (PER-1)
      *(salonun kayıtlı telefonu yoksa buton hiç görünmemeli)*
- [ ] Kayıt ekranında **KVKK bildirimi** ve tıklanabilir bağlantılar (PER-3)
- [ ] Antrenman ekranında **"3 set × 12 tekrar"** yazıyor mu (PER-4)
      *(eskiden yalnızca "3 set hedefi" diyordu)*
- [ ] Bekleyen istekte **"Tümünü onayla"** — ücretsiz limitte tek mesaj
      vermeli, paywall'ı üst üste açmamalı (PER-5)

---

## 3 · Regresyon — bunlar zaten çalışıyordu

Kural ve model değişiklikleri bu akışlara dokundu, kırılmadıklarını görelim.

- [ ] Sınırsız paketli üye hâlâ derse katılabiliyor mu *(PER-9 bu yolu
      bilinçli olarak değiştirmedi ama komşusunu değiştirdi)*
- [ ] PT randevusu alma / iptal
- [ ] Ödeme bildirme ve yönetici onayı
- [ ] Check-in (QR ve 6 haneli kod)
- [ ] Paket atama, paket değişiklik teklifi
- [ ] Ebeveyn–çocuk akışı

---

## Bilinen eksikler — hata değil

- **Paywall/abonelik çalışmayabilir.** RevenueCat panel kurulumu hâlâ açık
  (plan.md P0-1). Yükseltme akışını test etme.
- **App Check yok.** Şifre sıfırlama uç noktası internete açık; koruma
  yalnızca hız sınırı (adres başına genişleyen bekleme + IP başına saatte 20).
- **Anlatım pozları şematik.** 43'ü arketipten türetildi, `poseReviewed:false`
  taşıyorlar ve ekran bunu söylüyor. Yanlış görünen olursa "Sorun bildir".

## Sorun bulursan

Uygulama içinden **Sorun bildir** yalnızca hareket anlatımları için. Diğer
her şey için ekran görüntüsü + hangi rolde olduğun (üye/antrenör/yönetici)
yeterli — rol, çoğu hatanın hangi kod yolunda olduğunu söylüyor.
