# GymEntra — İyileştirme Planı

Bu dosya, uygulamanın tam denetimi (akışlar, veri şeması, güvenlik kuralları,
performans, mağaza hazırlığı) sonucunda çıkan iş listesidir. Tek takip
kaynağıdır: bir madde tamamlandığında kutusu işaretlenir ve altına kısa bir
"nasıl çözüldü" notu düşülür.

**Denetim tarihi:** 19 Ağustos 2026
**Kapsam:** `apps/gymentra-mobile/` (Expo SDK 57 istemci) + `backend/` (Firestore
kuralları, indexler, Cloud Functions) — paylaşılan Firebase projesi `tarabyamarte`.

> **Yol notu (7 Eylül 2026 — monorepo birleştirmesi).** Depo tek kök altında
> toplandı: eski `gymentra-mobile/` → `apps/gymentra-mobile/`, eski `marte06/`
> → `backend/`. Güncel iş maddelerindeki yollar 8 Eylül 2026'da düzeltildi;
> tarihli geçmiş kayıtlarda (depo durumu tabloları, arşiv notları) o günkü
> yollar bilerek olduğu gibi bırakıldı.

**Öncelik anahtarı**
| Seviye | Anlamı |
|---|---|
| **P0** | Yayına çıkmayı engeller. Mağaza reddi veya gerçek kullanıcı kaybı. |
| **P1** | Güvenlik / veri bütünlüğü. Yayından önce kapatılmalı. |
| **P2** | Doğruluk ve dayanıklılık. İlk sürüme yetişmeli. |
| **P3** | Performans / maliyet. Ölçeklenince acıtır. |
| **P4** | Ürün boşlukları. v1.1 planına girebilir. |
| **P5** | Kod sağlığı / teknik borç. |

---

## KALAN İŞLER — sıralı (2 Eylül 2026)

Bu bölüm, dosyanın geri kalanındaki açık maddelerin **tek sıralı listesi**.
Sıra değerle değil, **bağımlılık ve risk** ile belirlendi: yayını engelleyen
şey önce, ölçeklenince acıtan şey sonra, iyileştirme en sonda.

*2 Eylül 2026 revizyonu:* dört persona ile yapılan kullanım testi
(`personatalepleri.md`, ayrıntılar aşağıda **PER** bölümünde) sıraya bir
"Kuşak 1.5" ekledi ve Kuşak 2–3'ü yeniden dizdi. Kuşak 1'e dokunulmadı:
mağaza engeli olmayan hiçbir şey mağaza engelinin önüne geçmez.

### Denetim — 8 Eylül 2026 · yayın altyapısı

Bu altı madde planın *açık işleri* değil, planın **hiç konuşmadığı**
boşluklar. Kod tarafı değil, yayın ve işletme tarafı; hiçbiri bir ekranı
etkilemediği için bugüne kadar kimsenin önüne çıkmadı.

**D-1. [x] CI fiilen çalışmıyor — P5-5 "kuruldu" diyor ama koşmuyor.**
*(8 Eylül 2026 — çözüldü.* Tek dosya: `.github/workflows/ci.yml`, dört iş —
**mobile** (typecheck + `expo lint --max-warnings 0` + `npm test`), **rules**
(emülatöre karşı kural testleri), **functions** (derleme + emülatörlü testler),
**rig** (typecheck + poz denetimi dahil testler). Eski iki kopya silindi.
Dördünün de CI'da koşacağı komutlar yerel olarak çalıştırıldı ve **hepsi
yeşil**: mobil 346, kural 220, functions 79, rig 195 test; lint ve functions
derlemesi de temiz. **Kalan tek şey push:** dal origin'in 35 commit önünde,
GitHub'da henüz koşmadı.)*

*Özgün bulgu:*
İki workflow dosyası da alt dizinlerde: `apps/gymentra-mobile/.github/workflows/ci.yml`
ve `backend/.github/workflows/ci.yml`. GitHub **yalnızca depo kökündeki**
`.github/workflows` dizinini okur ve kökte öyle bir dizin yok — yani 7 Eylül
monorepo birleştirmesinden beri hiçbir kontrol çalışmıyor. Üstelik mobil
workflow yalnızca typecheck + lint yapıyor; **`npm test` hiç yok**, ne 148
mobil test ne de kural testleri o yoldan geçiyor. Ayrıca dal (`uzak-diz-ters-bukulme`)
origin'in 35 commit önünde — dosyalar köke taşınsa bile push edilmeden koşmaz.
*Yapılacak:* iki workflow'u kökte tek dosyada birleştir (mobil: typecheck +
lint + `npm test`; backend: kural testleri + functions derlemesi), push et,
yeşil olduğunu gör.

**D-2. [x] EAS Update (OTA) kurulu değil.** *(8 Eylül 2026 — kuruldu.)*
`expo-updates` eklendi, `updates.url` proje kimliğine bağlandı ve her build
profiline kanal verildi (`production`, `preview`, `development`,
`development-device`, `simulator`).

**`runtimeVersion` politikası `fingerprint` seçildi**, `eas update:configure`'ın
varsayılan olarak yazdığı `appVersion` değil. Fark kritik: `appVersion` ile
runtime sürümü `1.0.0` olur ve yerel bağımlılık değişip sürüm numarası
unutulduğunda OTA güncellemesi **uyumsuz build'lere düşer** — kullanıcı
açılışta çöken bir uygulama alır ve OTA ile geri de alamazsın. `fingerprint`
yerel projenin durumundan hesaplandığı için bu kapıyı kendiliğinden kapatır
(bugünkü değer `2b3bc0e5…`, 113 kaynak dosyadan).

⚠️ **OTA ancak bir sonraki build'den itibaren çalışır.** Bugün incelemede
olan iOS build 22 ve Play'deki sürüm kodu 6, `expo-updates` içermiyor —
onlara güncelleme gönderilemez. Yani üretim sürümü **yeni bir build'le**
çıkmalı; aksi hâlde yayına OTA'sız girilmiş olur ve ilk JS hatası tam bir
mağaza turu demektir.

*Özgün bulgu:* `GYMENTRA_PLAN.md` Faz 5 "JS-only
değişiklikler store onayı beklemeden yayınlanır" diyor ama `app.json`'da ne
`updates` ne `runtimeVersion` var. Yayından sonraki ilk küçük hata tam bir
mağaza turu demek. **Yayından önce kurulmalı** — sonradan eklemek, kurulu
olmayan sürümdeki kullanıcılara ulaşmıyor.

**D-3. [x] Firestore yedeği yok.** *(8 Eylül 2026 — kuruldu; runbook:
`docs/BACKUP.md`.)* Ölçülen başlangıç durumu tahminden de çıplaktı: PITR
kapalı ve sürüm saklama **1 saat**, sıfır yedek, sıfır zamanlama, üstelik
**silme koruması da kapalı** — veritabanının kendisi tek komutla
silinebiliyordu. Üçü de açıldı: PITR **7 gün**, **günlük** yedek (7 gün
saklama), silme koruması. Doğrulandı (`databases describe`).

Runbook'ta asıl değerli olan geri yükleme tarafı: restore **her zaman yeni
bir veritabanı yaratır**, var olanın üzerine yazamaz — yani "geri al" tek
komut değil, üç adım (yükle → doğrula → taşı). Üç senaryo (PITR'lı kısmi
kurtarma, yedekten restore, silinmiş veritabanı) komutlarıyla yazıldı.

**Kalan üç karar:** (1) haftalık zamanlama — bugün koruma penceresi 7 gün,
üç hafta önce bozulmuş veri kurtarılamaz; (2) Storage sürümleme — açılmadı,
çünkü avatar yolu sabit ve sürümleme silinen hesabın fotoğrafını eski sürüm
olarak yaşatır (`deleteMyAccount`'un temizlediğini geri getirir, KVKK
sorunu); (3) Auth kullanıcı dışa aktarımı bugün elle. Ayrıca **restore
tatbikatı yayından önce bir kez yapılmalı** — yedeğin varlığı geri
yüklenebildiğini kanıtlamaz.

*Özgün bulgu:* Bu planda "yedek" kelimesi bir kez geçiyor, o
da git hakkında. Canlı bir salonun üyelik, paket, kredi ve ödeme defteri
Firestore'da duruyor; PITR açık değil, zamanlanmış dışa aktarma yok, geri
yükleme provası hiç yapılmadı. Yanlış bir toplu script ya da hatalı bir kural
deploy'u geri alınamaz. *En küçük hâli:* PITR (7 gün) + günlük export'un bir
GCS bucket'ına yazılması.

**D-4. [x] Yayın sonrası izleme kör.** *(10 Eylül 2026 — üçü de ele alındı;
biri zaten varmış, biri koda indi, biri panelde kaldı.)*

**Bütçe alarmı — zaten vardı, sıkılaştırıldı.** "Yok" tespiti yanlıştı:
`Firebase Project tarabyamarte` bütçesi ₺500/ay olarak duruyordu, doğru
eşiklerle (%50/90/100, aylık, yalnızca proje `171027427019`). `notificationsRule`
boş görünüyor ama bu bildirimlerin kapalı olduğu anlamına gelmiyor —
Budgets API'sinde boş kural **varsayılan** demek, yani fatura yöneticilerine
e-posta gider. *Yapılan:* iki eşik eklendi — **%10 (₺50) erken tel** ve
**%100 FORECASTED_SPEND**. Gerekçe: bugünkü harcama kuruşlar mertebesinde
(`freeTier: true`, tek salon), dolayısıyla ilk uyarının ₺250'de gelmesi
"kaçağı büyümeden yakala" işini görmüyordu; ₺50 bu ölçekte zaten üç
mertebelik bir sapma demek. Tavan ₺500'de bırakıldı — altı Firebase
projesinin hepsinde aynı düzen var, onu bozmanın sebebi yok.

**GlitchTip kota uyarısı — kurulamadı, panelde yapılacak.** Elimizde yalnızca
DSN var (`app.glitchtip.com/27190`); DSN yazma amaçlı bir anahtar, organizasyon
ayarı yönetemiyor ve depoda bir API jetonu yok. **Kullanıcı yapacak:**
GlitchTip → organizasyon ayarları → kota/kullanım e-posta uyarısı.

*Ama asıl korkulan senaryo koda bağlandı.* D-4'ün kendi cümlesi "bir çökme
döngüsü kotayı sessizce yakar" diyordu; `src/services/eventBudget.ts` tam
buna karşı bir kapı ve `Sentry.init`'in `beforeSend`'ine takıldı.
`data/errors.ts`'teki mevcut süzgeç bunu yakalayamazdı — o yalnızca *bizim*
`reportError` çağrılarımızı görüyor, çökme döngüsü ise SDK'nın küresel
yakalayıcısından geliyor.

Sınır **imza başına** (tür + sebep), küresel değil: tek bir sayaç olsaydı
gürültülü bir hata sessiz olanı susturur, yani tam kaçınmak istediğimiz şeyi
yapardı. Üstündeki oturum tavanı (25) her tekrarında *yeni* imza üreten
döngüyü sınırlıyor — mesajında zaman damgası taşıyan bir hata imza sınırını
hiç görmez. 10 birim testi (mobil 354 → 364).

⚠️ **Bu bir azaltma, garanti değil.** Sayaç bellekte, yani açılışta çöküp
yeniden başlayan bir uygulama her seferinde sıfırdan sayar. O senaryoyu ancak
GlitchTip tarafındaki kısıtlama yakalar — yukarıdaki panel işi bu yüzden hâlâ
gerekli.

**Kademeli sürüm — karar: evet, %20 ile başla.** Üretime çıkarken tek seferde
%100 verilmeyecek; **%20 → (48 saat temiz) → %50 → %100**. *Gerekçe istatistik
değil:* tek salonla %20 ≈ 10 kişi, anlamlı bir örneklem değil. Sebep **durdurma
düğmesi** — Play kademeli bir sürümü duraklatıp durdurabiliyor, tamamlanmış bir
sürümü geri alamıyorsun (kullanıcı zaten güncellemiş olur). Google girişi, push
ve QR üretim imzasıyla hiç denenmemişken (aşağıda 3. madde) o düğmenin
elimizde olması gerekiyor. İlk %20 penceresinde bakılacaklar: Play Console
vitals'ta çökmesiz oturum oranı, GlitchTip'te yeni imza, ve üç doğrulamanın
sahada tutması.

**D-5. [x] `poseReviewed` hâlâ `false`.** *(10 Eylül 2026 — etiket yeniden
yazıldı; kareler onaylanmadı ve onaylanmış gibi de gösterilmedi.)*

İki seçenekten ilki (kareleri onaylamak) gerçekte seçenek değildi: bayrağın
anlamı "yetkin bir antrenör baktı" ve bakan olmadı. `true`'ya çekmek, olmayan
bir denetimi iddia etmek olurdu — üstelik dosya üretilmiş (`build_exercise_library.py`),
elle düzenlenmiyor.

*Asıl sorun metnin kendisiydi:* tek cümlede iki ayrı şey vardı — bizim **iç
kalite durumumuz** ("antrenör onayı bekliyor") ve kullanıcının **güvenliği**
("tekniği antrenörüne doğrulat"). Birincisi kullanıcının yapabileceği bir şey
değil ve hem incelemeciye hem ilk üyeye "bu içerik doğrulanmadı" diye
okunuyor. İkincisi gerçek ve kalması gereken uyarı. Yeni metin ikincisini
tutuyor, birincisini atıyor:

> ⓘ Çizimler şematiktir; hareketin yolunu gösterir, tekniği anlatmaz.
> Tekniği antrenörüne doğrulat.

**Uyarı artık `poseReviewed`'a bağlı değil** — ve bu bilinçli. Doğru olduğu
koşul o bayrak değil: bir antrenör kareleri onaylasa bile çizimler şematik
kalır ve teknik yine antrenörden öğrenilir. Bayrağa bağlı bıraksaydık, onay
geldiği gün güvenlik uyarısı sessizce kaybolurdu. `poseReviewed` veride
duruyor ama artık hiçbir yerde okunmuyor; karelerin nasıl üretildiğini
söyleyen bir künye olarak bırakıldı. *Küçük borç:* okuyucusu kalmadığı için
ya üreticiden de kaldırılmalı ya da bu rolü açıkça belgelenmeli.

**D-2 eki — OTA yolu `preview` için açıldı (10 Eylül 2026).** *"Rig
iyileştirmeleri uygulamaya yansımıyor" şikâyetinin kökü buymuş; rig tarafında
eksik yoktu.* `packages/rig`'de `npm run export` on dört dosyanın hiçbirini
değiştirmedi — motor, kareler, siluetler, katalog ve programlar mobil kaynakta
zaten güncel. Yansımayan şey çalışan binary'ydi ve sebebi runtime uyuşmazlığı:

| | runtime |
|---|---|
| sürüm kodu 7 (internal, yerel build) | `2b3bc0e5…` |
| bugünkü ağaç ve `preview` güncellemesi | `a58c519b36…` |

Üstelik **`production` kanalına bugüne kadar hiç güncelleme yayınlanmamış**
(`eas branch:list` → N/A). Yani mağazadaki soyun OTA ile beslenmesi iki
sebepten birden imkânsızdı.

*Yapılan:* EAS'ta **bulutta** bir `preview` build alındı (`686fd820`, sürüm
kodu 7, APK). Bulut build'in parmak izi `eas update`'in hesapladığıyla aynı
şekilde hesaplandığı için — yerel `--local` build'in tuzağı tam buydu — artık
`eas update --branch preview --platform android --environment preview` ile
JS-only değişiklikler saniyeler içinde cihaza iniyor. Poz ayarları saf
JS/JSON olduğundan rig iterasyonu artık build gerektirmiyor.

İlk güncelleme yayınlandı ve paket açılıp içi doğrulandı: RevenueCat Android
anahtarı ve D-5'in yeni etiketi içeride, eski etiket yok. *Doğrularken not:*
Hermes ASCII olmayan dizeleri **UTF-16** saklıyor, `strings` ya da düz UTF-8
arama Türkçe metni bulamıyor — `.encode('utf-16-le')` ile aranmalı.

**`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` `preview` ortamına da eklendi.** Orada
iOS anahtarı vardı, Android'inki yoktu — bir Android APK'sı için tam tersi.
Build ortamını başlangıçta çözdüğü için APK'da yok; anahtar JS'ten okunduğu
(`purchases.ts:25`, `configure` çalışma zamanında) OTA ile taşındı, ikinci
build gerekmedi.

⚠️ **Mağaza soyu hâlâ açıkta.** Bu APK `preview` profilinden, imzası
production imzası değil — yayını bekleten üç doğrulama (Google ile giriş,
push, QR) bununla geçmiş sayılamaz. Ayrıca sürüm kodu 7'nin runtime'ı
artık orphan: üretim sürümü yeni bir build ister (D-2 zaten böyle diyordu) ve
o build de **bulutta** alınmalı, yoksa production kanalı da OTA'sız kalır.

**D-6. `packages/rig` bu planın dışında.** 5 Eylül'den bu yana yapılan
**bütün** commitler hareket motoru ve kare editörü; onlar
`packages/rig/TODOS.md`'de ayrı takip ediliyor ve plan.md onlardan haberdar
değil. İki liste arasında bir bağ yok, dolayısıyla "yayına ne kaldı"
sorusunun cevabı hiçbir dosyada tam değil. *Karar gerekiyor:* rig işleri
yayın öncesi kapsamda mı, sonrasında mı?

### Kuşak 1 — yayını gerçekten engelleyenler

**1. P0-1 · Freemium duvarı (IAP).** *(2 Eylül 2026: sunucu yarısı
`revenueCatWebhook`, istemci yarısı `services/purchases.ts` + yeniden
yazılan `paywall.tsx` hazır. Apple'da abonelik grubu ve iki ürün oluşturuldu,
Paid Apps anlaşması `Processing`. **4 Eylül 2026:** Play tarafı bitti —
`com.gymentra.mobile.pro.monthly` ve `.yearly` oluşturuldu, temel planlar
`ACTIVE`, 173 bölgede fiyat (TR ₺499,99 / ₺4.999,99, iOS ile eşit).
RevenueCat'te entitlement `pro` dört ürüne, `default` offering'indeki iki
paket her iki platforma bağlandı. `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` EAS
`production` ortamına eklendi; versionCode 4 internal track'te. Apple'da
abonelik grubu yerelleştirmesi ve iki inceleme ekran görüntüsü (1242×2208)
yüklendi. **Kalan:** Apple'daki iki ürün hâlâ `MISSING_METADATA` — API'nin
gösterdiği tüm alanlar dolu, eksik alan App Store Connect arayüzünden
okunacak. **8 Eylül 2026 — webhook tarafı bayat çıktı: iş zaten bitmiş.**
`REVENUECAT_WEBHOOK_TOKEN` Secret Manager'da (sürüm 2, 2 Eylül),
`revenueCatWebhook` 3 Eylül'den beri `ACTIVE` ve **sürüm 2'ye bağlı**.
Bugün uçtan uca sınandı: geçersiz jeton → 401, jetonsuz → 401, GET → 405.
Secret yüklenememiş olsa 500 alınırdı, yani jeton gerçekten okunuyor.

**RevenueCat tarafı da kurulu:** 2 Eylül 08:55'te `User-Agent: RevenueCat`
ile gelen bir istek **200** almış — URL ve jeton karşı tarafta doğru.
O olayın `app_user_id`'si bir UUID'ydi (`0ca3a471…`) ve fonksiyon "salon
bulunamadı" dedi; bu, RevenueCat panelinden gönderilen **test olayının**
imzası. İstemci gerçek satın almada kimliği doğru kuruyor:
`configurePurchases` `appUserID: tenantId` ile yapılandırıyor
(`services/purchases.ts:53`, paywall açılışında çağrılıyor).

**8 Eylül 2026 — Apple tarafı da bayat çıktı.** `asc.mjs`'e yazılan yeni
`subscriptions` komutu (grup yerelleştirmesi, ürün yerelleştirmesi, fiyat
çizelgesi ve inceleme ekran görüntüsünü tek tek yokluyor) ikisini de
**`READY_TO_SUBMIT`** gösteriyor — `MISSING_METADATA` geçmiş; 4–5 Eylül'de
yüklenen grup adı ve ekran görüntüleri durumu değiştirmiş, yalnızca yeniden
bakılmamış. Dört parçanın dördü de tam: `tr` yerelleştirme, 10 fiyat kaydı,
inceleme ekran görüntüsü `COMPLETE`.

⚠️ **Ama yeni bir engel çıktı: abonelikler incelemeye gönderilmemiş.**
Gönderilen kapta (`00f92308…`, 5 Eylül) **tek madde** var, o da sürüm 1.0.
Yani 1.0 bu hâliyle onaylanırsa uygulama yayına girer ama iki ürün
`READY_TO_SUBMIT`'te kalır — paywall'daki satın alma gerçek kullanıcıda
açılmaz. Abonelikler kendi gönderimlerini gerektiriyor; kap incelemedeyken
değiştirilemediği için ya 1.0'ın sonucu beklenip ürünler ayrıca
gönderilecek, ya da sürüm geri çekilip ikisi birlikte gönderilecek.

**Karar (kullanıcı, 8 Eylül 2026): 1.0 geri çekilmiyor.** İnceleme sonucu
beklenecek, abonelikler onaylandıktan sonra **ayrı bir gönderimle**
yollanacak. Kabul edilen sonuç: uygulama yayına girdikten sonra, abonelikler
de onaylanana kadar geçen sürede **paywall'daki satın alma çalışmaz** — yani
o pencerede 10 üye sınırına dayanan yeni bir salon yükseltme yapamaz.
Bugünkü durumdan kötü değil (satın alma zaten hiç çalışmıyor, Tarabya elle
açıldı), ama ikinci salon o pencerede gelirse elle açmak gerekir.

*Sırası geldiğinde:* `asc.mjs status` ile 1.0'ın durumu okunur; `APPROVED` /
`READY_FOR_SALE` görülünce iki ürün için gönderim kabı açılır. Kap açma
mantığı `submit` komutunda zaten var (boş kap varsa yenisini açmak yerine
onu kullanıyor) — abonelik maddesi ekleyen bir `submit-subscriptions`
komutu yazılacak.

**Kalan:** yukarıdaki gönderim kararı ve **gerçek cihazda satın alma**
(cihaz gerektiriyor).

*Cihaz testinde ayrıca bakılacak bir şey:* salon değiştiren bir hesapta
satın almanın hangi salona yazıldığı. `configurePurchases` ikinci salon için
`Purchases.configure`'ı **tekrar** çağırıyor; RevenueCat kullanıcı
değiştirmek için `logIn()` öneriyor ve iki kez `configure` etmenin davranışı
belgede net değil. Yanlışsa yükseltme parası yanlış salona yazılır — koddan
bakarak karara varılamaz, panelde hangi `app_user_id` ile göründüğüne
bakmak lazım.)* Açık maddeler içinde tek başına en
ağırı. Bir salon 10 aktif üyeye ulaşınca 11.'yi **hiçbir zaman**
onaylayamıyor; `paywall.tsx`'teki yükseltme düğmesi yalnızca geri gidiyor.
Tarabya Marte için elle bir abonelik yazılarak geçici olarak açıldı, yani
**sorun çözülmedi, ertelendi** — ikinci salon aynı duvara çarpar. RevenueCat
projesi zaten açılmış. Gerçek satın alma akışı + sunucu tarafı doğrulama.

**1a. [x] P0-1a · Paywall'un abonelikli durumu yok** *(4 Eylül 2026 —
görüldü ve aynı gün kapatıldı).* `alreadySubscribed` [`paywall.tsx:51`] hesaplanıyor ama tek bir
yerde kullanılıyor: yeşil "Aboneliğin zaten aktif" kartını çizmek için
(`:134`). Plan seçici (`:145`) ve satın alma bloğu (`:208`) yalnızca
`packages.length > 0` koşuluna bakıyor. Sonuç: aktif abonesi olan bir salona
"zaten abonesin" yazan bir kartın hemen altında **çalışan** bir "Aboneliği
başlat" düğmesi gösteriliyor. Aynı dönem seçilirse mağaza anlamsız bir hata
döndürür; **diğer dönem seçilirse gerçek bir plan değişikliği/yeni işlem
başlar** — kullanıcı istemeden. Üstelik başlık metni de abonelik aktifken
hâlâ "Ücretsiz plan 10 aktif üyeye kadar, şu an N üyen var" diyor; aboneli
salonun limiti yok. Aktif aboneye satın alma teklif eden ekran, App Store
incelemesinin klasik takıldığı desendir — bu yüzden Kuşak 1'in başında.

**Çözüm:** `alreadySubscribed` iken plan seçici, "Aboneliği başlat", "Satın
alımlarımı geri yükle" ve otomatik yenileme metni gizlensin; başlık ve
açıklama "aboneliğin aktif, sınırsız üye ekleyebilirsin" anlamına dönsün;
yalnızca yeşil kart ve "Geri dön" kalsın. Ayrıca arayüzdeki "Premium ile"
başlığı `Pro` olsun — ürünler ve entitlement `pro`, kullanıcı "Pro" satın
alıp "Premium" yazısı görüyor.

*Nasıl çözüldü:* `alreadySubscribed` artık dört yeri birden kapatıyor — plan
seçici, satın alma bloğu ve "satın alma açılamadı" uyarısı `!alreadySubscribed`
koşuluna alındı; başlık ve açıklama abonelikli durumda "Aboneliğin aktif /
Sınırsız üye ekleyebilirsin" diyor. Yeşil kart, başlıkla aynı şeyi tekrar
etmemesi için sorun gidermeye ayrıldı ("Üye onaylayamıyor musun?"). "Premium
ile" → "Pro ile". Aktif abonenin görebildiği tek eylem "Geri dön". Tip kontrolü
ve 148 test geçiyor. **Cihazda doğrulanmadı** — abonelikli bir salonla paywall
açılıp satın alma düğmesinin gerçekten kaybolduğu görülmeli.

**2. Mağaza girişini bitir (Android).** *(5 Eylül 2026 — `/play` ajanıyla
konsoldan doğrulandı: metinler ve 1024×500 öne çıkan grafik **zaten yüklü**;
ikon var, 6 telefon ekran görüntüsü var. Tablet görselleri boş ama Play
onları zorunlu tutmuyor.)* **Kalan tek iş: üretim kanalına sürüm çıkarmak** —
bugün yalnızca iç test kanalında 1.0.0 (sürüm kodu 5) var, üretim/beta/alfa
boş.

**2a. [x] Yeni production build alındı** *(8 Eylül 2026).* Sürüm kodu **7**,
`production` profili ve kanalı, runtime sürümü `2b3bc0e5…` (parmak izi
politikasının gerçekten devrede olduğu build çıktısında doğrulandı). Üç şeyi
birden taşıyor: OTA desteği (D-2), mikrofon izni düzeltmesi (P0-3) ve PER-6'nın
istemci yarısı. **Sürüm kodu 6 üretime terfi ettirilmemeli** — o build mikrofon
izniyle üretilmişti. **Internal track'e yüklendi** (8 Eylül 2026): `play.mjs
status` internal'da 1.0.0 / sürüm kodu 7 `completed` gösteriyor. *Not: `eas
submit` çıktısında "You've already submitted this version" hatası göründü ama
yükleme tamamlanmıştı — doğrulama CLI çıktısına değil Play API'sine
bakılarak yapıldı (öncesinde internal'da 6 vardı).* **Internal sürüm notu yazıldı**
*(8 Eylül 2026).* Notun gövdesi bir değişiklik listesi değil, bir **test
görevi**: aşağıdaki 3. maddedeki üç doğrulama (Google ile giriş, push, QR)
en üstte, gerekçesiyle birlikte ("önceki testler farklı imzalı APK'ylaydı").
`play.mjs`'e bunun için `notes` komutu eklendi — script salt okunurdu.
Komut kanalı okuyup **mevcut sürümü olduğu gibi geri yazıyor**, yalnızca
`releaseNotes` alanını değiştirerek: `tracks.patch` `releases` dizisinin
tamamını yerine koyduğu için eksik alan göndermek sürüm kodunu düşürürdü.
İç test dışındaki bir kanala not yazmak `--onaylandi` istiyor (yayındaki
sürümün açıklamasını değiştirmek kullanıcı onayına bağlı).
Kalan: aşağıdaki cihaz doğrulaması.

**3. Android'de gerçek cihaz doğrulaması.** Google ile giriş, push bildirimi
ve QR okutma — üçü de production imzasıyla **hiç denenmedi**; önceki
denemeler `preview` APK'sıylaydı ve imzası farklı. Bunlar çalışmıyorsa
Android yayını anlamsız.

**4. iOS mağaza kalanları.** *(5 Eylül 2026 — `/appstore` ajanıyla
doğrulandı, üçü de gerçekten eksik.)* Yaş sınırı anketinde **26 yanıtsız
alan**; inceleme bilgileri **tamamen boş** (demo hesap adı, parolası, not ve
iletişim — onay bekleyen bir hesapla incelemeci hiçbir şey göremez, kesin
ret); ekran görüntülerinde yalnızca **6.1" yüklü (5/5)**, 6.5" seti hiç yok.
Sürüm 1.0 `PREPARE_FOR_SUBMISSION`, yani henüz gönderilmedi.

*(5 Eylül 2026 — ikisi kapandı.)* **Yaş sınırı anketi dolduruldu:** 25 alanın
tamamı tek istekte yazıldı (Apple parça kabul etmiyor); içerik alanlarının
hepsi yok/NONE, `healthOrWellnessTopics` evet. Üç alan yorum gerektirdi ve
şöyle yanıtlandı: **kullanıcı üretimi içerik hayır** (profil fotoğrafı yalnızca
kendi salonunun personeline görünüyor; "evet" demek uygulamayı Apple 1.2'nin
filtreleme/şikâyet/engelleme zorunluluklarına sokardı ve onlar yok),
**ebeveyn kontrolü hayır** (veli onayı üyeliği aktifleştirmeyi kontrol ediyor,
içeriği değil), **yaş doğrulama hayır** (doğum tarihi kullanıcı beyanı).
**İnceleme bilgileri yazıldı:** demo hesap `uye01@supergym88.test`
(Supergym-88, uydurma veri), İngilizce inceleme notu (uygulama Türkçe;
incelemeci menüde kaybolursa kesin ret) ve iletişim bilgileri.

*(5 Eylül 2026 — iOS kapandı, sürüm incelemede.)* **6.5" ekran görüntüleri**
Supergym-88 demo hesabıyla simülatörden alındı ve beş görsel `APP_IPHONE_65`
setine yüklendi. **App Privacy** konsoldan tamamlandı: 13 veri türü (Health,
Photos or Videos, Other User Content, Purchase History, Crash Data ve Other
Data Types eklendi), Crash Data dışında hepsi kimliğe bağlı, hiçbirinde
takip yok — yani ATT ekranı gerekmiyor. Cevaplar tahmin değil, koddan
çıkarıldı; gerekçeleriyle `apps/gymentra-mobile/APP_PRIVACY.md` içinde. Beyan
yayınlandıktan sonra son engel de kalktı ve **sürüm 1.0 (build 22)
incelemeye gönderildi** → `WAITING_FOR_REVIEW`.

**Karar (kullanıcı, 8 Eylül 2026): incelemedeki build 22 geri çekilmiyor.**
O build OTA desteği (D-2), mikrofon izni düzeltmesi (P0-3) ve PER-6'nın
istemci yarısı olmadan üretildi; yine de kuyruk sırası korunuyor.
**Sonucu bilinerek kabul edildi:** yayına giren ilk iOS sürümü
`expo-updates` içermediği için **1.0.1 de OTA ile gönderilemez**, o da tam
bir mağaza turu ister. OTA iOS'ta ancak 1.0.1'den *sonraki* sürümlerde
işlemeye başlar. Android'de böyle bir gecikme yok: sürüm kodu 7 zaten
OTA'lı üretiliyor.

Yol üzerinde bir Apple tuhaflığı: aynı anda tek bir açık "gönderim kabı"na
izin veriliyor ama gönderilmemiş bir kap **iptal edilemiyor** ("not in
cancellable state"), yani her yarım kalan `precheck` bir sonrakini
kilitliyordu. `asc.mjs` artık yeni kap açamıyorsa mevcut boş kabı yeniden
kullanıyor ve `precheck` kabı iptal etmek yerine maddesini silip boş
bırakıyor (`submissions` komutu kapları listeler).

### Kuşak 1.5 — [x] TAMAMLANDI (3 Eylül 2026)

Altı maddenin altısı da kapandı. **Kalan:** `firestore.rules` (PER-1) ve
~~`functions:requestPasswordReset` (PER-2 HTML gövde) deploy edilmeli~~ —
**ikisi de bayat çıktı, 8 Eylül 2026'da doğrulandı: zaten deploy edilmişler.**
Canlı ruleset (`rulesets/34d0ff6d…`, 4 Eylül 15:19) indirilip `firestore.rules`
ile karşılaştırıldı: **birebir aynı**, `isPendingIn` içinde. Aynı şey
`storage.rules` için de geçerli. Composite index'ler de eşleşiyor: canlıda 36
READY, dosyada 36, alan alan aynı. `requestPasswordReset`'in canlı kaynak
paketi indirildi, `passwordReset.ts` yerelle **birebir aynı** ve HTML gövdeyi
içeriyor.

*Nasıl doğrulanır (tekrar gerekirse):* Firebase Rules REST API'sinden
`releases/cloud.firestore` → `rulesetName` → ruleset içeriği; fonksiyon için
`functions/<ad>:generateDownloadUrl`. İkisi de `x-goog-user-project:
tarabyamarte` başlığı istiyor, yoksa 403 dönüyor. **Deploy edilip
edilmediğine `git log`'a bakarak karar verilemez** — backend subtree olarak
alındığı için bütün commit tarihleri 7 Eylül.

**Fonksiyonların tamamı yeniden deploy edildi (8 Eylül 2026, kullanıcı
onayıyla).** Sebep bir hata değil, bir *belirsizlik*: her fonksiyon kendi
deploy anındaki kaynak paketini taşıyor ve 47'sinin 41'i 3–4 Eylül'de
deploy edilmişti; aradan geçen sürede `sync.ts` ve `notifications.ts` gibi
**ortak** dosyalar değişti. Tek tek 41 paketi indirip karşılaştırmak yerine
hepsini bir kez yeniden deploy etmek soruyu tamamen ortadan kaldırıyor —
artık 47'si de tek ve güncel pakete bakıyor.

*Sonuç:* 47 güncelleme, sıfır oluşturma, **sıfır silme**, hata yok. Deploy
öncesi `index.ts`'in 47 export'u canlıdaki 47 fonksiyonla birebir eşleştirildi;
eşleşmeseydi Firebase eksik olanı silmek isterdi. Firebase hiçbirini
"değişmemiş" diye atlamadı, yani kaç tanesinin gerçekten bayat olduğu bu
yoldan öğrenilemedi — ama soru artık geçersiz.

*PER-2'de kayıtlı tuzak bu sefer gerçekleşmedi ve kontrol edildi:* altı
callable'ın Cloud Run servisinde `allUsers` → `roles/run.invoker` bağı yerinde.
`revenueCatWebhook` uçtan uca sınandı — GET **405** (yani istek fonksiyonun
kendi koduna ulaşıyor; yetki eksik olsaydı Cloud Run daha önce keserdi),
jetonsuz POST **401** (secret okunuyor).

Mağaza gönderiminden **önce**, aynı build'e girecek şekilde. Her biri en
fazla yarım gün; toplamı Kuşak 1'in tek bir maddesinden kısa.

**4a. [x] PER-1 · "Salonu ara" ölü buton** *(3 Eylül 2026).* Buton gerçek
numaraya bağlandı; numara yoksa hiç gösterilmiyor. **Karar:** numarayı
herkese açık `tenants` dokümanına taşımak yerine kural genişletildi —
`isPendingIn`, onay bekleyen başvurana **yalnızca başvurduğu salonun**
iletişim bilgisini açıyor. `tenants` dokümanı join-by-code için her oturum
açmış kullanıcıya okunur, yani oraya taşımak her salonun iletişim bilgisini
herkese açardı. 5 kural testi (184 → 189). ~~**Kural deploy edilmeli.**~~
*(8 Eylül 2026 — zaten canlıda; yukarıdaki Kuşak 1.5 notuna bakınız.)*

**4b. [x] PER-2 · Şifremi unuttum** *(2 Eylül 2026 — deploy edildi ve
simülatörde uçtan uca doğrulandı: istemci → callable →
`generatePasswordResetLink` → Resend → gelen kutu).* Giriş ekranında bağlantı; `requestPasswordReset` callable'ı
`generatePasswordResetLink` ile bağlantıyı üretip **Resend** üzerinden
doğrulanmış `salt-tech-apps.com` alan adından Türkçe gönderiyor. İstemcinin
kendi `sendPasswordResetEmail`'i bilinçli olarak kullanılmadı: o, Firebase'in
posta servisinden varsayılan şablonla gider; kilitlenmiş bir üyenin okuyacağı
tek mesaj bu, ürünün diliyle olmalı.

*Hesap sayımına kapalı:* callable, adresin hesabı olsun olmasın **her zaman**
başarı döner ve ekran da öyle söyler ("bu adres kayıtlıysa..."). Dürüst cevap
vermek, isteyenin adres deneyerek kimin üye olduğunu öğrenmesine yarardı.

*Hız sınırı (2 Eylül 2026):* adres başına 0s / 1dk / 5dk / 15dk / 1sa, sonra
**süresiz saatte bir**; 24 saat sessizlik sayacı sıfırlar. Ayrıca IP başına
saatte 20. Tavanın kesme değil yavaşlatma olması bilinçli: sert sınır,
e-postanı bilen birinin haklarını yakıp seni 24 saat kendi şifreni
sıfırlayamaz hâle getirmesine izin verirdi — saldırgan hesabı alamaz ama
geri dönüş yolunu kapatır. IP sayacı ayrı, çünkü adres başına sınır
"binlerce farklı adrese birer istek" saldırısını hiç görmez; posta kotasını
yakan senaryo odur. Sayaç anahtarları SHA-256 (IP kişisel veri).

İstemci `retryAfterSeconds` döndüğünde "gönderildi" demiyor, bekleme
süresini söylüyor — sınıra takılan üye aksi hâlde hiç yola çıkmamış bir
e-postayı bekliyordu.

⚠️ **Kalan yüzey:** callable kimlik doğrulaması istemiyor (isteyen zaten
giriş yapamıyor) ve App Check bu projede kurulu değil. Dağıtık bir saldırı
(çok sayıda IP) hâlâ mümkün. Yayın sonrası App Check değerlendirilmeli.

*Teslimat notu:* ilk mail spam'e düştü. Başlıklarda SPF/DKIM/DMARC **üçü de
PASS** — yapılandırma eksiği yok, sebep soğuk alan adı itibarı. Kodla
çözülecek bir şey değil; hacimle ısınır. Yine de düz metnin yanına HTML
gövde eklendi (gövdesi çıplak URL olan düz metin küçük de olsa bir spam
sinyali).

*Deploy sırasında çıkan tuzak — tekrarlarsa:* `firebase deploy` Cloud Build
sürerken "An unexpected error has occurred" ile düşebiliyor. Fonksiyon
oluşuyor ve ACTIVE görünüyor **ama Cloud Run'a public invoker yetkisi
verilmemiş oluyor**; her çağrı 401 alıyor ve log'da
*"The request was not authorized to invoke this service"* yazıyor.
Çözüm: deploy'u tekrar çalıştırmak (fonksiyon var olduğu için güncelleme
olarak hızlı biter ve son adıma ulaşır). Firestore tetikleyicileri bundan
etkilenmiyor — dışarıdan çağrılmadıkları için o yetkiye ihtiyaçları yok.

**4c. [x] PER-3 · Kayıtta KVKK aydınlatması** *(3 Eylül 2026).* Birincil
aksiyonun altına bildirim (`LegalConsentNotice`), bağlantılar tıklanabilir,
sosyal giriş butonlarını da kapsıyor. **Karar — onay kutusu değil:** ad ve
e-posta sözleşmenin ifası için gerekli (KVKK md. 5/2-c), yani hukuki
dayanağı zaten var. Gereksiz bir kutu dayanağı yanlış tarif eder ve
gerçekten açık rıza gereken yerde (ileride pazarlama izni) kutunun anlamını
aşındırır. Zorunlu olan aydınlatma (md. 10) bildirimle karşılanıyor.

**4d. [x] PER-4 · Hedef tekrar sayısı** *(3 Eylül 2026).* Kök sebep ekran
değilmiş: `startWorkoutLog` set sayısını kopyalayıp `reps`'i düşürüyordu,
yani veri log'a hiç girmiyordu. `ExerciseLog.repsTarget` eklendi
(opsiyonel — eski loglarda yok), zincir uçtan uca bağlandı.

**4e. [x] PER-5 · "Tümünü onayla"** *(3 Eylül 2026).* Sıralı hâle getirildi
ve ilk redde duruyor: koltuk bittiyse sıradaki de sığmaz, devam etmek
yalnızca gürültü üretir. Duvara kadar onaylananlar onaylı kalıyor, mesaj
kaçının geçtiğini söylüyor.

**4f. [x] PER-6 · Antrenörün eklediği randevuda çakışma kontrolü yok.**
*(8 Eylül 2026 — **sunucu tarafı deploy edildi**: `createPtSessionByStaff`
ve çakışma denetimini taşıyan `bookPtSessions` ikisi de `ACTIVE`, Cloud Run
çağrı yetkileri doğrulandı. İstemci yarısı bir sonraki build'le sahaya
iner.)* Antrenör tarafı
`createPtSessionByStaff` callable'ına taşındı: antrenör hâlâ salonda mı, üye
hâlâ aktif mi, saat gerçekten boş mu — üye akışının yıllardır yaptığı üç
kontrol artık personel tarafında da var. `cancellationDeadlineAt` de yazılıyor
(elle eklenen randevuda hiç yoktu, iptalde salonun o günkü ayarına düşüyordu).

**Asıl düzeltme, deterministik kimliğin göremediği çakışma.** Kimlik
`{tenant}_{trainer}_{başlangıç}` olduğu için yalnızca *aynı dakikada başlayan*
iki randevuyu yakalıyordu. Elle eklenen randevunun başlangıcı ve süresi
serbest olduğundan 10:00–11:00 ile 10:30–11:30 iki farklı kimlik, iki mutlu
yazma, tek antrenör demekti. Yeni `findOverlap` yarı açık aralık
karşılaştırması yapıyor — arka arkaya dersler (11:00'de biten, 11:00'de
başlayan) çakışma sayılmıyor. **Aynı denetim üye akışına da eklendi**: üyenin
ızgaraya oturan saati, antrenörün elle koyduğu 09:30'luk randevunun içine
düşebiliyordu. 9 birim testi (functions 79 → 88).

**Bilerek yapılmadı — antrenörün kendi çalışma saatleri ve salonun açık
olması personel tarafında zorlanmıyor.** İkisi de üye akışında *teklif*: üye
antrenörün yayınladığından seçer. Kendi takvimine yazan antrenör o takvimin
sahibidir — telefonla sözleşilen 07:00 dersi, kapalı pazar günündeki fazladan
saat. Bunları engellemek bugün çalışan bir akışı kırardı; PER-6'nın eksiği de
"antrenör tuhaf saat seçti" değil, **bir saate iki üye** idi.

⚠️ **Kalan tek iş — kural sıkılaştırması.**
`pt_sessions` create kuralı hâlâ personelin doğrudan yazmasına izin veriyor;
şimdi kapatılırsa sahadaki build'ler (hâlâ `setDoc` kullanan) randevu
ekleyemez hâle gelir — canlı bir salonda kesinti demek. Kural, yeni build
dağıtıldıktan **sonra** sıkılaştırılmalı.

*Özgün madde:*
`ptSessionRepo.createPtSession` doğrudan `setDoc`; ne mevcut randevularla
çakışma, ne antrenörün kendi saatleri, ne salonun açık olması kontrol
ediliyor. Üye tarafındaki `bookPtSessions` callable'ı bunların hepsini
yapıyor. Aynı saate iki üye yazılabilir — P1 sınıfı veri bütünlüğü. Çözüm:
antrenör oluşturmasını da callable'a taşı (`consumeCredit: false` bayrağıyla).

### Kuşak 2 — salon sahibinin ve antrenörün günlük soruları

*Durum (3 Eylül 2026):* **5, 5a, 5b, 5c ve 7a tamamlandı**, 6 kısmen.
**Kuşak 2 tamamlandı** (3 Eylül 2026).

*Sıra değişikliği ve gerekçesi:* ders kümesi (PER-8 → PER-9 → PER-10)
raporlamanın önüne alındı. Üçü de `ClassSession`'a dokunuyor — ayrı ayrı
yapılsa üç şema göçü, üç kural turu, üç deploy olurdu. Ayrıca raporlamanın
istediği **katılım oranı** PER-8'in eklediği `attendance` verisine bağlı;
önce raporlama yapılsaydı o kart eksik doğardı.

**5. [x] P4-5 + PKG-12 · Raporlama** *(3 Eylül 2026 — `/admin/reports`,
simülatörde doğrulandı).* Altı kart, iki bölüm: **şimdi ilgilenilecekler**
(bekleyen ödeme · 14 günde biten paket · geçerli paketi olmayanlar) ve
**gidişat** (aylık gelir · yeni üye · grup dersi katılımı). Her kart bir
isim listesine iniyor ve satırlar üye detayına gidiyor — yüzdeyle biten bir
rapor sahibi yine üye listesine gönderirdi.

Üç karar kayda değer:

- **Katılım oranı yalnızca yoklaması alınmış derslerden.** Yoklamasız ders
  oranın dışında ve sayısı ayrıca yazılıyor. "İşaretlenmedi" ile "gelmedi"
  farklı olgular; birleştiren rapor bir antrenörlük sorununu bir devamsızlık
  sorunu gibi gösterir. PER-8'in üç durumlu yoklaması tam da bunun için.
- **"Geçerli paketi olmayanlar" bir borç listesi değil.** Uygulama borç
  tutmuyor — para uygulama dışında el değiştiriyor, vade kavramı yok.
  Söylenebilecek dürüst şey: şu an ödenmiş bir paketi olmayan aktif üyeler.
  Sahibin elle yazacağı liste de bu.
- **Süre `endsAt`'ten okunuyor, `status`'tan değil.** PKG-12'nin günlük
  süpürmesi hâlâ yok; temmuzda bitmiş paket hâlâ `active` görünüyor.
  `status`'e göre filtrelemek raporun aradığı satırları gizlerdi.

Yol boyunca çıkan üç hata da düzeltildi: kartlar veri gelmeden "bekleyen
ödeme yok" / "paketi yok" diye kesin ifade kuruyordu (yükleniyor ile boş
sonuç aynı gösteriliyordu); düşen dinleyici sonsuz "yükleniyor" bırakıyordu;
`MiniBarChart` altı boş ayı altı dolu çubuk çizip vurgulanan son çubukla
"iyi bir eylül" gibi gösteriyordu (sıfır tabanı eklendi).

**Kalan:** *filtreler* (paketi biten / borçlu / yeni) üye listesine
bağlanmadı — rapor onları türetiyor ama liste ekranı hâlâ yalnızca arama ve
alfabetik sıra biliyor. Sunucu tarafı toplama (aggregate) yok: ekran salonun
paketlerini 1000'lik bir tavanla çekiyor, yüzlerce üyeli salon için yeterli,
binlercesi için değil.

*Özgün madde:* Aylık gelir, katılım oranı, aktif üye
trendi, yaklaşan paket bitişleri, ödeme yapmayanlar. Panel bugün dört sayı
gösteriyor; sahibin ikinci sorusuna cevabı yok. ADMIN-5 de buraya katlanıyor.
*Persona testi (Hakan) öncelik gerekçesini pekiştirdi: "kimin parası
gecikti" ve "kimin paketi bitiyor" soruları bugün üye üye açarak
cevaplanıyor. PKG-12'nin "ödeme defteri bağı" ve "yaklaşan bitişler" alt
maddeleri bu yüzden raporun ilk iki kartı olmalı.*

**5a. [x] PER-7 · Antrenöre paket ve kalan hak** *(3 Eylül 2026).* Paket
bloğu programın üstünde — ekrandaki her şeyin bağlamı o. Kalan **gün sayısı**
tarihten önce geliyor: antrenörün kararı "on günü kalmış birine sekiz
haftalık program yazmaya değer mi", tarih bunu söylemiyor. Salt okunur; paket
atamak yönetici işi. *Kural değişikliği gerekmedi* — `member_packages` ve
`member_credits` zaten `isTenantStaff`'a açıkmış, ekran hiç sormamış.

**5b. [x] PER-8 · Grup dersi antrenöre açıldı** *(3 Eylül 2026 — deploy
edildi, simülatörde uçtan uca doğrulandı: kendi dersleri listelendi,
katılımcı adı göründü, yoklama Firestore'a yazıldı).* `ClassSession.trainerId`
+ `attendance`, antrenör "Dersler" sekmesi, 9 kural testi (189 → 198), mevcut
4 ders `backfill_class_trainer_id.cjs` ile birebir isim eşleşmesiyle
dolduruldu. Yoklama üç durumlu — "işaretlenmedi" ile "gelmedi" ayrı kalıyor
ki raporlama yoklama alınmamış dersi "herkes gelmemiş" saymasın.

*Özgün madde:* Ders programı yalnızca `canManageGym` ekranında;
`ClassSession.trainerName` serbest metin, antrenörün `userId`'sine bağlı
değil — "benim derslerim" sorgusu bile yazılamıyor. Ders satırı "3/10 dolu"
diyor, isim listesi ve yoklama yok. **Karar (kullanıcı, 2 Eylül 2026):
antrenör tam yetki** — kendi dersini oluşturur/düzenler/iptal eder,
katılımcıyı görür, yoklama alır. Kapsam: `ClassSession.trainerId` +
`attendance` alanı (`{userId: 'present'|'absent'}`), kural değişikliği
(antrenör yalnızca `trainerId == uid` olan dersleri yazar), antrenör
"Derslerim" sekmesi, admin ders satırından katılımcı listesi.

**5c. [x] PER-9 · Kotalı grup dersi rezervasyonu** *(3 Eylül 2026 — deploy
edildi).* `bookGroupClass` / `cancelGroupClassBooking` callable'ları; kredi
en erken bitenden harcanıyor ve yalnızca dersin tarihinden sonra dolan bir
kredi kullanılıyor. **Dolu ders bekleme listesine alıyor ve hiçbir şey
harcamıyor** — yer henüz yok. İptal iadesi salonun `cancellationHours`
değerine göre. *Sınırsız haklar mevcut doğrudan yazma yolunda bırakıldı:*
o yol üretimde çalışıyor, doğrulamadan oraya dokunmak bir dikişi toparlamak
için çalışan akışı riske atmak olurdu — birleştirme PKG-11'e ait.

*Özgün madde:* PKG-4 bunu bilerek yarım
bırakmıştı ("varsayılan şablonda yok, admin açarsa üye 'yakında' görür").
**Karar (kullanıcı, 2 Eylül 2026): kotalı paket satılacak** — yani dal artık
üretimde erişilir olacak ve bugünkü hâliyle satılan paket kullanılamaz.
`bookGroupClass` callable'ı: `member_credits` (`groupClass`) düşer, `classes`
dizisine yazar, dolu ise bekleme listesi; iptal `cancelGroupClassBooking`
ile PKG-11 eşiğine göre iade. `classes.tsx:33` `canJoinGroupClass` kotalı
dalı açar.

**6. [~] PER-10 · Seri ders** *(3 Eylül 2026 — simülatörde doğrulandı: 4
haftalık seri tam 7 gün arayla, ortak `seriesId` ile oluştu).* Ders formunda
TEKRAR seçimi (tek sefer / 4 / 8 / 12 hafta), tek `writeBatch` ile hepsi ya
da hiçbiri — yarım seri hiç olmamasından kötü, üyeler delikli bir program
görür ve eksik haftaların iptal mi edilmediği yoksa hiç oluşturulmadığı mı
anlaşılmaz. Seri iptali yalnızca ileriye.

⚠️ **Kalan:** seri iptalinin arayüz akışı (kaydır → İptal et → "bu ve
sonrakiler") simülatörde tetiklenemedi — tap isabet etmedi, kod yolu
yazıldı ve tip kontrolünden geçti ama **çalışırken görülmedi**. Ayrıca
**PKG-9 (seri PT randevusu) yapılmadı**: `bookPtSessions` zaten `slots: Date[]`
alıyor, yani sunucu tarafı hazır; eksik olan antrenör takviminde haftalık
tarihleri üretip diziyi göndermek.

*Özgün madde:* Grup dersi
bugün tek seferlik kayıt: haftada 20 dersi olan salon 3 aylık programı için
~240 kayıt giriyor. "Her Salı 19:00, 12 hafta" ile PKG-9'un "her Cuma 08:00,
8 hafta"sı aynı desen (`seriesId` + toplu oluştur + seriyi topluca
iptal/ertele). Ayrı yapılırsa iki farklı tekrar modeli çıkar; birlikte.

**7. PKG-10 + PKG-11 · Dondurma, iptal ve erişim politikası.**

**Kapsam kararı (kullanıcı, 3 Eylül 2026): para bu işin dışında.** Banka
ya da kart erişimimiz yok, `payments` resmî geçerliliği olmayan bir defter.
Uygulama ₺ iadesi hakkında **söz vermez** — o, salon ile üye arasında
uygulama dışında konuşulur. Uygulamanın gerçekten zorladığı iki şey var ve
kapsam yalnızca onlar: **ders hakkı** (`member_credits.used`) ve
**salona giriş** (`member_entitlements`).

**7b. [x] PER-11 · İptal eşiği salonun ayarı oldu** *(3 Eylül 2026).*
Ekranlar "24 saatten az kaldıysa iade edilmeyebilir" diyordu — sayı koda
gömülüydü (48 saat ayarlayan salonun üyesine yanlış kural) ve üyeye
bakamayacağı bir eşikten hesap yaptırıyordu. Artık onay metni koşul değil
**sonuç** söylüyor ve `tenants.cancellationHours` Salon ekranından
seçiliyor (6/12/24/48). Kredisi olmayan randevuda iade sözü hiç verilmiyor.

**7c. [x] Paket iptalinde erişim seçimi** *(3 Eylül 2026 — deploy edildi,
uçtan uca doğrulandı: paket sonlandırıldı, hak önbelleği durdu, üye
girişi korundu).* *(Kullanıcı isteği.)* Bugün
`cancelPackageAssignment` yalnızca "yanlışlıkla atadım" için: paketi anında
`cancelled` yapıyor, kredileri iptal ediyor, hak önbelleği siliniyor — kapı
o saniye kapanıyor, seçim yok. Yönetici seçebilmeli:
- **Bitiş tarihine kadar girsin** — `endsAt` korunur, krediler durur, üye
  kalan hakkını kullanır; paket yalnızca yenilenmez.
- **Girişi hemen bitsin** — bugünkü davranış.

Yaklaşan randevu engeli ("önce randevuları iptal edin") yalnızca ikinci
seçenek için anlamlı; birincide randevular geçerli kalmalı.

**7d. [x] İptal son tarihi ve devamsızlık** *(3 Eylül 2026 — deploy edildi,
simülatörde doğrulandı).* *(Kullanıcı politikası.)* Üye en geç **2 saat** kala iptal etmezse randevuya
katılmış sayılır ve hakkı yanar. **Günün ilk 2 saatindeki dersler için son
tarih bir gün öncesi** — 07:00 dersini 05:00'te iptal ettirmek politika
değil tuzak.

Bunun düz bir saat sayısıyla ifade edilemeyeceğine dikkat: eşik artık bir
**son tarih hesabı**. `openingHours` zaten kiracıda duruyor, "günün ilk 2
saati" oradan türetilebilir; salon saatlerini girmemişse sabit bir saate
düşülür.

**Kapatılan iki boşluk:**

1. **Antrenör/yönetici iptali koşulsuz iade ediyor.** `sessions.ts`'te
   `shouldRefund = isTrainer || isAdmin`. Yani üye gelmediğinde antrenörün
   "İptal" demesi hakkı geri veriyor — bu politikanın tam tersi. Antrenörün
   bugün elinde ya "Tamamla" (yalan) ya "İptal" (salon zarar eder) var.
   **PER-14a'nın `no-show` durumu buraya çekilmeli**, Kuşak 3'te
   bekletilirse politikanın her gün düşülecek bir deliği olur. Yönetici
   iadesi de otomatik değil, açıkça sorulan bir karar olmalı ("hak iade
   edilsin mi?") — gerçek mazeretin yolu bu.

2. **Kayıt yok, dolayısıyla gösterilecek bir şey de yok.** İptalde
   `pt_sessions`'a yalnızca `status` ve `updatedAt` yazılıyor. "Ben
   gelmedim, neden düştü" sorusunun cevabı bugün hiçbir yerde durmuyor.
   Yazılması gerekenler: `cancelledAt`, `cancelledBy`, `cancelledByRole`,
   `refunded`, ve **`deadlineAt`** (randevu alınırken hesaplanıp yazılır).
   Son tarihi rezervasyon anında dondurmak önemli: salon eşiği sonradan
   değiştirirse geçmiş randevular kendi kuralıyla kalır.

**Bu kayıt önce üyenin kendisine gösterilir**, yöneticiye değil. Tartışmayı
önleyen şey, yöneticinin bir rapordan okuyup üyeye anlatması değil, üyenin
randevu kartında en başından **"Son iptal: 4 Eylül 21:00"** yazması ve
sonrasında "Son tarih geçtikten sonra iptal edildi, hak yandı" satırını
kendi geçmişinde görmesi. Politikayı yalnızca iptal etmeye çalışırken
öğrenen üye için kural bir tuzaktır.

Raporda karşılığı: yanan haklar ve geç iptaller (madde 5'in kartlarına
eklenir).

**7e. [x] PKG-10 · Dondurma** *(3 Eylül 2026 — deploy edildi, simülatörde
uçtan uca doğrulandı: 15 gün donduruldu, bitiş 31 Eki → 15 Kas, hak
önbelleği düştü).* Kota ve gün sayısını **salon sahibi seçer**
(paket bazında, `freezePolicy`). Varsayılanlar: en az 15 gün; kota süreye
göre öneriliyor — 6 aydan kısada yok, 6 ayda 1, yılda 2, iki yılda 4.

**Kalan:** dondurmayı erken bitirme (üye planladığından önce döndü) yok;
bugün donma kendi süresinde biter. Bir de `sweepPackageStatuses` günlük
çalıştığı için donma bittiği gün ile önbelleğin geri gelmesi arasında
saatler olabilir — check-in bu arada `frozen` uyarısı verir ama personel
yine de içeri alabilir, o yüzden engelleyici değil.

*Özgün madde:* İkisi aynı soruyu
soruyor (para/hak geri nasıl döner) ve ayrı ayrı yapılırsa çelişirler.
`cancellationHours` alanı var ama yönetici ekranı yok.

**7a. [~] PER-12 · Admin üye listesinde arama** *(3 Eylül 2026 — arama ve
sıralama yapıldı).* Liste ayrıca **alfabetik sıralandı**; öncesinde
Firestore'un döndürdüğü sıradaydı, yani gözle taramak bile mümkün değildi.
Arama alanı 8 üyenin altında görünmüyor.

**Kalan:** *filtreler* (paketi biten / borçlu / yeni) — o durumlar raporlama
işinde türetiliyor, oradan gelecekler. *Sunucu tarafı sayfalama* — roster
zaten yüklü ve salon yüzlerce üye, binlerce değil; gerektiğinde raporlamanın
kapsamlı sorgularıyla birlikte.

### Kuşak 3 — üye derinliği ve ölçeklenince acıtanlar

**[x] PER-19 hareket motoru** *(3 Eylül 2026 — kullanıcı isteği).* Figür tek
bacaklı/tek kollu ve yönsüzdü. Uzak uzuv, yön kuralı (dik: ayak; yüzüstü:
baş–kalça; sırtüstü: yukarı; açık `face`), önden görünüş (`view:'front'`,
aynalama, glif yüz), oynat/sürükle motoru (rAF, 30 fps, odak dışında durur,
"hareketi azalt"a uyar). Kütüphane 46→38 (makine/kablo çıktı), 34 arketip —
aynı kareyi paylaşıp farklı hareket olan 11 tanesi ayrıldı. Üreticide zincir
normalizasyonu (segment uzunluğu A'dan, yön B'den, ankraj ekleminden) ve
yer/prop teması denetimi; ilk çalıştırmada 45 uyarı, şimdi sıfır. Uygulamada
görülmedi (simülatör yasak); galeri artifact motorun birebiri. `poseReviewed`
hâlâ false.

**[x] Salon logosu uygulama içinde + yönetici atama (3 sınırı)** *(3 Eylül
2026, kullanıcı isteği — deploy edildi).* Logo yalnızca sahibin ayar
ekranındaki yükleme düğmesinde çiziliyordu. `GymLogo` (expo-image, disk
önbelleği: üye kartı kapıda çevrimdışı çalışır; logosuz salon eski harf
avatarını alır) yükleme kapısı, üç rolün ana ekranı, üye kartı, salon
karekodu, kodla katılım onayı ve SALONUM kartında. Kuruluşta da logo
seçiliyor. Ekip ekranında YÖNETİCİLER bölümü, "Yönetici yap/al", 3/3
sayacı; `tenants.activeAdminCount` sunucu sahipli, `withinAdminLimit`
kural kapısı, backfill uygulandı. Kurucu korunmaz, herkes eşit.
*Uygulama ikonu build-time — kapsam dışı (önceki karar).*


**8. [x] P4-3 + PER-13 · Bildirim tercihleri ve ders hatırlatıcısı**
*(3 Eylül 2026 — deploy edildi).* Beş kategori (`bookings`, `packages`,
`payments`, `programs`, `account`), üç rolün de profil ekranında aynı
bileşen — tercih kişiye ait, o an taşıdığı role değil.

`account` (ebeveyn onayı, katılım isteği) **kapatılamıyor**: bunlar
bildirim değil, tamamlanması gereken akış adımları; susturulursa akış
bitmiyor. Sunucu da zorluyor, o kategori tercihleri hiç okumuyor.

`sendPushToUser`'da kategori **zorunlu**: yeni bir gönderim yeri ne
olduğunu söylemek zorunda, yoksa kapatılamaz hâle gelir ve tercih ekranı
kontrol ettiği şey hakkında yalan söylemeye başlar. 17 çağrı noktası
tek tek işaretlendi.

Hatırlatıcı 15 dakikada bir kısa bir pencereyi tarıyor, rezervasyon
başına iş kurmuyor: rezervasyon iptal edilince iptal edilmesi, ders
kayınca yeniden kurulması ve her deploy sonrası uzlaştırılması gerekirdi.
`reminderSentAt` mükerrer gönderimi engelliyor.

Tercih ekranı simülatörde doğrulandı (Expo Go'yu kapatıp yeniden açmak
gerekti — `open_url` bayat bundle'ı yenilemiyor; not: `xcrun simctl
terminate booted host.exp.Exponent`, sonra `openurl`).

*Özgün madde:*
Push açık/kapalı ve kategori bazlı tercih yok; sunucuda 11 bildirim var,
hiçbiri "dersin 1 saat sonra" demiyor. Hatırlatıcı bildirim sayısını
artırıyor; susturma yolu olmadan eklenmez. Önce tercih, sonra hatırlatıcı,
aynı iş.

**9. [x] PER-14 · Antrenör işletme detayları** *(3 Eylül 2026 — deploy edildi;
uygulamada görülmedi, simülatör yasak).* (a) no-show madde 7d ile geldi.
(b) İzin günleri: `exceptions` modelde vardı ama ekran her kayıtta `[]`
gönderiyordu — kaydedilmiş her izin günü saatlere dokununca siliniyordu;
artık yükleniyor, listeleniyor, ekleniyor. (c) Üye notu: `member_notes`,
salon/üye başına tek ortak not, personel okur-yazar, üye asla okumaz (kural).
*Özgün madde:* (a) **No-show durumu** —
`PtSessionStatus`'a `no-show`: hak yanar, üyeye bildirilir, rapora girer;
bugün antrenör ya "Tamamla" (yalan) ya "İptal" (kredi iade, salon zarar)
demek zorunda. (b) **İzin günü** — `TrainerAvailability.exceptions` modelde
var, `availability.tsx` her kayıtta `[]` gönderiyor. (c) **Üye notu** —
antrenörün üye başına, üyeye kapalı notu (sakatlık, hedef).

**10. [x] PER-15 · Üyeden yenileme talebi** *(3 Eylül 2026 — deploy edildi;
uygulamada görülmedi).* `renewal_requests/{tenantId}_{memberId}`, üye başına
tek açık talep; paket kartının altında yalnızca anlamlıyken (paket yok ya da
≤7 gün) görünür. Yöneticiye push + panel kartı + listede rozet + detayda
şerit. **Paket atanınca sunucu talebi kendiliğinden kapatır** — yöneticinin
hatırlaması gereken ek dokunuş yok. *Özgün madde:* Paket yalnızca admin atıyor; biten
paketin üyesi "salon yöneticisi atadığında görünür" duvarına bakıyor.
"Yenileme talebi gönder" → admin'e bildirim + panelde bekleyen talep.
PKG-12 yaklaşan bitişlerin üye ayağı; 5'ten sonra.

**11. [x] PER-16 · Duyuru / toplu bildirim** *(3 Eylül 2026 — deploy edildi;
uygulamada görülmedi).* `announcements`: yönetici tek ekrandan yayınlar, ana
ekranda son iki kart, herkese push (yeni `announcements` kategorisi,
kapatılabilir). Düzenleme yok — silip yeniden yayınla. *Promosyonların üyeye
görünür kampanyaya dönüşmesi yapılmadı*: promosyon bugün yalnızca paket
atarken uygulanan bir indirim; üyeye vitrin açmak ayrı bir tasarım kararı
(PER-15'in yenileme akışına bağlanmalı). *Özgün madde:* "Yarın kapalıyız", "kampanya
başladı" — uygulamada duyuru kavramı yok; promosyon üyeye hiç görünmüyor.
`announcements` koleksiyonu + push + ana ekranda kart. Promosyonların üyeye
görünür kampanyaya dönüşmesi de buraya bağlanır.

**12. [x] PER-20 · Üye profili: boy, kilo ve fotoğraf.** *(4 Eylül 2026 — deploy edildi: `firestore:rules`, `storage`, `uploadMemberPhoto`, `deleteMemberPhoto`, `deleteMyAccount`.)* Kural tarafında `changedKeys()` yerine `affectedKeys()`: `changedKeys` yalnızca iki haritada da bulunup değeri değişen alanları sayar, bu yüzden boş bırakılmış bir alanı ilk kez doldurmak (telefon dahil) reddediliyordu. *(Kullanıcı isteği,
3 Eylül 2026.)* Profilde boy ve kilo görünmüyor, üye kendi fotoğrafını
ekleyemiyor.

**Boy ayrı bir alan, ölçüm değil.** Kilo `measurements` içinde ve zaman
serisi olması gerekiyor; boy yetişkinde sabit ve her ölçüme kopyalanırsa
grafiği kirletir. Boy `tenant_memberships.heightCm`'e, kilo profilde **en
son ölçümden** okunur — profilde ikinci bir kilo alanı açmak iki doğruluk
kaynağı yaratır ve hangisinin güncel olduğu belirsizleşir. İkisi birlikte
VKİ'yi de verir.

**Fotoğraf: kırp, küçült, aslını bırakma.**
- `expo-image-picker` `allowsEditing` ile kare kırpma (yerel arayüz).
- `expo-image-manipulator` ile **512×512, JPEG q0.8**'e indirilir. Bir
  avatar için gereken bu; ham kamera karesi 3–5 MB ve o boyutu taşımanın
  ne kullanıcıya ne salona faydası var.
- Yüklendikten sonra hem seçicinin önbellek kopyası hem de dönüştürülmüş
  ara dosya `expo-file-system` ile silinir. Kullanıcının seçtiği tam
  çözünürlüklü kare cihazın uygulama önbelleğinde kalmamalı.
- Yol `members/{uid}/avatar.jpg` — deterministik, yeni yükleme eskisinin
  üzerine yazar, yetim dosya birikmez.

⚠️ **Storage okuma kuralı bugünkü hâliyle yetmiyor.** `members/{uid}/**`
okumayı `uid == request.auth.uid || isAdmin()` ile sınırlıyor; `isAdmin()`
küresel claim ve **GymEntra'da geçerli değil** (P1-6). Yani üye listesinde
avatarı ne antrenör ne salon yöneticisi görebilir. Kural, logo kuralındaki
`isGymEntraTenantAdmin` deseniyle "aynı salonun personeli" olacak şekilde
genişletilmeli. Bu, işin kural tarafındaki asıl işi.

**KVKK:** fotoğraf kişisel veri. Aydınlatma metnine eklenmeli ve
`removeMemberFromTenant` / `deleteMyAccount` cascade listesine Storage
nesnesinin silinmesi girmeli — bugün o listeler yalnızca Firestore
dokümanlarını temizliyor.

**13. [x] P1-8 + P4-6 · Çoklu salon üyeliği** *(4 Eylül 2026 — istemci
tarafı; sunucu değişikliği gerekmedi).* `getActiveMemberships` tüm aktif
üyelikleri **belirli sırayla** döndürüyor (katılım tarihi, sonra salon
kimliği) — eskiden `docs[0]` okunuyordu, yani aynı hesap iki açılışta iki
farklı salonu açabiliyordu. Seçim cihazda uid başına saklanıyor ve her
yüklemede listeye karşı doğrulanıyor, böylece ayrılınan salonda takılı
kalınmıyor. Rol salona göre yeniden çözülüyor: biri kendi salonunda yönetici,
gittiği salonda üyedir. Değiştirici yalnızca birden fazla üyelikte görünür —
tek salonlu hesapların çoğunluğuna hiçbir şey eklemiyor. Çevrimdışı önbellek
listeyi de taşıyor. *Yapılmadı:* bildirimler hâlâ seçili salona bakıyor,
başka salondaki bir randevu bildirimi geldiğinde uygulama salonu kendiliğinden
değiştirmiyor.

**14. [x] PER-17 · WORKOUT — antrenman derinliği** *(4 Eylül 2026 — kısaltılmış
kapsam tamamlandı; sunucu değişikliği gerekmedi, `programs` güncelleme kuralı
alan kısıtı taşımıyor).* **(a) Çok günlü program:** `Program.days[]` eklendi,
antrenör kurucusunda gün sekmeleri var. Tek günlü programlar `days` yazmıyor
ve okuma tarafı onları tek günlük liste olarak görüyor (`programDays`) — göç
yok. Kaydederken ilk gün `exercises`'a aynalanıyor, eski sürümdeki telefon boş
program görmüyor. Üye tarafında gün seçimi var ve **son çalışılan günden
sonraki gün** önceden işaretli (`suggestedDayId`); seçim üyenin. Liste
ekranları bütün günleri sayıyor. **(b) "Geçen sefer":** son tamamlanmış
kayıttan `80 kg × 3 set` satırı ağırlık seçicinin üstünde; yapılmamış setler
sayılmıyor. **(c)** `ProgramExercise.libraryId` eklendi — anlatım bağı isim
üzerinden kuruluyordu ve antrenör ismi düzenlediğinde sessizce kopuyordu.
*Kuyrukta kalan:* set bazlı ağırlık/tekrar, PR ve hacim grafiği, dinlenme
sayacı, salona açık egzersiz kütüphanesi, kardiyo tipi.

*Özgün madde:* 
*Model değişikliği yapılırken `ProgramExercise.exerciseId` de eklenmeli —
PER-19'un anlatım bağı bugün isim string'i üzerinden kuruluyor ve antrenör
ismi düzenlerse sessizce kopuyor.*
**Karar (kullanıcı, 2 Eylül 2026): üyelerin çoğu PT/grup, ağırlıkçı
azınlık** → yalnızca iki parça: (a) **çok günlü program** —
`watchActiveProgramForMember` tek program döndürüyor, Push/Pull/Legs
modellenemiyor; `Program.days[]` + "bugün hangi gün" seçimi. (b) **"geçen
sefer"** — antrenman ekranında ağırlık stepper'ı `targetWeightKg` ile
açılıyor, üyenin geçen hafta gerçekte kaldırdığıyla değil; son
`workout_logs` kaydından "geçen sefer: 80 kg × 3 set" satırı. Kalanı
(set bazlı ağırlık/tekrar, PR ve hacim grafiği, dinlenme sayacı, salona
açık egzersiz kütüphanesi, kardiyo tipi) **P2 kuyruğunda**.

**13b. PER-19 · Hareket görselleştirici — PER-18 ile tek iş.** *(Karar,
kullanıcı, 2 Eylül 2026; **kod tarafı yapıldı**.)* Claude Design'da üretilen
"Exercise Library" ekranı (ön/arka kas haritası + başlangıç/bitiş poz kareleri)
uygulamaya taşındı. Tasarım dosyası tarayıcıya özel bir şablon motoruyla
yazılmıştı, RN'de çalışmıyordu; 39 bölgeli anatomi SVG'si `react-native-svg`
bileşenlerine, poz çizeri de aynı eklem modeliyle yeniden yazıldı.

*Kapsam kararı:* şablonlardaki 146 satır **101 benzersiz isme**, o da
**46 kanonik harekete** indirildi (kullanıcı: "50'yi geçmesin"). Kardiyo
blokları, tek satırlık devre tarifleri ve "günün ilk hareketi — boş bar"
gibi programlama talimatları kütüphaneye **girmiyor** — başlangıç/bitiş pozu
olan tek hareketler değiller; ekran bunu söylüyor, uydurmuyor.

*Yapılanlar:* `src/data/exerciseLibrary.ts` (üretilen: 46 hareket, 30 poz
arketipi, 101 isim → kanonik id eşlemesi), `components/MuscleMap.tsx`,
`components/PoseDiagram.tsx`, `app/exercise-detail.tsx` (üye ve antrenöre
açık ortak rota), `trainer/builder.tsx` egzersiz seçici artık koda gömülü 10
isim yerine kütüphaneyi okuyor, `workout/session.tsx`'teki boş gri kare
"Nasıl yapılır?" girişine dönüştü. Üreteç: `backend/scripts/build_exercise_library.py`
(tasarım dosyası provenance olarak yanında). 10 yeni test.

*Poz kareleri şematiktir.* Üçü (bench, squat, deadlift) tasarımcının elle
ayarladığı kareler; kalanı hareket kalıbı arketiplerinden türetildi. Hepsi
`poseReviewed: false` taşıyor ve ekran "antrenör onayı bekliyor" diyor.
Kontak sayfasında gözden geçirilirken **beş arketip yanlış çıktı ve
düzeltildi**: barfiks yerde duruyordu (asılı figür yere basıyordu), bird-dog
yatıyor gibi okunuyordu, kedi-deve bird-dog'un bacak uzatma karesini
kullanıyordu, reverse fly dik gövdeyle lateral raise'e dönüşmüştü, leg curl
oturarak extension karesini kullanıyordu (diz ters yöne gidiyordu).

**Erişim ve kapsam (2 Eylül 2026, kullanıcı kararları).** Sekme eklenmedi —
üye tarafında zaten beş sekme var, altıncısı sık kullanılanları başparmak
erişiminden çıkarır (AGENTS §2).

| Kim | Nereden | Ne görür |
|---|---|---|
| Üye | Program sekmesi → "Programımdaki hareketler" | **yalnızca kendisine atananlar** (`scope=program`) |
| Antrenör | Profil → "Hareket kütüphanesi"; ayrıca builder'daki ⓘ | kütüphanenin tamamı (38) |
| Yönetici | Salon → "Hareket kütüphanesi" | kütüphanenin tamamı (38) |

Üyeye 38 hareketlik katalog vermek, onu antrenörünün yazmadığı bir listeden
çalışmaya davet eder; sorumluluk antrenörde kalmalı.

**Sorun bildirme.** Detay ekranının altında, **yalnızca personele** görünen
bir düğme: dört sebep (çizim/kaslar/anlatım/başka) + not, `exercise_reports`
koleksiyonuna yazar. Koleksiyon salt-yazılır — anlatımlar bizim içeriğimiz,
salonun değil; rapor geliştiriciye giden bir mesaj. Kurallar + 7 test yazıldı
(175 → 182 test), **2 Eylül 2026'da deploy edildi**. Üyeye kapalı: bir pozun
hareketi yanlış anlatıp anlatmadığı antrenörlük kararı, ayrıca açık bir
bildirim düğmesi spam hedefi.

Bunun asıl değeri: 43 doğrulanmamış pozu tek büyük onay turu beklemek yerine,
hatayı fark eden kişiden sürekli düzeltme almak.

**E-posta teslimatı (2 Eylül 2026).** İlk hâlinde rapor yalnızca Firestore'a
yazılıyordu — kimseye haber gitmiyordu ve ekran "geliştiricilere ulaşır"
diyerek tutamayacağı bir söz veriyordu. `emailExerciseReport` Cloud Function'ı
(Resend) eklendi; metin de dürüstleştirildi. Fonksiyon bilinçli olarak
"gönder ve unut": rapor zaten kaydedilmiş oluyor, sağlayıcı çökse bile
bildirim kaybolmuş sayılmaz.

**Kurulum kaldı (kullanıcı yapacak):** `RESEND_API_KEY` secret'ı, gönderici
alan adı doğrulaması ve fonksiyon deploy'u. Anahtar girilene kadar fonksiyon
uyarı loglayıp geçer, rapor yine kaydedilir.

⚠️ **Açık kalan zayıf halka — atama bağı isim üzerinden.** Antrenör
kütüphaneden bir hareket eklediğinde programa yalnızca `name` yazılıyor;
anlatım o isimden çözülüyor (`exerciseByName`). Antrenör ismi elle
düzenlerse bağ **sessizce** kopar ve üye anlatımı kaybeder. Kalıcı çözüm
`ProgramExercise.exerciseId` alanı — PER-17'nin model değişikliğiyle birlikte
yapılmalı, ayrı iş açmaya değmez. `SCHEMA.md` → `programs` bölümünde de
işaretli.

**Yol üstünde bulunan hata:** `mix(colors.line, …)` — `line` token'ı bir
`rgba()` dizesi, `mix` ise hex okuyor, sonuç `#NaNcbNaN`. Kontrast
ayarından beri bütün kas sınırları ve zemin çizgisi sessizce kayıptı.
Ayrıca `socialAuth`'un modül kapsamındaki Google Sign-In import'u Expo Go'da
uygulamayı açılışta düşürüyordu (projenin kendi `scripts/sim.sh`'i bu yüzden
çalışmıyordu) — require ilk kullanıma ertelendi. **Google girişinin gerçek
akışı doğrulanmadı**, native build gerektiriyor.

**13a. PER-18 · Hazır program şablonları — PER-17 ile tek iş.** *(Karar,
kullanıcı, 2 Eylül 2026.)* Antrenör bugün her üyeye sıfırdan, 10 sabit
egzersizli kütüphaneden program yazıyor. GymEntra ile gelen ortak
`program_templates` koleksiyonu; antrenör üyeye atarken **kopya** alır ve
düzenler (şablon değişmez, üyenin `programs` kaydı değişir); salon kendi
şablonunu da kaydedebilir (`tenantId` dolu). **Yalnızca antrenör/salon
atar**, üye seçemez. Kapsam: 6 başlık × 2 seviye (başlangıç/orta), ~12
şablon: ısınma (genel, alt/üst vücut), yağ kaybı, core güçlendirme,
sırt-omuz (masa başı), tam vücut başlangıç, alt/üst split. **Isınma her
programın otomatik ön bloğu** (`Program.warmup[]`, antrenör kapatabilir);
"Antrenmana başla" önce ısınmayı getirir.

*Model gereksinimi — PER-17 ile aynı değişiklik:* `ProgramExercise`'a
`type: 'weight' | 'time' | 'reps'` (+ `durationSeconds`), `restSeconds`,
`cue` (kısa ipucu metni); `Program.days[]`. Bunlar olmadan ısınma
yazılamaz (süre/vücut ağırlığı temelli, kg alanı anlamsız).

*İçerik ilkeleri:* ACSM/NSCA/WHO kılavuzlarına dayanır, her şablon
kaynağını taşır. **"Karın inceltme" yok** — bölgesel yağ yakımı için kanıt
yok, "core güçlendirme" adıyla. **"Postür düzeltme" yok** — kanıt karışık,
"sırt ve omuz güçlendirme" adıyla. Sertifikalı antrenör onayı: şablonlar
Tarabya antrenörü gözden geçirmeden üretime alınmaz; uygulamada sağlık
uyarısı ve "antrenörün uyarlaması gerekir" notu. Görsel/video yok — metin
ipucu ile başlanır (telif), görsel sonra.

*İçerik üretildi (2 Eylül 2026):* `program_templates.md` (13 şablon, 141
egzersiz, kaynakçalı) + `backend/scripts/program_templates.seed.json` +
`backend/scripts/seed_program_templates.cjs` (dry-run / `--apply`,
idempotent). 4 ısınma (genel, kısa, alt, üst) + 5 başlık × 2 seviye = 14
şablon. Seed, PER-17 model değişikliği ve `SCHEMA.md`'ye `program_templates`
bölümü eklenmeden **çalıştırılmaz**. *Karar (kullanıcı, 2 Eylül 2026):
gerçek antrenör onayı beklenmedi;* antrenör personası incelemesi yapıldı,
9 değişiklik uygulandı, 4 öneri gerekçesiyle reddedildi — belgenin
"Antrenör personası incelemesi" bölümü. Gerçek antrenör onayı ekipman
listesi ve Türkçe hareket adları için hâlâ önerilir.

**15. ~~UX-7 kalanı~~** — tamamlandı (1 Eylül 2026), on ekran.

### Kuşak 4 — borç ve temizlik

**16. WEB-6 · Göç veri kalitesi.** Tek `name` alanında birden çok kişi olan
kayıtlar. **Karar salon sahibinin**: ayrı üyeliklere bölünecek mi, yoksa
bilinçli olarak böyle mi kalacak? Konuşulmadan kod yazılmamalı.

**17. P3-3 · Kullanılmayan bağımlılıklar.** Dokuz paket. `expo-linking` ve
`react-native-gesture-handler` **artık kullanılıyor** (LegalLinks, kaydırmalı
satırlar) — liste yeniden doğrulanmalı, `npx expo-doctor` ile.

**18. P5-1 · Test kapsamı.** *(8 Eylül 2026 sayımı: kural 220, mobil 346,
functions 79, rig 195 — dördü de artık CI'da koşuyor, bkz. D-1.)* Kalan:
bileşen/render testi hiç yok — `react-native`'i ayrıştırabilen bir kurulum
gerektiriyor, ayrı bir iş.

**19. P4-7 · i18n.** Tüm metinler koda gömülü. İhracat düşünülene kadar
gerekmiyor; sıranın sonunda olmasının sebebi bu.

### Kuyruk — sıraya girmemiş, karar verilmiş

**P2 (değerli, engelleyici değil):** WORKOUT kalanı (14'e bkz.) · ölçüm
formunda doğrudan sayı girişi + kalça/boy/yağ oranı (kilo 75'ten 0,5
adımla başlıyor; 52 kg için 46 dokunuş) · üye kartında adı gizleme · ders
açıklaması/seviyesi · üyenin kendi haftalık hedefi (`WEEKLY_TARGET = 4`
sabit) · antrenman geçmişi listesi · antrenöre üyenin telefonu · antrenör
prim takibi · gün içinde bölünmüş çalışma saati · "fazla" bulunanların
sadeleştirilmesi (takvim paylaşımını çok antrenörlü salona sakla,
`trainer/programs` sekmesini `trainer/index` filtresine indir, tema modunu
üyeye bırak, `member/workout` sekmesini program atanınca göster).

### v2 notu — salon yaşam döngüsü (öncelik yok)

*(Kullanıcı isteği, 2 Eylül 2026. Yayın sonrası, v2 için not.)*

**Asıl dert (kullanıcı):** yönetim görünümü ölü kayıtlarla karmaşıklaşıyor.
Depolama maliyeti değil — 0 üyeli bir salon Firestore'da pratikte sıfıra mal
oluyor. Bu, çözümü büyük ölçüde belirliyor: **arşivleme yeter, silme
gerekmiyor.**

**Karar — iki ayrı durum:**

1. **Hiç üye almamış salon** *silinebilir.* Ödeme kaydı yok, üye yok, gerçek
   bir işletme değil — yanlışlıkla ya da denemek için açılmış bir kayıt.
2. **Üye almış ama terk edilmiş salon** → `status: 'dormant'`. Sayımlardan
   düşer, listelerde görünmez, veri durur. Sahip dönerse geri açılır.
   Çok uzun bir süre (ör. 2 yıl) ve uyarı e-postalarından sonra silinebilir.

*Ödeme kayıtları hakkında:* ilk değerlendirmemde VUK saklama yükümlülüğünü
gerekçe göstermiştim; **kullanıcı düzeltti** — bu defter resmi bir belge
değil (fatura yok, mali kimlik yok), ispat sayılmıyor, dolayısıyla yasal
saklama zorunluluğu yok. Yine de silme uyarı ve süre ister: yasal değil ama
o kayıtlar salon sahibinin kendi işletme geçmişi.

**Tetikleyici eşikleri konuşulmadı** — "1 ay içinde üye eklenmeyen" ilk
öneriydi ama Aralık'ta kurulup Ocak'ta açılacak salonu vurur. Uygulanmadan
önce eşikler ve uyarı akışı ayrıca kararlaştırılmalı.

**Yan fayda:** terk edilmiş salonların tuttuğu salon kodları (`TARABYA-01`
gibi) serbest kalır.

---

**P3 (uzak ufuk):** **cinsiyet alanı + kadın antrenör filtresi + kadınlara
özel ders/saat** — *karar (kullanıcı, 2 Eylül 2026): şimdilik hayır; Tarabya
için gerekmiyor, ikinci salon isterse yeniden değerlendirilir* · çoklu şube
· uygulama içi tahsilat (iyzico/POS) + e-fatura · acil durum/sağlık beyanı
· vardiya ve personel yönetimi.

---

## P0 — Yayın engelleyiciler

### [x] P0-0 · Salon kodu hiçbir yerde görünmüyor — üye alma akışı kopuk ⚠️

**Bulgu (27 Ağustos 2026, kullanıcı sorusu):** *"Admin yeni üyelere vereceği
salon kodunu nereden görüyor?"* — cevap: **hiçbir yerden.**

Salon kodu (`tenants.code`, ör. `TARABYA-01`) yalnızca salon **kurulurken**
yöneticinin kendi yazdığı bir alan. Kurulduktan sonra uygulamada onu gösteren
tek bir ekran yok. Yönetici kodu unutursa öğrenmesinin yolu yok; antrenör hiç
bilmiyor; üye hangi salonda olduğunu görüyor ama kodu göremiyor.

Üye tarafındaki katılma ekranı (`onboarding/gym-code.tsx`) *"Resepsiyondaki
QR'ı okut ya da salon kodunu gir"* diyor — ama **QR butonu pasif**
(`opacity: 0.5`, etiketi *"QR kodu tara (yakında)"*). Yani vaat edilen
"sıfır yazma" akışının yarısı hiç yapılmamış.

Sonuç: yeni üye alma, yöneticinin kodu ezberden hatırlayıp sözlü söylemesine
bağlı. Canlı salonda üye alma akışının tamamı buna dayandığı için P0.

**Kapsam (kullanıcı isteği, 27 Ağustos 2026):**
- **Üç rol de** kendi salonunu ve salon kodunu ekranda görebilmeli — yönetici,
  antrenör **ve üye**. (Üyeler birbirine yardımcı olabilsin diye üyede de.)
- Antrenör/yönetici, üye alırken **karekod gösterebilmeli**; yeni üyenin
  uygulaması bunu okutup salona katılabilmeli.
- Sözlü söylemek için kodun kendisi de okunaklı biçimde ekranda olmalı.

**Uygulama notu:** ek native modül gerekmiyor — karekod **gösterme** için
`components/QRCode.tsx` (üye kartında zaten kullanılıyor), karekod **okuma**
için `expo-camera`'nın `CameraView` + `barcodeScannerSettings` deseni
(`app/checkin.tsx`'te zaten çalışıyor) hazır. Kopyalama için `expo-clipboard`
kurulu değil; ilk adımda kod metni `selectable` yapılıp uzun basma ile
kopyalanabilir bırakılabilir.

#### Çözüldü (27 Ağustos 2026)

**`components/GymCodeCard.tsx` (yeni).** Salon adı + katılım kodunu gösterir.
Kod `selectable` — uzun basıp kopyalanabiliyor, böylece `expo-clipboard`
native modülü eklemeye (ve yeni bir build zincirine) gerek kalmadı.
Üç rolün de hesap ekranına kondu:
- `member/profile.tsx` — QR aksiyonu **yok**. Üye kodu okuyup arkadaşına
  söyleyebilir, ama resepsiyonda karekod göstermek salonun işi.
- `trainer/profile.tsx` ve `admin/settings.tsx` — `showQrAction` ile.

**`app/gym-qr.tsx` (yeni).** Personelin masada telefonu uzatacağı tam ekran
karekod. Kart yerine ayrı ekran olması bilinçli: karşıdakinin telefonuna
tutulacak, yer istiyor. `isStaff` guard'ı var; karekodun altında kod ayrıca
büyük ve `selectable` yazılı (okutamayan yazsın diye).

**Yük biçimi `gymentra:gym:<KOD>`.** Önek bilinçli: üye kartının yükü
üyelik doküman kimliği, salon karekodununki salon kodu. Önek olmadan tarayıcı
ikisini ayırt edemez ve yanlış olanı sessizce arar. `encodeGymQr` /
`decodeGymQr` tek yerde (`gym-qr.tsx`), iki taraf da onu kullanıyor.

**`onboarding/gym-code.tsx` — "yakında" kaldırıldı.** Pasif buton gerçek
tarayıcıya bağlandı (`CameraView` + `barcodeTypes: ['qr']`). Salon karekodu
değilse *"Bu karekod bir salon kodu değil"* diyor — yanlış QR'ı sessizce
aramıyor. Elle kod girme yolu aynen duruyor.

`tsc`, `expo lint` ve 55 mobil test temiz.

#### Çözüldü (27 Ağustos 2026)

**`components/GymCodeCard.tsx`** — salon adı + kod, kod `selectable`
(uzun basıp kopyalanabiliyor, native clipboard modülü gerekmeden). Üç rolün
de hesap ekranına eklendi:
- `member/profile.tsx` — karekod aksiyonu **yok**. Üye kodu okuyup
  arkadaşına söyleyebilir, ama resepsiyonda karekod göstermek salonun işi.
- `trainer/profile.tsx` ve `admin/settings.tsx` — `showQrAction` ile
  "Karekodu göster" butonu.

**`app/gym-qr.tsx`** (yeni, modal) — personelin resepsiyonda telefonu
uzatacağı tam ekran karekod. Altında kodun kendisi de büyük puntoyla yazıyor
("okutamıyorsa bunu yazsın"). `isStaff` ile korunuyor.

**Karekod yükü `gymentra:gym:<KOD>`** — `encodeGymQr`/`decodeGymQr` tek
yerde. Önek bilinçli: okuyucu bunu üye kartından (yükü üyelik doküman
kimliği) ayırt edip "bu bir salon kodu değil" diyebiliyor, var olmayan bir
salonu aramak yerine.

**`onboarding/gym-code.tsx`** — pasif *"QR kodu tara (yakında)"* butonu
gerçek tarayıcıya çevrildi (`CameraView` + `barcodeTypes: ['qr']`,
`checkin.tsx` ile aynı desen). Kamera izni istenmiyorsa elle kod girme yolu
zaten duruyor.

`tsc`, `expo lint` ve 55 mobil test temiz.

---

### [~] P0-1 · Freemium duvarı çıkışsız bir çıkmaz → gerçek IAP aboneliğine bağlanacak
`apps/gymentra-mobile/src/app/admin/members.tsx:60-64` — aktif üye sayısı
`FREE_MEMBER_LIMIT = 10`'a ulaşınca `approveMembership()` **hiç çağrılmıyor**,
kullanıcı `/paywall` ekranına yönlendiriliyor. `paywall.tsx:56`'daki
"Pro'ya geç ve Deniz'i onayla" butonu ise sadece `safeBack()` yapıyor — hiçbir
satın alma, yükseltme veya talep akışı yok.

Sonuç: gerçek bir salon 11. üyesini **hiçbir zaman onaylayamaz**. Üstelik
kullanıcıya hata da gösterilmiyor, istek sessizce onaylanmamış kalıyor.

Ek olarak `paywall.tsx` uydurma veri içeriyor: "Deniz'in isteği", "312 QR
check-in işlendi", "46 ders rezervasyonu", "₺749/ay".

#### ✅ Karar (19 Ağustos 2026)

Limit **kalıyor**, ancak arkasına gerçek bir uygulama içi satın alma (IAP)
aboneliği bağlanacak.

| | |
|---|---|
| Ücretsiz kademe | 10 aktif üyeye kadar |
| Premium — aylık | **500 TL / ay** |
| Premium — yıllık | **5.000 TL / yıl** (aylığa göre indirimli) |
| Kim öder | **Yalnızca salon sahibi/yöneticisi.** Üyelerden ve antrenörlerden asla ücret alınmaz. |
| Kanal | App Store IAP + Google Play Billing |

> Not: 500 × 12 = 6.000 TL, yıllık 5.000 TL ≈ **%17 indirim**. Pazarlamada
> "%20" denecekse yıllık fiyat 4.800 TL olmalı — fiyat metni yazılmadan önce
> netleştirilmeli.

#### Uyarı — komisyon ve B2B istisnası
Apple ve Google, uygulama işlevini açan dijital abonelikte kendi ödeme
sistemlerini zorunlu kılar ve **%15–30 komisyon** alır (ilk yıl sonrası veya
küçük geliştirici programında %15). 500 TL'lik abonelikte bu aylık 75–150 TL
demektir.

Alternatif: Apple Guideline **3.1.3(e) Enterprise Services** ve Google'ın
benzeri istisnası, **işletmelere** satılan hizmetlerde uygulama dışı
satın almaya izin verir — ancak uygulama içinden harici ödemeye **link
verilemez** ve akış tamamen uygulama dışında kurgulanmalıdır. GymEntra
salon sahiplerine satılan bir B2B SaaS olduğu için bu istisna teknik olarak
uygulanabilir; ancak inceleme riski taşır ve kullanıcı deneyimi bölünür.

**Mevcut karar: IAP ile ilerlemek.** Komisyon kabul edilmiş sayılır.

#### Durum — 19 Ağustos 2026

Sunucu ve arayüz tarafı **tamamlandı**; kalan işler harici hesap kurulumu
gerektiriyor (RevenueCat, App Store Connect, Play Console) ve bende
yapılamaz.

**Bu turda çözülen asıl hata:** limit aşıldığında `approve()` sessizce
`return` ediyordu — yönetici butona basıyor, hiçbir şey olmuyordu. Artık
"X sırada bekliyor — üye limitine ulaştın" mesajı gösteriliyor ve isteğin
silinmediği açıkça söyleniyor. Kural reddi (bayat istemci sayımı) de
yakalanıp aynı şekilde açıklanıyor.

#### Kalan (mağaza hesapları gerekiyor — bunlar bende yapılamaz)
- [x] Abonelik durumu veri modeli: `Tenant.subscription`
      (`status`, `plan`, `expiresAt`, `platform`) + `activeMemberCount`.
      **İkisi de sunucu sahipli** — kural, istemcinin bu iki alanı
      değiştirmesini engelliyor (test edildi).
- [x] IAP kütüphanesi seçimi → **RevenueCat** *(karar verildi ve bağlandı;
      `services/purchases.ts` + `revenueCatWebhook`. Bu kutu 8 Eylül 2026'ya
      kadar açık kalmıştı.)* Özgün madde: `expo-in-app-purchases` **kaldırıldı**;
      seçenekler `react-native-iap` (doğrudan, makbuz doğrulamasını kendin
      yaparsın) veya **RevenueCat** (abonelik durumu, yenileme, iptal ve
      çapraz platform senkronizasyonunu üstlenir).
      → Oturumun başında RevenueCat *üye aidatları* için reddedilmişti; bu
      farklı bir kullanım (salon sahibinin SaaS aboneliği) ve mağaza kuralı
      gereği IAP zorunlu. Karar ayrıca alınmalı.
- [x] App Store Connect + Play Console'da abonelik ürünlerinin tanımlanması
      (aylık/yıllık, Türkiye fiyatlandırması, abonelik grubu). *(4 Eylül 2026:
      Play'de `.pro.monthly` / `.pro.yearly` temel planları `ACTIVE`, 173
      bölgede fiyat; Apple'da abonelik grubu + iki ürün. **Kalan:** Apple'daki
      iki ürün hâlâ `MISSING_METADATA` — konsoldan bakılmalı.)*
- [~] Sunucu tarafı makbuz doğrulama (Cloud Function) + App Store Server
      Notifications / Google Play Real-time Developer Notifications ile
      yenileme ve iptal takibi. *(`revenueCatWebhook` yazıldı; **webhook
      secret'ı ve deploy kaldı**, gerçek cihazda satın alma hiç denenmedi.)*
- [x] `paywall.tsx` yeniden yazıldı. Uydurma istatistikler ("312 QR check-in",
      "46 ders rezervasyonu") ve uydurma isim ("Deniz") kaldırıldı; gerçek
      `activeMemberCount` gösteriliyor, iki plan (500₺/ay, 5.000₺/yıl) listeleniyor.
      **Çalışmayan bir satın alma butonu konmadı** — bunun yerine mağaza
      kurulumunun tamamlanmadığı açıkça yazıldı. "Satın alımları geri yükle"
      butonu IAP bağlanınca eklenecek.
- [x] `firestore.rules`: limit sunucuda zorlanıyor. Kurallar doküman
      sayamadığı için `syncActiveMemberCount` Cloud Function'ı
      `tenants/{id}.activeMemberCount` alanını güncel tutuyor; kural onu
      okuyor. Yalnızca `member` rolü sayılıyor — antrenör işe almak salonu
      ücretli plana itmiyor. Aktif abonelik limiti kaldırıyor.
      Canlıda doğrulandı: üye eklenince 51→52, silinince 52→51.
- [ ] Abonelik bitince ne olur? Mevcut üyeler **kilitlenmemeli** (veri
      rehin alınmaz); yalnızca yeni üye onayı durur. Bu davranış yazılı
      olarak netleştirilmeli.
- [x] `BILLING_EXEMPT_TENANTS` tamamen kaldırıldı. Koda gömülü muafiyet
      listesi yerine pilot salona veri tarafında `subscription.plan:
      'grandfathered'` verildi — kural zaten aboneliği tanıyor, ikinci bir
      mekanizmaya gerek kalmadı.
      ⚠️ Bu şarttı: canlı salonun 51 üyesi var; sayaç dolduğu anda kural yeni
      üye onayını kilitleyecekti.

### [x] P0-2 · Hesap silme yok — Apple kesin ret sebebi
App Store Review Guideline **5.1.1(v)**: hesap oluşturmaya izin veren her
uygulama, **uygulama içinden hesap silme** imkânı sunmak zorundadır.

**Çözüldü ve 19 Ağustos 2026'da production'a deploy edildi.**
- `backend/functions/src/index.ts` → yeni `deleteMyAccount` onCall fonksiyonu
  (region `europe-west1`). Admin SDK ile çalışıyor çünkü güvenlik kuralları
  istemcinin `measurements`/`workout_logs`/`payments`/`checkins` silmesini
  bilinçli olarak engelliyor.
  - **Sert silme:** `tenant_memberships`, `measurements`, `workout_logs`,
    `checkins`, `push_tokens`, `programs`, `calendar_shares` (her iki yön).
  - **Anonimleştirme:** `payments` — `memberName` "Silinmiş üye" yapılır,
    `note` silinir, `memberId` korunur (salonun defteri bozulmasın).
  - **İptal:** gelecekteki `pt_sessions` `cancelled` yapılır; geçmiş takvim
    olduğu gibi kalır.
  - **Koruma:** salonun **son aktif yöneticisi** silinemez — aksi halde salon
    yönetilemez hale gelirdi (`failed-precondition` ile açıklayıcı hata).
  - Batch'ler 400'lük parçalara bölünüyor (Firestore 500 yazma sınırı).
- `src/services/accountDeletion.ts` — callable sarmalayıcı.
- `src/components/DeleteAccountButton.tsx` — **iki adımlı** onay, yıkıcı
  stil. Üç rolün ekranına da eklendi.

**Kalan:**
- [ ] Gerçek cihazda uçtan uca test (yeni build gerekiyor).
- [x] Gizlilik politikasına silme prosedürü ve saklama süreleri eklendi
      *(8 Eylül 2026).* `apps/gymentra-site/privacy/index.html` bölüm 5 dört alt
      başlığa ayrıldı: silme prosedürü (uygulama içi adımlar + e-posta yolu +
      tek yönetici kısıtı), silinenlerin listesi, **anonimleştirilerek saklanan
      iki kayıt** (ödeme defteri ve geçmiş PT randevusu — ikisinde de ad
      "Silinmiş üye", veri sorumlusu salon) ve saklama süreleri. Metin
      `deleteMyAccount`'un gerçekte yaptığından çıkarıldı, tahminle değil.
      **Eski metindeki iki yanlış düzeltildi:** (1) "silme talebi için bize
      e-posta atın" diyordu — uygulama içi silme bir yıldır var ve Apple
      5.1.1(v) tam olarak onu istiyor; (2) salonun ödeme defterini "mevzuatın
      gerektirdiği süre boyunca" saklayabileceğini yazıyordu — kullanıcı
      kararına göre (bkz. v2 notu) bu defter resmi belge değil, yasal saklama
      yükümlülüğü yok; olmayan bir hukuki dayanağı politikada iddia etmek
      KVKK tarafında düzeltmesi zor bir beyan olurdu.
      Ayrıca `delete-account/index.html`'deki **"yedeklerde en fazla 30 gün"**
      ifadesi **7 güne** çekildi: D-3'te kurulan gerçek yapılandırma PITR 7 gün
      + günlük yedek 7 gün saklama (`docs/BACKUP.md`).
      **Yayına alındı** (8 Eylül 2026) ve dört yol da doğrulandı.

      ⚠️ *Dağıtım yolu sanıldığı gibi değilmiş — bir sonrakinde vakit kaybetmemek
      için:* `SaltTechSolutions/gymentra-site` **31 Ağustos'ta arşivlendi**, yani
      salt okunur; `git subtree push` oraya 403 alıyor. Cloudflare Pages'teki
      `gymentra` projesi git'e **bağlı değil** (Git Provider: No), doğrudan
      yüklemeyle yayınlanıyor:
      `npx wrangler pages deploy apps/gymentra-site --project-name=gymentra --branch=main`.

      **Bu deploy sırasında çıkan asıl bulgu — aşağıdaki mağaza maddesi
      yanlışmış.** Production'daki tek dağıtım üç haftalıktı; yani
      `/delete-account/` sayfası **hiç yayına girmemişti**. Site bilinmeyen her
      yolda ana sayfayı döndürdüğü için adres 200 dönüyor ve göze "çalışıyor"
      gibi görünüyordu — açan kişi pazarlama sayfasını görüyordu. Play
      Console'daki hesap silme alanı tam da bu adresi gösteriyor ve Google onu
      denetliyor. Aynı deploy ile sayfa ve ana sayfadaki "Hesap Silme"
      bağlantısı da yayına girdi.
- [x] Play Console'daki "hesap silme URL'i" alanı — `gymentra.salt-tech-apps.com/delete-account/`
      yayında ve alan dolduruldu. *(Bu kutu 8 Eylül 2026'ya kadar açık
      kalmıştı; mağaza hazırlığı bölümünde zaten işaretliydi.)*

### [x] P0-3 · Gereksiz mikrofon izni (`RECORD_AUDIO`)

⚠️ **Düzeltme (8 Eylül 2026): bu madde yanlış kapatılmış.** `app.json`'ın
`permissions` dizisinden kaldırmak yetmiyormuş — **`expo-image-picker`
eklentisi izni geri ekliyor**: `microphonePermission` verilmediğinde
plugin `RECORD_AUDIO`'yu koşulsuz ekliyor (`withImagePicker.js:11`). Yani
girdi dosyası temiz görünürken **çözülen manifest kirliydi**;
`npx expo config --type public` çıktısında izin duruyordu. Kontrol
`app.json`'a bakarak yapıldığı için üç tur boyunca gözden kaçtı.

*Çözüm:* `expo-image-picker` eklentisine `microphonePermission: false`
verildi — bu hem izni eklemiyor hem de `withBlockedPermissions` ile başka
bir paketin eklemesini engelliyor. Çözülen config artık yalnızca
`android.permission.CAMERA` içeriyor.

**Sonucu:** Play'deki sürüm kodu 6 bu düzeltmeden önce üretildi, yani
manifestinde mikrofon izni olduğu varsayılmalı. Üretim sürümü yeni build ile
çıkacağı için (bkz. D-2) kendiliğinden düzelir; **eski build üretime terfi
ettirilmemeli.**

*Özgün madde:*
`apps/gymentra-mobile/app.json:27-30` Android izinleri arasında
`android.permission.RECORD_AUDIO` var. Uygulama yalnızca QR okutuyor, ses
kaydetmiyor. Gereksiz hassas izin hem Play Store incelemesinde risk hem de
Data Safety formunda yanlış beyana yol açar.

**Çözüldü.** İzin `expo-camera` plugin'inin varsayılanından geliyordu
(`recordAudioAndroid = true`). `app.json`'da plugin'e `recordAudioAndroid:
false` ve `microphonePermission: false` verildi — böylece hem Android
`RECORD_AUDIO` izni hem de iOS `NSMicrophoneUsageDescription` anahtarı
üretilmiyor. (İzni `permissions` listesinden silmek yetmezdi; plugin onu
tekrar ekliyordu.)
⚠️ Native değişiklik — etkili olması için yeni EAS build gerekiyor.

### [x] P0-4 · Uygulama içi Gizlilik / Şartlar bağlantısı yok
Sayfalar yayında (`gymentra.salt-tech-apps.com/privacy/`, `/terms/`) ama
uygulama içinden erişilemiyor. Her iki mağaza da uygulama içinde erişilebilir
olmasını bekler.

**Çözüldü.** `src/components/LegalLinks.tsx` eklendi; üç rolün de ekranına
yerleştirildi: `member/card.tsx`, `trainer/profile.tsx`,
`admin/settings.tsx`.

### [x] P0-5 · Üretime sızan geliştirme ekranları
**Çözüldü.** `src/app/states.tsx` (tasarım durum galerisi) ve
`src/app/checkin-success.tsx` (simüle-check-in butonu kaldırıldıktan sonra
ölü kod) silindi; `_layout.tsx`'teki `Stack.Screen` kayıtları da kaldırıldı.
`paywall.tsx` P0-1 kapsamında yeniden yazılacağı için duruyor.

---

## RM — Rol ve yetki modeli (mimari)

> Bu bölüm 19 Ağustos 2026'da kullanıcı talebiyle eklendi ve P1'den hemen
> sonra ele alınmalı: hem güvenlik (check-in yetkisi) hem ürün (küçük
> salonlarda sahip = antrenör) hem de mevcut bir hatayı kapsıyor.

### [x] RM-1 · Model tek role sıkışmış — tamamlandı

`TenantMembership.role` **tek değerli** (`'member' | 'trainer' | 'admin'`) ve
doküman kimliği `{tenantId}_{userId}` olduğu için bir kullanıcının bir salonda
**yalnızca bir rolü** olabiliyor.

Desteklenmesi istenen dört senaryo:

| Senaryo | Bugün |
|---|---|
| Yalnızca salon sahibi (antrenörlük yapmaz) | ✅ çalışıyor |
| Yalnızca antrenör | ✅ çalışıyor |
| **Sahip aynı zamanda antrenör** (küçük salon) | ❌ **temsil edilemiyor** |
| **Antrenör + üye kabul (check-in) yetkisi verilmiş** | ❌ **temsil edilemiyor** |

Ek olarak, check-in şu an yalnızca yöneticiye açık
(`firestore.rules` → `checkins` create `isTenantAdmin`). Gerçek bir salonda
resepsiyonu çoğunlukla antrenör/personel tutar ve sahip her zaman orada olmaz.
(Bu, daha önce **P2-6** olarak da kaydedilmişti — RM-2 onu kapsıyor.)

**Ayrıca hâlihazırda bir tutarsızlık var:** `trainer/programs` ve
`trainer/calendar` admin'i `isStaff` ile kabul ederken, `trainer/index`
(Üyeler) ve `trainer/profile` `role === 'trainer'` şartı koşuyor. Admin
ayarlardan takvime girdiğinde "Üyeler" sekmesi kilitli geliyor.

### Önerilen model

```ts
export type MembershipRole = 'member' | 'trainer' | 'admin';
export type MembershipPermission = 'checkin';        // ileride genişler

export interface TenantMembership {
  // ...
  roles: MembershipRole[];              // YENİ — `role`ün yerini alır
  role?: MembershipRole;                // legacy, göç boyunca korunur
  permissions?: MembershipPermission[]; // devredilmiş dar yetkiler
}
```

**Neden iki ayrı kavram?**
- **`roles`** = hangi uygulama yüzeyini görürsün (üye sekmeleri / antrenör
  sekmeleri / yönetici sekmeleri). "Sahip aynı zamanda antrenör" bir rol
  *bileşimi*dir, yetki değil.
- **`permissions`** = yöneticinin, tüm yönetici yüzeyini vermeden devrettiği
  dar yetenek. "Ben yokken Mert üye kabul etsin" demek, Mert'e markalaşma
  ayarlarını ve ödeme defterini açmak anlamına gelmemeli.

**Rol bileşimi örtük olmamalı.** Yönetici otomatik olarak antrenör
sayılmamalı — antrenörlük yapmayan bir sahibin navigasyonunda PT takvimi
olmamalı. Aynı kişi ikisini de yapıyorsa `roles: ['admin','trainer']` açıkça
verilir.

### Yetenek yardımcıları (tek doğruluk kaynağı)

Ekranlar `role === 'admin'` gibi ham karşılaştırma yapmayı bırakmalı;
`src/data/membership.ts` içinde tek yerde tanımlanan yardımcıları kullanmalı:

| Yardımcı | Anlamı |
|---|---|
| `canManageGym(m)` | `admin` — onaylar, ödeme defteri, markalaşma, dersler |
| `canCheckIn(m)` | `admin` **veya** `permissions` içinde `checkin` |
| `canCoach(m)` | `trainer` — kendi takvimi, kendi üyeleri, program yazma |
| `canOverseeCalendars(m)` | `admin` — tüm antrenörlerin takvimini görme/devretme |

`canCoach` ve `canOverseeCalendars` ayrı olmalı: takvim ekranı zaten
"yönetici = gözetim modu, randevu oluşturma yok" ayrımını yapıyor, bu
yardımcılar onu isimlendiriyor.

### Navigasyon — çoklu rol

`roles.length > 1` olduğunda kullanıcı iki yüzey arasında geçebilmeli.

- `AuthContext` → `activeRole` (kullanıcı bazlı `AsyncStorage`'da saklanır) +
  `setActiveRole`.
- `/` yönlendirmesi: geçerliyse `activeRole`, değilse öncelik sırası
  **admin > trainer > member**.
- Rol değiştirici **yalnızca birden fazla rol varsa** görünür; profil/ayarlar
  ekranına ve tercihen başlık alanına konur.

### Güvenlik kuralları

`isTenantAdmin` / `isTenantStaff` yeni şekli okurken eski dokümanları da
tolere etmeli:

```
function membershipRoles(tid) {
  let m = get(/databases/$(database)/documents/tenant_memberships/$(tid + '_' + request.auth.uid)).data;
  return m.get('roles', [m.get('role', '')]);
}
```

Yeni: `isTenantCheckinStaff(tid)` = `admin` **veya** `permissions` içinde
`checkin`. `checkins` create kuralı `isTenantAdmin` yerine bunu kullanmalı.

`permissions` alanını **yalnızca kiracı yöneticisi** değiştirebilmeli —
antrenör kendine check-in yetkisi veremez. Mevcut membership update kuralı
şu an yalnızca `['status','approvedAt']` değişimine izin veriyor;
`roles` ve `permissions` de yönetici için açılmalı, ama **kendi rolünü
düşürüp salonu yönetimsiz bırakmaması** için son-yönetici koruması gerekir
(`deleteMyAccount`'taki mantığın aynısı).

### Sorgu ve index değişiklikleri

`where('role','==','member')` → `where('roles','array-contains','member')`.
Etkilenen: `watchActiveMembers`, `watchActiveTrainers`.

Yeni composite index gerekiyor (array-contains + eşitlikler index birleştirme
ile çözülemez):

```json
{ "collectionGroup": "tenant_memberships", "queryScope": "COLLECTION",
  "fields": [ {"fieldPath":"tenantId","order":"ASCENDING"},
              {"fieldPath":"status","order":"ASCENDING"},
              {"fieldPath":"roles","arrayConfig":"CONTAINS"} ] }
```

### Göç sırası (canlı proje — sıra önemli)

1. **Kuralları önce deploy et**, her iki şekli de kabul edecek biçimde
   (geriye dönük uyumlu, tek başına hiçbir şeyi bozmaz).
2. Index'i ekle ve deploy et.
3. **Backfill script'i:** her `tenant_memberships` dokümanına
   `roles: [role]` yaz. `role` alanı geri dönüş için **silinmez**.
4. `roles ?? [role]` okuyan ve `roles` yazan istemciyi yayınla.
5. Tüm kullanıcılar yeni sürüme geçtikten sonra `role` alanı ve kurallardaki
   legacy dal temizlenir.

### Yapılacaklar

- [x] **RM-1** `types.ts` → `roles` + `permissions`; `convert.ts` geriye dönük
      okuma (`roles ?? [role]`).
- [x] **RM-2** `canCheckIn` yetkisi + `checkins` kuralının gevşetilmesi
      (eski **P2-6** bu maddeye taşındı).
- [x] **RM-3** `src/data/membership.ts` yetenek yardımcıları; tüm ekranlardaki
      ham `role === '...'` karşılaştırmalarının değiştirilmesi.
- [x] **RM-4** `trainer/index` ve `trainer/profile` tutarsızlığının
      giderilmesi (admin'in kilitli "Üyeler" sekmesi).
- [x] **RM-5** `activeRole` + rol değiştirici UI.
      `src/services/activeRole.ts` (uid bazlı kalıcı tercih),
      `AuthContext.activeRole` / `setActiveRole`,
      `src/components/RoleSwitcher.tsx` — tek rollülerde **hiç render
      edilmiyor**. Üç rolün ekranına da yerleştirildi. `/` yönlendirmesi
      `activeRole ?? primaryRole` kullanıyor. Artık verilmeyen bir rol
      saklanmışsa (admin'likten düşürülmüş biri) otomatik olarak geçerli
      role düşülüyor.
- [x] **RM-6** Yönetici ekranında rol/yetki atama arayüzü.
      `src/app/admin/staff.tsx` — "Ekip ve yetkiler". Antrenörlere kapıda
      üye kabulü yetkisi verilip alınabiliyor, üyeler antrenör yapılabiliyor.
      Salon ayarlarından linklendi. Yönetici olanlarda yetki zaten açık
      olduğu için buton yerine açıklama gösteriliyor.
- [x] **RM-7** Kurallar + index + backfill + son-yönetici koruması.
- [x] **RM-8** Kural testleri: çoklu rol, devredilmiş check-in yetkisi,
      antrenörün kendine yetki verememesi, son yöneticinin rolünü
      düşürememesi.
- [x] **RM-9** `SCHEMA.md` güncellemesi.


---

## P1 — Güvenlik

> Tümü `backend/firestore.rules` içinde. Her değişiklik `firebase deploy
> --only firestore:rules --dry-run` ile doğrulanıp, kullanıcı onayıyla
> production'a gitmeli.

### [x] P1-1 · `classes` her kiracıya açık — çok kiracılı izolasyon kırık
```
match /classes/{classId} {
  allow read: if isSignedIn();
```
Herhangi bir hesabı olan **herkes**, tüm salonların ders programını, antrenör
isimlerini, tarihlerini ve **rezervasyon yapan üyelerin uid listesini**
(`bookedUserIds`, `waitlistUserIds`) okuyabiliyor. Çok kiracılı bir üründe bu
doğrudan veri sızıntısıdır.

Düzeltme: okuma `isTenantMember(resource.data.tenantId)` benzeri bir yardımcıya
bağlanmalı (kullanıcının o kiracıda aktif üyeliği var mı). İstemci sorguları
zaten `where('tenantId','==',...)` ile geldiği için sorgu uyumlu kalır.

### [x] P1-2 · İki ayrı `match /payments/{paymentId}` bloğu
Kuralların içinde biri legacy (marte06 `members` koleksiyonuna dayalı), biri
yeni GymEntra defteri olmak üzere **aynı yol için iki match bloğu** var.
Firestore bunları OR'lar — yani en gevşek olan kazanır. Bu, ileride bir bloğu
sıkılaştırıp diğerini unutmaya açık ciddi bir ayak kapanıdır.

Düzeltme: legacy blok kaldırılmalı veya iki ürün ayrı koleksiyonlara
(`payments` / `gym_payments`) taşınmalı.

### [x] P1-3 · `tenantId` doğrulanmadan veri enjeksiyonu
`workout_logs`, `measurements` ve `payments` create kurallarında `tenantId`
yalnızca `is string` olarak kontrol ediliyor; kullanıcının o kiracıya gerçekten
üye olduğu doğrulanmıyor.

Sonuç: kötü niyetli bir kullanıcı, üyesi olmadığı **herhangi bir salona**
sahte ölçüm, antrenman kaydı veya "ödeme bildirimi" yazabilir. Ödeme
bildirimleri o salonun yöneticisinin onay kuyruğunda görünür.

Düzeltme: `isTenantMember(tid)` yardımcısı ekleyip create kurallarına koşul olarak
bağlanmalı. Ayrıca `payments` için makul bir üst tutar sınırı konmalı.

### [x] P1-4 · `pt_sessions` yetki sınırları gevşek
- **create:** `isTenantStaff(tenantId)` yeterli; `trainerId == request.auth.uid`
  zorunlu değil. Bir antrenör başka bir antrenörün takvimine randevu yazabilir.
- **update:** atanmış antrenör (`resource.data.trainerId == auth.uid`) **tüm
  alanları** değiştirebiliyor — `tenantId`, `memberId`, `date` dahil. Kaydı
  başka bir kiracıya taşımak bile mümkün.

Düzeltme: create'te `trainerId` sahiplik kontrolü; update'te
`changedKeys().hasOnly([...])` ile alan kısıtı ve `tenantId`/`memberId`
değişmezliği.

### [x] P1-5 · `tenants` ve `packages` genel okumaya açık
`tenants` okuma `isSignedIn()` — salon kodu ile katılım için gerekli, ancak
tüm salonların `contactEmail`, `contactPhone`, `address` bilgilerini de açığa
çıkarıyor. İletişim alanları ayrı bir alt dokümana taşınıp yalnızca üyelere
açılmalı. `packages` (legacy) benzer şekilde tüm oturum açmış kullanıcılara
açık.

**Çözüldü.** İletişim alanlarının hiçbiri okunmuyordu **ve hiçbir salonda
veri yoktu** — yani tamamen ölü alanlardı. `contactEmail`/`contactPhone`
tipten ve `convert.ts`'ten kaldırıldı; böylece sızma yüzeyi tümüyle ortadan
kalktı.

Sonradan eklenmeleri gerekirse diye desen şimdiden kuruldu ve kural yazıldı:
`tenants/{id}/private/{docId}` → okuma `isTenantMember`, yazma
`isTenantAdmin`. Salon dokümanı bilerek herkese açık kalıyor (kodla katılım
buna muhtaç), bu yüzden hassas alan oraya **asla** yazılmamalı — kurala not
düşüldü.

`address` korundu: katılım akışında üyenin doğru salonu seçtiğini teyit
etmesini sağlıyor.

**`packages` bilinçli olarak değiştirilmedi.** O bir marte06 (web)
koleksiyonu; paket adları hassas değil ve daraltmak web uygulamasının
yeniden test edilmesini gerektirirdi. Gerekçe kurala yazıldı.

### [x] P1-6 · Küresel `isAdmin()` iddiası tüm kiracıları aşıyor
marte06'dan gelen `request.auth.token.admin == true` custom claim'i, GymEntra
tarafındaki **her kiracının** her verisine tam erişim veriyor. Tek ürün
olduğunda mantıklıydı; çok kiracılı beyaz etiket üründe bir platform
süper-kullanıcısıdır. Bilinçli bir karar olarak belgelenmeli ya da GymEntra
koleksiyonlarından kaldırılmalı.

**Çözüldü — küresel claim GymEntra koleksiyonlarından kaldırıldı.**
`isTenantAdmin`, `isTenantStaff`, `isTenantMember`, `canCheckIn` ve
`tenants` update kuralındaki `isAdmin()` bypass'ları silindi.
Legacy marte06 koleksiyonları (`members`, `lessons`, `packages`, `settings`,
`branches`, legacy `payments`) kendi `isAdmin()` kontrollerini koruyor.

Yetenek kaybı yok: gerçek destek işi Admin SDK ile Cloud Function içinde
yapılır, o zaten kuralları baypas ediyor ve sunucu tarafında iz bırakıyor —
her istemci oturumunu sessizce genişleten bir claim'in aksine.

**Deploy öncesi bulunan risk:** `tarkan.cicek@gmail.com` küresel claim'e
sahipti ama **hiçbir salonda üyeliği yoktu**; kural değişikliği onu GymEntra'dan
tamamen kilitleyecekti. Kullanıcı kararıyla claim korundu (marte06 için
gerekli) ve hesaba `tarabya-marte` salonunda gerçek `admin` üyeliği
oluşturuldu. Yeni açılacak hesaplara küresel claim verilmeyecek.

Regresyon testleri eklendi: küresel claim artık başka bir salonun ölçüm,
antrenman, program, ödeme ve üyelik verisini **okuyamıyor**, salon adını
değiştiremiyor, üye rolü atayamıyor, check-in yazamıyor — ama legacy marte06
erişimi duruyor.

### [x] P1-7 · `push_tokens` sahiplik doğrulaması zayıf
Doküman kimliği token'ın kendisi; create kuralı yalnızca `userId == auth.uid`
kontrol ediyor. Bir kullanıcı, sahip olmadığı bir token'ı kendi kimliğiyle
kaydedebilir. Ayrıca token'lar hiç temizlenmiyor (kullanıcı çıkış yapınca da
kalıyor) — zamanla ölü token birikir.

Düzeltme: çıkışta `unregisterPushToken()` çağrısı; Cloud Function'da Expo'nun
`DeviceNotRegistered` yanıtında token silme.

---

## P2 — Doğruluk ve dayanıklılık

**Çözüldü.**
- **Çıkışta iptal:** `signOutAndForget()` artık cihazın Expo token'ını
  `unregisterPushToken()` ile siliyor. Asıl önemi ortak cihazda: önceki
  kullanıcının kaydı kalırsa telefonu sonra alan kişi **onun bildirimlerini**
  alıyordu. `activeRole` tercihi de burada temizleniyor.
- **Ölü token temizliği:** `sendPushToUser()` Expo'nun yanıtındaki
  `DeviceNotRegistered` biletlerini eşleştirip ilgili dokümanları siliyor
  (uygulama silinmiş/token iptal edilmiş cihazlar).
- **Kural sıkılaştırması:** doküman kimliği `ExponentPushToken[...]`
  biçimine uymalı, `platform` `ios`/`android` olmalı ve yazan kişi o salonun
  aktif üyesi olmalı.

**Dürüst sınır:** kurallar opak bir token'ın gerçekten çağıranın cihazına ait
olduğunu kanıtlayamaz. Etkisi de veri sızıntısı değil, rahatsızlık: saldırgan
kendi bildirimlerini başkasının cihazına yönlendirebilir. Gerçek savunmalar
yukarıdaki iki madde; bu sınır kurala yorum olarak yazıldı.

### [x] P2-1 · 29 `onSnapshot` çağrısının hiçbirinde hata yakalayıcı yok
`src/data/firebase/*.ts` içinde 29 adet `onSnapshot(query, onNext)` var, **hiçbiri**
üçüncü parametre olan `onError` geri çağrısını vermiyor.

Sonuç: izin reddi veya ağ hatası olduğunda dinleyici sessizce ölür, ekran
sonsuza kadar boş/yükleniyor durumunda kalır. Daha önce antrenör üye
listesinde yaşadığımız `permission-denied` hatası tam olarak böyle
görünmüştü — kullanıcıya hiçbir şey söylenmedi.

**Çözüldü.**
- Yeni `src/data/firebase/watch.ts` → `watchQuery` / `watchDoc`
  sarmalayıcıları. Her düşen abonelik artık **konsola bağlam adıyla**
  yazılıyor (`[firestore] Üye listesi aboneliği düştü: permission-denied …`)
  ve isteğe bağlı bir `onError` geri çağrısına iletiliyor.
- 12 repo dosyasındaki **29 ham `onSnapshot` çağrısının tamamı** bu
  sarmalayıcıya taşındı; kodda `watch.ts` dışında ham `onSnapshot` kalmadı.
- Yeni `src/components/ErrorNotice.tsx` (mesaj + "Tekrar dene").
- Ekranlara bağlandı: `trainer/index`, `trainer/programs`, `trainer/calendar`,
  `admin/members`. Yeniden abone olma `retryKey` ile yapılıyor.

**Kalan:** diğer ekranlarda (üye tarafı) hata durumu henüz yüzeye
çıkarılmadı — repo katmanı hazır, sadece bağlanması gerekiyor.

### [x] P2-2 · Çevrimdışı çalışmıyor — tasarım varsayımıyla çelişiyor
`src/services/firebase.ts:24` → `initializeFirestore(app, {})`. Firebase **JS**
SDK'sı React Native'de diske kalıcı önbellek desteklemez (yalnızca bellek içi).
`member/card.tsx` yorumunda "resepsiyon wifi'si güvenilmezdir, çevrimdışı
çalışmalı" yazıyor ama gerçekte uygulama çevrimdışı açılınca üyelik verisi
gelmediği için **QR kart hiç render olmuyor**.

**Çözüldü (Seçenek A).**
- Yeni `src/services/membershipCache.ts` — üyelik + salon bilgisi
  `AsyncStorage`'a yazılıyor (uid bazlı anahtar, Date alanları için reviver).
- `AuthContext` artık **önce diskten** okuyup ekranı dolduruyor, sonra ağdan
  tazeliyor. Ağ başarısız olursa önbellekteki kartla devam ediliyor.
- `membershipFromCache` bayrağı eklendi; üye kartında **gerçek** bir
  "✈ çevrimdışı — kayıtlı kartın" göstergesi var (eskisi her zaman görünen
  sahte bir etiketti, kaldırılmıştı).
- Yarış koşulu koruması: `activeUidRef` ile hızlı hesap değişiminde eski
  yanıtın yeni kullanıcının durumunu ezmesi engellendi.
- Yeni `src/services/signOut.ts` → `signOutAndForget()`. Önbellek **çıkıştan
  önce** temizleniyor; sonrasında `auth.currentUser` null olacağı için kimin
  kaydının silineceği bilinemezdi ve ortak cihazda önceki üyenin kartı diskte
  kalırdı. Tüm çıkış noktaları buna bağlandı.

**Not:** Firestore verisinin geri kalanı hâlâ çevrimiçi gerektiriyor. Tam
çevrimdışı kalıcılık için native SDK'ya (Seçenek B) geçmek gerekir.

### [x] P2-3 · Kısa kod tahsisi izin hatasına düşebiliyor
`membershipRepo.ts:allocateShortCode()` — `requestJoin()` içinden, kullanıcı
**henüz o kiracının üyesi değilken** `tenant_memberships` üzerinde sorgu
çalıştırıyor. Sorgu boş dönerse Firestore izin verir; bir çakışma olursa
okunamayan bir doküman döneceği için sorgu `permission-denied` fırlatır ve
katılım isteği hata verir.

Düzeltme: kısa kodu istemcide üretmeyi bırak; üyelik onaylanırken bir Cloud
Function (Admin SDK, kuralları aşar) ata. Çakışma kontrolü orada güvenli.

**Çözüldü.** Kısa kod üretimi istemciden kaldırıldı; yeni Cloud Function
`assignMembershipShortCode` (`onDocumentCreated` → `tenant_memberships`)
Admin SDK ile çakışma kontrolü yapıp kodu atıyor. `requestJoin()` ve
`createTenantWithOwner()` artık `shortCode` yazmıyor, `allocateShortCode()`
tamamen silindi. Zaten kodu olan (göç edilmiş/eski) dokümanlara dokunulmuyor.
Beş çakışmada pes edip hata logluyor — 900 binlik uzayda bu şanssızlık değil,
veri bozukluğu işaretidir.

Canlıda doğrulandı: kodsuz bir üyelik oluşturuldu, tetikleyici kodu atadı,
test kaydı silindi.

### [x] P2-4 · Üyeye dokunmak sessizce taslak program yaratıyor
`src/app/trainer/index.tsx:70` — `openClient()` her dokunuşta
`findOrCreateDraftProgram()` çağırıyor. Yani antrenör listeye göz atarken bile
veritabanında boş taslak programlar oluşuyor ve Programlar sekmesini kirletiyor.

Düzeltme: üyeye dokununca bir **üye detay ekranı** açılmalı (mevcut program,
son ölçümler, antrenman geçmişi, yaklaşan randevular); program oluşturma
oradaki açık bir butonla yapılmalı.

**Çözüldü.** Yeni `src/app/trainer/member.tsx` — üyenin programı, antrenman
özeti (toplam/süre/son antrenman) ve ölçümleri tek ekranda. Üye listesindeki
dokunma artık buraya gidiyor ve **hiçbir şey yazmıyor**;
`findOrCreateDraftProgram` yalnızca ekrandaki açık "Program oluştur"
butonundan çağrılıyor. Ölü `openingFor` durumu kaldırıldı.
Yeni index gerekmedi — üç sorgu da mevcut indexleri kullanıyor.

### [x] P2-5 · Check-in mükerrer kaydı engellemiyor
`checkinRepo.ts` — aynı üye arka arkaya okutulursa iki ayrı `checkins` kaydı
oluşur ve günlük sayaç şişer. Aynı üye için son N dakika içinde kayıt varsa
"zaten giriş yapmış" yanıtı dönmeli.

**Çözüldü.** Her iki check-in yolu ortak `recordCheckIn()` üzerinden geçiyor;
son **60 dakika** içinde kaydı olan üye için yazma yapılmadan
`already-checked-in` dönüyor ("Bu üye az önce zaten giriş yaptı."). Pencere
kazara çift okutmayı ve kısa bir dışarı çıkışı yutacak, akşam tekrar gelişi
engellemeyecek şekilde seçildi.
Yeni index: `checkins` (tenantId, userId, checkedInAt) — deploy edildi.

### [x] P2-6 · Check-in yalnızca yöneticiye açık → **RM-2**'de çözüldü
`firestore.rules` → `checkins` create `isTenantAdmin()` istiyor. Gerçek bir
salonda resepsiyonu genelde yönetici değil personel/antrenör tutar. Antrenör
rolü de check-in yapabilmeli (`isTenantStaff`), ya da ayrı bir "resepsiyon"
rolü tanımlanmalı.

### [x] P2-7 · Üye kendi giriş geçmişini göremiyor
`CheckIn` tipi ve kuralları var, üye için okuma izni de var — ama hiçbir ekran
göstermiyor. Üyenin "bu ay kaç kez geldim" sorusu cevapsız. Gelişim ekranına
doğal olarak eklenir.

**Çözüldü.** `watchMyCheckins()` eklendi ve Gelişim ekranına "SALONA GELİŞ"
kartı kondu: bu hafta / bu ay / son 12 hafta + son geliş tarihi. Dinleyici 12
haftayla sınırlı. Kurallar zaten üyenin kendi kayıtlarını okumasına izin
veriyordu; eksik olan sadece arayüzdü.

### [x] P2-8 · Bekleme listesi otomatik ilerlemiyor
Kurallarda belgelenmiş bilinçli bir eksik: bir üye rezervasyonunu iptal
edince bekleme listesindeki ilk kişi otomatik yükseltilmiyor (tek-uid toggle
modeli iki farklı kullanıcının dizisini aynı yazımda değiştiremiyor).
Cloud Function ile çözülmeli — aksi halde yönetici elle takip etmek zorunda.

**Çözüldü.** Yeni Cloud Function `promoteFromClassWaitlist`
(`onDocumentUpdated` → `classes`). Bir yer boşaldığında bekleme
listesindeki ilk kişiyi rezervasyona alıp listeden çıkarıyor ve ona push
bildirimi gönderiyor.

Kurallarla yapılamamasının sebebi belgelenmişti: rezervasyon "tek uid
self-toggle" modeliyle korunuyor, terfi ise **başka bir kullanıcının** uid'ini
iki dizi arasında taşımayı gerektiriyor. Admin SDK bu yazımın güvenli olduğu
tek yer.

Kendi yazımını tekrar tetiklememesi için yalnızca `bookedUserIds` **küçüldüyse**
çalışıyor; ayrıca zaten rezervasyonu olan bir bekleme kaydını yinelemiyor.

### [x] P2-9 · Üye salondan ayrılamıyor
Üyelik iptali / salondan ayrılma akışı yok. Yalnızca yönetici `suspended`
yapabiliyor. Üyenin kendi üyeliğini sonlandırma hakkı olmalı (P0-2 hesap
silmeden ayrı bir ihtiyaç).

---

## P3 — Performans ve maliyet

**Çözüldü.** `MembershipStatus`'a `'left'` eklendi (`suspended` yönetici
işlemini ima ettiği için ayrı tutuldu) + `leftAt`. `leaveTenant()` repo
fonksiyonu ve `LeaveGymButton` (üye kartında, onaylı). Kural: kişi yalnızca
**kendi** üyeliğini, yalnızca `active` iken, yalnızca `status`+`leftAt`
alanlarını değiştirerek sonlandırabiliyor.
**Yöneticiler bu yoldan ayrılamıyor** — salonun sonuncusu olabilirler ve
kurallar kalan yönetici sayısını sayamaz; sahiplik devri ayrı bir akış.
Testler: 57/57 (6'sı yeni).

### [x] P3-1 · Hiçbir sorguda `limit()` yok — sınırsız okuma
Tüm dinleyiciler koleksiyonun tamamını çekiyor:

| Fonksiyon | Sorun |
|---|---|
| `watchClassesForTenant` | Tüm dersler, geçmiş dahil, tarih filtresi yok |
| `watchPaymentsForTenant` | Salonun tüm ödeme geçmişi |
| `watchSessionsForTenant` / `ForTrainer` | Tüm randevular, geçmiş dahil |
| `watchMeasurements` | Tüm ölçüm geçmişi |
| `watchWorkoutLogsForMember` | Tüm antrenman kayıtları |
| `watchProgramsForTenant` | Tüm programlar |
| `watchActiveMembers` | Tüm üyeler |

Bir yıl işleyen orta ölçekli bir salonda bu, her ekran açılışında binlerce
doküman okuması demek — hem gecikme hem doğrudan Firestore faturası.

**Çözüldü.**
| Sorgu | Yeni sınır |
|---|---|
| `watchClassesForTenant` | bugünden itibaren + `limit(100)` |
| `watchPaymentsForTenant` | `limit(200)` |
| `watchPaymentsForMember` | `limit(50)` |
| `watchMeasurements` | `limit(100)` |
| `watchWorkoutLogsForMember` | en yeni `limit(200)`, istemcide ters çevrilir |
| `watchSessionsForTrainer` / `ForTenant` | **tarih aralığı parametresi** (P3-2) |

Hiçbiri yeni composite index gerektirmedi — mevcut indexler yeterliydi,
simülatörde doğrulandı.

⚠️ `watchWorkoutLogsForMember` artık son 200 antrenmanla sınırlı; Gelişim
ekranındaki "toplam" bu pencereyi ifade ediyor. Daha fazlası gerekirse
`getCountFromServer` ile ayrı bir sayım gerekir.

### [x] P3-2 · Takvim ekranı gereksiz veri çekiyor
`trainer/calendar.tsx` tüm randevuları çekip istemcide seçili güne filtreliyor.

**Çözüldü.** `watchSessionsForTrainer` / `watchSessionsForTenant` artık
`{ from, to }` aralığı alıyor; takvim ekranı görüntülenen aya göre (önünde ve
arkasında birer hafta payla, ızgaranın taşan hücrelerinde de nokta görünsün
diye) abone oluyor. Ay değiştikçe abonelik yenileniyor.

### [~] P3-3 · Kullanılmayan bağımlılıklar native derlemeyi şişiriyor
Kaynak kodda hiç kullanılmayanlar:
`@shopify/flash-list`, `expo-glass-effect`, `expo-symbols`, `@expo/ui`,
`expo-web-browser`, `expo-linking`, `react-native-gesture-handler`,
`expo-system-ui`, `expo-status-bar`.

(`react-dom` / `react-native-web` yalnızca web hedefi içindir — web'i
desteklemeyeceksek onlar da gidebilir.)

Not: bazıları başka paketlerin geçişli bağımlılığı olabilir; kaldırmadan önce
`npx expo-doctor` ile doğrulanmalı.

**Kısmen çözüldü — ve bu listenin üçte biri yanlışmış.**
- `expo-linking` **kullanılıyor** (P0-4'te eklediğim `LegalLinks`).
- `react-native-gesture-handler` ve `expo-symbols` **expo-router'ın kendi
  bağımlılıkları** — package.json'dan çıkarılsalar da kurulu kalırlar, yani
  native derlemeyi hiç küçültmezler.
- `expo-glass-effect` ve `@expo/ui` de başka paketlerce çekiliyor.
- `expo-system-ui` bırakıldı: `app.json`'daki `userInterfaceStyle` ayarını o
  yönetiyor.

**Kaldırılanlar:** `expo-web-browser`, `expo-status-bar`,
`@shopify/flash-list`. `tsc` ve lint temiz.
⚠️ Native derleme etkisi ancak yeni bir EAS build ile doğrulanabilir.

### [x] P3-4 · Aynı veri birden çok ekranda ayrı ayrı dinleniyor
`watchActiveMembers` en az üç ekranda ayrı dinleyicilerle çağrılıyor
(`trainer/index`, `trainer/calendar`, `trainer/profile`). Paylaşılan bir veri
katmanı (React Query / Zustand / context) hem okuma sayısını hem de yeniden
render'ı azaltır.

---

## P4 — Ürün boşlukları

- [x] **P4-1 · Ders rezervasyonu üyeye görünür değil.** → MEMBER-3 ile
      çözüldü (1 Eylül 2026): `member/bookings.tsx`, grup dersi + PT tek
      listede.
- [x] **P4-2 · Antrenör üyenin ilerlemesini göremiyor.** **Madde bayatmış**
      (1 Eylül 2026 kontrolü): `trainer/member.tsx` ölçümleri ve antrenman
      geçmişini zaten gösteriyor, `trainer/index`'ten erişiliyor. Yeni iş
      yapılmadı; yalnızca oradaki elle kurulmuş istatistik kartı ADMIN-7
      sözleşmesine (`StatCard`) alındı.
- [x] **P4-3 · Bildirim tercihleri yok.** → Kuşak 3 madde 8 ile çözüldü
      (3 Eylül 2026): beş kategori, üç rolde ortak bileşen, `account`
      kapatılamıyor. *Özgün madde:* Push açık/kapalı ayarı, kategori
      bazlı tercih yok. GDPR/KVKK açısından da beklenir.
- [x] **P4-4 · Üye profil düzenleme yok.** → MEMBER-5a ile çözüldü
      (31 Ağustos 2026): ad, telefon, doğum tarihi. **Fotoğraf hâlâ yok** —
      Storage yükleme akışı gerektiriyor, ayrı iş.
- [x] **P4-5 · Yönetici raporlaması yok.** → Kuşak 2 madde 5 ile çözüldü
      (3 Eylül 2026): `/admin/reports`, altı kart. *Özgün madde:* Aylık gelir, katılım oranı, aktif
      üye trendi — salon sahibinin ilk soracağı şeyler.
- [x] **P4-6 · Çoklu salon üyeliği desteklenmiyor.** → P1-8 ile birlikte
      çözüldü (4 Eylül 2026, Kuşak 3 madde 13). *Özgün madde:* `getActiveMembership()`
      ilk aktif üyeliği alıp diğerlerini yok sayıyor. Kullanıcı iki salona
      üyeyse ikincisine hiç erişemez.
- [ ] **P4-7 · Dil desteği sabit Türkçe.** Tüm metinler koda gömülü. i18n
      altyapısı yoksa ihracat mümkün değil.

---

## ADMIN-REV · Salon yöneticisi yüzeyi denetimi — 29 Ağustos 2026

**İstek:** *"Bir salon yöneticisi olarak adım adım her fonksiyonu gözden
geçir, eksikleri tespit et."* Kullanıcı üç örnek verdi: salon adı
değiştirilemiyor, çalışma saatleri yok, yöneticiye push bildirimi gitmiyor.

**Yöntem:** 17 yönetici ekranının tamamı, `classRepo`/`paymentRepo`/
`tenantRepo` yazma yüzeyi, `firestore.rules`'un yönetici izinleri ve
`notifications.ts` tek tek okundu. Aşağıdakiler **kod okunarak doğrulandı**,
tahmin değil.

### Kritik bulgu — kuralların izin verdiği ama ekranın yapamadığı işler

Üç yerde güvenlik kuralı yöneticiye yetki veriyor, istemcide o yetkiyi
kullanan **hiçbir kod yok**. Yani backend hazır, sadece ekran eksik:

| İş | Kural | İstemci |
|---|---|---|
| Ders güncelleme | `allow update: isTenantAdmin` ✅ | `updateClass` **yok** |
| Ders silme | `allow delete: isTenantAdmin` ✅ | `deleteClass` **yok** |
| Salon iletişim bilgisi | `tenants/{id}/private/*` yazma ✅ | Hiç kullanılmıyor |

**Ders iptal/erteleme yokluğu operasyonel olarak en acil olanı.** Salon ders
saatini sürekli değiştirir, hoca hastalanır, ders iptal olur. Şu an yönetici
ders **ekleyebiliyor ama bir daha dokunamıyor** — yanlış saatle eklenen ders
sonsuza kadar takvimde kalıyor ve üyeler ona rezervasyon yapmaya devam ediyor.

**Çözüldü (29 Ağustos 2026):** `updateClass` ve `deleteClass` `classRepo`'ya
eklendi; ders listesine kaydırmalı **Düzenle / İptal et** bağlandı.

- İptal onayı kayıtlı kişi sayısını söylüyor.
- Düzenleme, ekleme formunu yeniden kullanıyor (iki formun zamanla
  ayrışmaması için). Formun sabit ön ayarları düzenleme için dardı: 07:15'lik
  bir dersi açıp kaydetmek onu sessizce 09:00'a taşırdı — gün/saat/süre
  listeleri artık düzenlenen dersin kendi değerini ön ayarlarda yoksa
  seçenek olarak ekliyor.
- Kayıtlı kişi varsa formda uyarı: saati değiştirmek onların programını da
  değiştiriyor.
- `updateClass` bilinçli olarak rezervasyon dizilerine dokunmuyor.

### [x] ADMIN-1 · Salon kimliği düzenlenemiyor ⚠️ **kullanıcı bildirdi**

`admin/settings.tsx` yalnızca **markalaşma** yapıyor: logo, ana renk, tema.
Salon adı ekranda `branding.appName`'den geliyor ama kod
`const [appName] = useState(...)` — **setter yok**, okunup aynen geri
yazılıyor. Yani ad hiçbir yerden değiştirilemiyor.

Eksik alanlar: **ad**, adres, iletişim (telefon/e-posta).

Ad değişikliği göründüğünden zor: `tenantName` üyelik dokümanlarına
denormalize kopyalanmış (54 kayıt) ve `member_packages`, `pt_sessions` gibi
yerlerde de kopya var. Değişince hepsinin güncellenmesi gerekir — tek
dokümanlık bir düzenleme değil, bir Cloud Function işi.

İletişim bilgisi için şema zaten hazır (`tenants/{id}/private/contact`,
SCHEMA.md'de yazılı, kuralı var) ama **istemcide tek satır kod yok**.

**Çözüldü (31 Ağustos 2026):** ayarlar ekranına "Salon bilgileri" bölümü —
ad, adres, telefon, e-posta. Ad hem `tenants.name`'e hem
`branding.appName`'e yazılıyor; ikisi ayrı kalırsa başlık değişip üyenin
katıldığı salon adı eskisi olarak kalırdı.

Denormalize kopyalar `syncTenantNameToMemberships` ile yayılıyor
(`onDocumentWritten`, yalnızca ad gerçekten değiştiyse — marka düzenlemeleri
bu dokümanı çok daha sık yazıyor ve her biri tüm listeyi yeniden yazardı).
450'lik batch: 500 sınırında büyük bir salonun kuyruğu sessizce düşerdi.

Telefon/e-posta `private/contact`'a gidiyor, salon dokümanına değil — o
doküman her oturum açmış kullanıcıya okunabilir. İletişim **okuması**
başarısız olursa kaydetme o iki alana dokunmuyor: boş alanları yazmak hiç
gösteremediğimiz bilgiyi silerdi.

Yol üzerinde düzeltildi: `save()` `catch`siz `try/finally` idi — yönetici
Kaydet'e basıyor, spinner duruyor, hatanın olduğunu hiçbir şey söylemiyordu
(AGENTS §2).

**Kalan:** `tenants.code` (katılım kodu) hâlâ değiştirilemiyor. Kurallar
bilinçli olarak değişmez tutuyor; kod değişimi ayrı bir karar.

### [x] ADMIN-2 · Salon çalışma saatleri diye bir kavram yok

Şemada da yok, ekranda da. Bunun etkisi UX-4'te not edilmişti: antrenör
çalışma saati tanımlarken 06:00–22:00 arası her saati seçebiliyor, salonun
kapalı olduğu saate randevu açabiliyor. Salon saati olmadan UX-4'ün
"salon saatleri içinde kalsın" kısmı **uygulanamaz** — bu madde onun önkoşulu.

`tenants` altına `openingHours` (haftalık gün→pencere haritası, tatil
istisnalarıyla) gerekiyor.

**Çözüldü (31 Ağustos 2026):** `tenants.openingHours`, `Date.getDay()`
numaralarıyla anahtarlı. `null` "o gün kapalı", alanın hiç olmaması "salon
saatlerini hiç girmemiş" — her mevcut salon alandan eski olduğu için bu
ikisinin ayrı okunması şart, yoksa tüm salonlar bir gecede kapalı olurdu.

Yönetici tarafı kendi ekranında (`admin/hours.tsx`): tek seferde tek gün
açılıyor. Yedi satır × iki stepper tek ekranda on dört kontrol demekti;
salon bir günü düzenleyip çıkıyor. "Bu saatleri tüm açık günlere uygula"
var — çoğu salon aynı pencereyi altı yedi gün işletiyor, kapalı günler
kapalı kalıyor.

**Kısıt (UX-4):** antrenör müsaitliği bu pencereye kelepçeli. Salonun kapalı
olduğu gün hiç açılamıyor; açık günde stepper salon penceresinin dışına
çıkmıyor. Kayıtlı bir değer zaten dışarıda kalmışsa (salon saatleri sonradan
değişmişse) sınır yalnızca o tarafta genişliyor — antrenör elindekini
koruyup içeri yürüyebiliyor, ekran hiç dokunmadığı saatleri sessizce
yeniden yazmıyor. Uyarı satırı da taşmayı söylüyor.

Bu ekranda iki tane 17'lik çip duvarı vardı (başlangıç ve bitiş, gün başına)
— ders formunun çip duvarıyla aynı hata, aynı şekilde kaldırıldı.
`TimeStepper` opsiyonel `min`/`max` aldı: sınırsızken sarıyor, sınırlıyken
kırpıyor. Sarma sınırlı bir aralıkta karşı uca sıçratırdı.

Üye tarafı: `GymInfoCard` (üye profili) — haftalık saatler bugün vurgulu,
adres, telefon ve e-posta (dokunulunca arama/e-posta açılıyor). Bu olmadan
ADMIN-1'in iletişim alanları yazılabilir ama okunamazdı; kimse kaydedileni
göremiyordu.

**Yapılmadı:** tatil/istisna günleri. Haftalık pencere kurulduktan sonra
ayrı bir veri şekli ve ayrı bir ekran gerektiriyor — bilinçli olarak sonraki
tura bırakıldı, sessizce atlanmadı.

**Ders saatleri de kelepçelendi (31 Ağustos, kullanıcı onayıyla):** aynı
pencere `admin/classes.tsx`'e de uygulandı. Farkı: ders bir *tarih* seçiyor,
gün değil — pencere seçilen günün `getDay()`'inden geliyor ve gün
değiştikçe kelepçe de değişiyor. Ders kapanışa kadar **bitmek** zorunda,
sadece kapanıştan önce başlamak yetmiyor; tavan bu yüzden süreyle birlikte
kayıyor. Salonun kapalı olduğu gün ders hiç eklenemiyor — düğme kapalı ve
`submit` de ayrıca kontrol ediyor, düğme tek giriş yolu değil.

### [x] ADMIN-3 · Yöneticiye bildirim gitmiyor ⚠️ **kullanıcı bildirdi**

Beş bildirimin **dördü üyeye**, yalnızca biri yöneticiye gidiyor
(`notifyAdminsOnMemberLeft`, 27 Ağustos'ta eklendi).

Salon sahibini ilgilendiren ve **hiç bildirim üretmeyen** olaylar:

| Olay | Neden önemli |
|---|---|
| **Yeni katılım isteği** | Sahibin en zaman-kritik olayı. Şu an ancak uygulamayı açınca görüyor; üye kapıda bekliyor olabilir. **En öncelikli.** |
| Üye ödeme bildirimi gönderdi | ✅ `notifyAdminsOnPaymentNotice` |
| Üye paket teklifini yanıtladı | ✅ `notifyAdminsOnPackageChangeResponse` |
| Üye PT randevusunu iptal etti | ✅ `notifyTrainerOnSessionCancelled` |
| Paket/kredi bitmek üzere | ✅ `notifyExpiringPackages` |

Altyapı hazır: `sendPushToUser()` var, `notifyAdminsOnMemberLeft` aktif
yöneticilere fan-out desenini zaten kuruyor — kopyalanacak.

**Kısmen çözüldü (29 Ağustos 2026):** `notifyAdminsOnJoinRequest` eklendi ve
canlıya alındı — listedeki en öncelikli madde. `onDocumentWritten`
kullanıldı, `onDocumentCreated` değil: P0-6'dan sonra yeniden katılma bir
UPDATE olduğu için create-only bir tetikleyici geri dönen her üyeyi
kaçırırdı. Fan-out `notifyTenantAdmins` yardımcısına çıkarıldı,
`notifyAdminsOnMemberLeft` de onu kullanıyor.

**Kalan:** ödeme bildirimi, paket teklifi yanıtı, PT iptali, paket bitişi.

### [x] ADMIN-4 · Yanlış girilen veri düzeltilemiyor

- **Ödeme:** `recordPayment` var, düzenleme/silme yok. Kural da
  `delete: if false`. Yanlış tutar girildiyse defterde kalıcı.
- **Paket ataması:** üyeye yanlış paket atandıysa geri alma yolu yok.
- **Ders:** yukarıdaki tabloda.

Muhasebe defterinde silme olmaması doğru (iz bırakmalı), ama **düzeltme
kaydı** (ters kayıt / iptal işareti) olmadan yönetici sıkışıyor.

**Karar (29 Ağustos 2026, kullanıcı):** bir ödeme kaydı değiştirildiğinde
**hem yönetici hem üye haberdar olmalı**, ve bildirime basıldığında **ilgili
ödemeye gidip değişikliği görebilmeli**.

Bu, bugünkü `notifyOnPaymentStatusChange`'den farklı: o yalnızca
`pending → confirmed/rejected` geçişini yakalıyor ve yalnızca üyeye gidiyor.
Gereken, **tutar/yöntem/not gibi alanların düzeltilmesini** de yakalayan ve
iki tarafa da giden bir bildirim.

Uygulama notu — derin bağlantı altyapısı zaten var: `sendPushToUser`'ın
`data` parametresi `{ screen: 'member/payments' }` şeklinde kullanılıyor
(bkz. `notifyOnPaymentStatusChange`). Ödeme kimliğini de taşıyıp ekranın o
kayda kaydırması/vurgulaması gerekecek — şu an bildirim yalnızca ekranı
açıyor, belirli bir kayda götürmüyor. Bu eksik **tüm bildirimler için**
geçerli, ayrıca not edildi.

**Çözüldü — ödeme kısmı (1 Eylül 2026).**

**Ters kayıt deseni seçildi.** Orijinal satır hiç düzenlenmiyor: tutarı,
yöntemi ve tarihi yöneticinin ilk inandığı şey ve üzerine yazmak bir
düzeltme yapıldığını tamamen gizler. Yerine aynı tutarda `kind: 'reversal'`
bir satır yazılıyor, orijinal `reversedAt` ile işaretleniyor ve ekranda
üstü çizili duruyor. İkisi tek `writeBatch` içinde — işaretsiz bir ters
kayıt aynı satırın iki kez iptalini mümkün kılar, ters kayıtsız bir işaret
ise iptal edilmiş görünen ama ciroya sayılmaya devam eden bir ödeme bırakır.

⚠️ **Yol üzerinde bulunan hata:** `PaymentKind` (`'charge' | 'refund'`)
tipte vardı ama **hiçbir yere yazılmıyordu** ve gelir hesabı onu hiç
okumuyordu (`sum + p.amount`). Yani bir iade kaydedilse ciro **artardı**.
Ters kayıtlar bilinçli yazılmaya başlayınca bu gizli hata sahibin ana
ekranındaki yanlış rakama dönüşecekti. İşaret artık tek bir yerde:
`utils/revenue.ts` → `sumPayments`.

Kurallar: ters kayıt neyi iptal ettiğini **söylemek zorunda** (yoksa defterde
karşılığı olmayan negatif bir satır kalır) ve yalnızca yönetici yazabilir
(üyenin kendi borcunu iptal etmesi olurdu). İşaretleme kuralı yalnızca üç
alana izin veriyor ve `reversedAt` zaten varsa reddediyor — her iptal
ciroyu bir kez daha düşürürdü. 7 test, **171/171 geçiyor**.

**Bildirim:** `notifyOnPaymentReversed` hem üyeye hem diğer yöneticilere
gidiyor, gerekçeyle birlikte. Düzeltmeyi yapan yönetici hariç tutuluyor —
insana yaptığı şeyi haber veren bildirim, okunmadan kapatılmayı öğreten
bildirimdir. `notifyTenantAdmins` bunun için `exceptUserId` aldı.

⚠️ **Planın varsayımı yanlıştı:** "bildirime basınca ekran açılıyor ama
kayda gitmiyor" yazıyordu. Gerçekte **hiçbir dokunma dinleyicisi yoktu** —
bildirime basmak uygulamayı açıyor, başka hiçbir şey yapmıyordu.
`PushNotificationSync` artık `addNotificationResponseReceivedListener` ve
soğuk açılış için `getLastNotificationResponseAsync` kuruyor,
`data.screen`'e yönlendiriyor ve `paymentId`'yi `highlight` parametresi
olarak taşıyor. Hedef ekran o satırı çerçeveliyor. **Bu tüm bildirimler
için altyapı** — derin bağlantı maddesi böylece kapandı.

**Çözüldü — paket kısmı (1 Eylül 2026).** `cancelPackageAssignment`
callable'ı. Kural değil callable, `bookPtSessions` ile aynı sebepten: bir
kotayı geri almak, aynı krediye koşan bir rezervasyonla hakemlik gerektiriyor
ve kurallar bunu yapamaz. `member_packages` istemciye **kapalı kalıyor** —
testler bunu doğruluyor (yönetici bile doğrudan iptal edemiyor).

Atama silinmiyor, `cancelled` işaretleniyor: üyenin geçmişi bunun olduğunu
ve geri alındığını göstermeli — ödemeyi düzenlemek yerine ters kaydetmekle
aynı gerekçe. `syncMemberEntitlements` erişim aynasını durum değişiminden
kendi başına yeniden hesaplıyor.

**Yaklaşan randevu varsa reddediyor.** Bir yöneticinin hatasını toplamak
için birinin randevularını sessizce iptal etmek, yöneticiye onları önce
bilerek iptal ettirmekten daha kötü bir sonuç; hata mesajı kaç randevunun
engellediğini söylüyor. `creditId in [...]` sorgusu 30'luk parçalara
bölünüyor — ileride bir değişiklik kontrolü sessizce kırpıp rezervasyonları
geçirmesin diye. Yeni index: `pt_sessions` `creditId + date`.

Harcanmış krediler `used` sayısını koruyor: üye o dersleri gerçekten aldı ve
sıfırlamak antrenörün geçmiş seanslarını açıklamasız bırakırdı. Kredi durumu
`revoked` — `expired` değil, çünkü kotanın süresi dolmadı, geldiği atama
geri alındı; "derslerim nereye gitti" sorusuna doğru cevap veriyor.

4 test, **175/175 geçiyor.**

### ADMIN-6 · Ödeme eklerken üye seçimi kullanılamaz halde ⚠️ **kullanıcı bildirdi**

`admin/payments.tsx` → "+ Ödeme ekle" → üye seçimi **51 üyenin tamamını
sarmalanmış çip olarak** basıyor (`members.map` → `<Chip>`, satır 169).

- Arama yok, gruplama yok, kaydırma kabı yok.
- Tutar alanı bu çip duvarının **altına** itiliyor; yönetici asıl işi yapmak
  için önce 51 çip geçmek zorunda.
- Salon büyüdükçe **kötüleşiyor** — 200 üyede ekran tamamen kullanılamaz.

**Bu, UX-2'nin tekrarı.** O da aynı sebeple çıkmıştı: 7 test üyesiyle
tasarlanan ekran, göçten sonra 51 üyede kırıldı. Aynı sınıf hata, farklı
ekran — yani tekil bir hata değil, **desen**.

`admin/staff.tsx` de aynı şeyi yapıyor (51 üyeyi kart olarak basıyor, satır
198). `ScrollView` içinde olduğu için çip duvarı kadar kötü değil, ama rol
atanacak kişiyi bulmak yine elle kaydırmayı gerektiriyor.

**Önerilen çözüm — asıl sorun akışın yönü.** Ödeme "bir üyeye" yapılır;
doğru başlangıç noktası kişidir, ödeme ekranı değil:

1. **`admin/member.tsx`'e "+ Ödeme ekle" ekle.** Yönetici zaten o kişiye
   bakıyorken ödeme girmesi en kısa yol — seçim adımı tamamen ortadan
   kalkıyor. (Ekranda bugün yalnızca "+ Paket ata" var.)
2. **Ödemeler ekranındaki seçim ise aramaya dönmeli:** bir `TextField` +
   eşleşen ilk birkaç sonuç. Hiç yazılmadan liste basılmamalı.
3. Aynı arama deseni `staff.tsx`'e de uygulanmalı.

**Genel kural olarak plana giriyor:** üye listesi basan her yeni ekran
arama/limit ile başlamalı; 51 üyelik salon artık test verisi değil, gerçek
ölçek.

---

### [x] ADMIN-7 · Kart tasarımlarının bütünsel gözden geçirilmesi

**İstek (29 Ağustos 2026, simülatör testi):** *"Üyede paketim kartı görünüyor
ama çok anlamlı değil. Kart büyüklüğüne göre yazıların yerleşimi ve büyüklüğü
dengesiz ve oransız gibi. Tekrar bir tasarımı gözü ile tüm kartları gözden
geçir."*

`MyPackageCard`'ın kendi sorunu düzeltildi (tam genişlik ortalanmış sütun
yerine satır içi haplar — tek kredi türünde kartın ortasında yalnız dev bir
rakam kalıyordu). Ama istenen **bütünsel** bir tasarım turu; o yapılmadı.

Gözden geçirilecekler — üye Bugün ekranında yan yana duran kartlar birbiriyle
tutarsız:
- "PAKETİM" — başlık + iki satır + haplar
- "YAKLAŞAN RANDEVU" — ikon + iki satır + sağda metin bağlantı
- "DURUMUM" — büyük halka + üç satır metin
- "Ödemelerim" / "Randevu al" — ikon + iki satır + chevron

Dört farklı iç düzen, dört farklı görsel ağırlık. Tipografi ölçeği (h3 /
helper / label) ve ikon-metin hizası kart başına değişiyor. Bir kart
envanteri çıkarılıp ortak bir düzen sözleşmesi tanımlanmalı.

Not: `designplan.md` bu iş için mevcut referans.

**Çözüldü (29 Ağustos 2026):** `components/InfoCard.tsx` — öndeki görsel +
başlık/alt başlık + isteğe bağlı sağ eylem. Yaygın durum için `icon`
(38pt daire tek yerde tanımlı; üç kartın 38, birinin 34 olmasının sebebi
her çağrı yerinde elle yazılmasıydı), gerçekten farklı olanlar için `lead`.

Dönüştürülenler: paket teklifi, randevu al, ödemelerim, durumum, paket kartı.
Alt başlık aciliyeti taşıyabiliyor (`subtitleTone`) — bekleyen ödeme
bildirimi ve bitmek üzere olan paket uyarı renginde.

**Tamamlandı (31 Ağustos 2026):** kalan yüzeyler de sözleşmeye alındı.

Envanter çıkarılınca **ikinci bir kart ailesi** göründü: küçük başlık +
eşit bölünmüş ortalanmış rakamlar + 1px ayraçlar. Bu düzen altı yerde elle
kopyalanmıştı → `components/StatCard.tsx`. Eksik değer sıfır değil, kısa
çizgi olarak çiziliyor — "veri yok" ile "sıfır" farklı cevaplardır.

Dönüştürülenler: antrenör profili (RANDEVULARIM, ÜYE VE PROGRAMLAR),
`member/progress.tsx` (SALONA GELİŞ, ANTRENMAN ÖZETİ — rakamların altındaki
tek satırlık dipnot için `footnote`), yönetici panelindeki katılım isteği
kartı (`InfoCard` + yeni `initials` prop'u; baş harf dairesi de artık tek
yerde çiziliyor).

**Bilinçli dönüştürülmedi:** `admin/index.tsx`'teki üçlü sayaç şeridi
(aktif üye / bekleyen istek / bu ay gelir). Görsel olarak `StatCard`'a
benziyor ama üçü ayrı dokunma hedefi ve iki farklı ekrana gidiyor; tek
karta birleştirmek üç hedefi bire indirirdi. Farklı bir aile (dokunulabilir
kutucuk), aynı düzen değil.

---

### ADMIN-5 · Panel yüzeysel

`admin/index.tsx`: bugün giren sayısı, aktif üye, bekleyen istek, bu ay
gelir. Gelir gerçek veriden (`confirmed` ödemelerin toplamı) — uydurma değil.

Eksik: yaklaşan paket bitişleri, bu hafta doluluk, ödeme yapmayanlar. Bunlar
P4-5 (raporlama) ile örtüşüyor.

### Önerilen sıra

1. **ADMIN-3'ün "yeni katılım isteği" bildirimi** — en küçük iş, en yüksek
   etki. Mevcut fan-out deseni kopyalanacak.
2. **Ders güncelleme/silme** — kural hazır, sadece repo + ekran. Operasyonel
   olarak en acil eksik.
3. **ADMIN-1 salon adı + iletişim** — ad için denormalize kopyaları
   güncelleyen Cloud Function gerekiyor, iletişim için şema zaten hazır.
4. ~~ADMIN-2 çalışma saatleri~~ — tamamlandı (31 Ağustos).
5. **ADMIN-6 ödeme/üye seçimi** — kullanıcı bildirdi, ölçekle kötüleşiyor.
   Üye detayına "+ Ödeme ekle" eklemek en kısa yol.
6. **ADMIN-4 düzeltme yolları** — ters kayıt deseni kararı gerektiriyor.
7. ADMIN-5 → P4-5 ile birlikte.

---

## MEMBER-REV · Salon üyesi yüzeyi denetimi — 29 Ağustos 2026

**Yöntem:** 11 üye ekranı (`member/`), üyenin kendi verisine erişimi ve
düzenleyebildikleri okundu. ADMIN-REV ile aynı disiplin — aşağıdakiler kod
okunarak doğrulandı.

### [x] MEMBER-1 · Üye satın aldığı paketi HİÇ göremiyor ⚠️ en ciddi eksik

`watchMemberCredits` istemcide **tek yerde** kullanılıyor: `book-session.tsx`,
randevu almadan önce PT kredisi var mı diye bakmak için. Üyenin
*"paketim ne, ne zaman bitiyor, kaç dersim kaldı"* sorusunu cevaplayan
**hiçbir ekran yok**.

Üye şunları göremiyor:
- Aktif paketinin adı ve bitiş tarihi
- Kalan grup dersi / PT ders hakkı
- Paket geçmişi

Bu PKG-12'de planlanmıştı (*"Üye: Bugün ekranı ve Hesabım'da aktif paket —
'Gold · 24 gün kaldı', '12 Ders · 5 kaldı'"*) ama yapılmamış. Salon para
alıyor, üye ne aldığını uygulamada göremiyor — ürün açısından en zayıf nokta.

**Çözüldü (29 Ağustos 2026):** `components/MyPackageCard.tsx`, Bugün
ekranında "yaklaşan randevu"nun üstünde. Repo tarafı zaten hazırdı
(`watchMemberPackages`, `watchMemberCredits`) — eksik olan yalnızca ekrandı.
Kalan süre gün olarak (sorulan soru "yenilemem gerekiyor mu"), son bir hafta
uyarı renginde. Sınırsız grup dersi ∞ ile. Paketi olmayan üye boş kart yerine
açıklayıcı bir cümle görüyor.

### MEMBER-2 · Üye kendi bilgilerinin hiçbirini düzenleyemiyor

`member/profile.tsx`'te düzenleme yok: yalnızca salon kodu kartı, rol
değiştirici, çıkış, salondan ayrıl, yasal bağlantılar, hesap silme.
Ad, telefon, doğum tarihi, fotoğraf — hiçbiri.

Kayıt ekranı *"Doğum günü, fotoğraf vs. SONRA sorulur"* diye söz veriyor
(`onboarding/register.tsx` alt metni) ama **o "sonra" hiç gelmiyor**.

29 Ağustos'ta yöneticiye bu düzenleme yeteneği verildi (`admin/edit-member`);
üyenin kendisinde hâlâ yok. Bu P4-4 ile aynı madde, artık asimetrisiyle
birlikte kayıtlı.

### [x] MEMBER-3 · "Rezervasyonlarım" görünümü yok

Bugün ekranı yalnızca **bir sonraki** PT randevusunu gösteriyor; Dersler
ekranı seçilen **günü** gösteriyor. Üyenin tüm yaklaşan rezervasyonlarını
(grup dersi + PT) tek yerde gördüğü bir ekran yok. P4-1'in doğrulanmış hali.

**Çözüldü (1 Eylül 2026):** `member/bookings.tsx`. Grup dersi ve PT randevusu
**karıştırılıp saate göre sıralanıyor**, ayrı bölümlere konmuyor: üyenin
sorusu "sırada ne var", listeyi veri modelimize göre bölmek birleştirmeyi
ona yaptırmak olur.

`watchMyUpcomingClasses` — `bookedUserIds` üzerinde `array-contains`. Ayrı
bir rezervasyon koleksiyonu değil, çünkü uid listeleri zaten ders
dokümanında (tek-uid toggle kuralını ifade edilebilir kılan şey o) ve
paralel bir koleksiyon eşlenmesi gereken ikinci bir doğruluk kaynağı olurdu.
Yeni index: `classes` `tenantId + bookedUserIds + date`.

Bugün ekranındaki "YAKLAŞAN RANDEVU" başlığına "Tümü ›" eklendi — o kart
yalnızca **bir sonrakini** gösteriyor ve giriş noktası olmadan perşembe dersi
ile cuma randevusu olan üye ikisini birlikte hiçbir yerde göremiyordu.

### [x] MEMBER-4 · Giriş (check-in) geçmişi yüzeysel

`watchMyCheckins` yalnızca bu haftanın sayısını besliyor (Bugün ekranındaki
"haftada 0/4"). Üye *"en son ne zaman geldim, bu ay kaç kez"* göremiyor.

**Madde bayatmış (1 Eylül 2026 kontrolü):** `member/progress.tsx` bunu zaten
gösteriyor — "SALONA GELİŞ" kartında bu hafta / bu ay / son 12 hafta ve
altında "Son gelişin: …". ADMIN-7 turunda `StatCard`'a dönüştürülen kart bu.
Yeni iş yapılmadı; madde kapatıldı.

---

## MEMBER-5 · Reşit olmayan üye ve ebeveyn bağlama — 29 Ağustos 2026

**İstek (kullanıcı):** *"Salon üyesinin yaş bilgisini de bilmemiz lazım ki
eğer 18 yaşından küçük ise aynı üyeyi bir ebeveyne bağlama opsiyonu doğsun,
ebeveyn'in de bilgilerini alalım."*

**Bu salon zaten böyle çalışıyordu.** Silinen legacy `members` koleksiyonunda
`parentName` ve `parentPhone` alanları vardı (arşivde duruyor,
`archive/marte06-legacy/members.json`). Yani ihtiyaç yeni değil — göçte
düşmüş.

**Bugünkü durum:** `tenant_memberships.birthDate` alanı var ama:
- Üye kendisi giremiyor (MEMBER-2)
- Yalnızca marte06'dan taşınan üyelerde dolu — yeni kaydolanda boş
- Yaşla ilgili hiçbir mantık yok

**Gerekenler:**
1. **Doğum tarihi kayıt akışında sorulmalı** (veya ilk girişte). Şu an hiç
   sorulmuyor, yani yaş bilgisi yeni üyelerde hiç oluşmuyor.
2. **18 yaş altı tespiti** — doğum tarihinden türetilir, ayrı alan tutulmaz
   (yaş her gün değişir, `isMinor` alanı bayatlar).
3. **Ebeveyn bilgisi**: ad, telefon, (e-posta?), yakınlık derecesi.
4. **Ebeveyni bir GymEntra hesabına bağlama opsiyonu** — ebeveyn de salonun
   üyesiyse çocuğunun randevu/ödeme durumunu görebilmeli.

### Kararlar (kullanıcı, 29 Ağustos 2026)

1. **Ebeveyn gerçek üye olarak kaydedilir** — serbest metin değil, gerçek
   `tenant_memberships` kaydı. Ödemeleri sonuçta ebeveyn yapacak.
2. **Ebeveynin geçerli paketi olması şartı YOK** — kendisi spora gelmiyor
   olabilir.
3. **Ebeveyn, çocuklarından herhangi biri aktif üyelik paketine sahipse
   karekod okutup salona girebilir.**
4. **Ebeveyn çocuk adına tüm işlemlere yetkilidir.**
5. **Ebeveyn birden çok çocuğu için ödemeyi ayrı ayrı yapabilmeli.**
6. **18 yaş altı, ebeveyn ataması yapılmadan kaydı bitiremez** ve ebeveyn
   onayı olmadan kayıt olamaz.

### Bu kararların mimari sonuçları

**(a) Bağlantı nerede durur.** Çocuğun üyelik dokümanına `guardianId`
(ebeveynin uid'si). Doküman kimliği zaten `{tenantId}_{uid}`, yani çocuk
başına tek ebeveyn doğal olarak tekil. Ebeveynin çocuklarını listelemesi
`where('guardianId','==',uid)` sorgusu — **yeni composite index gerekir**.

**(b) Ebeveynin karekodla girişi kuralla çözülemez.** Karar 3 "çocuklarından
*herhangi biri*" diyor; bu bir **sorgu**, kurallar sorgu çalıştıramaz.
Projenin bu soruna verdiği yerleşik cevap zaten var: `member_entitlements`
aynası (PKG-4). `syncMemberEntitlements` bugün `member_packages` yazımında
tetiklenip `{tenantId}_{memberId}` önbelleğini yazıyor.

Genişletme: bir çocuğun paketi değiştiğinde **ebeveynin önbelleği de**
yeniden hesaplanmalı ("çocuklarından en geç biten aktif paket"). Böylece
check-in kuralı ebeveyn için de tek doküman okumasıyla karar verir —
"sayan her şey callable'da / aynada" ilkesi korunur.

⚠️ Dikkat: ebeveynin girişi çocuğun **kredisini tüketmemeli**. Check-in
`accessReason` alanını taşıyor (PKG-3); ebeveyn girişi için ayrı bir sebep
değeri gerekir ki defterde ayırt edilebilsin ve hak düşmesin.

**(c) "Çocuk adına tüm işlemler" kuralları belirgin genişletir.** Kurallara
`isGuardianOf(childUid)` yardımcısı gerekir (çocuğun üyelik dokümanını
`get()` edip `guardianId == request.auth.uid` kontrolü — kurallar bunu
yapabilir). Etkilenen yerler: `pt_sessions` (alma/iptal), `classes`
(rezervasyon/iptal), `payments` (bildirim), `member_packages` ve
`member_credits` (okuma), `checkins` (okuma), `measurements`.

Ayrıca **callable'lar da güncellenmeli** — `bookPtSessions` ve
`cancelPtSession` bugün `request.auth.uid`'i üye olarak kabul ediyor;
ebeveyn çağırdığında çocuğun adına çalışmaları gerekecek.

**(d) Ödeme kimin defterine yazılıyor.** Karar 5 gereği ödeme **çocuğun**
kaydı olmalı (`memberId` = çocuk) ama **ebeveyn tarafından** gönderildiği
görünmeli. Yeni alan: `submittedBy` (veya `paidBy`). Aksi halde ebeveynin
üç çocuğu için yaptığı üç ödeme tek kişinin defterinde toplanır ve hangi
çocuğa ait olduğu kaybolur.

**Toplu ödeme (karar 7, 29 Ağustos 2026).** Ebeveyn ödeme yaparken **birden
çok çocuk seçebilmeli**; girilen tutar seçilen çocuklara **eşit bölünerek**
ayrı ayrı kaydedilir. Yani tek bir 900₺ girişi, üç çocuk seçiliyse üç ayrı
300₺ `payments` kaydı olur — defter çocuk bazında doğru kalır.

Çözülmesi gereken iki ayrıntı:
- **Yuvarlama.** 1000₺ / 3 çocuk tam bölünmüyor. Kuruş kaybı ya da fazlası
  olmamalı: kalan **son çocuğa** eklenmeli (ya da kuruş bazında dağıtılmalı).
  Toplamın girilen tutara **birebir** eşit olması şart, yoksa defter tutmaz.
- **Atomiklik.** N kayıt ya hep birlikte yazılmalı ya hiç — yarısı yazılıp
  hata alınırsa ebeveyn ne ödediğini bilemez. `writeBatch` yeterli.

Ayrıca bu ödemelerin **bir arada yapıldığı** görünmeli (ebeveyn tek işlem
yaptı, defterde üç satır var). Ortak bir `paymentGroupId` bunu çözer —
yönetici "bu üç kayıt tek ödemeydi" diyebilmeli.

**(e) Kayıt akışı iki taraflı onay gerektirir.** Karar 6 "ebeveyn
onaylamadan kayıt olamaz" diyor. Yani çocuk kaydı **ebeveynin onayını
bekleyen** bir ara durumda kalmalı — mevcut `pending` (salon onayı) durumundan
**farklı** bir şey: iki ayrı onay var (ebeveyn + salon yöneticisi). Durum
modeli buna göre genişletilmeli.

Ebeveyn henüz üye değilse önce onun kaydolması gerekir; akış bunu
karşılamalı (çocuk "ebeveynimin e-postası şu" der, ebeveyne davet gider).

**(f) KVKK.** Çocuğun verisini işlemek için ebeveyn onayı yasal
zorunluluk — karar 6 zaten bunu karşılıyor, ama onayın **kayıt altına
alınması** gerekir (ne zaman, hangi ebeveyn, hangi sürüm metin).

### Bağımlılıklar ve sıra

- **MEMBER-2 önkoşul**: doğum tarihi bugün kayıt akışında hiç sorulmuyor,
  yani 18 yaş altı tespiti için gereken veri hiç oluşmuyor.
- ADMIN-1'deki denormalize kopya sorununun aynısı burada da var: ebeveyn adı
  çocuğun ekranında gösterilecekse kopya tutulmalı ve kaynak değişince
  güncellenmeli.
- Bu madde tek başına bir "blok" büyüklüğünde — PKG serisi gibi alt maddelere
  bölünmeli. Uygulamaya başlamadan önce ayrı bir plan turu hak ediyor.

### Alt maddeler (plan turu, 31 Ağustos 2026)

Sıra bağımlılıkla belirlendi; her madde kendinden öncekinin verisine
dayanıyor.

**[x] MEMBER-5a · Doğum tarihi ve üyenin kendi bilgilerini düzenlemesi**
(= MEMBER-2). Her şeyin önkoşulu: yaş verisi bugün yeni üyelerde hiç
oluşmuyor, 18 yaş altı tespiti yapılacak bir şey yok. Üye profiline
düzenleme ekranı (ad, telefon, doğum tarihi) + kural: üye kendi dokümanında
bu üç alanı yazabilsin. `isMinor` alanı **tutulmaz** — yaş her gün değişir,
doğum tarihinden türetilir.

**Çözüldü (31 Ağustos 2026):** `member/edit-profile.tsx` + kural (üye kendi
dokümanında `userDisplayName`, `phone`, `birthDate` yazabilir — yöneticininki
gibi ayrı bir kural, çünkü onay kuralı her yazımda `status` doğruluyor).
`pending` durumunda da açık: kayıt ekranının "sonra sorulur" dediği bilgiyi
dolduran kişi tam olarak onay bekleyen kişi.

Tarih yardımcıları `utils/birthDate.ts`'e çıkarıldı — artık iki ekran aynı
alanı yazıyor, ayrı ayrışan iki parser tek alana iki farklı şey yazardı.
`parseBirthDate` ay/gün taşmasını da yakalıyor (`new Date(1990, 12, 32)`
hata vermeden Ocak 1991'e kayıyordu). `ageFrom` türetilmiş — `age`/`isMinor`
alanı yazıldığı gün doğru, ertesi gün yanlış olur ve beslediği tek karar
(bu üye reşit mi) bayatlamaması gereken karardır.

Profilde eksik doğum tarihi uyarı renginde çağrılıyor: kayıt ekranı sormaya
söz verip sormadığı için üyelerin çoğunda yok ve eksik olduğundan
şüphelenmeleri için bir sebep yok.

Yol üzerinde: `admin/edit-member.tsx` hata metni ham `'#F87171'` kullanıyordu
— bu koyu temanın `danger` token'ı, yani açık temada yanlış renkti
(AGENTS §3). Token'a çevrildi.

**[x] MEMBER-5b · Ebeveyn bağlantısı ve iki taraflı onay.** Çocuğun
dokümanında `guardianId` + `guardianStatus` (`pending` / `approved`).
Ebeveyn zaten üye değilse davet akışı. Mevcut `status: 'pending'` salon
onayı; ebeveyn onayı **ayrı** bir eksen — ikisini tek alana sıkıştırmak
"hangi onay eksik" sorusunu cevapsız bırakır. KVKK gereği onay kayıt altına
alınır (ne zaman, hangi ebeveyn, hangi metin sürümü). `where('guardianId',
'==', uid)` için **yeni composite index**.

**[x] MEMBER-5c · Ebeveyn yetkisi — kurallar ve callable'lar.**
`isGuardianOf(childUid)` yardımcısı (çocuğun dokümanını `get()` edip
`guardianId` kontrolü — kurallar bunu yapabilir, sorgu değil). Etkilenen:
`pt_sessions`, `classes`, `payments`, `member_packages`, `member_credits`,
`checkins`, `measurements`. `bookPtSessions` ve `cancelPtSession` bugün
`request.auth.uid`'i üye sanıyor; ebeveyn çağırdığında çocuk adına
çalışmalı.

**Çözüldü (31 Ağustos 2026).** `isGuardianOf(tid, childUid)` — üyelik
kimliği `{tenantId}_{uid}` olduğu için sorgu değil `get()`, kuralda
ifade edilebilmesinin tek sebebi bu. **Yalnızca `approved` yetki taşıyor:**
`pending` bağ ebeveyne çocuğun üyelik satırını okutuyor (göremediği bir
isteği değerlendiremez) ama başka hiçbir şey vermiyor.

Okuma açıldı: `member_credits`, `member_packages`, `pt_sessions`,
`checkins`, `payments`, `measurements`.

**Ders rezervasyonu tek-uid modelini kırıyordu.** Mevcut `isSelfArrayAdd`
yalnızca `request.auth.uid`'i ekletiyor; ebeveyn *çocuğun* uid'sini ekliyor.
`isGuardianArrayAdd`/`Remove` eklendi — eklenen uid diff'ten okunuyor
(`&&` kısa devre yaptığı için `[0]` ancak boyut kontrolleri tek eleman
olduğunu kanıtladıktan sonra çalışıyor). `canBookGroupClass` uid parametresi
aldı: kontrol edilen hak **çocuğunki**, ebeveynin değil — karar 2 ebeveynin
paketi olmasını aramıyor.

Ödeme bildirimi: ebeveyn açabiliyor ama kayıt **çocuğun** defterinde
(`memberId` = çocuk) ve `submittedBy` ebeveyni yazıyor. Bu olmadan bir
ebeveynin üç çocuğu için üç ödemesi tek kişinin geçmişinde toplanırdı.

Callable'lar: `bookPtSessions` opsiyonel `memberId` alıyor (yokken çağıran
kendisi — mevcut her çağrı aynen çalışıyor); `cancelPtSession` ebeveyni de
yetkili sayıyor.

⚠️ **Yol üzerinde bulunan hata:** iptal iadesi mantığında
`shouldRefund = isTrainer || isAdmin`, sonra `if (isMember && ...)`.
Ebeveyn hiçbir dala düşmüyordu, yani iptal ediyor ama **hiç iade
alamıyordu** — çocuk kendi iptal etseydi alacaktı. `isGuardian` eklendi.

12 test. **157/157 geçiyor.**

Ekranlar: `member/child.tsx` — ebeveynin çocuğun paketini, kalan ders
hakkını ve yaklaşan randevularını gördüğü, randevu iptal edebildiği ekran.

**Kalan UI da tamamlandı (1 Eylül 2026).** Yeni ekran yazılmadı — mevcut
randevu alma akışı opsiyonel `memberId`/`memberName` parametresi alıyor ve
parametre varsa **tamamen çocuk üzerinden** çalışıyor: sayılan kredi
çocuğunki, gösterilen isim çocuğunki, callable çocuk adına çağrılıyor.
Ekranda "X adına randevu alıyorsun" satırı var — kredinin düştüğü ekranda
kimin adına işlem yapıldığını söylemeyen tek başka ipucu yok.

Giriş: çocuk detayında "Bu çocuk için randevu al" → antrenör listesi
(parametreleri taşıyor) → randevu ekranı. İkinci bir akış kopyalamak yerine
mevcut olanı parametreleştirmek, ikisinin ileride ayrışmasını da engelliyor.

**[x] MEMBER-5d · Ebeveynin karekodla girişi.** Karar 3 bir *sorgu* ("çocuklarından
herhangi biri") — kural sorgu çalıştıramaz, yani aynaya gider.
`syncMemberEntitlements` genişletilir: çocuğun paketi değişince ebeveynin
önbelleği de yeniden hesaplanır. Girişin çocuğun kredisini **tüketmemesi**
şart; `accessReason` için ayrı bir değer.

**Çözüldü (31 Ağustos 2026) — ama planın mimari notu yanlıştı.**

Not, giriş kararının `member_entitlements` aynasından verildiğini
varsayıyordu. **Vermiyor.** Giriş erişimi `checkinRepo.resolveAccess`
içinde, tarayan personelin cihazında, doğrudan `member_packages` /
`member_credits` okunarak çözülüyor; ayna yalnızca **ders rezervasyonunu**
kapılayan kuralın okuduğu şey. Dolayısıyla aynayı genişletmek gereksizdi —
üstelik yanlış olurdu: aynayı ebeveyn için doldurmak ona *kendi adına ders
rezervasyonu* hakkı verirdi, oysa karar 2 ebeveynin spor yapmadığını
söylüyor.

Yapılan: `resolveAccess`'e altıncı bir adım. Ebeveynin onaylı çocuklarından
herhangi biri aktif üyelik paketi taşıyorsa giriş `ok`. **En sona** kondu —
kendi paketi olan kendi paketiyle giriyor, buraya yalnızca hiçbir şeyi
olmayan ebeveyn düşüyor. Sorguyu tarayan personel cihazı çalıştırıyor;
üyenin kendisi roster'ı listeleyemez ama tarayan o değil.

**Hiçbir şey tüketilmiyor.** Çocuğun kredisi ve randevusu ellenmiyor —
ebeveyn çocuğun ödeme yapan bir üye *olduğu gerçeği* üzerine giriyor,
çocuğun harcayabileceği bir şey üzerine değil.

`accessReason: 'guardian'` ayrı bir değer; `'ok'` değil çünkü bu girişler
meşru ama kişinin kendi paketi değil, `warn` da değil çünkü personel bir
uyarıyı geçmiyor. `CheckInWarnReason` bu yüzden `Exclude<..., 'ok'>`
olmaktan çıkıp açık listeye döndü.

3 test. **160/160 geçiyor.**

**[x] MEMBER-5e · Ebeveyn ödemesi ve toplu ödeme.** `payments.submittedBy`
(ödeme çocuğun defterine, ebeveyn tarafından gönderildiği görünür) ve
`paymentGroupId`. Eşit bölme: kalan **kuruş** son çocuğa, toplam girilen
tutara birebir eşit olmalı. `writeBatch` — N kaydın yarısı yazılırsa
ebeveyn ne ödediğini bilemez.

**Çözüldü (31 Ağustos 2026).** `utils/splitAmount.ts` **tam sayı kuruş**
üzerinden bölüyor, lira üzerinden değil: 1000 / 3 kayan noktada
333.33333333333331 ve üç tanesi 1000'e geri toplanmıyor. Bu fonksiyonun
varlık sebebi tam olarak toplanması. Kalan **son paya** ekleniyor — kuruşu
etrafa dağıtmak yerine, çünkü kural salon sahibinin gözle
doğrulayabileceği tek cümle olmalı: herkes eşit öder, sonuncu tek kuruşu
karşılar. Yedi vakada toplam girilen tutara birebir eşit çıktı
(1000/3, 100/7, 0.03/2, 1234.56/5 dahil).

`writeBatch`: yarısı yazılmış bir bölme, ebeveynin 900₺ ödeyip defterde
600₺ görmesi ve hangi çocuğun eksik olduğunu bilememesi demek.
`paymentGroupId` istemcide üretiliyor — sunucunun atadığı bir kimlik, ancak
içinde bulunması gereken yazımdan *sonra* var olurdu.

Bölünmüş tutarlar **gönderilmeden önce** ekranda gösteriliyor: "eşit
bölünecek" birinin parası hakkında verilmiş bir söz, tek kuruş sonradan
sürpriz olmamalı.

Yönetici tarafında bildirim satırı artık "… · Ahmet Yılmaz ödedi" ve grup
kaydıysa tek ödemenin parçası olduğunu söylüyor. Bu olmadan yönetici,
ödemeye hiç gelmemiş bir üyeden 300₺ bildirimi görüyordu.

Kural değişikliği **gerekmedi** — 5c'deki guardian ödeme dalı toplu yazımı
zaten karşılıyor. 4 test eklendi; en önemlisi: batch'teki tek bir izinsiz
kayıt tüm batch'i düşürüyor. **164/164 geçiyor.**

### MEMBER-5 bloğu tamamlandı (5a–5e)

Kalan UI: ebeveynin çocuk adına **yeni randevu alması** ekranı (5c'de not
edildi). Sunucu desteği hazır.

---

## Bildirimlerde ortak eksik — derin bağlantı

`sendPushToUser`'ın `data` parametresi bugün yalnızca `{ screen: '...' }`
taşıyor, yani bildirime basınca **ekran açılıyor ama ilgili kayda
gidilmiyor**. Üye 12 ödemesi varken "ödemen onaylandı" bildirimine bastığında
hangisi olduğunu kendisi aramak zorunda.

Bütün bildirimler için geçerli; ADMIN-4'ün ödeme düzeltme bildirimi de buna
bağlı. Kayıt kimliğini `data`'ya koyup hedef ekranın o kaydı vurgulaması
gerekiyor.

---

## P5 — Kod sağlığı

- [ ] **P5-1 · Test kapsamı** — ⚠️ *İlk denetimde "hiç test yok" yazmıştım,
      bu **yanlıştı**.* `backend/tests/firestore.rules.test.ts` (355 satır) ve
      `npm run test:rules` script'i zaten mevcut: vitest +
      `@firebase/rules-unit-testing` + Firestore emülatörü.
      Kapsadıkları: legacy marte06 koleksiyonları, `tenants`,
      `tenant_memberships`, `classes` (yazma), `checkins`.
      **Kapsamayanlar (bu turda eklendi):** `programs`, `workout_logs`,
      `measurements`, GymEntra `payments`, `pt_sessions`, `calendar_shares`,
      `push_tokens` ve çapraz kiracı izolasyonu.
      **İkinci düzeltme (2 Eylül 2026):** "mobil tarafta hiç test yok" da
      yanlıştı — `vitest` kurulu ve 8 test dosyası zaten vardı. Bu turda
      ayrıca: `splitAmount`, `birthDate` (parse/format/yaş), `revenue`
      (işaretli toplam) ve `openingHours` için testler eklendi.
      **13 dosya / 94 test.**

      Bu turda bulunan iki şey:
      - Mevcut bir test **düşüyordu**: MEMBER-5d'nin eklediği ebeveyn
        sorgusu, `getDocs` stub'ının `{}` döndürmesi yüzünden patlıyordu.
        Üretim hatası değil, mock boşluğuydu; stub gerçek boş bir
        `QuerySnapshot`'a çevrildi.
      - Stepper'ların saat/tarih aritmetiği bileşen dosyalarında duruyordu ve
        **test edilemiyordu** — bir bileşen `react-native` import ediyor,
        test koşucusu onu ayrıştıramıyor. `utils/time.ts`'e taşındı; zaten
        AGENTS §3'e göre sunum bileşeninde iş mantığı olmamalıydı.

- [x] **P5-7 · `firebase deploy --only functions` eski kodu yüklüyordu.**
      `firebase.json`'da `predeploy` hook'u yoktu; `npm run build` hiç
      çalışmadığı için deploy her seferinde `functions/lib/` içindeki **eski
      derlenmiş JS'i** gönderiyordu. Yeni `deleteMyAccount` fonksiyonu ilk
      deploy'da bu yüzden hiç oluşmadı.
      **Çözüldü.** `firebase.json` → `functions.predeploy` eklendi
      (`npm --prefix "$RESOURCE_DIR" run build`), yeniden deploy edildi ve
      `deleteMyAccount` oluştuğu doğrulandı.
- [x] **P5-2 · Hata izleme yok.** Sentry/Crashlytics entegre değil; sahadaki
      çökme ve hatalardan haberimiz olmuyor.
      **Çözüldü (plan-eng-review Faz 2.2, 24 Ağustos 2026).** Sentry değil
      **GlitchTip** — aynı Sentry event protokolünü konuşan, gerçekten
      ücretsiz (1.000 olay/ay, sınırsız kullanıcı/proje), açık kaynaklı bir
      servis. `@sentry/react-native` (mobil) ve `@sentry/node` (functions)
      SDK'ları değiştirilmeden, DSN'i GlitchTip'e yönlendirerek kullanıldı.
      Beklenen iş kuralı hataları (HttpsError'ın bilerek fırlattığı
      failed-precondition/invalid-argument/vb.) her iki tarafta da filtrelenip
      raporlanmıyor — yalnızca gerçekten beklenmeyen hatalar GlitchTip'in
      ücretsiz olay bütçesini harcıyor. Mobil: `EXPO_PUBLIC_SENTRY_DSN` EAS
      ortam değişkeni olarak eklendi (production/preview/development) —
      **standalone build'ler bu değişikliği görmek için yeni bir EAS build
      gerektiriyor**, Metro reload yetmez.
- [x] **P5-3 · `react-hooks/exhaustive-deps` uyarıları temizlendi (12 → 0).**
      Risk teorik değildi: `workout_logs` index hatası tam da bu gürültünün
      içinde kaybolmuştu (bkz. DEV-1).

      Bastırmak yerine kod dürüstleştirildi — `const uid = user?.uid` bir kez
      bağlanıp effect'ler ve bağımlılık dizileri onu kullanıyor; gerçekten
      değişen değer zaten oydu. `user`'ın guard ile daraltıldığı yerlerde
      (`save`, `submit`, `toggleShare`) `user.uid` korundu.
      `workout/session.tsx`'te bağımlılık `log` yerine `log.startedAt`
      milisaniyesine indirildi — tüm log'a bağlamak, üye her seti
      işaretlediğinde kronometreyi sıfırlardı.

      Artık `npx expo lint` **sıfır hata, sıfır uyarı**.
- [x] **P5-4 · ~~`GymClass` tipi ölü~~ — ⚠️ bu iddia YANLIŞTI.**
      Tip ölü değil: `ClassSession` ham Firestore dokümanı,
      `GymClass` ise `toGymClass()`'ın ürettiği **UI view-model'i**
      (saat metni, rozet tonu, rezervasyon durumu). `member/index.tsx`,
      `member/classes.tsx` ve `data/classDisplay.ts` aktif kullanıyor;
      silmek uygulamayı bozardı. İkisi çakışmıyor, katman ayrımı bilinçli.

      *Not: ilk denetimde doğrulanmadan yazılmış üçüncü yanlış iddia
      (bkz. P5-1 "hiç test yok", P3-3 bağımlılık listesi). Plandaki
      iddialar uygulanmadan önce koda bakılarak doğrulanmalı.*
- [x] **P5-5 · CI kuruldu.**

      `apps/gymentra-mobile/.github/workflows/ci.yml` — `npm ci` + `tsc --noEmit`
      + `expo lint --max-warnings 0`. **Uyarılar hata sayılıyor**; keyfi bir
      katılık değil: kırık bir Firestore sorgusu günlerce 12 exhaustive-deps
      uyarısının içinde gizli kaldı (DEV-1).
      → İlk çalıştırma **yeşil** doğrulandı (run 32298840421). `.env`
      olmadan da geçiyor.

      `backend/.github/workflows/ci.yml` — iki iş: güvenlik kuralı testleri
      (gerçek emülatöre karşı, JDK 21 ile) ve functions derlemesi. İkincisi
      ayrı çünkü deploy `functions/lib`'i yüklüyor; derleme sessizce
      düşerse deploy eski çıktıyı gönderir (P5-7).
      → İkisi de CI'ın çalıştıracağı komutlarla **yerel olarak doğrulandı**
      (70/70 test, build OK). GitHub'da henüz koşmadı — depo push edilmedi.

      **Güncelleme (8 Eylül 2026):** bu iki dosya hiçbir zaman koşmadı —
      GitHub yalnızca depo kökündeki `.github/workflows`'u okur. İkisi de
      silindi, yerlerine kökte tek `.github/workflows/ci.yml` geldi (dört iş:
      mobile, rules, functions, rig). Ayrıntı: **D-1**.
- [~] **P5-6 · Firestore indexleri elle yönetiliyor.** Yeni sorgu eklendiğinde
      index unutulursa hata sahada çıkıyor (bu denetimde de yaşandı — DEV-1).

      Kısmen hafifledi: `watch.ts` sarmalayıcısı artık her düşen aboneliği
      bağlam adıyla logluyor, DEV-1 tam da böyle yakalandı. Ama bu tespit,
      önleme değil. Gerçek çözüm, kural testlerine benzer şekilde emülatöre
      karşı çalışan sorgu testleri olurdu — emülatör eksik index'i aynı
      `failed-precondition` ile bildirir.

---

## Mağaza hazırlığı

**Çözüldü.** `src/data/firebase/sharedWatch.ts` — referans sayan paylaşım
katmanı. İlk abone gerçek dinleyiciyi açıyor, sonrakiler ona bağlanıyor ve
son değeri anında alıyor (boş ekran flaşı olmuyor). Son abone ayrıldıktan
sonra **5 sn** bekleniyor, böylece iki sekme arasında gidip gelmek dinleyiciyi
sürekli kurup yıkmıyor.

Paylaşılanlar: `watchActiveMembers`, `watchActiveTrainers`,
`watchProgramsForTenant`, `watchActiveProgramsForTenant`. Antrenörde Üyeler +
Takvim + Profil sekmeleri aynı anda mount olduğu için üye listesi tek başına
3 kat okunuyordu.

**Ekranlarda hiçbir değişiklik gerekmedi** — `watch*` imzaları aynı kaldı.
Çıkışta `resetSharedWatches()` çağrılıyor; ortak cihazda sonraki hesap
öncekinin önbelleğe alınmış satırlarını görmüyor.

### iOS — App Store

- [x] Bundle identifier: `com.gymentra.mobile`
- [x] App Store Connect kaydı açık (app id `6802950274`)
- [x] Uygulama adı, ikon, splash
- [x] Sign in with Apple (Google girişi sunulduğu için zorunlu) — aktif
- [x] `ITSAppUsesNonExemptEncryption: false`
- [x] Kamera / fotoğraf izin açıklamaları (Türkçe, `app.json` plugin'lerinde)
- [x] App Privacy anketi dolduruldu ve **yayınlandı** — 13 veri türü; Crash
      Data dışında hepsi kimliğe bağlı, hiçbirinde tracking yok
      (gerekçeler: `apps/gymentra-mobile/APP_PRIVACY.md`)
- [x] Gizlilik politikası URL'i
- [x] Açıklama, anahtar kelimeler, destek/pazarlama URL'i
- [x] **Ekran görüntüleri** — 6.1" ve 6.5" setleri yüklü (Supergym-88)
- [x] **Hesap silme akışı** (P0-2) — uygulama içi `DeleteAccountButton` üç rol
      ekranında da var, `deleteMyAccount` callable canlıda, web sayfası yayında
- [x] Uygulama içi gizlilik/şartlar bağlantısı (P0-4) — `LegalLinks`, üç rol
      ekranında
- [x] Yaş sınırı (age rating) anketi — 25 alan, 4+ sonucu
- [x] Demo hesap bilgileri — `uye01@supergym88.test`, onaylı üye; İngilizce
      inceleme notu ve iletişim bilgileri yazıldı
- [ ] TestFlight ile gerçek cihaz doğrulaması
- ⏳ **Sürüm 1.0 `WAITING_FOR_REVIEW`** — 5 Eylül'de gönderildi, 8 Eylül
      itibarıyla hâlâ sırada (build 22 VALID). Apple'daki iki abonelik
      ürününün `MISSING_METADATA` durumu `asc.mjs` ile okunamıyor —
      script'te abonelik komutu yok, konsoldan bakılmalı.
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) — Expo SDK 57 çoğunu üretir,
      üçüncü parti SDK'lar için doğrulanmalı

### Android — Google Play

- [x] Package: `com.gymentra.mobile`
- [x] Adaptive icon (foreground/background/monochrome)
- [x] Google Sign-In yapılandırıldı (SHA-1 + SHA-256 Firebase'e eklendi)
- [x] FCM V1 servis hesabı EAS'a yüklendi (push bildirimleri için)
- [x] Preview APK ile gerçek cihaz doğrulaması
- [x] **`RECORD_AUDIO` izni kaldırıldı** (P0-3) — `app.json`'da doğrulandı,
      izin listesinde yalnızca `CAMERA` var
- [x] **Play Console geliştirici hesabı** — Salt Tech Solutions, **kurumsal**
      hesap (Hesap Kimliği `6543189686852267211`). Kurumsal olduğu için
      bireysel hesaplara uygulanan **20 test kullanıcısı / 14 gün kapalı
      test** şartı geçerli değil: Android'in önünde takvim engeli yok.
- [x] **Data Safety formu** — dolduruldu (1 Eylül 2026)
- [x] İçerik derecelendirme anketi — tamamlandı
- [x] Ekran görüntüleri — kullanıcı hazırladı (1 Eylül 2026)
- [x] 1024×500 öne çıkan grafik — **yüklü** *(8 Eylül 2026, `play.mjs images`:
      icon 1, featureGraphic 1, phoneScreenshots 6; 7"/10" tablet setleri boş,
      Play onları zorunlu tutmuyor)*
- [x] Mağaza girişi metinleri — **yayında** *(8 Eylül 2026, `play.mjs listing`:
      başlık 8/30, kısa açıklama 75/80, uzun açıklama 1619/4000, tr-TR)*
- [x] **`eas.json` `submit.production.android`** eklendi
      (`./secrets/play-service-account.json`, `track: internal`).
      **Dosyanın kendisi henüz yok** — Play Console → Ayarlar → API erişimi
      üzerinden bir servis hesabı oluşturulup JSON anahtarı indirilmeli ve o
      yola konmalı. O gelene kadar `eas submit --platform android` çalışmaz.
- [x] `.gitignore`'a `secrets/` eklendi. `*.p8` App Store anahtarını zaten
      yakalıyordu ama Play anahtarı `.json` ve onu yakalayan bir kural yoktu;
      dizinin tamamını yok saymak, bir sonraki kimlik bilgisini uzantısı ne
      olursa olsun kimse kural hatırlamak zorunda kalmadan kapsıyor.
- [x] AAB (App Bundle) — düzeltme: `production` profili Android'de zaten
      varsayılan olarak AAB üretiyor. APK üreten yalnızca `preview` profili
      ve o zaten dahili test için. Eski not yanlıştı.
- [x] Hesap silme — `gymentra.salt-tech-apps.com/delete-account/` yayında,
      Play Console'daki alan dolduruldu. Sayfa `deleteMyAccount`'un gerçekte
      yaptığına göre yazıldı (o sırada bulunan hata için bkz. aşağısı).
      ⚠️ *Bu kutu 1 Eylül'de işaretlendi ama sayfa 8 Eylül 2026'ya kadar
      **gerçekte yayında değildi** — dosya depoya girmişti, Cloudflare'e hiç
      dağıtılmamıştı ve adres ana sayfayı döndürüyordu. 8 Eylül'de deploy edilip
      doğrulandı. Ders: "commit edildi" ile "yayında" ayrı şeyler; bu sitede
      **her yol 200 döndüğü için** adresi açıp göz kararı doğrulamak da yetmiyor,
      sayfanın başlığına bakmak gerekiyor.*
- [x] `internal` track'e ilk yükleme — versionCode 2 AAB, `eas submit` ile
      API üzerinden gitti. (Play'in "ilk sürümü elle yükle" davranışını
      bekliyordum, gerçekleşmedi.)
- [ ] Gerçek cihazda doğrulama: **Google ile giriş**, **push bildirimi** ve
      **QR okutma**. Üçü de Android'de production imzasıyla hiç denenmedi;
      önceki denemeler `preview` APK'sıylaydı ve imzası farklı.
- [x] Tüm beyanlar tamamlandı (1 Eylül 2026). Mağaza girişi de yüklü
      (yukarı bkz.) — **kalan tek iş üretim sürümü.** *(8 Eylül 2026,
      `play.mjs status`: internal 1.0.0 sürüm kodu **6**, production/beta/alpha
      boş.)*

**Android'de bugün ne çalışıyor:** paket adı, adaptive icon, Google Sign-In
(SHA-1/SHA-256 Firebase'de), FCM V1 servis hesabı EAS'ta, preview APK ile
gerçek cihaz doğrulaması. Yani **build alınabilir durumda** — eksik olan
mağaza tarafı, kod tarafı değil.

**Apple Sign-In Android'de:** sorun yok. `isAppleSignInAvailable()`
`Platform.OS === 'ios'` döndürüyor ve `register.tsx` düğmeyi buna göre
gizliyor — Android'de "Apple ile devam et" hiç çizilmiyor. (Apple'ın
"başka platformda da sunulmalı" şartı yalnızca uygulamanın **kendisi** o
platformda üçüncü parti giriş sunuyorsa devreye girer; Google girişi
Android'de zaten yerel akışla çalışıyor.)

### Her iki mağaza

- [x] Sürüm numaralandırma stratejisi — *(8 Eylül 2026 doğrulandı:* `eas.json`'da
      `appVersionSource: remote`, `production` profilinde `autoIncrement`;
      karşılığı sahada Play internal sürüm kodu 6 ve iOS build 22.)
- [x] Çökme izleme (P5-2) — `@sentry/react-native` eklentisi `app.json`'da,
      DSN GlitchTip'e yönlendirilmiş. **Canlı olay akışı doğrulanmadı**;
      ilk üretim build'inde bilerek bir hata fırlatılıp GlitchTip'te
      görüldüğü teyit edilmeli.
- [x] Destek e-postası / iletişim kanalı — *(8 Eylül 2026, `play.mjs details`:*
      `gymentrasupport@salt-tech-apps.com`, +90 850 885 43 38,
      `gymentra.salt-tech-apps.com`.) **Kalan:** uygulama içinde yardım/iletişim
      yolu yok — üye yalnızca mağaza sayfasından ulaşabiliyor.

---

## PKG — Üyelik paketleri, haklar ve randevulu ders kullanımı (20 Ağustos 2026)

### Ürün tanımı

**İki satış birimi, aynı anda tutulabilir.**

| Birim | Örnek | Ne verir |
|---|---|---|
| **Süreli üyelik** (`membership`) | 1 / 3 / 6 ay, 1 / 2 yıl | Seviyesine göre haklar |
| **Ders paketi** (`lessons`) | 8, 12, 20 ders | Antrenörle önceden randevulanmış özel ders |

**Üç seviye — ama seviye bir tip değil, hazır şablon:**

| Seviye | Salon | Grup dersi | Özel ders |
|---|---|---|---|
| Silver | ✓ | — | — |
| Gold | ✓ | sınırsız | — |
| Platinium | ✓ | sınırsız | 3 ayda bir 12 ders |

**Erişim kuralları:**
- Süreli üyelik özel ders hakkı vermez (Platinium'un periyodik hediyesi hariç).
  6 aylık Gold üyesi ayrıca 8 ders satın alabilir.
- Yalnızca ders paketi olan üye salona **sadece randevulu günlerde** girer;
  o gün **gün boyu** kalır ve Silver gibi kendi başına çalışır.
- Dondurulmuş paket, dondurma süresince hiçbir hak vermez.

---

### Tasarımı yöneten dört karar

Bu fazın tamamı dört karardan türüyor. Maddeler bunların uygulanışı.

**1. Hak (entitlement) esas, seviye değil.**
Admin paket içeriğini değiştirebilecekse "Silver/Gold/Platinium" koda gömülü
tip olamaz. Paketin taşıdığı hak kümesi esastır; seviye adları yalnızca yeni
salon açılırken yazılan tohum veridir. **Kodda `if (tier === 'gold')` gibi bir
dal hiçbir yerde olmayacak** — yoksa admin'in içeriği değiştirmesi anlamsızlaşır.

**2. Satılan şey donar, katalog akar.**
Atama anında haklar, fiyat ve politikalar `member_packages`'a **kopyalanır**;
ayrıca aktif ataması olan katalog kaydı **kilitlenir**. İkisi birlikte gerekir:
kopya satılmış hakkı korur, kilit katalog geçmişini okunur tutar.

**3. Tek kota defteri.**
Özel ders kredisi, Platinium'un periyodik hediyesi ve (açılırsa) kotalı grup
dersi **aynı defterde** yaşar. Tek tüketim mekanizması, tek callable, tek iade
yolu — iki ayrı sayaç mekanizması yazmaktansa.

**4. Sayan her şey callable'da.**
Firestore kuralları **sayamaz**. Kalan kredi, dondurma kotası, promosyon
kullanımı, aktif atama sayısı — hepsi transaction içinde Cloud Function
tarafından yürütülür. Kural yalnızca "bu hak var mı" sorusunu yanıtlar.
(Aynı kısıt `tenants.activeMemberCount` için de geçerliydi.)

---

### Mevcut durumdaki boşluklar

Bu iş "paket koleksiyonu ekle"den ibaret değil; dört kavram uygulamada **hiç yok**:

1. **Paket ve hak kavramı yok.** `tenant_memberships` yalnızca aktif/pasif biliyor.
2. **Grup dersi hakkı denetlenmiyor.** `classes` rezervasyonu bugün herkese açık.
3. **Antrenör müsaitliği yok.** `pt_sessions` yalnızca *alınmış* randevuyu tutuyor;
   "salı 15:00'te xx antrenörü boş mu?" sorusunun veri karşılığı yok.
4. **Üye randevu alamıyor.** `createPtSession` yalnızca antrenör takviminden
   çağrılıyor; kural `trainerId == request.auth.uid` ile üyeyi dışarıda bırakıyor.

**Koleksiyon adlandırması.** Legacy `packages` ve `assigned_packages` aynı
projede **hâlâ duruyor** (WEB-5 bekliyor). Bu adları yeniden kullanmak
`payments` için yaşanan iki-match-bloğu + `!('tenantId' in resource.data)`
ayıracı wart'ını (P1-2) tekrarlamak olur. **Yeni adlar:** `gym_packages`,
`member_packages`, `member_credits`, `promotions`,
`package_change_requests`, `trainer_availability`.

---

### [x] PKG-1 · Hak tabanlı paket kataloğu

**`gym_packages`**

| Alan | Tip | Not |
|---|---|---|
| `tenantId` | string | |
| `name` | string | "Gold", "8 Ders" — serbest metin |
| `kind` | `'membership' \| 'lessons'` | |
| `price` | number | |
| `durationDays` | number? | `membership` için zorunlu |
| `lessonCount` / `lessonValidityDays` | number? | `lessons` için |
| `entitlements` | map | Aşağıda |
| `freezePolicy` | map? | `{ minDays, maxCount }` — `membership` için |
| `activeAssignmentCount` | number | Cloud Function tutar; kilidin dayanağı |
| `supersedesId` | string? | Yeni sürümse eskiye bağ |
| `isActive` / `sortOrder` / `createdAt` | | |

**Haklar:**

```
{
  gymAccess:    true,
  groupClasses: { unlimited: true },            // veya { count: 4, periodDays: 30 }
  ptLessons:    { count: 12, periodDays: 90 }   // alan yoksa hak yok
}
```

Kotalı haklar tek şekli paylaşır (`{count, periodDays}`), böylece tüketim tek
defterden yürür (karar 3). `{unlimited: true}` **hiç kredi kaydı açmaz** — o
durumda rezervasyon bugünkü kadar ucuz kalır.

#### Satılmış paket değişmez — sürümleme

Aktif ataması olan pakette fiyat, süre, haklar ve dondurma politikası
**kilitlidir**. Üye belirli bir içeriği satın aldı; kataloğu düzenlemek
geriye dönük olarak satılmış hakkı değiştirmek olurdu.

- `activeAssignmentCount == 0` → paket serbestçe düzenlenir.
- `> 0` → kural yalnızca `isActive` ve `sortOrder` değişimine izin verir.
  İçerik değiştirmek isteyen admin **yeni sürüm** oluşturur: `supersedesId`
  ile eskiye bağlanır, eski kayıt `isActive:false` olur (artık satılmaz),
  mevcut atamalar bozulmadan devam eder.
- Arayüz bunu engel değil akış olarak sunar: *"Bu pakete sahip 12 aktif üye
  var. Değişiklikler yeni sürüm olarak kaydedilecek."*

**Kurallar:** okuma = kiracı personeli + kiracı üyesi (üye ne alabileceğini
görsün), yazma = kiracı yöneticisi + yukarıdaki kilit.

---

**Çözüldü (20 Ağustos 2026).** `types.ts` → `convert.ts` → `packageRepo.ts` →
`firestore.rules` (78 test, +8) → `firestore.indexes.json` → `SCHEMA.md` →
`admin/packages.tsx` (katalog listesi) + `admin/package-form.tsx`
(oluştur/düzenle).

Kilit rule tarafında da zorlanıyor: `activeAssignmentCount > 0` iken kural
yalnızca `isActive`/`sortOrder` değişimine izin veriyor, içerik alanları
donuyor. `activeAssignmentCount`'ı istemcinin **hiçbir koşulda** hareket
ettirememesi ayrıca test edildi (kilitli/kilitsiz ikisinde de) — `member_packages`
henüz yok, o yüzden sayaç şu an her zaman 0 ve gerçek kilit PKG-2'nin Cloud
Function'ı devreye girince anlam kazanacak; kural yine de bugünden doğru.

Yeni `confirmAction` eklendi (`utils/confirm.ts`) — `confirmDestructive`'in
kırmızı olmayan kardeşi. Yeni sürüm oluşturmak yıkıcı değil (hiçbir şey
kaybolmuyor) ama sonucu görmeden onaylanmamalı; kırmızı buton burada yanlış
mesaj verirdi.

Yeni salon açılışına (`createTenantWithOwner`) `seedDefaultPackages` bağlandı
— Silver/Gold/Platinium tohum olarak yazılıyor, fiyatları 0 (admin
doldurmalı). Uygulama kodunda **hiçbir yerde** isimle dallanma yok; ekranlar
yalnızca `entitlements` alanlarını soruyor.

**Simülatörde doğrulanmadı** — ekrana ulaşmak oturum açmayı gerektiriyor ve
simülatörde dokunmalar güvenilir kaydolmuyor. Bundle'ın hatasız yüklendiği
(kayıt ekranı) doğrulandı, form akışı cihazda test edilmeli.

---

### [x] PKG-2 · Atama ve kota defteri

**`member_packages`**

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` / `memberName` | | `memberName` denormalize |
| `packageId` / `packageName` / `kind` / `entitlements` / `freezePolicy` | | Atama anında **kopyalanır** |
| `listPrice` / `finalPrice` | number | Promosyon uygulandıysa ikisi farklı |
| `promotionId` / `promotionName` / `bonusDays` / `bonusLessons` | | PKG-5 |
| `startsAt` / `endsAt` | Timestamp | `endsAt = startsAt + durationDays + bonusDays` |
| `frozenDays` / `freezes` | | PKG-10 |
| `status` | `'active' \| 'frozen' \| 'expired' \| 'cancelled'` | |
| `paymentId` | string? | Ödeme defterine bağ |
| `assignedAt` / `assignedBy` | | |

**`member_credits`** — her kota bakiyesi, türü ve kaynağı ne olursa olsun.

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` | | |
| `kind` | `'ptLesson' \| 'groupClass'` | Tek defter, iki hak türü |
| `source` | `'purchase' \| 'entitlement'` | Satın alınan paket / periyodik hak |
| `sourcePackageId` | string | `member_packages` dokümanı |
| `total` / `used` | number | `used` istemciden **asla** yazılamaz |
| `startsAt` / `expiresAt` | Timestamp | Periyodik hakta dönem sınırları |
| `status` | `'active' \| 'exhausted' \| 'expired'` | |

Tüketimde krediler **son kullanma tarihine göre** sırayla harcanır (önce
biteni önce) — üye hediyesini boşa harcamaz.

Periyodik hakkı yenileyen **zamanlanmış Cloud Function** her dönem başında
yeni kredi kaydı açar. Okuma anında da tarih kontrolü yapılır: fonksiyon
gecikse bile ekranda yanlış bakiye görünmez.

**Index:** `tenantId + memberId + endsAt DESC`, `tenantId + status + endsAt ASC`
(yaklaşan bitişler), `tenantId + memberId + kind + status` (kredi).

**Arayüz:** Salon ayarlarında katalog CRUD (hak anahtarlarıyla); admin üye
satırından "Paket ata".

---

**Çözüldü (20 Ağustos 2026).** `member_packages` + `member_credits` →
`memberPackageRepo.ts` → kurallar (85 test, +7) → 4 composite index →
2 Cloud Function → `admin/member.tsx` (üye detayı: iletişim bilgisi, aktif
paketler, kalan krediler) + `admin/assign-package.tsx` (katalogdan seçip
ata) → `admin/members.tsx` satırları artık tıklanabilir → `SCHEMA.md`.

**`sourcePackageId` plandaki gibi `member_packages` dokümanına işaret ediyor,
`gym_packages`'a değil** — ilk yazımda bunu ters yapmıştım (katalog id'si),
düzeltildi. Fark önemli: yenileme fonksiyonu "bu kredi hâlâ geçerli mi?"
sorusunu belirli bir *atamanın* durumuna (`status`, `endsAt`) bakarak
yanıtlıyor; katalog id'si bir üyenin aynı paketi ikinci kez satın aldığı
durumda hangi atamadan geldiğini ayırt edemezdi.

**İki Cloud Function:**
- `syncPackageAssignmentCount` — PKG-1'in kilidini gerçek kılıyor.
  `activeAssignmentCount` şimdiye kadar hep 0'dı (hiç atama yoktu); artık
  gerçek sayı.
- `renewEntitlementCredits` — günlük, Platinium'un çeyreklik dersini ve
  (açılırsa) kotalı grup dersini bir sonraki döneme yuvarlıyor. Yalnızca
  kaynak atama hâlâ `active` ve süresi dolmamışsa yeniliyor; sona ermiş bir
  üyelik yeni kredi üretmeye devam etmiyor.

**`member_packages`/`member_credits` update tamamen kapalı — bilinçli.**
PKG-2 kapsamında hiçbir client-side "iptal et"/"durdur" özelliği yok.
Sebebi kapsam disiplini: iptal, dondurma ve süre-dolumu geçişlerinin her
biri kendi maddesinde (PKG-10, PKG-11, PKG-12) zaten tanımlı ve her biri
kendi geri alma/kota mantığını taşıyor. Şimdiden yarım bir "iptal" yolu
açmak o maddelerin işini ikiye bölerdi.

**Atama akışı doğrudan — PKG-6'ya kadar doğru olan budur.** `assignPackageToMember`
üyeye onay sormuyor; bu yalnızca *ilk/ek* atama için doğru
("İlk atama onay istemez" — PKG-6). Fonksiyonun kendi doc yorumu ve
`member_packages` kuralının yorumu bunu açıkça işaretliyor, PKG-6 yazan kişi
bu fonksiyonu değişiklik yolu için **çağırmamalı**, yerine
`package_change_requests` akışını kullanmalı.

**Yapılmayanlar, bilerek:** Promosyon seçimi (PKG-5 henüz yok — `finalPrice`
şimdilik `listPrice`'a eşit). Dondurma arayüzü (PKG-10). Kredi tüketimi/randevu
akışı (PKG-8) — kredi defteri hazır ama harcama yolu yok. Bir üyenin ders
paketi süresi doldu diye salon girişinin engellenmesi (PKG-3, sıradaki madde)
— check-in bu paketleri henüz hiç okumuyor.

**Simülatörde doğrulanmadı — kullanıcının isteği üzerine ertelendi**
("simülatör kontrollerini en son yapacağız"). `tsc --noEmit`, `expo lint`
ve `functions` derlemesi temiz.

---

### [x] PKG-3 · Check-in'de erişim ve paket etiketi

```
{ ok: true, name: 'Ayşe Şengül',
  access: 'ok' | 'warn',
  packageLabel: 'Gold' | '8 Ders · bugün randevulu' | null,
  warnReason: 'no-package' | 'no-session-today' | 'frozen' | 'expiring-soon' | null }
```

**Karar sırası:**
1. Aktif süreli üyelik bugünü kapsıyor ve `entitlements.gymAccess` → `ok`,
   etiket paket adı.
2. Değilse: kullanılabilir ders kredisi var **ve** bugüne `pt_sessions` kaydı
   var → `ok`, etiket "8 Ders · bugün randevulu". O gün gün boyu serbest.
3. Kredi var ama bugün randevu yok → `warn`, "Bugün randevusu yok".
4. Paket dondurulmuş → `warn`, "Üyelik dondurulmuş (12 Eylül'e kadar)".
5. Hiçbiri → `warn`, "Üyelik paketi yok".

**Giriş engellenmez, uyarılır.** Kapıda ödeme yapıyor olabilir; kararı
personel verir. Uyarı ekranında "Yine de kabul et" birincil aksiyondur ve
seçim `checkins.accessReason`'a yazılır — "kaç kişi paketsiz alındı"
sonradan raporlanabilsin.

Başarı ekranı istenen biçimde: **"Ayşe Şengül · Gold"**.

**Performans:** Check-in'in sürtünme bütçesi ≤5 sn. Paket **doğrudan
okunacak**, `tenant_memberships` üzerine denormalize *edilmeyecek* —
denormalize kopya süre dolduğunda kendi kendine bayatlar ve düzeltmesi
zamanlanmış fonksiyon ister. Ölçülüp gecikme sorun çıkarırsa optimize edilir.

---

**Çözüldü (20 Ağustos 2026).** `resolveAccess` (`checkinRepo.ts`) plandaki
5 adımlı karar sırasını birebir uyguluyor. `checkins.accessReason` alanı
eklendi, kural değeri doğruluyor (`in ['ok','no-package','no-session-today',
'frozen']`). `CheckInAccessReason` `types.ts`'e taşındı — `CheckIn`
arayüzünün zaten sahip olması gereken bir alandı.

**Akış plandan bir noktada ayrıştı — bilinçli.** Plan "uyarı ekranında
'Yine de kabul et' birincil aksiyon" diyordu ama check-in'in ne zaman
**yazıldığını** açık bırakmıştı. İki yorum mümkündü: (a) giriş her durumda
hemen yazılır, uyarı yalnızca bilgilendirir; (b) `warn` durumunda yazma
**duraklar**, personel onaylayana kadar kayıt oluşmaz. (b)'yi seçtim: `ok`
durumu hâlâ tek adımda, sürtünmesiz yazılıyor (vaka çoğunluğu bu); `warn`
durumunda personel gerçekten bir karar veriyor ve "Vazgeç" seçeneği var —
(a) olsaydı "Vazgeç" anlamsız kalırdı, kayıt zaten oluşmuş olurdu.
`confirmCheckInDespiteWarning` mükerrer kayıt kontrolünü **tekrar** yapıyor:
uyarı ile onay arasındaki süre gerçek zaman, başka biri aynı üyeyi o arada
okutmuş olabilir.

**`getMemberPackages`/`getActiveMemberCredits` tek seferlik (one-shot)
eklendi**, `watchMemberPackages`/`watchMemberCredits`'in yanına — check-in
tek bir karar anı, abone olunan bir ekran değil; canlı dinleyici gereksiz
kalırdı. Sıfır yeni composite index gerekti: üçü de (paketler, krediler,
bugünün randevusu) PKG-1/PKG-2/D1-2'de zaten eklenmiş index'leri
kullanıyor — sonuç kümesi küçük olduğu için (`limit(10)`) durum/tarih
filtrelemesi istemci tarafında yapılıyor.

**Açık soru — `expiring-soon` uygulanmadı.** Üstteki JSON şeklinde
tanımlıydı ama 5 adımlı karar sırası onu hiç üretmiyordu — hangi eşikte
("3 gün kala mı, 7 gün kala mı?") tetikleneceği plan metninde yoktu.
`CheckInWarnReason` tipinden çıkarıldı; salon sahibi bir eşik belirlerse
eklenir.

**Simülatörde doğrulanmadı** — kullanıcı isteğiyle sona ertelendi.
`tsc --noEmit`, `expo lint` temiz; kural testleri 85 → 86.

---

### [x] PKG-4 · Grup dersi hakkının yaptırımı

Bugün `classes` rezervasyonu **herkese açık**; seviyeler bu madde olmadan
anlamsız kalır. Üç yol, karmaşıklık yalnızca sonuncusunda:

| Hak | Davranış |
|---|---|
| yok | Rezervasyon kilitli: "Grup dersleri Gold ve üzeri paketlerde" |
| `{unlimited: true}` | **Bugünkü davranış aynen** — `bookedUserIds`'e tek yazma, kota yok, iptal serbest |
| `{count, periodDays}` | Rezervasyon `member_credits` üzerinden (`kind:'groupClass'`) — PKG-8'in callable'ı ve PKG-11'in iade yolu **aynen yeniden kullanılır** |

**Kotalı grup dersi altyapıda var, varsayılanda yok.** Silver'a aylık N ders
iyi bir yukarı-satış aracı ve model destekliyor, ama iki gerçek bedeli var:
(a) grup dersi iptali bugün "geri alınabilir, onay sorma" diye tanımlı
(AGENTS.md §2) — kota gelince iptal anlamlı bir karar hâline gelir ve onay
istemeye başlar; (b) Silver ders alabiliyorsa Gold'un değer önermesi zayıflar.
Salon isterse katalogdan açar; tohum şablonda Silver = yalnızca `gymAccess`.

**Yaptırım kuralda da olacak** — istemci kontrolü UX içindir, güvenlik değil
(AGENTS.md §6). Kural bir `member_packages` `get()`'i gerektirir;
**deterministik doküman kimliği** (`{tenantId}_{memberId}_current`) ile tek
okuma yeterli olacak şekilde tasarlanmalı, çünkü kural sorgu yapamaz. Kotalı
durumda kural yalnızca hakkın varlığını doğrular; **sayma işi callable'ın**.

---

**Çözüldü (20 Ağustos 2026).** Planın kendisi bir mimari boşluk bırakmıştı:
"deterministik doküman kimliği ile tek okuma yeterli olacak şekilde
tasarlanmalı" diyordu ama `member_packages` rastgele id kullanıyordu (PKG-2)
— kurallar "üyenin güncel üyelik paketi hangisi?" sorgusunu **hiç
çalıştıramaz**, yalnızca sabit bir yoldan `get()` edebilir. Çözüm: yeni
`member_entitlements/{tenantId}_{memberId}` — güncel paketin `entitlements`
+ `endsAt`'inin tek dokümanlık kopyası, `syncMemberEntitlements` Cloud
Function'ı (`member_packages` yazımında tetiklenir) tarafından tutuluyor.
`member_packages`'ın kendi geçmiş tutma tasarımına dokunulmadı — bu yalnızca
bir yan önbellek.

**Tazelik sorunu `request.time` ile çözüldü, günlük fonksiyona gerek
kalmadı.** Önbellek yalnızca yazımda tazeleniyor, zamanın geçmesiyle değil
— süresi dolmuş bir üyelik hiç yeni yazma tetiklemeden sonsuza kadar
`active` görünmeye devam ederdi. Kural bunun yerine
`get(...).data.endsAt > request.time` diye kendi doğruluyor; PKG-12'nin
genel günlük "status tazele" işine bağımlı olmadan bugünden doğru.

`isOnlySelfArrayToggle` `isSelfArrayAdd`/`isSelfArrayRemove` olarak ikiye
bölündü — hak kontrolü yalnızca **ekleme**ye uygulanıyor, **çıkarma**
(iptal) hiçbir zaman gated değil. Aksi hâlde paketi değişen bir üyenin eski
rezervasyonunu iptal edememesi gibi saçma bir kilit çıkardı.

**Kotalı grup dersi bilerek yarım bırakıldı — planın kendi sınırı.** Yalnızca
`{unlimited: true}` rezervasyonu geçiyor; `{count, periodDays}` kredi tüketen
bir callable gerektiriyor (PKG-8'in ruhu, ama grup dersleri `pt_sessions`
değil `classes` üzerinde çalıştığı için ayrı bir akış), o da henüz yok.
Varsayılan şablonlarda hiçbir paket kotalı grup dersi taşımıyor, yani bu şu
an üretimde erişilemeyen bir dal — ama admin paket formunda kotalı seçeneği
açarsa (PKG-1'de zaten var), üye rezervasyon deneyince kural onu reddediyor
ve istemci bunu "yakında aktif olacak" diye açıkça söylüyor; sessiz bir
bedava-kota açığı değil.

**Yol üstünde bulunan iki eski hata düzeltildi:** `SCHEMA.md`'de `classes`
bölümü "bekleme listesinden otomatik yükseltme yok" diyordu — P2-8 çoktan
[x] işaretliydi, `promoteFromClassWaitlist` fonksiyonu zaten vardı. Aynı
bölüm kaldırılan `isOnlySelfArrayToggle` ismini de anıyordu.

Kural testleri 86 → 89: hak yoksa rezervasyon reddi, kotalı hak de reddi
(callable yok), süresi geçmiş önbellek reddi (`request.time` kontrolü).

**Simülatörde doğrulanmadı** — kullanıcı isteğiyle sona ertelendi.
`tsc --noEmit`, `expo lint`, `functions` derlemesi temiz. Sıfır yeni
composite index — Cloud Function `getMemberPackages` ile aynı
fetch-all-filtrele-istemcide desenini kullanıyor.

**Bu maddeyle Blok 1 tamamlandı (PKG-1→4).** Süreli üyelik uçtan uca
çalışıyor ve seviyeler (Silver/Gold/Platinium) artık gerçekten satılabilir
— Gold'un grup dersi hakkı Silver'a göre fiilen bir fark yaratıyor.

---

### [x] PKG-5 · Promosyonlar

Dönemsel kampanyalar: yüzde/tutar indirimi ya da ek süre ("1 yıl alana 1 ay
hediye"). Promosyon **kataloğu değiştirmez** — katalog satılmış içeriği
koruduğu için (karar 2) kampanya ayrı bir kavram olmak zorunda; aksi halde
her kampanya paketin yeni bir sürümünü doğururdu.

**`promotions`**

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `name` | | "Yıllık üyeliğe 1 ay hediye" |
| `kind` | `'percentDiscount' \| 'amountDiscount' \| 'bonusDays' \| 'bonusLessons'` | |
| `value` | number | %20 · 500 ₺ · 30 gün · 4 ders |
| `appliesTo` | array | `gym_packages` kimlikleri; boş = tümü |
| `startsAt` / `endsAt` | Timestamp | Kampanya penceresi |
| `maxRedemptions` / `redeemed` | number? | `redeemed` istemciden yazılamaz |
| `isActive` | boolean | |

Atamada admin uygun promosyonlardan birini seçer; sonuç `member_packages`'a
**düz değer olarak** yazılır (`listPrice`, `finalPrice`, `bonusDays`,
`bonusLessons`). Promosyon sonradan bitse ya da silinse bile üyenin aldığı şey
değişmez — fiyat ve haklar gibi bunlar da kopyalanmış değerdir.

`redeemed` sayacı ve `maxRedemptions` kontrolü atama callable'ında,
transaction içinde (karar 4).

**Arayüz:** Salon ayarlarında promosyon listesi; atama ekranında "Promosyon
uygula" ve **önce/sonra fiyat ile ek sürenin açıkça yazıldığı** özet.

---

**Çözüldü (20 Ağustos 2026).** `promotions` → `promotionRepo.ts` →
`assignPackageToMember` (promosyon parametresi eklendi) → kurallar (94 test,
+5) → composite index → `admin/promotions.tsx` (kampanya listesi) +
`admin/promotion-form.tsx` (oluştur/düzenle) + `admin/assign-package.tsx`'e
promosyon seçici ve önce/sonra özeti.

**`redeemed` sayacı planın kendi "sayan her şey callable'da" ilkesinin
istisnası — bilinçli.** Diğer tüm sayaçlar (`activeMemberCount`,
`activeAssignmentCount`) bir Cloud Function gerektiriyordu çünkü kurallar
*sorgu* yapamaz. Burada sorguya gerek yok: `redeemed` tek dokümanda duran
düz bir sayı, kural onu "tam +1 ve tavanın altında" diye doğrudan
doğrulayabiliyor — `classes.bookedUserIds.size() <= capacity` ile aynı
desen. `assignPackageToMember` bunu `runTransaction` içinde yapıyor,
`bookClass`'ın kapasite kontrolüyle birebir aynı atomiklik garantisiyle.

**Uyumsuz `kind`/paket eşleşmesi sessiz no-op, hata değil — planın kendi
sözü.** `bonusDays` yalnızca `membership`, `bonusLessons` yalnızca `lessons`
paketini etkiler; ters eşleşirse değer kopyalanır ama hiçbir şeyi
değiştirmez. `promotion-form.tsx`'in paket seçicisi `kind`'e göre
filtrelendiği için bu pratikte hiç yaşanmıyor.

**Planın belirtmediği, kendim karar verdiğim bir nokta: kampanya
tarihleri.** Plan `startsAt`/`endsAt` Timestamp diyordu ama bunu seçecek
bir takvim bileşeni uygulamada **hiç yok** (yeni native bağımlılık = yeni
EAS build). Bunun yerine `startsAt` her zaman "şimdi", admin yalnızca "kaç
gün sürecek?" seçiyor (paket formunun zaten kullandığı gün-sayacı deyimi).
Sonuç: **ileri tarihli bir kampanya planlanamaz** — bu v1 kısıtı, gerçek
takvim seçici gerektiğinde ele alınmalı.

**Yapılmayan (bilerek):** üye yüzlü promosyon vitrini yok — okuma yalnızca
kiracı personeline açık. PKG-12 "görünürlük" maddesinin kapsamında değildi,
ayrıca istenirse eklenir.

**Simülatörde doğrulanmadı** — kullanıcı isteğiyle sona ertelendi.
`tsc --noEmit`, `expo lint` temiz.

---

### [x] PKG-6 · Üye onaylı paket değişikliği

**Atanmış paket tek taraflı değiştirilemez.** Silver↔Gold geçişi, promosyon
süresi ya da ders paketi eklenmesi — hepsinde üye bilgilendirilmeli ve
onaylamalı. Ücret değişiyorsa açıkça görünmeli.

**`package_change_requests`**

| Alan | Tip | Not |
|---|---|---|
| `tenantId` / `memberId` / `memberName` | | |
| `kind` | `'upgrade' \| 'downgrade' \| 'promotion' \| 'addon'` | Etiketleme; yaptırım karşılaştırmadan gelir |
| `currentSummary` / `proposedSummary` | map | Ad, haklar, fiyat, `endsAt` |
| `priceDelta` | number | + ek ücret · − iade · 0 değişmiyor |
| `refundAmount` / `refundBasis` | number / string? | Aşağıdaki oransal hesap |
| `note` | string? | Yöneticinin açıklaması |
| `effectiveAt` / `expiresAt` | Timestamp | |
| `status` | `'pending' \| 'approved' \| 'rejected' \| 'expired' \| 'cancelled'` | |
| `createdBy` / `createdAt` / `respondedAt` | | |

**Akış:**
1. Admin değişikliği hazırlar → istek `pending`. `member_packages`'a
   **hiçbir şey yazılmaz.**
2. Üyeye push gider (`sendPushToUser` altyapısı hazır). Bugün ekranında ve
   Hesabım'da öne çıkan kart belirir.
3. Üye **iki paketi yan yana** görür: giden hak, gelen hak, fiyat farkı,
   iade tutarı, başlangıç tarihi. Hak listesi `entitlements` map'inden
   üretilir — elle metin yazılmaz, yoksa yeni bir hak eklendiğinde ekran
   yalan söyler.
4. Onaylarsa `applyPackageChange` callable transaction'da: isteği `approved`
   yapar, eski `member_packages` kaydını kapatır, yenisini açar, promosyon
   sayacını artırır, kredi defterini günceller, iade gerekiyorsa ödeme
   defterine kayıt düşer.
5. Reddederse hiçbir şey değişmez; yöneticiye bildirim gider.
6. `expiresAt` geçerse zamanlanmış fonksiyon `expired` yapar — süresiz
   bekleyen teklif, admin'in unuttuğu bir tuzağa dönüşür.

**Kurallar:** üye kendi isteğini okur ve **yalnızca `status`'ü**
`approved`/`rejected` yapabilir; başka alana dokunamaz. `member_packages`'a
üye asla yazamaz.

**İlk atama onay istemez**, yalnızca bilgilendirme bildirimi gönderir. Üye
zaten kasada satın aldı; oraya onay ekranı koymak resepsiyonu kilitler.

#### Düşürmede oransal iade

Gold→Silver gibi bir düşüşte kalan süreye düşen fark **iade edilir**:

```
refundAmount = (eskiFinalPrice − yeniFinalPrice) × (kalanGün / toplamGün)
kalanGün  = endsAt − effectiveAt   (dondurma günleri düşülmüş hâliyle)
toplamGün = endsAt − startsAt
```

Tutar onay ekranında **hesabıyla birlikte** gösterilir ("kalan 92 / 180 gün").
Onaylandığında `payments` defterine bir kayıt düşer.

**`payments` şema eklentisi:** `kind: 'charge' | 'refund'` (varsayılan
`charge`, mevcut kayıtlar geriye dönük uyumlu). Tutar her zaman pozitif
kalır — negatif tutar raporlamayı kirletir. Para hareketi uygulama dışında
gerçekleşir; burası **yalnızca defter**, bugünkü gibi.

---

**Çözüldü (20 Ağustos 2026).** `package_change_requests` → `packageChangeRepo.ts`
→ kurallar (99 test, +5) → 2 composite index → 3 Cloud Function
(`notifyOnPackageChangeRequested`, `applyPackageChange`,
`expirePendingPackageChangeRequests`) → `admin/propose-package-change.tsx`
(admin/member.tsx'teki aktif paket satırı artık "Değiştir" ile buraya
açılıyor) → `member/package-offer.tsx` (yan yana karşılaştırma, onayla/reddet)
→ Bugün ve Hesabım'da öne çıkan teklif kartı.

**Cloud Function burada bir istisna değil, zorunluluk — planın kendi
mantığının doğal sonucu.** `member_packages` kuralı hiçbir client update'ine
izin vermiyor, admin dahil (PKG-2). Üyenin onayı yalnızca `status` alanını
değiştirebiliyor; asıl işi (eski paketi kapatmak, yenisini açmak, kredi
defterini güncellemek, promosyon sayacını artırmak, iade kaydı düşmek)
yapacak sunucu tarafı bir yer olmak zorundaydı. `applyPackageChange` bu yeri
dolduruyor — `pending→approved` geçişini izleyen bir `onDocumentUpdated`.

**Apply anında yeniden doğrulama — planın belirtmediği ama gerekli bir
karar.** Admin bir teklif hazırladıktan **günler sonra** üye onaylayabilir
(varsayılan 3 gün pencere). Bu sürede bağlı promosyon süresi dolmuş ya da
kontenjanı bitmiş olabilir. `applyPackageChange` promosyonu apply anında
**yeniden kontrol ediyor**; artık geçerli değilse sessizce düşürülüyor —
üye onayladığı temel değişikliği yine de alıyor, yalnızca artık geçerli
olmayan hediyeyi almıyor. Hedef paketin kendisi ise sorun değil: PKG-1'in
kilidi zaten içeriğinin donmuş olmasını garanti ediyor.

**İdempotency — Cloud Functions tetikleyicileri aynı olayı yeniden teslim
edebilir.** `appliedAt` işareti bunun karşılığı: set edildikten sonra aynı
geçiş tekrar tetiklenirse fonksiyon hemen çıkıyor. Bu olmadan bir retry
paketi ikinci kez atar, krediyi ikinci kez basar, promosyonu iki kez harcar.

**"Ekleme" mi "değiştirme" mi — `kind` alanından değil, karşılaştırmadan
çıkarılıyor.** Planın kendi sözü ("Etiketleme; yaptırım karşılaştırmadan
gelir") burada somutlaştı: `currentPackageAssignmentId` varsa o paket
kapatılıp değiştiriliyor; yoksa (üyenin o türden hâlâ aktif paketi yoksa —
mesela Gold üyeye ilk kez ders paketi ekleniyor) hiçbir şey kapatılmıyor,
saf ekleme oluyor. `admin/propose-package-change.tsx` bunu paket
türlerinin (`membership`/`lessons`) eşleşip eşleşmediğine bakarak otomatik
belirliyor.

**Admin iptal yolu plan metninde yoktu, eklendi.** Plan yalnızca üyenin
onay/red hakkını tanımlıyordu; hâlâ `pending` olan bir teklifi adminin geri
çekebilmesi (fikir değiştirme, yanlış paket seçme) tanımlanmamıştı ama
`status` enum'ında `'cancelled'` zaten vardı — kural ve repo fonksiyonu
(`cancelPackageChangeRequest`) eklendi.

**`payments.kind: 'charge'|'refund'` planın istediği gibi geriye dönük
uyumlu** — alan yoksa `'charge'` sayılıyor, mevcut kayıtlar hiç dokunulmadı.

**Yapılmayan (bilerek):** ileri tarihli teklif planlama yok — `effectiveAt`
her zaman "şimdi" (PKG-5'teki aynı v1 kısıtı: takvim seçici bileşeni yok).
Onay/red sonrası başarı bildirimi yalnızca planın açıkça istediği iki yerde
var (üyeye teklif geldiğinde, adminine reddedildiğinde) — onaylandığında
adminine ayrıca bildirim gitmiyor, plan bunu istemedi.

**Simülatörde doğrulanmadı** — kullanıcı isteğiyle sona ertelendi.
`tsc --noEmit`, `expo lint`, `functions` derlemesi temiz.

**Bu maddeyle Blok 2 tamamlandı (PKG-5→6).** Ticari esneklik hazır:
promosyon uygulanabiliyor, atanmış bir paket artık tek taraflı
değiştirilemiyor.

---

### [x] PKG-7 · Antrenör müsaitlik modeli

Randevunun ön koşulu; şu anda hiç yok.

**`trainer_availability`** — doküman kimliği `{tenantId}_{trainerId}`.

| Alan | Tip | Not |
|---|---|---|
| `weekly` | map | `{ mon: [{start:'08:00', end:'12:00'}], ... }` |
| `slotMinutes` | number | Varsayılan 60 |
| `exceptions` | array | `[{date, closed:true}]` veya o güne özel pencere |
| `updatedAt` | Timestamp | |

Boş `weekly` = müsaitlik **tanımlanmamış**. Üyeye sessizce "boş slot yok"
göstermek yerine antrenöre "çalışma saatlerini tanımla" uyarısı çıkar —
sessiz boşluk, hatayı antrenöre değil üyeye yaşatır.

Serbest slotlar = `weekly` − `exceptions` − o aralıktaki `pt_sessions`;
istemcide hesaplanır, ikisi de zaten okunuyor.

**Kurallar:** okuma = kiracı üyesi, yazma = antrenörün kendisi veya yönetici.
**Arayüz:** Antrenör Profil → "Çalışma saatlerim".

---

**Çözüldü (20 Ağustos 2026).** `TrainerAvailability`/`Weekday`/`TimeWindow`/
`AvailabilityException` tipleri → `availabilityRepo.ts` (`watchTrainerAvailability`,
`setTrainerAvailability`, `hasAnyAvailability`, `computeFreeSlots`) → kurallar
(`trainer_availability` bloğu) → `trainer/availability.tsx` (Antrenör Profil'e
eklenen "Çalışma saatlerim" girişinden açılıyor).

**Zaman seçimi saat çipleriyle, planın öngördüğü gibi değil ama aynı v1
kısıtından geliyor.** Uygulamada hiç saat seçici bileşeni yok (PKG-5/6'daki
aynı sınır). Plan `weekly` alanını serbest `'HH:mm'` string'i olarak
tanımlıyordu; ekran bunu 06:00–22:00 arası tam saat çipleriyle dolduruyor.
Veri modeli dakika hassasiyetini destekliyor, yalnızca bu ekran onu
sergilemiyor.

**Günde tek pencere — planın `TimeWindow[]` (öğle arası gibi bölünmüş gün)
imkânını veri modeli koruyor, ekran sergilemiyor.** `setTrainerAvailability`
her gün için en fazla bir `{start,end}` yazıyor; ileride bölünmüş gün
gerekirse yalnızca ekran değişir, kural ve tip zaten hazır.

**`exceptions` veri modelde var, ekranda hiç yok** — plan da bunu ayrı bir
"istisna" kavramı olarak tanımlamıştı, v1 kapsamı yalnızca haftalık düzeni
kapsıyor.

**Simülatörde doğrulanmadı** — kullanıcı isteğiyle sona ertelendi.
`tsc --noEmit`, `expo lint`, kurallar testi (102/102) temiz.

---

### [x] PKG-8 · Üyenin randevu alması (kredi tüketimi)

`bookPtSessions({ tenantId, trainerId, slots: [Date] })` — callable, tek
transaction (karar 4):

1. Üyenin kullanılabilir kredilerini son kullanma tarihine göre sıralar,
   toplam yeterli mi bakar.
2. Her slot antrenörün müsaitlik penceresinde mi ve boş mu?
3. `pt_sessions` kayıtlarını `creditId` ile oluşturur.
4. İlgili kredilerde `used` artırır; biten krediyi `exhausted` yapar.

`pt_sessions`'a `creditId: string?` eklenir. **Null geçerli:** antrenörün
pakete bağlı olmayan kendi kaydı (mevcut davranış korunur). Kural,
`creditId` dolu dokümanların create'ini istemciye kapatır.

**Arayüz:** Üye → "Randevu al" → antrenör seç → takvim + o günün boş slotları
→ onay. `MonthCalendar` yeniden kullanılır.

---

**Çözüldü (20 Ağustos 2026).** `pt_sessions.creditId` → kural (`creditId`
alanı olan doküman istemciden asla oluşturulamaz) → `trainer_busy_slots`
ayna koleksiyonu + `syncTrainerBusySlots` (gizlilik: bir üye başka üyenin
kiminle randevusu olduğunu göremez) → `bookPtSessions` callable (tek
transaction: üyelik + müsaitlik + çakışma + kredi yeterliliği doğrular, en
erken bitecek krediden düşer) → `ptSessionRepo.bookPtSessions` istemci
sarmalayıcısı → `member/trainers.tsx` (antrenör seç) → `member/book-session.tsx`
(takvim + boş slot çipleri + onay) → Bugün ekranında "Randevu al" girişi.

**Neden callable, planın kendi "karar 4"ünün doğal sonucu.** Yeterlilik
kontrolü tek bir üyenin **birden fazla** `member_credits` dokümanını
toplayıp karşılaştırmayı gerektiriyor — kural tek doküman öncesi/sonrasını
görebilir, sorgu sonucunu değil. `assignPackageToMember`/promosyon harcaması
gibi istemci `runTransaction`'ı burada işe yaramıyor: iki cihaz aynı slotu
aynı anda rezerve etmeye çalışırsa yarış durumunu yalnızca sunucu tarafı
transaction önler.

**`trainer_busy_slots` planın metninde yoktu, gizlilik gereği eklendi.**
Plan boş slot hesabını "`weekly` − `exceptions` − `pt_sessions`" olarak
tanımlıyordu ama `pt_sessions`'ı doğrudan okumak üyenin kimin ne zaman
randevusu olduğunu görmesi demek — kural buna izin vermiyordu zaten (yalnız
kendi randevusunu okuyabiliyor, PKG-6 öncesi kural). Kimlik alanlarını
taşımayan bir ayna, `member_entitlements` (PKG-4) ile aynı desenin gizlilik
motivasyonlu hali.

**Tek slot rezervasyonu — callable birden fazlasını destekliyor, ekran
sergilemiyor.** `bookPtSessions({slots: Date[]})` imzası PKG-9'un (seri
randevu) planladığı aynı callable'ı yeniden kullanması için baştan dizi
alıyor; bu ekran şimdilik `slots: [tek seçim]` gönderiyor.

**`remaining <= 0` istemci tarafı kontrolü yalnızca UX** — plan "sayan her
şey callable'da" prensibini burada da koruyor: gerçek yeterlilik kontrolü
`bookPtSessions` içinde, ekrandaki kontrol yalnızca boş bir butonun round-trip
hatasından daha iyi olması için var.

**Simülatörde doğrulanmadı** — kullanıcı isteğiyle sona ertelendi.
`tsc --noEmit`, `expo lint`, `functions` derlemesi, kurallar testi
(102/102) temiz.

**Bu maddeyle Blok 3 tamamlandı (PKG-7→8).** Ders paketleri artık
kullanılabilir: antrenör saatlerini tanımlayabiliyor, üye kredisini
harcayarak randevu alabiliyor.

---

### [x] UX-4 · Antrenör çalışma saatleri ekranı: genel UX yenilemesi gerekiyor

`trainer/availability.tsx`'teki gün açma akışı kullanışsız bulundu (26 Ağustos
2026, kullanıcı testi). Bugünkü haliyle:

- Başlangıç ve Bitiş saat listeleri (06:00–22:00, tek tek chip'ler) birbirinden
  bağımsız — bitiş listesi başlangıçtan önceki saatleri de gösteriyor (örn.
  başlangıç 17:00 seçilse bile bitiş listesinde 06:00–16:00 hâlâ tıklanabilir).
  Bitişin başlangıçtan önce olması zaten anlamsız bir durum, seçilebilir bile
  olmamalı.
- Salonun kendi çalışma saatleri hiç dikkate alınmıyor — antrenör salonun açık
  olmadığı bir saat aralığını da seçebiliyor.
- Gün ve saat seçimi genel olarak fazla adımlı/hantal (7 gün × 2 saat listesi ×
  17 chip) — daha basit bir etkileşim modeli (örn. tek bir saat aralığı
  seçici/slider, ya da "her gün aynı saatler" kısayolu) değerlendirilmeli.

**Çözüldü (31 Ağustos 2026, ADMIN-2 ile birlikte).** Üç maddenin üçü de:
- İki 17'lik çip duvarı kalktı, yerine kelepçeli `TimeStepper`.
- Bitiş artık başlangıçtan önce olamıyor (`endMin = window.start`); başlangıç
  bitişin ötesine itilirse bitiş de birlikte kayıyor, negatif pencere
  kalmıyor — o pencere sessizce hiç slot üretmezdi.
- Salon çalışma saatleri kelepçesi eklendi; salonun kapalı olduğu gün hiç
  açılamıyor.

Detay ADMIN-2 maddesinde.

**İstenen davranış** (kullanıcı notu):
- Başlangıç saati seçildikten **sonra**, Bitiş listesinde yalnızca o saatten
  **sonraki** saatler gösterilsin (geri bir saatte bitiş zaten mümkün değil).
- Gösterilen saatler salonun kendi çalışma saatleri **içinde** kalsın.
- Gün ve saat girişleri daha basit/az adımlı olacak şekilde yeniden tasarlanmalı.

Kapsamı bir UX tasarım kararı gerektirdiği için şimdilik uygulanmadı, buraya
not düşüldü — ileride ele alınacak.

**Önkoşul (29 Ağustos 2026 denetiminde çıktı):** "salon çalışma saatleri
içinde kalsın" maddesi **ADMIN-2 olmadan uygulanamaz** — şemada salon
çalışma saati diye bir alan yok. Bu madde ADMIN-2'den sonra ele alınmalı.

---

### [x] UX-5 · Üye "Randevu al" ekranı ilk açılışta antrenör listesini boş gösteriyordu

**Bulgu (26 Ağustos 2026, kullanıcı testi):** üye "Randevu al" ekranına ilk
girişte antrenör listesi hiç gelmedi ("Henüz antrenör yok" boş durumu),
ekrandan çıkıp tekrar girince liste doğru geldi.

**Kök neden:** [`member/trainers.tsx`](apps/gymentra-mobile/src/app/member/trainers.tsx)
`loading` state'ini `useState(!!activeTenant)` ile mount anında hesaplıyordu.
`AuthContext`'in `activeTenant`'ı henüz yüklemediği ilk render'da bu `false`
oluyor — yani gerçekte hâlâ yükleniyorken ekran "yükleniyor" değil "antrenör
yok" durumunu gösteriyordu. `activeTenant` asenkron gelip effect yeniden
çalıştığında liste düzelirdi, ama kullanıcı o arada boş ekranı görmüş oluyordu.

**Çözüm:** `loading` her zaman `true` ile başlatılır; yalnızca
`watchActiveTrainers`'ın gerçek sonucu (veri veya hata) geldiğinde `false`
olur — `book-session.tsx`'teki `availability === undefined` desteğiyle aynı
yaklaşım. `tsc --noEmit` temiz.

---

### [x] UX-6 · PT randevuları üyenin "Dersler" takviminde hiç görünmüyordu

**Bulgu (26 Ağustos 2026, kullanıcı testi):** üye antrenörden randevu aldı,
antrenör kendi takviminde görebildi, ama üye "Bugün" ekranındaki "YAKLAŞAN
RANDEVU" kartında randevuyu görse de "Dersler" sekmesindeki takvimde o günü
seçince "Bu güne planlanmış ders yok" diyordu.

**Kök neden:** kod hatası değil, kapsam boşluğu. `member/classes.tsx`
(Dersler ekranı) yalnızca `watchClassesForTenant` ile grup derslerini
sorguluyordu — PKG-7/8'in PT randevu modeli (`pt_sessions`) hiç
sorgulanmıyordu. İki özellik ayrı zamanlarda eklenmiş ve hiç birleştirilmemiş.

**Çözüm:**
- `ptSessionRepo.ts`'e `watchSessionsForMember(tenantId, memberId, range, ...)`
  eklendi — `watchSessionsForTrainer`'ın üye tarafındaki eşi, aynı ay
  penceresi deseniyle (mevcut kural ve index zaten üyenin kendi randevusunu
  okumasına izin veriyordu, yeni index gerekmedi).
- `member/classes.tsx`: aynı `range`'i kullanarak PT randevularını da çekiyor,
  takvimin gün noktası sayaçlarına (`countsByDay`) dahil ediyor, ve grup
  dersleri listesinin altına ayrı bir "ÖZEL DERS" bölümü ekliyor (saat,
  antrenör adı, süre, İptal et — `member/index.tsx`'teki iptal akışıyla aynı
  onay/toast deseni: iade olup olmadığına göre farklı mesaj).
- `tsc --noEmit` ve `npx expo lint` temiz. Simülatörde ve kullanıcının kendi
  cihazında doğrulandı (1 Eylül'e gidince "ÖZEL DERS" altında randevu görünür
  oldu).

---

### [x] UX-8 · Üye "Randevu al" ekranı: antrenör listesi yüklenmiyor / sonsuz bekliyor

**Bulgu (27 Ağustos 2026, kullanıcı testi):** üye "Randevu al" ekranında
"Antrenör listesi yüklenemedi" hatası; ikinci girişte hata bile vermeden
boş bir liste ile sonsuza kadar bekliyor.

**İki ayrı kök neden vardı:**

**1. Güvenlik kuralı — üye antrenör listesini hiç okuyamıyordu.**
`tenant_memberships` okuma kuralı yalnızca *kendisi* veya *kiracı personeli*
(admin/antrenör) izni veriyordu. PKG-8'in randevu akışı ise "antrenör seç"
ile başlıyor — yani düz bir **üyenin** antrenör kayıtlarını okuması gerekiyor.
Kural bunu reddediyordu → `permission-denied`. Yani üye bu ekranı hiçbir
zaman kullanamıyordu; PKG-8 canlıda fiilen çalışmıyordu.

*Çözüm:* aktif üye, kendi salonunun `roles` içinde `trainer` bulunan
kayıtlarını okuyabilir. Bilinçli olarak dar — üye hâlâ salonun diğer
**üyelerini** listeleyemez (`memberName`'in her yerde denormalize olmasının
gizlilik gerekçesi korunuyor). 4 yeni kural testi eklendi (üye antrenörü
okur / başka üyeyi okuyamaz / başka salonun antrenörünü okuyamaz / pending
üye okuyamaz).

**2. `sharedWatch` hatadan sonra kalıcı olarak takılıyordu.**
`sharedWatch.ts` bir dinleyici hata verdiğinde `stop`'u dolu, `hasValue`'yu
`false` bırakıyordu. İkinci girişte yeni abone ne yeni dinleyici başlatıyor
(zaten biri var) ne de kayıtlı bir değer alıyor (hiç değer üretilmemiş) —
`onChange` da `onError` da hiç çağrılmıyor, ekran sonsuza kadar `loading`
durumunda kalıyordu. Tam olarak kullanıcının tarif ettiği "hata bile vermeden
bekletiyor" davranışı.

*Çözüm:* `Entry`'ye `lastError` eklendi; başarısız bir dinleyiciye geç
katılan abone kayıtlı hatayı hemen alıyor (ilk değer geldiğinde temizleniyor).

**Not:** bu hata `sharedWatch` kullanan **her** ekranı etkiliyordu
(`watchActiveTrainers`, `watchTenantMembers`, program listeleri) — antrenör
listesinde görünmesinin sebebi, kural hatası yüzünden orada garanti bir hata
üretiliyor olmasıydı.

106 kural testi + 48 mobil test geçiyor. Kurallar production'a deploy edildi
(27 Ağustos 2026).

---

### [x] UX-9 · Legacy `role` alanı tamamen kaldırıldı

**İstek (27 Ağustos 2026):** UX-8'in kural hatası, aynı bilginin iki alanda
(`role` tekil + `roles` dizi) tutulmasından besleniyordu — kullanıcı "eski
alanları tamamen geçersiz hale getirelim ki karışıklık olmasın" dedi.

**Önce doğrulandı:** production'daki 58 `tenant_memberships` kaydının
**hepsinde her iki alan da var** ve hiç uyuşmazlık yok (`role` her zaman
`roles` içinde). Yani `role` saf fazlalık, bilgi kaybı olmadan silinebilir.

**Kaldırılan yerler:**
- `firestore.rules`: `membershipRoles()` fallback'i, antrenör okuma kuralı,
  kendi üyeliğini bitirme kuralı, `allow create` (artık `roles: ['member']`
  bekliyor), `allow update`'in `changedKeys` listesi.
- `gymentra-mobile`: `convert.ts` okuma fallback'i, `membershipRepo.ts`'in
  iki yazma yolu (`requestMembership`, `setMembershipRoles`),
  `tenantRepo.ts`'in salon kurma yolu.
- `tests/firestore.rules.test.ts`: tüm seed'ler `roles` dizisine çevrildi,
  anlamsızlaşan "legacy docs still work" testi silindi.
- `SCHEMA.md`: `role` satırı çıkarıldı, kural açıklaması güncellendi.

**Veri göçü:** `scripts/drop_legacy_role_field.cjs` — idempotent, önce kuru
çalıştırma, `roles` `role`'ü kapsamıyorsa o kaydı atlayıp uyarıyor. 58/58
kayıt temizlendi, sonrasında doğrulandı (`role` olan: 0, `roles` eksik: 0).

**Bilinen geçici etki:** cihazlardaki **eski build'ler** rol atarken hâlâ
`role` yazıyor; yeni kural bunu reddediyor. Yani eski build'de "rol
değiştirme" çalışmaz, yeni build'e geçince düzelir. Diğer akışlar etkilenmez
(okuma yolları zaten `roles`'ü tercih ediyordu).

---

### [x] P0-6 · Salondan ayrılan üye BİR DAHA katılamıyor ⚠️

**İstek (27 Ağustos 2026):** *"Üyeler isterlerse birden fazla salona üye
olabilirler. Salondan ayrılabilir ve tekrar üye olabilirler. Bunların
gerçekleşebileceğini kontrol edelim."*

**Emülatörde bire bir denendi (5 senaryo, `tests/` altında geçici bir dosyayla;
sonuçlar aşağıda). Üçü çalışıyor, ikisi kırık:**

| # | Senaryo | Sonuç |
|---|---|---|
| A | Hiç üyeliği olmayan biri katılma isteği gönderir | ✅ |
| B | Bir salonun üyesiyken **ikinci** bir salona da katılır | ✅ |
| C | Aktif üye salondan kendi ayrılır | ✅ |
| D | **Ayrıldıktan sonra aynı salona yeniden katılır** | ❌ **permission-denied** |
| E | **Reddedildikten sonra yeniden katılır** | ❌ **permission-denied** |

**Kök neden:** üyelik doküman kimliği deterministik — `{tenantId}_{userId}`.
Üye ayrılınca doküman **silinmiyor**, `status: 'left'` olarak duruyor.
`requestJoin` ise aynı kimliğe `setDoc` yapıyor; doküman zaten var olduğu için
bu Firestore kuralları açısından **create değil update**. Update kuralı ise
yalnızca (a) kiracı yöneticisine veya (b) aktif üyenin kendini `left`
yapmasına izin veriyor. `left`/`rejected` → `pending` geçişi hiçbir kuralda yok.

Yani bir üye salondan ayrıldığında **kalıcı olarak dışarıda kalıyor** —
yönetici bile geri alamaz (update kuralı `status`'ü `['active','rejected',
'suspended']` ile sınırlıyor, `pending` yok). Aynı şey reddedilen başvuru için
de geçerli: yanlışlıkla reddedilen kişi bir daha başvuramıyor.

Canlı salonda üye giriş/çıkışı olağan olduğu için P0.

**Ek bulgu — ayrılma ekranı yalan söylüyor:** `LeaveGymButton`'ın onay
metni *"Salon kodunu girerek tekrar katılabilirsin"* diyor. Bu şu anda
**doğru değil**; kullanıcıya yapamayacağı bir şey vaat ediliyor.

#### Karar (kullanıcı, 27 Ağustos 2026)

- **Ayrılma:** yönetici **onayı gerekmez**. Üyeye sorulan "emin misin?"
  ikinci onayı yeterli (bu zaten var, `LeaveGymButton`'daki
  `Alert.alert` — davranış korunacak).
- **Ayrılma:** yönetici **bilgilendirilecek** (onay değil, bildirim).
- **Yeniden katılma:** sıfırdan üye oluyormuş gibi **yönetici onayı
  gerekecek** — yani `pending` durumuna dönüp normal onay kuyruğuna girer.

**Yapılacaklar:**
- Kurala `left`/`rejected` → `pending` yeniden başvuru yolu eklenmeli:
  yalnızca kişinin kendisi, yalnızca `roles: ['member']`, `status: 'pending'`,
  ve `leftAt`/`approvedAt` temizlenerek. Onay yine yöneticide kalır —
  yani üye kendini `active` yapamaz (mevcut create kuralındaki aynı
  kısıt korunur).
- Ayrılma anında yöneticiye bildirim: `sendPushToUser()` altyapısı zaten
  var (PKG-6/PKG-11 bildirimleri bunu kullanıyor); `tenant_memberships`
  üzerinde `status: active → left` geçişini yakalayan bir
  `onDocumentWritten` tetikleyicisi yeterli.
- Yanlışlıkla reddedilen başvuru da aynı yoldan yeniden başvurabilir hale
  gelir (E senaryosu), ayrıca bir yönetici aksiyonu gerekmez.
- Yukarıdaki 5 senaryo kalıcı kural testi olarak eklenmeli (geçici dosya
  silindi; bu davranışın bir daha sessizce kırılmaması için).

#### Çözüldü (27 Ağustos 2026)

**Kural — yeniden başvuru yolu.** `tenant_memberships`'e üçüncü bir
`allow update` eklendi: kişinin kendisi, `left`/`rejected` → `pending`,
`roles: ['member']` ve `permissions: []` zorunlu, `tenantId`/`userId`
değişmez. Değişebilecek alanlar `hasOnly(['status','roles','permissions',
'requestedAt','leftAt','approvedAt'])` ile sınırlı.

İki bilinçli kısıt:
- **`shortCode` izinli alan listesinde YOK.** `assignMembershipShortCode`
  `onDocumentCreated` — yani bu doküman için bir daha asla tetiklenmez;
  üzerine yazılması üyenin giriş kodunu kalıcı olarak yok ederdi. Bu yüzden
  istemci de `setDoc` (değiştir) değil `updateDoc` kullanıyor.
- **`suspended` yeniden başvuramaz.** Ayrılmak kişinin kendi kararı, askıya
  alınmak yöneticinin; askıdaki birinin kendini kuyruğa geri koyabilmesi o
  kararı delerdi.

**İstemci.** `requestJoin` artık önce dokümanı okuyor: varsa `updateDoc` ile
`pending`'e döndürüyor (roller/izinler düz üyeye sıfırlanıyor, `leftAt` ve
`approvedAt` siliniyor), yoksa eskisi gibi `setDoc` ile yaratıyor. Çağıranlar
değişmedi. Ayrılmış üye zaten `primaryRole() === null` olduğu için salon kodu
ekranına düşüyor — yeniden katılma akışı ek bir ekran gerektirmedi.

**Yöneticiye bildirim.** `notifyAdminsOnMemberLeft` (`notifications.ts`):
`status → 'left'` geçişinde salonun **tüm aktif yöneticilerine** push
gönderiyor (tek bir owner alanına değil — salonun birden çok yöneticisi
olabilir ve tenant dokümanının sahibi mutlaka masada duran kişi değil).

**9 kalıcı kural testi** eklendi (5 senaryo + 4 kötüye kullanım): ayrılan
yeniden başvurabilir, reddedilen yeniden başvurabilir, doğrudan `active`
olunamaz, eski antrenör rolünü/`checkin` iznini taşıyamaz, askıdaki
başvuramaz, başkası adına başvurulamaz, `shortCode` değiştirilemez, başka
salona taşınamaz. 115/115 kural testi geçiyor.

**Yan bulgu — UX-9'un kaçırdığı bir güvenlik gerilemesi düzeltildi.**
`deleteMyAccount` (`functions/src/auth.ts`) "salonu yöneticisiz bırakma"
korumasını `where('role','==','admin')` ile yapıyordu. UX-9'da `role` alanı
silindiği için bu sorgu artık **hiç sonuç dönmüyordu** — yani tek yönetici
hesabını silip salonu sahipsiz bırakabilirdi. Her iki sorgu da
`where('roles','array-contains','admin')` olarak düzeltildi.
`functions/src/` içinde başka legacy `role` sorgusu kalmadı (tarandı).

**Not:** `LeaveGymButton`'daki *"Salon kodunu girerek tekrar katılabilirsin"*
metni artık doğru.

---

### [x] P1-8 · Birden çok salonun üyesi olan kişi salonlar arasında geçemiyor

*(4 Eylül 2026 — çözüldü; ayrıntı Kuşak 3 madde 13'te. Bu kutu 8 Eylül
2026'ya kadar yanlışlıkla açık kalmıştı.)*

**Bulgu (27 Ağustos 2026):** güvenlik kuralları çoklu salon üyeliğine izin
veriyor (yukarıdaki B senaryosu ✅) ve veri modeli de destekliyor (üyelik
kimliği `{tenantId}_{userId}`, kişi başına birden çok doküman olabilir).
**Ama istemci bunu hiç kullanmıyor:**

`membershipRepo.ts`'teki `getActiveMembership`, kullanıcının aktif üyeliklerini
sorgulayıp **`snap.docs[0]`** döndürüyor — yani iki salonun üyesi olan biri
her zaman rastgele (Firestore doküman sırasına göre) *bir* salonu görüyor,
diğerine hiç erişemiyor. Salon değiştirme arayüzü yok (`RoleSwitcher` var ama
o **rol** değiştiriyor, salon değil).

Sonuç: özellik veri katmanında var, ürün katmanında yok. Kullanıcı ikinci
salona katılma isteği gönderebilir, onaylanabilir, ama uygulamada göremez.

**Yapılacaklar:** salon değiştirici (aktif salon seçimi, `activeRole` deseniyle
aynı şekilde kalıcı saklanan bir `activeTenantId`), ve `getActiveMembership`'in
tek bir salon varsaymayı bırakması.

---

### [x] UX-7 · Güncellenebilen ekranlara "aşağı çekerek yenile" eklenmeli

**İstek (26 Ağustos 2026, kullanıcı notu):** liste/takvim gösteren ekranlarda
(Bugün, Dersler, Randevularım, Üyelerim, antrenör Takvim'i vb.) standart iOS
pull-to-refresh jesti yok. Bu ekranlar zaten canlı `onSnapshot` dinleyicileriyle
güncel kalıyor, ama kullanıcı alışkanlığı gereği elle "çekip yenileme" isteği
mantıklı — özellikle bağlantı kısa süre koptuysa görsel bir "tazelendi" geri
bildirimi sağlar.

**Kısmen çözüldü (1 Eylül 2026):** `components/useRefreshControl.tsx`.
Jest **plasebo değil** — aboneliği gerçekten yıkıp yeniden kuruyor
(`retryKey`), çünkü çevrimdışıyken düşen bir dinleyici her zaman kendiliğinden
toparlamıyor. Spinner sabit bir süre tutuluyor: yeniden abone olmanın
beklenecek bir tamamlanma sinyali yok ve ilk snapshot önbellekten 20ms'de
gelirse spinner'ı o hızda gizlemek "hiçbir şey olmadı" gibi okunuyor.

Eklendiği ekranlar: Bugün (`member/index`), Dersler (`member/classes`),
Rezervasyonlarım (`member/bookings`), Üyeler (`admin/members`).

**Tamamlandı (1 Eylül 2026):** kalan ekranlar da eklendi — antrenör takvimi,
yönetici paneli, Bugün girenler, Ekip, Paketler, Gelişim. Toplam on ekran.

Her birinde `retryKey`'in **gerçekten bir aboneliğe bağlı olduğu tek tek
doğrulandı**. `trainer/calendar` bunu ilk seferde kaçırmıştı: hook eklenmiş
ama `retryKey` hiçbir `useEffect`'in bağımlılığında değildi, yani jest
spinner gösterip hiçbir şey yapmayacaktı — kaçınmak istediğim plasebonun
tam kendisi.

Kapsam: hangi ekranların gireceğine karar verilmeli (muhtemelen tüm
`ScrollView`/liste ekranları), `RefreshControl` sarmalaması gerekecek. Henüz
uygulanmadı, ileride ele alınacak.

---

### [~] OPS-1 · TestFlight'a geçiş

**İstek (26 Ağustos 2026):** daha fazla test kullanıcısına ulaşmak için
şu anki ad-hoc dağıtımdan (link ile doğrudan kurulum, `preview` profili —
cihaz kaydı gerektiriyor, tek tek UDID eklemek gerekiyor) TestFlight'a
geçilecek (sınırsız test kullanıcısı, UDID kaydı gerekmez).

**Denendi, tek engelde durdu (26 Ağustos 2026):**
`eas build --platform ios --profile production --non-interactive` şu hatayı
verdi: *"Distribution Certificate is not validated for non-interactive
builds... Credentials are not set up. Run this command again in interactive
mode."* — App Store dağıtım sertifikası Apple sunucularında interaktif
Apple ID (+2FA) doğrulaması istiyor; bu ajan headless çalıştığı için bunu
yapamıyor. **Tek bir kerelik manuel adım gerekiyor, kullanıcıdan.**

**Çözüm yolu — App Store Connect API Key (bir kerelik kurulum, sonrası tam
otomatik):**
1. https://appstoreconnect.apple.com/access/integrations/api → "Users and
   Access" → "Integrations" → "App Store Connect API" sekmesi.
2. Yeni anahtar oluştur, rol **Admin** (hem sertifika/profil yönetimi hem
   TestFlight'a submit için gerekli).
3. İnen `.p8` dosyasını (Apple yalnızca **bir kez** indirtir, kaybedilirse
   yeni anahtar gerekir) ve sayfada görünen **Key ID** ile **Issuer ID**'yi
   sakla.
4. Dosyayı ve iki ID'yi bu ajana ilet (dosyayı doğrudan `.p8` içeriğini
   sohbete yapıştırmak yerine, aynı makinede olduğumuz için bir dosya yoluna
   kaydedip yolunu söylemek yeterli).

Bu geldikten sonra ajan tarafında yapılacaklar (kullanıcı müdahalesi
gerekmeden):
- `.p8` dosyası `apps/gymentra-mobile/secrets/` altına taşınır (zaten
  `.gitignore`'da).
- `eas.json`'ın `submit.production` bölümüne `ascApiKeyPath`, `ascApiKeyId`,
  `ascApiKeyIssuerId` eklenir.
- `eas build --platform ios --profile production --non-interactive` —
  sertifika artık API key ile doğrulanacağı için interaktif adım gerekmez.
- `eas submit --platform ios --non-interactive` — App Store Connect'te uygulama
  kaydı yoksa API key'in Admin yetkisiyle otomatik oluşturulur, build
  TestFlight'a yüklenir.
- İç test grubuna (Internal Testing) e-posta ile ekleme yapılır; harici
  testçiler için Apple'ın **Beta App Review**'ından geçmesi gerekir (genelde
  saatler sürer, ilk sürümde 1-2 gün de sürebilir — bu App Store inceleme
  süreci, bizim kontrolümüzde değil).

**Risk değerlendirmesi:** bu geçiş şu anki `preview` (ad-hoc) akışını
**bozmaz** — ikisi paralel, farklı `eas.json` profilleri. Geliştirme
tempo'suna dokunmaz, sadece dağıtım kanalı eklenir. Tek kalıcı risk: `.p8`
anahtarı Admin yetkili — commit edilmemesi ve gitignore'da kalması kritik
(zaten `secrets/` bu şekilde kullanılıyor, bkz. `backfill_*.cjs` scriptleri).

#### İlerleme (26 Ağustos 2026)

- Kullanıcı App Store Connect API Key oluşturdu (Admin rol, Key ID
  `DLVPQCL56S`), `.p8` dosyasını `apps/gymentra-mobile/secrets/` altına taşıdık
  (zaten `.gitignore`'da, `backend/secrets/` ile aynı desen).
- `eas.json`'ın `submit.production.ios` bölümüne `ascApiKeyPath`,
  `ascApiKeyId`, `ascApiKeyIssuerId`, `ascAppId` eklendi.
- İlk App Store dağıtım sertifikası **kullanıcı tarafından interaktif**
  oluşturuldu (`npx eas build --profile production` — ASC API key sayesinde
  Apple ID/2FA sormadı, yalnızca sertifika oluşturma onayı istedi). Bundan
  sonraki production build'ler tam headless çalışabilir (sertifika artık
  EAS sunucularında kayıtlı).
- `eas submit --platform ios --id 07166982-13ed-4cea-8860-94d79f46aa04
  --non-interactive` başarılı — build App Store Connect'e yüklendi
  (submission `82a7ad82-8965-43f3-8882-adef99a04819`). Apple işliyor
  (~5-10 dk), bitince https://appstoreconnect.apple.com/apps/6802950274/testflight/ios
  üzerinden görünür olacak.
- Harici test grubu **"GymEntra Beta Testçileri"** oluşturuldu (App Store
  Connect API üzerinden, `betaGroups`), 3 test kullanıcısı eklendi:
  `basak.cicek@icloud.com`, `hakan_ioglu@hotmail.com`,
  `tuncdemircioglu@gmail.com`.
- Beta App Review için gerekenler dolduruldu: `betaAppReviewDetails`
  (iletişim: Tarkan Çiçek, demo hesap: `trainer.test.tarabya@example.com` /
  `48162026`), `betaAppLocalizations` (açıklama, gizlilik politikası URL'i
  `https://gymentra.salt-tech-apps.com/privacy/`), build'in `betaBuildLocalizations`'ı
  ("what to test" notu).
- Build gruba eklendi ve `betaAppReviewSubmissions` ile incelemeye
  gönderildi — durum **WAITING_FOR_REVIEW**. Apple'ın Beta App Review'u
  bizim kontrolümüzde değil (genelde saatler, ilk sürümde 1-2 gün de
  sürebilir). Onaylanınca 3 test kullanıcısına otomatik davet e-postası
  gider.

---

### [ ] PKG-9 · Seri randevu (haftalık tekrar)

Salon sahibinin istediği kolaylık: *"antrenörün her cuma 08:00–09:00 zamanını
8 ders için al."*

Antrenör seç → haftalık slot seç → **kaç hafta?** (varsayılan = kalan kredi)
→ oluşacak tarihlerin **önizlemesi** → onay. Aynı `bookPtSessions` callable'ı
`slots` dizisiyle çağrılır; atomiklik bedava gelir.

Önizleme kritik: çakışan ya da antrenörün izinli olduğu tarih işaretlenir ve
kullanıcı **atlayıp devam edebilir** — 8 haftanın 3'ü doluyken tüm işlemi
reddetmek kullanıcıyı çıkmaza sokar.

---

### [ ] PKG-10 · Paket dondurma

**Varsayılan politika** (paket bazında admin değiştirebilir):

| Üyelik süresi | Dondurma hakkı |
|---|---|
| 6 aydan kısa | yok |
| 6 ay | 1 kez |
| 1 yıl | 2 kez |
| 2 yıl | 4 kez |

Her dondurma **en az 15 gün**; süre `endsAt`'e eklenir (`frozenDays`) — üye
hakkını kaybetmez, erteler.

`freezeMemberPackage({ memberPackageId, startsAt, days })` callable: kota,
minimum süre ve çakışma kontrolü tek yerde. Kota `freezePolicy.maxCount`'tan
okunur ve **atama anında kopyalandığı için** politika sonradan değişse de
satılmış pakete geriye dönük uygulanmaz.

**Etkileri:**
- Dondurma penceresinde `status='frozen'`; check-in uyarı verir (PKG-3),
  grup dersi rezervasyonu kapanır (PKG-4).
- Periyodik ders hakkı dondurma boyunca **yenilenmez**; kredi son kullanma
  tarihleri de aynı gün kadar ötelenir. Aksi halde üye dondururken hediyesini
  kaybeder.
- Aktif randevular otomatik iptal **edilmez** — donduran kişiye "bu tarihte N
  randevun var" uyarısı çıkar, kararı o verir.

---

### [ ] PKG-11 · İptal ve iade politikası

Kredi **randevu alınırken** düşer (antrenörün zamanı o an rezerve edilir),
dolayısıyla iptalin krediyi geri verip vermediği tanımlanmalı.

Kiracı ayarında `cancellationHours` (varsayılan 24):
- İptal ≥ 24 saat önce → kredi iade (`used--`).
- Daha geç → kredi yanar; **yıkıcı işlem onayında bu açıkça yazar**.
- Antrenör/yönetici iptali → her zaman iade.

`cancelPtSession` callable, aynı transaction disiplini. Kotalı grup dersi
iptali de aynı yoldan geçer (PKG-4).

---

### [ ] PKG-12 · Görünürlük ve raporlama

- **Üye:** Bugün ekranı ve Hesabım'da aktif paket — "Gold · 24 gün kaldı",
  "12 Ders · 5 kaldı · 12 Ekim'e kadar". (D1-1'de veri olmadığı için
  yapılamayan şey buydu.) Bekleyen değişiklik teklifi öne çıkan kart olarak.
- **Admin:** üye satırında paket rozeti; "Yaklaşan bitişler"
  (`tenantId + status + endsAt` index'i bunun için); dondurmadaki üyeler;
  bekleyen teklifler.
- **Ödeme defteri bağı:** paket atarken "ödeme de kaydet" seçeneği `payments`
  kaydı oluşturup `paymentId` ile bağlar.
- **Süre dolumu:** `status`'ü güncel tutan günlük zamanlanmış fonksiyon.

---

### Sıra ve bağımlılık

**Blok 1 — süreli üyelik çalışır hâle gelir.** PKG-1 → PKG-2 → PKG-3 istenen
check-in uyarısını verir. PKG-4 seviyeleri anlamlı kılar; onsuz Silver ile
Gold arasında hiçbir fark yok, yani seviyeler satılamaz.

**Blok 2 — ticari esneklik.** PKG-5 → PKG-6. PKG-6'nın PKG-5'ten sonra
gelmesi bilinçli: onay ekranının "ne değişiyor" özeti promosyonu da
kapsamalı, sonradan eklemek o ekranı ikinci kez yazdırır.

**Blok 3 — ders paketleri kullanılabilir hâle gelir.** PKG-7 → PKG-8. Ders
paketleri bu ikisi olmadan **satılabilir ama kullanılamaz**, o yüzden aynı
blokta. PKG-9 saf kolaylık, üstüne oturur.

**Blok 4 — işletme detayları.** PKG-10 ilk 6 aylık paket dolmadan hazır
olmalı. PKG-11 ilk randevu alınmadan. PKG-12 sürekli birikir.

---

## Önerilen sıra

1. **P0 tamamı** — mağaza reddini engeller (özellikle P0-1 ve P0-2 karar gerektirir).
2. **P1-1, P1-2, P1-3, P1-4** — gerçek veri sızıntısı ve enjeksiyon riskleri.
3. **P2-1, P2-2** — kullanıcının fark ettiği sessiz hatalar.
4. **P3-1** — sorgu limitleri; veri büyümeden ucuz, büyüdükten sonra pahalı.
5. **P5-1** (kural testleri) — bundan sonraki her kural değişikliğini güvence altına alır.
6. **PKG-1 → PKG-2 → PKG-3** — hak tabanlı paketler; süreli üyeliği uçtan
   uca çalıştırır ve check-in'deki "paket yok" uyarısını verir. Salonun
   günlük işleyişinde eksik olan en büyük parça.
7. **PKG-4** — grup dersi hakkının yaptırımı. Onsuz Silver ile Gold arasında
   hiçbir fark yok, yani seviyeler satılamaz.
8. **PKG-5 → PKG-6** — promosyon altyapısı ve üye onaylı paket değişikliği.
   Atanmış paket tek taraflı değiştirilemez; bu ikisi o kuralın altyapısı.
9. **PKG-7 → PKG-8** — antrenör müsaitliği ve üyenin randevu alması. Ders
   paketleri bu ikisi olmadan satılabilir ama kullanılamaz.
10. **PKG-10** — dondurma; ilk 6 aylık paket dolmadan hazır olmalı.
11. Kalanlar önceliklendirilerek (PKG-9/11/12, designplan D2–D3).

---

## RM göç kaydı — 19 Ağustos 2026

Production'a uygulandı ve simülatörde uçtan uca doğrulandı.

**Kod**
- `types.ts` → `roles: MembershipRole[]` + `permissions: MembershipPermission[]`.
- `convert.ts` → `roles ?? (role ? [role] : [])` — eski dokümanlar çalışmaya
  devam ediyor.
- `src/data/membership.ts` (yeni) → yetenek yardımcıları. Ekranlardaki **tüm**
  ham `role === '...'` karşılaştırmaları kaldırıldı.
- Yazma tarafı geçiş boyunca **iki şekli birden** yazıyor (`roles` + `role`),
  böylece kurulu eski build'ler bozulmuyor.
- Sorgular `array-contains`'e geçti.

**RM-4 — kapatılan mevcut hata:** `trainer/index` (Üyeler) ve
`trainer/profile` `role === 'trainer'` şartı koşarken `trainer/programs` ve
`trainer/calendar` admin'i kabul ediyordu; yönetici ayarlardan takvime
girdiğinde "Üyeler" sekmesi kilitli geliyordu. Artık ikisi de `isStaff`.

**Kurallar** — `membershipRoles()` her iki şekli okuyor; `canCheckIn()`
eklendi ve `checkins` kuralı ona bağlandı; membership update artık
`roles`/`permissions` atamasına izin veriyor ama **yönetici kendi admin
rolünü düşüremiyor** (salonu yönetimsiz bırakmasın).

**Doğrulama** — `npm run test:rules` **51/51**, 9'u yeni rol testi:
legacy tek-rol dokümanı, sahip+antrenör bileşimi, düz antrenörün check-in
yapamaması, devredilmiş yetkiyle yapabilmesi ama ödeme defterine
erişememesi, antrenörün kendine yetki verememesi, yöneticinin atayabilmesi,
son yöneticinin rolünü düşürememesi, yetkinin salonlar arası sızmaması,
askıya alınmış üyeliğin hiçbir şey vermemesi.

**Backfill** — 13 doküman, idempotent (ikinci çalıştırmada 0 güncelleme).
`role` alanı **bilerek silinmedi**; tüm istemciler güncellendikten sonra
ayrı bir pasta temizlenecek.

### [x] RM-10 · Üyelik değişiklikleri canlı yayılmıyordu

RM-5'i doğrularken çıktı: `AuthContext` üyeliği **tek seferlik**
(`getActiveMembership`) okuyordu. Yönetici resepsiyondaki antrenöre check-in
yetkisi verdiğinde, antrenörün uygulaması bunu ancak **tam yeniden
başlatmadan sonra** görüyordu — yani RM-2/RM-6'nın asıl kullanım senaryosu
("çıkıyorum, kapıya sen bak") pratikte çalışmıyordu.

**Çözüldü.** `AuthContext` artık üyelik dokümanına `watchMembership` ile
abone. Rol/yetki değişimi ve **askıya alma** anında yansıyor; önbellek de
her değişimde tazeleniyor.

Simülatörde doğrulandı: uygulama açıkken Firestore'dan admin rolü
kaldırıldığında rol değiştirici anında kayboldu.

### [x] RM-11 · Yetki verildi ama antrenörün ekrana ulaşacağı yol yoktu

Kullanıcı bildirdi: yönetici antrenöre üye kabulü yetkisi verdi, antrenör
çıkıp girdi, check-in ekranı açılmadı.

**Sebep — RM-2/RM-6'daki eksiğim.** Yetkiyi güvenlik kuralında ve ekran
korumasında verdim ama **navigasyonu hiç eklemedim**:
- `/admin/checkin` yalnızca admin panelinden (`admin/index.tsx`) linkliydi.
- Antrenörün sekme çubuğunda check-in yoktu.
- Admin paneli `canManageGym` ile korunduğu için antrenör oraya da giremiyordu.
- Üstelik ekran hâlâ `admin/` route grubunun altındaydı; antrenör oraya
  gitseydi kilitli admin sekme çubuğunu görecekti.

Veri tarafı doğruydu (`permissions: ['checkin']` yazılmıştı) — sorun tamamen
erişilebilirlikti. Özellik uçtan uca hiç test edilememişti.

**Çözüldü.**
- `src/app/admin/checkin.tsx` → **`src/app/checkin.tsx`**. Check-in artık role
  değil yetkiye bağlı olduğu için hiçbir rolün sekme grubuna ait değil; kök
  Stack'te paylaşılan bir rota.
- Antrenörün ana ekranına (`trainer/index`) **yalnızca `canCheckIn` doğruysa**
  görünen "Giriş kabul et" kartı eklendi. Kapıda çalışan biri için sık ve
  zaman kritik bir eylem olduğundan profil sekmesine gömülmedi.
- Admin panelindeki kart yeni yola bağlandı.
- Geri butonu `safeBack(router, '/')` — doğrudan deep-link ile açıldığında da
  kullanıcıyı kendi rolünün ana ekranına götürüyor.

Simülatörde antrenör hesabıyla doğrulandı: yetki verilince kart çıkıyor.

---

## WEB — marte06 web uygulamasının kapatılması (19 Ağustos 2026)

Kullanıcı kararı: web uygulaması kapatılacak, **üyeler** GymEntra'ya
taşınacak; dersler, paketler ve üyelik atamaları taşınmayacak.

### [x] WEB-1 · Legacy veri arşivlendi
`backend/archive/marte06-legacy/` — 7 koleksiyon, **224 doküman** JSON olarak
dışa aktarıldı (members 51, lessons 146, packages 5, assigned_packages 9,
payments 9, settings 1, branches 3).

⚠️ Arşiv düz metin şifre içerdiği için `.gitignore`'a eklendi ve
commit edilmiyor.

### [x] WEB-2 · Üyeler GymEntra'ya taşındı
51 legacy üyeden **50'si** `tenant_memberships/tarabya-marte_{uid}` olarak
oluşturuldu: `roles: ['member']`, `status: 'active'`, denormalize ad/e-posta,
tekil 6 haneli kısa kod, `requestedAt`/`approvedAt` orijinal `createdAt`'ten.
İzlenebilirlik için `migratedFromMemberId` alanı eklendi.

Script idempotent yazıldı (deterministik doküman kimliği + mevcut üyelikleri
atlama), yeniden çalıştırıldığında 0 değişiklik yaptığı doğrulandı.

Salon şimdi: **51 üye, 3 yönetici, 2 antrenör** — kısa kod çakışması yok.

**Taşınamayan 1 kayıt:** *Baran Demir* (`WzHcQOIGhzx8f2Ln9xFX`,
demirbarannn10@gmail.com) — Firebase Auth hesabı yok, üyelik dokümanı uid ile
anahtarlandığı için oluşturulamıyor. Ona hesap açmak diğer 50'de olduğu gibi
düz metin şifre üretmek anlamına geleceğinden **bilerek yapılmadı**; salon
kodu (`TARABYA-01`) ile kendisi katılmalı.

### [x] WEB-3 · Düz metin şifreler silindi
Arşivi alırken bulundu: `members` koleksiyonunda **36 kayıtta
`tempPassword`, 6 kayıtta `portalPassword`** açık metin duruyordu. Üye kendi
dokümanını okuyabildiği için kendi şifresini de okuyabiliyordu; yöneticinin
oturumu ele geçirilse 42 kullanıcının (muhtemelen başka yerlerde de
kullandığı) şifresi açığa çıkardı.

42 dokümandan iki alan da silindi, kalmadığı doğrulandı. Auth hesapları
etkilenmedi — kimse giriş yeteneğini kaybetmedi.

### [x] WEB-4 · Site yayından kaldırıldı
`firebase hosting:disable --site tarabyamarte`. `https://tarabyamarte.web.app`
artık HTTP 404 dönüyor. **Geri dönüşlü:** `firebase deploy --only hosting`
ile tekrar yayına alınır. Kod, veri ve kurallar etkilenmedi.

### [x] WEB-5 · Legacy koleksiyon ve kural temizliği
Site kapalı ama legacy koleksiyonlar (`members`, `lessons`, `packages`,
`assigned_packages`, legacy `payments`, `settings`, `branches`) ve onlara ait
güvenlik kuralları duruyor. Bir süre gözlemledikten sonra:
- Kurallardaki legacy blokları ve `isAdmin()` bağımlılığı kaldırılabilir.
- `payments` ayıracı (`!('tenantId' in ...)`) gereksiz kalır; GymEntra
  ledger'ı tek sahip olur (bkz. P1-2 içindeki `gym_payments` notu).
- `createAuthUserOnNewMember` Cloud Function'ı artık tetiklenmeyecek,
  kaldırılabilir.
Acele edilmemeli — arşiv alındı ama geri dönüş kolaylığı için veri yerinde
bırakıldı.

**Güncel envanter (27 Ağustos 2026, production sayımı):**
`lessons` 146 · `members` 51 · `assigned_packages` 9 · `payments` 9
(GymEntra kayıtlarıyla **karışık** — ayıklanması gerek) · `packages` 5 ·
`branches` 3 · `settings` 1.

**Ek bulgu — ölü web kodu bozuk kayıt üretmeye çalışır:**
`marte06/src/pages/member/JoinGymPage.tsx` hâlâ yalnızca `role: 'member'`
yazıyor, `roles` yazmıyor. UX-9'da legacy `role` alanı kaldırıldığı için bu
kod artık güvenlik kurallarını geçemez. Site kapalı olduğundan şu an zararsız,
ama biri yanlışlıkla deploy ederse sessizce kırılır — bu temizlikte
kaldırılmalı (veya web uygulaması tamamen arşivlenmeli).

**Karar (27 Ağustos 2026):** TestFlight test turu sürerken kapsam
büyütülmeyecek; bu madde test turundan sonra ele alınacak.

#### Çözüldü (29 Ağustos 2026)

**Önce arşiv doğrulandı.** Silmeden önce `archive/marte06-legacy/` ile
production **doküman kimliği düzeyinde** karşılaştırıldı — 7 koleksiyon, 224
doküman, ikisinde de birebir aynı, eksik yok. Sayı eşleşmesi yeterli
sayılmadı; arşivde olmayan tek bir doküman bile olsa silme geri alınamaz
olurdu.

**Silme öncesi iki bulgu kullanıcıya soruldu:**
1. `payments` **karışıktı** — 9 dokümanın 4'ü legacy, **5'i GymEntra**
   formatında canlı ödeme kaydıydı. Koleksiyonu topluca silmek canlı defteri
   yok ederdi. (Salon sahibi bu 5 kaydın demo olduğunu doğrulayınca hepsi
   silindi.)
2. 51 legacy `members` kaydından **50'si** `tenant_memberships`'a taşınmıştı;
   **Baran Demir** taşınmamıştı. Kullanıcı bunların arşiv kaydı olduğunu,
   hiçbirinin aktif olmadığını doğruladı.

**Silinen:** 224 doküman — `lessons` 146 · `members` 51 · `assigned_packages` 9
· `payments` 9 · `packages` 5 · `branches` 3 · `settings` 1.
Script: `scripts/purge_legacy_web_collections.cjs` — kuru çalıştırma
varsayılan, ve **her dokümanı silmeden önce arşivde tekrar arıyor**; arşivde
bulunmayan varsa o koleksiyonu atlayıp uyarıyor.

**Kurallar.** 7 legacy blok (`members`, `assigned_packages`, `lessons`,
`packages`, `settings`, `branches`, legacy `payments`) ve artık çağrılmayan 4
yardımcı fonksiyon kaldırıldı. `payments` ayıracı (`!('tenantId' in ...)`)
gereksizleşti — GymEntra bloğu tek sahip. **`isAdmin()` tamamen kaldırıldı**:
platform çapında süper-kullanıcı artık hiçbir yerde yok (P1-6'nın hedefi).
Kural dosyası 718 satıra indi.

**Fonksiyonlar.** `createAuthUserOnNewMember` kaldırıldı — `members`
koleksiyonu silindiği için bir daha tetiklenemezdi. (Silme işlemi
`onDocumentCreated`'ı tetiklemediği için temizlik sırasında da güvenliydi.)

**Testler.** Legacy koleksiyonlara ve `isAdmin`'e dayanan 4 test anlamsızlaştı,
kaldırıldı. Ayrıca kullanıcının bildirdiği "yönetici hâlâ üye kabul edemiyor"
şikayeti için, eski build'in yazdığı **legacy `role` alanını taşıyan** bekleyen
bir başvurunun onaylanabildiğini kanıtlayan kalıcı bir test eklendi — kuralın
suçsuz olduğu böyle doğrulandı (asıl sebep kullanıcının build 4'te olmasıydı).
112/112 geçiyor.

**Yapılmadı — bilinçli:** `marte06/src/` web uygulaması kaynağı silinmedi.
*(Güncelleme, 7 Eylül 2026: monorepo birleştirmesinde kaldırıldı —
`6b1b676c`, artık `backend/` yalnızca Firebase arka ucu.)*
Orada başka bir oturumdan kalan 31 dosyalık commit'lenmemiş çalışma var;
silmek o işi yok ederdi. Web uygulaması artık verisi olmadığı için kesin
olarak ölü — kaynağın arşivlenmesi/kaldırılması ayrı bir iş olarak duruyor
(`JoinGymPage.tsx`'in legacy `role` yazması da orada).

### [ ] WEB-6 · Göç edilen üyelerde veri kalitesi sorunları

Göç sonrası uygulamada görüldü: bazı legacy kayıtlar tek bir `name` alanına
birden çok kişi yazılmış (ör. *"Gonca, Zeyneb Erva, Elif Sena, Ecrin…"*).
Muhtemelen web tarafında grup/aile kaydı olarak kullanılmış.

Bunlar artık ayrı ayrı GymEntra üyeliği olarak görünmüyor; tek bir üyelik ve
tek bir QR kodu paylaşıyorlar. Salon sahibiyle konuşulup ya ayrı üyeliklere
bölünmeli ya da bilinçli olarak böyle bırakıldığı not edilmeli.

### [x] UX-1 · Üyenin "Dersler" ekranında takvim yok

Antrenörün Takvim ekranı ay ızgarası + gün seçimi + seçili günün kompakt
listesi olarak yeniden yazıldı (RM öncesi iş). Üyenin `member/classes.tsx`
ekranı hâlâ **düz bir liste**: `watchClassesForTenant` ile gelen dersler
tarih gruplaması olmadan alt alta diziliyor, üye "yarın ne var?" sorusunu
kaydırarak aramak zorunda.

**İstenen:** antrenör takvimiyle aynı desen —
- Ay ızgarası, bugün otomatik seçili
- Dersi olan günlerde nokta göstergesi
- Seçili günün dersleri altta listelensin
- Başka gün seçilince o günün dersleri gelsin
- "Bugüne dön" kısayolu

**Uygulama notu:** `trainer/calendar.tsx` içindeki takvim mantığı
(`monthCells`, `dayKey`, `isSameDay`, ay gezinme, nokta sayımı) birebir aynı
işi yapıyor. İki ekrana kopyalanmak yerine **paylaşılan bir
`MonthCalendar` bileşenine** çıkarılmalı; aksi halde iki kopya zamanla
birbirinden ayrışır.

Ayrıca `watchClassesForTenant` şu an sınırsız dinliyor — takvim ay bazlı
olacağı için antrenör takviminde yapıldığı gibi **tarih penceresine
bağlanmalı** (`range`), yoksa salonun tüm ders geçmişi her açılışta
okunur.

### [x] UX-2 · Antrenörün üye listesi kaydırılamıyor

`src/app/trainer/index.tsx` — liste **hiçbir kaydırma kabına sarılmamış**;
`<ListGroup>` doğrudan sabit bir `<View style={{ flex: 1 }}>` içinde
render ediliyor. Kardeş ekran `trainer/programs.tsx` aynı listeyi
`ScrollView` içinde gösteriyor, yani tutarsızlık da var.

Test verisiyle 7 üye ekrana sığdığı için görünmüyordu. Legacy göçten sonra
salonun **51 üyesi** olunca ortaya çıktı: ilk ~13 üyeden sonrası tamamen
erişilemez.

**Düzeltme:** listeyi kaydırılabilir hale getir. 51+ satır için `ScrollView`
yerine **`FlatList`** tercih edilmeli — tüm satırları birden render etmek
yerine görünenleri render eder, salon büyüdükçe fark açılır.

Dikkat: `+ Giriş kabul et` kartı ve filtre çipleri kaydırma alanının
**dışında** kalmalı (sabit başlık), yoksa sık kullanılan check-in kısayolu
listeyle birlikte yukarı kayıp kaybolur.

**Aynı sınıf hatayı diğer ekranlarda da kontrol et:** `admin/members.tsx`,
`admin/payments.tsx`, `admin/staff.tsx` ve `trainer/member.tsx` — veri
büyüdüğünde hangileri taşıyor?

### [x] UX-3 · Check-in onay ekranı kötü görünüyor ve akışı kesiyor

`src/app/checkin.tsx` — başarılı taramadan sonraki sonuç bloğu. Ekran
görüntüsünde tek parça dev yeşil bir alan, ortasında küçük yazı ve
tanımsız bir üçgen çıkıyor.

**Dört ayrı sorun:**

1. **`flex: 1` sonuç kartını tüm ekrana yayıyor.** Kompakt bir onay kartı
   olması gerekirken kenardan kenara düz bir yeşil blok oluşuyor.
2. **`✓` karakteri 48pt'de doğru render edilmiyor** — ekranda ince beyaz bir
   üçgen olarak görünüyor (Inter fontunda o glif yok). Antrenman ekranındaki
   play/pause'da yapıldığı gibi **Ionicons** kullanılmalı.
3. **"Yeni tarama" butonu görünmüyor.** `critical` varyantı dolu birincil
   renk kullanıyor, arka plan da `colors.p` — yeşil üstüne yeşil, düz yazı
   gibi duruyor. Yeşil zeminde kontrast veren bir varyant gerekiyor.
4. **Akış kesiliyor.** Resepsiyonda personel arka arkaya onlarca kişi
   okutuyor; her seferinde tam ekran onay + elle "Yeni tarama" dokunuşu
   gereksiz sürtünme. Kısa bir onay gösterip (~1.5 sn) **otomatik olarak
   taramaya dönmeli**, başarıda haptic geri bildirim verilmeli. Hata
   durumunda ise ekranda kalmalı — personelin okuması gerekir.

**Not:** aynı blok hata durumunu da render ediyor; düzeltme ikisini de
kapsamalı. Başarı ve hata görsel olarak bir bakışta ayrılmalı (renk +
ikon), çünkü personel ekrana bakmadan da akışı sürdürmeye çalışacak.

---

## Cihaz testi bulguları — 19 Ağustos 2026

Kullanıcının iOS build üzerinde yaptığı incelemeden çıkanlar.

### [x] DEV-1 · `workout_logs` sorgusu index'siz kalmış (loglardan yakalandı)
P2-1'de eklenen `watch.ts` sarmalayıcısı işe yaradı: Metro loglarında
`Antrenman geçmişi aboneliği düştü: failed-precondition — The query requires
an index` görüldü.

Sorgu `orderBy('startedAt','desc')` kullanıyordu ama deploy edilmiş index
yalnızca `ASCENDING`'di — Firestore'da **sıralama yönü index'in parçasıdır**.
Üyenin Gelişim ekranındaki antrenman özeti ve antrenörün üye detay ekranı
sessizce boş kalıyordu.

`(tenantId, memberId, startedAt DESC)` index'i eklenip deploy edildi.

### [x] DEV-2 · Panel kartları tıklanamıyor + iki kart uydurma veri gösteriyordu
- Check-in sayacı `/checkin` tarayıcısına gidiyordu — sayının **arkasındaki
  listeye** değil. Yeni `admin/today.tsx`: bugün girenler, saatiyle birlikte.
  (Check-in kayıtları yalnızca uid tutuyor; isimler üye listesinden burada
  birleştiriliyor, her tarama dokümanına denormalize edilmiyor.)
- **"7 paketi bitiyor" ve "84B₺ bu ay gelir" sabit yazılmış uydurma
  değerlerdi.** Sırasıyla gerçek bekleyen istek sayısı ve bu ayın onaylanmış
  ödeme toplamıyla değiştirildi.
- Üç kartın hepsi artık ilgili ekrana götürüyor.

### [x] DEV-3 · Admin "Üyeler" sekmesi üyeleri göstermiyordu
Ekran yalnızca `watchPendingRequests` dinliyordu; sekme "Üyeler" adını
taşımasına rağmen **onay kuyruğuydu**. 51 üyesi ve 0 bekleyen isteği olan
salon boş görünüyordu — kullanıcının "ödemelerde üye var ama üyeler ekranında
yok" gözlemi tam olarak buydu.

Aktif üye listesi eklendi (giriş koduyla birlikte), ekran kaydırılabilir
yapıldı ve boş-durum metni düzeltildi.

### [x] DEV-4 · Salon ayarlarından antrenör ekranına düşme
`admin/settings.tsx` "Antrenör takvimleri" satırı `/trainer/calendar`'a
push ediyordu — `trainer/` rota grubuna girmek **tüm sekme çubuğunu**
değiştiriyordu. Yönetici salon ayarlarında gezerken bir anda antrenör
arayüzünde buluyordu kendini; profil hâlâ "admin" diyordu çünkü rol
değişmemişti, **navigasyon** değişmişti.

Check-in ekranındakiyle aynı sınıf hata. Yeni `admin/calendar.tsx` rotası
aynı takvim görünümünü (`TrainerCalendarView` export edildi) yöneticinin
kendi sekme çubuğu içinde render ediyor.

### [x] DEV-5 · "Ekip ve yetkiler" ilk girişte hata veriyordu
Loglardaki `permission-denied` ve `[auth] üyelik yenilenemedi` satırlarıyla
eşleşiyor. Sebep: P1-6'da küresel `admin` claim'ini GymEntra kurallarından
kaldırdım ama `tarkan.cicek@gmail.com` hesabının **hiçbir salonda üyeliği
yoktu** — o pencerede hesap tüm GymEntra verisine erişimini kaybetti.
Hesaba `tarabya-marte`'de admin üyeliği oluşturulunca çözüldü.

Doğrulama için hedefli bir kural testi yazıldı: admin, kiracı geneli
`checkins` sorgusunu çalıştırabiliyor; düz üye çalıştıramıyor.

### [x] UX-1 uygulandı — ortak `MonthCalendar`

Takvim mantığı `src/components/MonthCalendar.tsx` bileşenine çıkarıldı
(ay ızgarası, gün seçimi, ay gezinme, nokta göstergeleri + `startOfDay`,
`isSameDay`, `dayKey` yardımcıları). **Antrenör takvimi de bu bileşene
geçirildi** — kopyalanmadı, ikisi tek kaynağı kullanıyor.

Üyenin Dersler ekranı yeniden yazıldı: bugün otomatik seçili, dersli günlerde
nokta, altta seçili günün dersleri, "Bugüne dön" kısayolu, hata durumu.

**Sorgu sınırlandırıldı:** `watchClassesForTenant` artık zorunlu bir
`range` alıyor. Üç çağrı yeri de kendi penceresini veriyor — üye takvimi
±1 hafta paylı ay, üye ana ekranı yalnızca bugün, yönetici ders yönetimi
ayın başından itibaren 3 ay. Öncesinde tüm gelecek dersler `limit(100)` ile
çekiliyordu.

---

### [x] DEV-6 · Yetki ekranları çıkışsız kilitli akıştı

Kullanıcı bildirdi: *"simülatör ekranında 'salon antrenör oturumu gerekli'
mesajı var ama çıkış (logout) imkanı vermiyor."*

11 ekran (`admin/{settings,members,calendar,payments,staff,classes}`,
`trainer/{index,calendar,member,programs,profile}`) yetki yoksa çıplak bir
kilit ikonu ve tek cümle basıyordu. Sekme çubuğu yalnızca aynı kilitli yüzeyin
ekranları arasında dolaştığı için, yanlış yüzeye düşen ya da üyeliği iptal
edilen kullanıcının ne geri dönüş yolu ne de oturum kapatma imkânı vardı —
AGENTS.md §2'nin açıkça yasakladığı kilitli akış.

**Çözüm:** Ortak `components/AccessGuard.tsx`. İki çıkış yolu sunuyor:
üyelik *bir* rol veriyorsa "Ana ekranıma dön" (`primaryRole` → `ROLE_HOME`),
ve her durumda `confirmDestructive` onaylı "Çıkış yap". 11 ekranın hepsi buna
geçirildi; iki ekrandaki açıklama metni `hint` olarak korundu.

Yan düzeltmeler: `ROLE_HOME` artık `Record<MembershipRole, Href>` — üç
çağrı yerindeki `as never` kaçamağı kalktı. `AccessGuard` bilerek `<Screen>`
sarmıyor: rol layout'ları zaten bir tane render ediyor ve
`react-native-safe-area-context` iç içe geçtiğinde üst inset'i iki kez
uyguluyor.

Görsel olarak simülatörde doğrulandı (buton render oluyor); onay diyaloğu
simülatörde dokunma kaydedilmediği için **tıklanarak doğrulanmadı**.

### [x] DEV-7 · Oturum kapatma hiçbir yere yönlendirmiyordu

DEV-6'yı simülatörde doğrularken çıktı: `AccessGuard`'ın "Çıkış yap" butonu
çıkışı tetikliyor ama uygulama aynı ekranda kalıyordu — buton `…` durumunda
donuyor, kullanıcı hâlâ kilitli yüzeyde.

Sebep: kimlik durumuna göre yönlendirme **yalnızca** `app/index.tsx` içindeydi
ve o effect sadece o ekran mount olduğunda çalışıyor. Başka bir yerden çıkış
yapıldığında (profil ekranı ya da `AccessGuard`) dinleyici `user`'ı
temizliyor, fakat hiçbir şey navigasyon yapmıyordu. Yani sorun DEV-6'dan
önce de vardı; profil ekranındaki çıkış da aynı şekilde takılıyordu.

**Çözüm:** `context/AuthRedirect.tsx` — `ThemeSync` gibi başsız, `AuthProvider`
içinde mount ediliyor, dolayısıyla tek bir route'u değil tüm uygulamayı
izliyor. Oturum kapalıysa ve bulunulan yol herkese açık değilse
(`/` launcher ile `/onboarding/*` hariç) `/onboarding/register`'a
yönlendiriyor.

Simülatörde doğrulandı: oturum kapalıyken `gymentramobile://trainer` derin
bağlantısı artık kayıt ekranına düşüyor.

## [~] VC-1 · **GymEntra hiçbir sürüm kontrolünde değil** ⚠️

P5-5 (CI/CD) için depoya bakarken çıktı ve CI'dan çok daha acil:

```
$ git status --short | grep gymentra
?? gymentra-mobile/
?? gymentra-site/
```

`gymentra-mobile/` ve `gymentra-site/` **hiçbir git deposunda takip
edilmiyor**. Bu oturumda yazılan her şey — rol modeli, takvimler, güvenlik
düzeltmeleri, göç script'leri — yalnızca bu diskte duruyor. Yedek yok, geçmiş
yok, bozulan bir değişikliği geri alma imkânı yok.

**Depo durumu**
| Depo | Durum |
|---|---|
| `Marte/.git` (MarteSporManagement) | Son commit **1 yıl önce**, 21.295 bekleyen değişiklik (çoğu `gym-management/node_modules` silmesi). Terk edilmiş. `gymentra-mobile` içinde **0 dosya** takipli. |
| `marte06/.git` | Sağlıklı, 2 hafta önce commit'lenmiş. Bu oturumdaki kural/index/function değişikliklerim **commit edilmemiş** durumda. |

**İyi haber:** `gymentra-mobile/.gitignore` hazır ve doğru — `node_modules`,
`.expo`, imzalama anahtarları ve **`.env`** dışlanmış. Kaynak yalnızca
~1,2 MB (src + assets).

**Öneri**
1. `gymentra-mobile` için **kendi deposunu** başlat (dış repo'nun 21 bin
   değişiklikli hali temizlenmeden ona eklemek riskli).
2. `gymentra-site` de ayrı veya aynı depoda takibe alınsın.
3. `marte06`'daki bekleyen kural/function değişiklikleri commit'lensin.
4. **Bundan sonra** CI kurulsun (P5-5) — takip edilmeyen bir depoda CI
   anlamsız.

### Yapılanlar — 19 Ağustos 2026

- [x] `gymentra-mobile` kendi deposuna alındı:
      **https://github.com/SaltTechSolutions/gymentra-mobile** (private, `main`).
      126 dosya, ilk commit.

      Push öncesi sır denetimi yapıldı: `.env` dışlandı (uzakta olmadığı
      API ile doğrulandı), imzalama anahtarı yok, tüm dosyalarda
      `AIza…` / `-----BEGIN` / token taraması temiz. `.env.example` yalnızca
      boş şablon.

- [x] `gymentra-site` kendi deposuna alındı:
      **https://github.com/SaltTechSolutions/gymentra-site** (private, `main`).

- [x] `marte06`'daki bu oturuma ait değişiklikler commit'lendi (`4210f0c`):
      kurallar, indexler, `firebase.json` predeploy hook'u, Cloud Functions
      ve 1073 satırlık kural testi.

      **Yalnızca bu oturumun dosyaları** commit'lendi. Depoda 44 adet
      bana ait olmayan bekleyen değişiklik var (`src/App.tsx`, silinmiş
      `AppShell` dosyaları, design-system sayfaları) — yarım kalmış başka
      bir işle kendi değişikliğimi aynı commit'e karıştırmadım.

- [ ] **`marte06` push edilmedi.** Dal `refactor/mobile-ui`, origin'in
      4 commit önünde; bunların 3'ü bana ait değil. Push etmek onları da
      yayınlar — bu kullanıcının kararı.

- [x] CI kuruldu (P5-5).

---

## CEO-REV · Plan incelemesi — 20 Ağustos 2026 (HOLD SCOPE)

`/plan-ceo-review`, HOLD SCOPE modu. Kapsam sabit tutuldu: hata görünürlüğü,
PKG-1→8 doğrulaması, kritik testler, veri bütünlüğü ve canlı salon cutover'ı.
Yeni özellik kapsamı eklenmedi.

### Premise challenge — planın kendi sırası ihlal edilmiş

Plan "Önerilen sıra"da **1. P0 tamamı** diyor. P0-1 (IAP aboneliği) hâlâ açıkken
PKG-1→8 tamamlandı. Yani mağazaya çıkamayan bir uygulamaya sekiz paketlik yeni
özellik eklendi. Asıl kısıt "özellik eksikliği" değil, **"hiçbiri canlıda
çalışmıyor ve çalışmadığını görecek bir mekanizma yok"** imiş.

### NOT in scope (bilinçli ertelenenler)

| Madde | Gerekçe |
|---|---|
| PKG-9 · Seri randevu | Veri bütünlüğü kapanmadan kolaylık özelliği eklemek riski çoğaltır |
| PKG-10 · Paket dondurma | Aynı gerekçe; ayrıca PKG-11'e bağımlı |
| PKG-12 · Raporlama | Aynalar güvenilir olmadan rapor yanlış sayı üretir |
| P4-1→7 · Ürün boşlukları | HOLD SCOPE dışı; canlı salonun bugünkü sorunu değil |
| Codex #11 · Değişim ekonomisi | Gerçek ama CRITICAL değil; PKG-11 ile birlikte ele alınmalı |
| Codex #13 · Tenant saat dilimi | Tek salon tek saat diliminde; beyaz etiket ihracatında zorunlu olacak |
| Codex #15 · functions monoliti | 1.099 satır; refactor kapsamı, davranış değişmiyor |
| Paylaşılan scheduling paketi | F4'te sözleşme testi tercih edildi; monorepo karmaşıklığına girilmedi |

### What already exists (yeniden kullanılan)

- `watch.ts` sarmalayıcısı — hata geri çağrısı altyapısı var, yalnızca
  `console.warn`'dan Sentry'ye bağlanması gerekiyor.
- `ListSkeleton` — yükleniyor durumu için bileşen zaten mevcut, iki yeni
  ekranda kullanılmamış.
- `member_entitlements`'ın `endsAt > request.time` deseni — F6'daki
  `expiresAt` filtresi bunun birebir kopyası.
- 102 kural testi + emülatör altyapısı — yeni kural testleri buraya eklenir.
- `bookPtSessions`'ın isimli `HttpsError` mesajları — kullanıcıya gösterilecek
  metin sunucuda zaten yazılı, istemci onu atıyor.

### Dream state delta

```
BUGÜN                       BU TURDAN SONRA              12-AY İDEALİ
8 paket kodda,        →  8 paket canlıda ve        →  Mağazada, ödeme alan,
hiçbiri deploy                doğrulanmış, hatalar        çok salonlu, hatası
edilmemiş, sıfır test,        görünür, veri bütün,        dakikalar içinde
sıfır hata izleme             51 üye geçirilmiş           fark edilen ürün
```

Bu tur, ideale giden yolu **açıyor**; P0-1 (IAP) hâlâ tek gerçek yayın engeli
ve dış hesap kurulumuna bağlı.

### Failure Modes Registry

| Kod yolu | Hata modu | Yakalanıyor? | Test? | Kullanıcı görüyor? | Loglanıyor? |
|---|---|---|---|---|---|
| 8 PKG Cloud Function | Hiç deploy edilmemiş | H | H | Sessiz/yanlış davranış | H → **CRITICAL** |
| 22 × `} catch {}` | İsimli hata yok ediliyor | K (yutuluyor) | H | Genel "tekrar dene" | H → **CRITICAL** |
| `watch.ts` düşen abonelik | `console.warn` | K | H | Hiçbir şey | Sadece dev → **CRITICAL** |
| `bookPtSessions` trainerId | Doğrulanmıyor | H | H | Hayalet randevu, kredi yanar | H → **CRITICAL** |
| `member_credits.expiresAt` | Okurken kontrol yok | H | H | Ölü kredi harcanabilir | H → **CRITICAL** |
| Check-in son kredi (Codex #1) | `exhausted` sorgudan düşüyor | H | H | Kapıda "paketin yok" | H → **CRITICAL** |
| `renewEntitlementCredits` (Codex #2) | `exhausted` yenilenmiyor | H | H | Hak kalıcı kayıp | H → **CRITICAL** |
| `applyPackageChange` trigger (Codex #6) | Trigger düşerse onay askıda | H | H | "Onaylandı" ama paket yok | H → **CRITICAL** |
| Eski paket kredileri (Codex #9) | İptal edilmiyor | H | H | Çift hak harcama | H → **CRITICAL** |
| 4 denormalize ayna | Kayma tespiti yok | H | H | Kural yanlış karar verir | H → **WARNING** |

**10 satırın 9'u CRITICAL GAP.**

### Implementation Tasks

Sırayla; T1–T3 bitmeden T14 (deploy) yapılmaz.

- [x] **T1** — functions — Check-in ve yenilemede `exhausted` kredi körlüğünü kapat
  - Kaynak: Codex #1 ve #2, kodda doğrulandı (`checkinRepo.ts:84`, `functions/src/index.ts:570`)
  - **Çözüldü (plan-eng-review Faz 1.1+1.2+1.3, 20-22 Ağustos 2026).** `resolveAccess` artık `hasSessionToday`'i kredi kontrolünden bağımsız ve önce çağırıyor — randevunun varlığı tek başına erişim kanıtı. Yenileme `renewEntitlementCredits` → `creditRollover`'a taşındı: `status in ['active','exhausted']` sorguluyor, eski krediyi expire etmek ve yenisini açmak artık tek transaction (deterministik `{creditId}_next` id ile idempotent). Regresyon testleri: mobil `checkinRepo.test.ts`, functions `packages.creditRollover.test.ts`.
- [x] **T2** — functions — Kredi geçerlilik zinciri: `expiresAt > now` filtresi + randevu tarihinde geçerlilik + günlük `expired` işi
  - Kaynak: F6 + Codex #5
  - **Çözüldü (Faz 1.4, aynı tur).** `bookPtSessions` artık `expiresAt > now` filtreli sorguluyor ve her slotu yalnızca KENDİ süresinden önce biten bir kredi ödeyebiliyor (üst toplam yerine slot-bazlı uygunluk). `creditRollover` (T1) günlük expire işini zaten üstleniyor, ayrı bir iş gerekmedi.
- [x] **T3** — functions — Paket değişikliği bütünlüğü: callable transaction'a taşı (#6), tenant sınırı doğrula (#7), aktif paket tekilliği (#8, #14), eski kredileri iptal et (#9), süresi dolan promosyonda teklifi iptal edip yeniden onay iste (#10)
  - Kaynak: Codex #6–#10, #14
  - **Çözüldü (Faz 1.6, en büyük madde).** `applyPackageChange` trigger → `approvePackageChange` callable. Üyenin `status` yazımı kuralda tamamen kapandı; onay/red ikisi de callable'dan. Tenant sınırı, çift-onay reddi (`currentPackageAssignmentId` artık `active` değilse reddediliyor), eski kredilerin `cancelled` yapılması, süresi dolmuş promosyonda tüm swap'ın reddedilip isteğin `expired` yapılması — hepsi uygulandı. 9 emülatör testi.
- [x] **T4** — functions — `bookPtSessions` slot doğrulaması: ızgara hizası, bitişin pencere içinde kalması, mükerrer slot, süre çakışması
  - Kaynak: Codex #4
  - **Çözüldü (Faz 1.5+1.7, aynı tur).** `isWithinAvailability` ızgara hizası ve bitiş kontrolünü de yapıyor artık; mükerrer slot istekte reddediliyor. Ayrıca `pt_sessions` deterministik `{tenantId}_{trainerId}_{epochMs}` id'ye geçti — sorgu+auto-ID'nin verdiği yanlış eşzamanlılık garantisi (phantom read) düzeltildi.
- [x] **T5** — functions — `bookPtSessions` antrenör yetkisi: üyelik var mı, `active` mi, `roles`'ta `trainer` var mı
  - Kaynak: F3
  - **Çözüldü (Faz 1.8, aynı tur).** `trainerMembershipSnap` artık yalnızca isim için değil, varlık/aktiflik/rol için de kontrol ediliyor.
- [x] **T6** — functions+mobile — PKG-11 (iptal ve iade) — PKG-8'in zorunlu bağımlılığı, atlanamaz
  - Kaynak: Codex #3
  - **Çözüldü (Faz 1.9, 22 Ağustos 2026).** Yeni `cancelPtSession` callable: antrenör/admin her zaman iade, üye yalnızca `tenants.cancellationHours` (varsayılan 24s) öncesinde iade. Kredi bağlı bir `pt_sessions` dokümanının doğrudan `status:'cancelled'` yazımı kuralda herkese kapatıldı. Mobil: `trainer/calendar.tsx`'in mevcut iptal yolu callable'a taşındı, üye tarafında hiç olmayan iptal UI'ı `member/index.tsx`'e eklendi. 10 emülatör testi + 1 kural testi.
- [x] **T7** — mobile+functions — Hata görünürlüğü: 22 `catch`'te `HttpsError.message` kullan + Sentry entegre et + `watch.ts` oraya raporlasın
  - Kaynak: F2
  - **Çözüldü (Faz 2.1+2.2, 24 Ağustos 2026).** `data/errors.ts` (reportError/errorMessage) — 24 catch bloğu (dosya değişince 22'den 24'e çıktı) güncellendi. Sentry yerine GlitchTip (aynı protokol, ücretsiz): mobil `@sentry/react-native` + sunucu `@sentry/node`, ikisi de yalnızca beklenmeyen hataları raporluyor. `watch.ts`'in düşen abonelik raporu koşulsuz raporluyor. Mobil taraf yeni EAS build gerektiriyor — henüz build alınmadı.
- [x] **T8** — functions — 4 ayna için mutabakat işi (sapma bulur, düzeltir, raporlar)
  - Kaynak: F8
  - **Çözüldü (Faz 2.3, 25 Ağustos 2026).** `reconcileMirrors` — dördünü de (activeMemberCount, activeAssignmentCount, member_entitlements, trainer_busy_slots) kaynağından yeniden türetip sapmayı düzeltiyor, öksüz kayıtları temizliyor. Günlük değil **haftalık**: `member_packages`/`member_credits` yazma yollarının çoğu `updatedAt` üretmediği için delta tarama şimdilik mümkün değil, tam tarama yapıyor — tek kiracılı pilot ölçeğinde maliyetsiz. 9 emülatör testi.
- [x] **T9** — scripts — Canlı salon cutover: 51 üye için idempotent backfill, önce kuru çalıştırma, etiketli/geri alınabilir
  - Kaynak: Codex #12. **Salon sahibiyle hangi paket/bitiş tarihi kararı gerekiyor.**
  - **Uygulandı (25 Ağustos 2026).** Karar: Silver paketi (yeni oluşturuldu — `gym_packages` bu tenant için tamamen boştu, `tarabya-marte` PKG-1'den önce göç ettiği için hiç `seedDefaultPackages` görmemiş; 0₺ placeholder, yalnızca `gymAccess`), bitiş 1 Kasım 2026. `scripts/backfill_silver_2026-11-01.cjs` — dry-run ile doğrulandı (51 aday, 0 atlanan), `--apply` ile gerçek yazım yapıldı: 1 `gym_packages` + 51 `member_packages`, hepsi `backfillBatch` etiketli (`--revert [--apply]` ile toplu geri alınabilir).

    **Sıralama sapması, bilerek not düşülüyor:** Faz 4 planı backfill'in *deploy'dan sonra* (trigger'lar canlıyken) koşmasını öngörüyordu ki `activeAssignmentCount`/`member_entitlements` otomatik dolsun. Sekiz fonksiyon T14'te henüz deploy edilmediği için bu 51 yazım o aynalara şu an yansımıyor (`gym_packages.activeAssignmentCount` hâlâ 0). Veri bozulması değil — `reconcileMirrors` (T8) tam bunun için var; T14'te deploy olunca (veya elle tetiklenince) kendiliğinden düzelir.

    **Ayrıca:** `scripts/` altındaki 8 eski script (artık kırık `admin.apps`/`admin.credential.cert`/`admin.firestore()` API'siyle yazılmış — firebase-admin@14 flat/modular API'ye geçmiş) kullanıcı isteğiyle silindi; `package.json`'daki ölü referansları da kaldırıldı.
- [x] **T10** — mobile — Vitest kur; saf mantık testleri: `computeFreeSlots` kenar durumları, oransal iade, `applyPromotionEffect`, `entitlementRows`
  - Kaynak: F5
  - **Çözüldü (Faz 0.1 + Faz 3.1'de zaten tamamlanmıştı).** `computeFreeSlots` (13 test), `applyPromotionEffect` (4), `computeProratedRefund` (4), `entitlementRows` (5) — hepsi ayrı test dosyalarında.
- [x] **T11** — functions+mobile — `isWithinAvailability` sözleşme testi (aynı vaka tablosu iki tarafta)
  - Kaynak: F4
  - **Çözüldü (Faz 3.2, 25 Ağustos 2026).** `isWithinAvailability` export edildi; 10 vakalık birebir aynı tablo iki repoda da (`sessions.isWithinAvailability.test.ts` ve `availabilityContract.test.ts`) çalışıyor.
- [x] **T12** — mobile — `book-session.tsx` ve `availability.tsx`'te boş `View` yerine `ListSkeleton`
  - Kaynak: F7
  - **Çözüldü (Faz 3.3, aynı tur).**
- [x] **T13** — mobile — Tab başlıkları (`title`) commit'lenecek — geri butonu "profile" yazıyordu
  - Kaynak: Bölüm 11, simülatörde canlı yakalandı, düzeltme yapıldı ve commit'lendi (`5f51b34`).
  - **Simülatörde reload ile teyit edilmedi** — kullanıcı isteğiyle sona ertelendi (T14'ün simülatör doğrulama adımına dahil).
- [ ] **T14 (P1, human: ~1s / CC: ~15dk)** — deploy — T1–T9 bittikten SONRA: 8 fonksiyon + kurallar + indexler deploy, ardından simülatörde PKG-1→8 uçtan uca doğrulama
  - Kaynak: F1. **Production deploy — kullanıcı onayı zorunlu.**

## PER — Persona kullanım testi (2 Eylül 2026)

Dört persona (salon sahibi, antrenör, kadın üye, erkek üye) ile 53 ekranın
tamamı, gerçek kullanıcının izleyeceği sırayla gezildi. Tam rapor, adım
adım turlar, "fazla bulunanlar" ve 40 maddelik talep listesi:
**`personatalepleri.md`**. Buradaki maddeler o rapordan plana alınanlar;
numaralar raporun kendi kodlarından (H/D/Z/B) bağımsız, plan içi sıradır.

**Yöntem sınırı:** kod düzeyinde akış takibi, canlı cihaz turu değil.
Bulguların hepsi kodun kesin yaptığı şeyler (ölü buton, okunmayan alan,
eksik ekran); algısal bulgular (yavaşlık, okunabilirlik) bu turda yok.

**Kullanıcı kararları (2 Eylül 2026):**
- Kotalı grup dersi paketi **satılacak** → PER-9 Kuşak 2.
- Cinsiyet alanı / kadın antrenör filtresi / kadınlara özel saat →
  **şimdilik hayır**, P3 kuyruğu.
- Grup dersinde antrenör **tam yetki** → PER-8 kapsamı geniş.
- Üyelerin çoğu PT/grup, ağırlıkçı azınlık → PER-17 iki parçaya indirildi.
- Hazır program şablonları **eklenecek** (PER-18): ortak kütüphane + salon
  kopyası, ısınma otomatik ön blok, 6 başlık × 2 seviye, yalnızca
  antrenör/salon atar.
- Hareket görselleştirici (PER-19): kas haritası **46 kanonik harekete**,
  poz kareleri de aynı 46'ya; üyeye antrenman sırasında açık; PER-18 ile
  aynı iş sayılıyor.
- **Yönetici her zaman antrenördür** (2 Eylül 2026): `canCoach` admin rolünde
  de `true`. Küçük salonda sahip aynı zamanda çalıştırıyor; sahibin üyeye
  program yazamaması savunulabilir değildi. Yetenek ile yüzey ayrı tutuldu —
  yönetici antrenör sekme çubuğu almaz, `admin/builder` gibi kendi route'unda
  ekranı görür. Kural olarak `AGENTS.md` §4b'ye yazıldı; `membership.test.ts`
  koruyor.

Raporun plan.md'yle çelişen iki bulgusu bağlamla düzeltildi: kotalı grup
dersi "satılan özellik çalışmıyor" değil, PKG-4'ün bilinçli sınırıydı
(karar onu şimdi gerçek eksik yaptı); "borçlular / yaklaşan bitişler"
zaten PKG-12'nin içindeydi, yeni madde açılmadı.

| # | Madde | Kuşak | Kaynak |
|---|---|---|---|
| [ ] PER-1 | `pending.tsx` ölü "Salonu ara" butonu (+ onay bekleyenin salon telefonunu okuyamaması) | 1.5 | Z-9 |
| [ ] PER-2 | Şifremi unuttum akışı | 1.5 | Z-5 |
| [ ] PER-3 | Kayıtta KVKK / şartlar onayı | 1.5 | Z-6 |
| [ ] PER-4 | `reps` antrenman ekranında gösterilmiyor (hata) | 1.5 | B-4 |
| [ ] PER-5 | "Tümünü onayla" limit dolunca N kez paywall (hata) | 1.5 | H-7 |
| [ ] PER-6 | Antrenör randevusunda çakışma kontrolü yok (veri bütünlüğü) | 1.5 | D-4 |
| [ ] PER-7 | Antrenöre üyenin paketi + kalan hakkı | 2 | D-1 |
| [ ] PER-8 | Grup dersi antrenöre açılır: `trainerId`, katılımcı listesi, yoklama, "Derslerim" | 2 | D-2, H-5 |
| [ ] PER-9 | Kotalı grup dersi rezervasyon callable'ı | 2 | Z-2 |
| [ ] PER-10 | Seri ders — PKG-9 ile tek iş | 2 | H-4 |
| [ ] PER-11 | İptal metni sabit "24 saat" → `cancellationHours`'tan (PKG-11 içinde) | 2 | Z-8 |
| [ ] PER-12 | Admin üye listesinde arama + filtre + sayfalama | 2 | H-6 |
| [ ] PER-13 | Ders/randevu hatırlatıcısı (P4-3 ile birlikte) | 3 | Z-3 |
| [ ] PER-14 | No-show durumu, antrenör izin günü, üye notu | 3 | D-5, D-6, D-3 |
| [ ] PER-15 | Üyeden yenileme talebi | 3 | Z-7 |
| [ ] PER-16 | Duyuru / toplu bildirim (+ promosyonun üyeye görünmesi) | 3 | H-10 |
| [ ] PER-17 | WORKOUT: çok günlü program + "geçen sefer" | 3 | B-1, B-3 |
| [ ] PER-18 | Hazır program şablonları (ortak kütüphane + ısınma ön bloğu) — PER-17 ile tek iş | 3 | kullanıcı isteği |
| [x] PER-19 | Hareket görselleştirici — 46 hareket, kas haritası + poz kareleri, göz atılabilir liste, personel sorun bildirimi (2 Eylül 2026: kod + kurallar deploy edildi; poz kareleri antrenör onayı bekliyor, atama bağı PER-17'de `exerciseId`'ye taşınacak) | 3 | Claude Design + kullanıcı isteği |

Kuyruğa yazılanlar (P2/P3) "KALAN İŞLER → Kuyruk" altında; ayrı madde
açılmadı, karar verildiğinde açılır.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | mode: HOLD_SCOPE, 9 critical gaps |
| Outside Voice | codex (plan review) | Independent 2nd opinion | 1 | issues_found | 15 bulgu (9 CRITICAL, 5 HIGH, 1 WARNING); 2'si kodda doğrulandı |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX:** 15 bulgu; #1 (son kredi check-in'i bozuyor) ve #2 (tükenmiş kredi hiç yenilenmiyor) kodda birebir doğrulandı. #3–#9 kabul edildi, T1–T6'ya dağıtıldı. #11/#13/#15 bilinçli ertelendi.

**CROSS-MODEL:** Tek çelişki #10 — süresi dolan promosyonun sessizce düşürülmesi. `plan.md:1412-1419`'daki önceki karar (sessizce düşür, temel değişikliği uygula) **değiştirildi**: teklif iptal edilip yeniden onay istenecek. Gerekçe: PKG-6'nın varlık sebebi "üye onayı olmadan paket değişmez"; onay sonrası fiyatı değiştirmek o ilkeyi deler. Geri kalan 14 bulguda çelişki yok — dış ses, incelemenin kaçırdıklarını buldu.

**VERDICT:** CEO review tamamlandı (HOLD SCOPE, kapsam korundu, 14 görev üretildi). **NOT CLEARED** — eng review çalıştırılmadı ve 9 CRITICAL veri bütünlüğü açığı kapatılmadan T14 (production deploy) yapılamaz.

**Not:** `bun` kurulu olmadığı için `gstack-review-log` doğrulama adımını çalıştıramadı; kayıtlar binding alanları olmadan `main-reviews.jsonl`'e yazıldı. Staleness tespiti bu satırlar için heuristik'e düşer.

NO UNRESOLVED DECISIONS
