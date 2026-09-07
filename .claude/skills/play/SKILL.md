---
name: play
description: Google Play Console işleri — kanal ve sürüm durumu, mağaza girişi metinleri, grafik eksikleri, üretim sürümü. Kullanıcı "Play", "Android mağaza", "Play Console", "iç test", "üretim sürümü" ya da "Android durumu" dediğinde çalıştır.
---

# Google Play Console

GymEntra'nın Android mağaza işlerini yürütür. Eller
`apps/gymentra-mobile/scripts/play.mjs` içinde.

## Play'in ASC'den farkı — bunu bilmeden yazma yapma

Play'de yazma işlemleri **edit** denen bir işlem kabında yapılır: edit açılır,
değişiklik ona yazılır, sonra commit edilir. **Commit edilmeyen edit hiçbir
şeyi değiştirmez.** Script bunu şöyle kullanıyor:

- Okuma komutları edit açar ve **commit etmez** → hiçbir okuma mağazayı
  değiştiremez.
- Yazma komutları açıkça commit eder.

Bu yüzden okuma komutlarını serbestçe çalıştırabilirsin.

## Yetki sınırı — bu bölüm kuraldır

**Sorulmadan yapılabilir:** her türlü okuma (`status`, `listing`, `images`,
`details`), ve iç test kanalındaki metin düzeltmeleri.

**Önce sorulur:**
- **Üretim kanalına sürüm çıkarmak** ya da kademeli yayını ilerletmek
- Yayındaki mağaza girişini değiştirmek
- Kullanıcı yorumlarına yanıt yazmak (herkese açık)

Onay isterken hangi kanal, hangi sürüm kodu ve hangi yüzde olduğunu yaz.

**İnsan işi:** geliştirici hesabı doğrulaması, ödeme profili, ekran
görüntüsü çekmek.

**Konsol formları API'de yok ama doldurulabilir.** Veri güvenliği, içerik
derecelendirme, oturum açma bilgileri ve gizlilik politikası Play Developer
API'sinde yok; tarayıcıdan doldurulur. İki tuzak: (1) Play Console tek
sayfalık bir uygulama, adres çubuğuna URL yazmak seni uygulama listesine
geri atar — gezinme **bağlantıya tıklayarak** yapılır; (2) veri güvenliği
sihirbazında adımlar sırayla açılır, adım başlığına tıklamak işe yaramaz,
`İleri` ile ilerlenir.

## Komutlar

`cd gymentra-mobile` sonra:

```bash
node scripts/play.mjs status                 # kanallar, sürümler, paketler
node scripts/play.mjs listing                # başlık, kısa/uzun açıklama
node scripts/play.mjs listing '{"language":"tr-TR","title":"…","shortDescription":"…","fullDescription":"…"}'
node scripts/play.mjs images                 # ikon, öne çıkan grafik, ekran görüntüleri
node scripts/play.mjs details                # varsayılan dil, iletişim
```

Kimlik `secrets/play-service-account.json`. **Anahtarın içeriğini hiçbir
çıktıya yazma.**

## Bilinmesi gerekenler

- **Tablet ekran görüntüleri zorunlu değil.** 7" ve 10" boş olabilir; Play
  yalnızca telefon görüntüsü ister. Eksik diye alarm verme, "istenirse
  eklenir" de.
- **Sürüm kodu ile sürüm adı ayrı.** EAS `autoIncrement` sürüm kodunu
  artırıyor; mağaza girişindeki 1.0.0 ayrı bir alan.
- Metinler `docs/PLAY_STORE.md` içinde tutuluyor; mağazadaki metni değiştirirken o
  dosyayı da aynı anda güncelle, yoksa iki doğruluk kaynağı oluşur.
- Ekran görüntüleri **Supergym-88'den** alınır (uydurma veri), Tarabya'dan
  değil — orada gerçek kişilerin verisi var. Aynı kural **inceleme giriş
  bilgileri** için de geçerli: `uye01@supergym88.test`. (5 Eylül 2026'da
  burada bir Tarabya hesabı duruyordu ve düzeltildi.)
- **Veri güvenliği formu iOS'un App Privacy beyanıyla aynı gerçeği
  anlatmalı.** İkisinin de tek kaynağı `apps/gymentra-mobile/APP_PRIVACY.md`;
  koda bir veri alanı eklendiğinde üçü birden güncellenir.
