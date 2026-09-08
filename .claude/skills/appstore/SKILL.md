---
name: appstore
description: App Store Connect işleri — build ve inceleme durumu, TestFlight test notu ve test kullanıcıları, yaş sınırı anketi, inceleme bilgileri (demo hesap), ekran görüntüsü eksikleri. Kullanıcı "mağaza durumu", "TestFlight", "App Store", "inceleme", "yaş sınırı", "demo hesap" ya da "build nerede" dediğinde çalıştır.
---

# App Store Connect

GymEntra'nın iOS mağaza işlerini yürütür. Eller `apps/gymentra-mobile/scripts/asc.mjs`
içinde; bu dosya ne zaman hangisinin çağrılacağını ve **neyin onay istediğini**
söyler.

## Yetki sınırı — bu bölüm kuraldır

**Sorulmadan yapılabilir** (hepsi geri alınabilir, hiçbiri dışarıya çıkmaz):
- Her türlü okuma: `status`, `review-detail`, `age-rating`, `screenshots`, `testers`
- TestFlight test notu yazmak (`notes`) — yalnızca test kullanıcıları görür
- Yaş sınırı anketi ve inceleme bilgilerini doldurmak — sürüm incelemeye
  gönderilene kadar kimse görmez

**Önce sorulur** (dışarıya açılan ya da geri dönüşü zor):
- Sürümü **incelemeye göndermek**
- Mağaza metinlerini/ekran görüntülerini **yayınlanmış** bir sürümde değiştirmek
- Kullanıcı yorumlarına yanıt yazmak (herkese açık)
- Test kullanıcısı **silmek**

Onay isterken ne göndereceğini önce yazdır, sonra sor. "Onaylıyor musun?"
tek başına yeterli değil — hangi sürüm, hangi build, hangi metin.

**İnsan işi olan, ajanın yapamayacağı adımlar** (bunları hazırla, kullanıcıya
söyle, bekle): D-U-N-S ve geliştirici doğrulaması, vergi/banka formları,
sözleşme onayları, 2FA'lı konsol adımları, ekran görüntüsü **çekmek**
(simülatör bu projede kullanılmıyor — görselleri kullanıcı verir).

## Komutlar

`cd gymentra-mobile` sonra:

```bash
node scripts/asc.mjs status                  # build'ler + mağaza sürümü durumu
node scripts/asc.mjs notes 22                # build 22'nin test notunu oku
node scripts/asc.mjs notes 22 "…"            # test notunu yaz
node scripts/asc.mjs review-detail           # demo hesap / inceleme notu durumu
node scripts/asc.mjs review-detail '{"demoAccountRequired":true,"demoAccountName":"…","demoAccountPassword":"…","notes":"…"}'
node scripts/asc.mjs age-rating              # yaş sınırı anketi, yanıtsız alanlar
node scripts/asc.mjs age-rating '{"violenceCartoonOrFantasy":"NONE"}'
node scripts/asc.mjs screenshots             # hangi ekran boyutu eksik
node scripts/asc.mjs subscriptions           # abonelik ürünleri; MISSING_METADATA'nın sebebi
node scripts/asc.mjs testers                 # TestFlight grupları ve kişiler
```

Kimlik `eas.json`'daki ASC anahtarından geliyor. **Anahtarın içeriğini hiçbir
çıktıya, log'a ya da commit'e yazma.**

## İşler

### Test notu yazmak

Notu commit'lerden üret, ama commit mesajını kopyalama: test eden kişi neyi
deneyeceğini bilmek istiyor, neyin refactor edildiğini değil. Kısa maddeler,
"şuraya bak" biçiminde. Build numarasını `status` ile doğrula — numarayı
tahmin etme.

### İncelemeye hazırlık

Üç eksik, üçü de tek başına ret sebebi:

1. **Demo hesap.** Onay bekleyen bir hesapla incelemeci hiçbir şey göremez.
   Supergym-88'in demo hesabı kullanılmalı (bkz.
   `backend/scripts/README-supergym-demo.md`), Tarabya değil — orada gerçek
   kişilerin verisi var.
2. **Yaş sınırı anketi.** `age-rating` yanıtsız alanları listeler; spor
   uygulaması için çoğu `NONE`.
3. **Ekran görüntüleri.** `screenshots` hangi boyutun eksik olduğunu söyler.
   Görselleri kullanıcı verir; Supergym-88'den alınır, Tarabya'dan değil.

### Sürüm durumu

`PREPARE_FOR_SUBMISSION` = henüz gönderilmemiş. `WAITING_FOR_REVIEW` /
`IN_REVIEW` = Apple'da. `REJECTED` gördüysen ret gerekçesini konsoldan oku ve
kullanıcıya olduğu gibi aktar — yorumlayıp yumuşatma.
