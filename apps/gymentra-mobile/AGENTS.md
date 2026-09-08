# GymEntra — Geliştirme Kuralları

GymEntra, spor salonları için beyaz etiketli bir üyelik/antrenman yönetim
mobil uygulamasıdır. Expo SDK 57 (React Native) + Firebase.
Üç rol: **üye**, **antrenör**, **salon yöneticisi**.

---

## 0. Expo DEĞİŞTİ

Kod yazmadan önce sürüme özel dokümanı oku:
https://docs.expo.dev/versions/v57.0.0/

Ezberden Expo/React Native API'si yazma. SDK 57 birçok API'yi değiştirdi.

---

## 1. Referans dosyaları — ne zaman okunmalı

Token verimliliği için bu dosyalar **her oturumda değil, yalnızca ilgili iş
yapılırken** okunur:

| Dosya | Ne zaman oku |
|---|---|
| `../SCHEMA.md` | Veritabanı şeması, koleksiyon ilişkisi, güvenlik kuralı, yeni sorgu veya index işi yaparken. **Veri katmanına dokunan her değişiklikten önce zorunlu.** |
| `../plan.md` | İyileştirme/hata giderme işine başlarken; bir madde tamamlanınca güncellemek için |
| `../designplan.md` | UI/UX tasarım işi yaparken |

**Şema değiştiyse `SCHEMA.md` aynı commit içinde güncellenir.** Kod ile
şema dosyası çelişirse kod doğrudur; dosya hemen düzeltilir.

---

## 2. Önce UX

Bu bir mobil uygulamadır ve **neredeyse tamamen telefondan** kullanılacaktır.
v1'de tablet desteği yok, yalnızca dikey yön.

- Her UI ve akış kararı önce kullanılabilirlik üzerinden savunulmalı.
  "Güzel görünüyor" gerekçe değildir.
- **Dokunma hedefi en az 44pt.** Birincil aksiyon 56pt (`TouchTarget`).
- **Başparmakla erişim.** Sık kullanılan aksiyonlar ekranın alt yarısında
  olmalı. Üst köşeler tek elle zor erişilir.
- **Ekran başına tek birincil aksiyon.** O aksiyon dolu/vurgulu buton
  (`critical` veya `primary`); geri kalanı `secondary`/`ghost`.
  Birincil aksiyonu `ghost` yapmak onu pasif gösterir — yapma.
- **Kullanıcı her akıştan çıkabilmeli.** Kilitli akış yasak. Yıkıcı bir
  işlemden çıkarken onay sor, ilerlemeyi kaydet.
- **Dört durum her zaman düşünülmeli:** `loading` / `ready` / `empty` /
  `error`. Boş ile yükleniyor aynı görünmemeli; hata sessizce yutulmamalı.
- **Platform yerelliği.** iOS'ta kenardan geri kaydırma, Android'de sistem
  geri tuşu çalışmalı. Özel geri butonu yalnızca gerçek modal ekranlarda.
- **`Screen` iç içe kullanılmaz.** Rol layout'ları (`member/`, `trainer/`,
  `admin/`) zaten bir tane render ediyor; içeride ikincisi çentik payını iki
  kez uygular. Tab bar'ı olmayan ekranlar `Screen`'i doğrudan kullanır ve
  varsayılan olarak dört kenarı da alır.
- **Geri bildirim: kalıcı satır içi metin = form doğrulaması, geçici toast
  = işlem sonucu.** `useToast()` ile `success`/`error`. Sonucu ekranda
  zaten görünen işleme başarı mesajı koyma (canlı güncellenen liste,
  dönen anahtar) — yalnızca hatayı bildir. Her şeyi duyurmak
  bildirimleri okunmadan kapatılan gürültüye çevirir.
- **Yazma işlemi `catch`siz bırakılmaz.** `try/finally` hatayı sessizce
  yutar; kullanıcı butona basar, hiçbir şey olmaz.
- Metinler Türkçe, sade ve insani. Teknik jargon ve hata kodu kullanıcıya
  gösterilmez.

---

## 3. Mimari

**Katmanlar — sınırlar aşılmaz.**

```
src/app/**          Ekranlar (Expo Router). UI + ekran durumu.
                    Doğrudan Firestore çağrısı YAPMAZ.
src/data/firebase/  Repo katmanı. Tüm Firestore erişimi burada.
src/data/types.ts   Alan modeli. Firebase tipi sızdırmaz (Timestamp → Date).
src/components/     Sunum bileşenleri. Veri çekmez, iş kuralı bilmez.
src/context/        Global durum (auth, tema).
src/services/       Dış servis kurulumu (firebase, socialAuth).
src/theme/          Token'lar ve tema türetme.
```

- Ekran, `firebase/firestore` içinden **hiçbir şey** import etmez. Her zaman
  bir repo fonksiyonu çağırır.
- Repo fonksiyonları alan tipi döndürür (`Program`, `PtSession`), ham
  `DocumentSnapshot` değil. Dönüşüm `convert.ts` içinde.
- Bileşenler ham hex renk kullanmaz — `useAppTheme()` token'ları. Beyaz
  etiket runtime tema değişimi buna bağlı.

**Yeni bir veri özelliği eklerken sıra:**
`types.ts` → `convert.ts` → `*Repo.ts` → `firestore.rules` →
`firestore.indexes.json` (gerekirse) → ekran → `SCHEMA.md`.

---

## 4. React kuralları

- **Hook'lar koşulsuz ve en üstte.** Erken `return`'den sonra hook çağrılmaz.
  Guard gerekiyorsa **sarmalayıcı bileşen deseni** kullan: dış bileşen
  yetki/veri kontrolü yapıp erken döner, tüm hook'lar iç bileşende yaşar.
  (Örnek: `trainer/calendar.tsx`, `admin/settings.tsx`.)
- **Effect içinde `setState` ile senkronizasyon yapma.** Türetilebilen değer
  render sırasında hesaplanır; başlangıç değeri `useState`'in lazy
  initializer'ıyla verilir.
- Abonelikler `useEffect` içinde kurulur ve **temizleyici döndürülür**
  (`return unsubscribe`).
- `npx expo lint` **sıfır hata** vermeli. Uyarılar gözden geçirilir.

---

## 4b. Roller ve yetenekler

**Yetenek soruları yalnızca `src/data/membership.ts` içinde cevaplanır.**
Ekranda `roles.includes('trainer')` ya da `role === 'admin'` yazma; her
zaman `canCoach` / `canManageGym` / `canCheckIn` / `canOverseeCalendars` /
`isStaff` kullan. Ham karşılaştırmalar zamanla ayrışır — `trainer/index`'in
bir zamanlar yöneticileri `trainer/calendar`'ın içeri aldığı bir sekmeden
kilitlemesinin sebebi tam olarak buydu.

**Yönetici her zaman antrenördür.** *(Karar: kullanıcı, 2 Eylül 2026.)*
Küçük salonların çoğunda salonu işleten kişi aynı zamanda çalıştıran kişidir;
salonun sahibinin bir üyeye program yazamamasını açıklayabilen bir model yok.
Bu yüzden `canCoach` admin rolünde de `true` döner — ayrıca `trainer` rolü
verilmesi **gerekmez**.

**Ama yetenek ile yüzey aynı şey değil.** Yeteneğe sahip olmak bir yöneticiye
antrenör sekme çubuğu vermez; navigasyon hâlâ açıkça verilmiş `roles`
dizisini izler (`RoleSwitcher` ve `primaryRole` bu yüzden `roles`'u doğrudan
okur). Çalıştırmayan bir sahip yanında PT takvimi taşımamalı; program yazmak
isteyen bir sahibe de hayır denmemeli. İkisini karıştırma:

| Soru | Nereye bakılır |
|---|---|
| Bu kişi bunu **yapabilir mi**? | `membership.ts` yetenek fonksiyonları |
| Bu kişi bu **sekmeyi görür mü**? | `roles` dizisi (açık), `ROLE_HOME`, `RoleSwitcher` |

Bir yöneticinin antrenör ekranına ihtiyacı olduğunda, onu antrenör route
grubuna **itme** — sekme çubuğunu iş ortasında değiştirir. `admin/` altında
ekranı render eden bir rota aç; `admin/calendar.tsx` ve `admin/builder.tsx`
bu deseni izler.

Kural tarafında karşılığı `isTenantStaff(tid)` = admin ∨ trainer.

---

## 5. Firestore kuralları

- **Her sorgu `tenantId` ile filtrelenir.** Çok kiracılı izolasyon hem sorguda
  hem güvenlik kuralında zorlanır. İstemciye asla güvenilmez.
- **Sorgular sınırlı olmalı.** `limit()` ve/veya tarih penceresi olmadan
  koleksiyon dinleme yapma — okuma maliyeti ve gecikme doğrudan buna bağlı.
- **Ham `onSnapshot` kullanma.** `data/firebase/watch.ts` içindeki
  `watchQuery` / `watchDoc` sarmalayıcılarını kullan. Hata geri çağrısı
  atlanırsa izin hatası ekranı sessizce sonsuz yüklemede bırakır; sarmalayıcı
  her düşen aboneliği bağlam adıyla loglar ve isteğe bağlı `onError`'a iletir.
  Her `watch*` fonksiyonu son parametre olarak `onError?: WatchErrorHandler`
  almalı; liste ekranları bunu `ErrorNotice` ile yüzeye çıkarmalı.
- Eşitlik dışı filtre veya farklı alanda `orderBy` varsa **composite index**
  gerekir → `marte06/firestore.indexes.json`.
- Denormalize alanlar (`memberName`, `trainerName`, `tenantName`) bilinçlidir:
  istemci başka kullanıcının Auth profilini okuyamaz. Ancak **kaynak değişince
  kopyalar da güncellenmeli** — aksi halde eski isimler kalır.

**Güvenlik kuralı veya index değişikliği:**
1. `firebase deploy --only firestore:rules --dry-run` ile doğrula.
2. Değişikliği ve etkisini kullanıcıya açıkla.
3. **Production'a çıkmadan önce kullanıcıdan açık onay al.** Bu proje canlı
   bir Firebase projesini (marte06 web uygulamasıyla ortak) kullanır.

---

## 6. Güvenlik

- Sır (`.env`, `serviceAccount.json`) asla commit edilmez. Her ikisi de
  `.gitignore` içinde — kontrol et.
- `EXPO_PUBLIC_*` değişkenleri **istemci paketine gömülür**, gizli değildir.
  Gerçek sır asla buraya konmaz.
- Standalone build'ler `.env` dosyasını görmez → değerler **EAS Environment
  Variables** olarak tanımlanmalı (`eas env:create`). Bu unutulursa uygulama
  `auth/invalid-api-key` ile çöker.
- Yetki kontrolü istemcide **UX içindir**, güvenlik değildir. Gerçek kontrol
  her zaman Firestore kuralında.
- Kullanıcı verisi silme/anonimleştirme Cloud Function üzerinden yapılır;
  istemciye toplu silme yetkisi verilmez.

---

## 7. Doğrulama

Her değişiklikten sonra, iddia etmeden önce çalıştır:

```bash
npx tsc --noEmit && npx expo lint
```

- Yeni **native modül** veya `app.json` plugin değişikliği → yeni build
  gerekir. Sadece JS değişikliği → yeniden yükleme yeterli. Kullanıcıya
  hangisinin gerektiğini açıkça söyle.
- **`eas update`, yerel build'e ulaşmıyor.** *(8 Eylül 2026'da denendi.)*
  `runtimeVersion` politikası `fingerprint`; `--local` build parmak izini
  kendi geçici dizininde hesaplıyor, `eas update` ise çalışma dizininde.
  İkisi tutmayınca kurulu APK `CheckCompleteUnavailable` deyip update'i hiç
  görmüyor. Yani "JS değişikliği → OTA" yolu **yalnızca EAS'ta derlenmiş
  binary'ler için** geçerli; yerelde derlenmiş bir APK'ya renk/metin
  değişikliği göndermek istiyorsan ya yeni build alacaksın ya da önce
  `runtimeVersion`'ı sabit bir değere çekeceksin (üretimi de etkiler,
  kullanıcıya sor).
- `eas update` çalıştırırken `--platform android` ver: varsayılan `all`,
  web export'unu da deniyor ve Firebase'in `getReactNativePersistence`'ı
  web'de olmadığı için düşüyor. `--non-interactive` ise `--environment`
  istiyor.
- Simülatörde görsel doğrulama yapılabiliyorsa yap. Dokunmalar kaydedilmiyorsa
  körlemesine tıklama yapma — kullanıcıdan doğrulama iste.
- Test hesabı şifresi: `48162026` (tüm test hesapları).

**Build önce yerelde alınır.** *(Karar: kullanıcı, 6 Eylül 2026.)* EAS'ın
ücretli üyelik kotası doluyor ve kotanın üstü pahalı. Bu makinede build için
gereken her şey var (JDK 17, Android SDK 36 + NDK 27/28, Xcode 26.6,
fastlane), yani:

```bash
npm run build:android:local          # .aab, üretim profili — mağaza için
npm run build:android:preview:local  # .apk, cihaza doğrudan kurulabilir
npm run build:ios:local              # .ipa
```

Cihazda bir şeyi gözle görmek için istenen şey **.aab değil .apk**'dır;
`preview` profili onu üretir ve mağazaya hiç dokunmaz.

`--local` yalnızca derlemeyi buraya taşır: imzalama anahtarı yine EAS'tan
çekilir, sürüm kodu yine uzaktan artar. Yani çıkan paket EAS'ta derlenenle
aynı imzayı taşır — mağaza tarafında hiçbir şey değişmez.

İki uyarı:

- **Disk.** Yerel build birkaç GB Gradle/Xcode türetilmiş dosyası üretir.
  Build'den önce `df -h /` ile bakılmalı, yoksa yarıda "no space left" ile
  düşer. Aşağıdaki temizlik ~30 GB açıyor; tıkandıkça tekrarlanabilir.
- `ANDROID_HOME` **ve** `JAVA_HOME` kabuk profilinde tanımlı değil, bu yüzden
  npm script'leri ikisini de kendi içinde veriyor. Elle `eas build --local`
  çalıştıracaksan sen de ver.
- **JDK tuzağı.** `java -version` "17" diyor ama o bir **JRE** (Liberica
  JRE 17) — `javac` yok. `/usr/libexec/java_home` de yalnızca onu ve Java
  8'i görüyor. Gerçek JDK 17, Homebrew'un keg-only `openjdk@17`'si:
  `$(brew --prefix openjdk@17)/libexec/openjdk.jdk/Contents/Home`.
  `JAVA_HOME` verilmezse Gradle JRE'ye düşer ve
  `Error resolving plugin [id: 'com.facebook.react.settings'] > No Java
  compiler found` ile 14 saniyede patlar. *(8 Eylül 2026'da bu yaşandı.)*

Yerel build'in mümkün olmadığı tek durum: makinenin meşgul olması ya da
kullanıcının açıkça EAS istemesi. Kotayı harcamadan önce sor.

**Disk tıkandığında temizlik.** *(Karar: kullanıcı, 8 Eylül 2026 — "gereksiz
build'leri arada bir silelim ki yine tıkanmayalım".)* Yer **kod tabanında
değil**: depo 1.4 GB ve içinde build çıktısı tutulmuyor, `android/`–`ios/`
klasörleri CNG ile üretiliyor. Silinecek yerler depo dışında:

```bash
npm cache clean --force
rm -rf ~/Library/Developer/Xcode/DerivedData
rm -rf ~/Library/Developer/Xcode/"iOS DeviceSupport"
rm -rf ~/Library/Caches/CocoaPods
rm -rf ~/.gradle/caches
brew cleanup -s && rm -rf "$(brew --cache)"
```

Hepsi yeniden üretilir; tek bedeli bir sonraki build'in bir kez yavaş olması.

**Silinmeyecekler — sorulmadan dokunma:**

| yer | neden |
|---|---|
| `~/.expo` | **Önbellek değil**, EAS oturumu burada. Silersen `eas` "Not logged in" der ve build düşer; kullanıcı `eas login` çalıştırmadan devam edilemez. *(8 Eylül 2026'da bu hata yapıldı.)* |
| `~/.android/avd` | 12 GB ama emülatör cihazları; silinirse hepsi gider |
| `~/Library/Developer/CoreSimulator/Devices` | 14 GB; kullanıcının başka uygulaması da orada çalışıyor |
| `~/Library/Developer/Xcode/Archives` | Yayınlanmış build'lerin dSYM'leri — çökme raporlarını çözmek için lazım |

**İki salon, iki amaç — karıştırma.**

| Salon | Kod | Ne için |
|---|---|---|
| GymEntra Salonu | `TARABYA-01` | **Test.** Gerçek kişilerin verisi var. Buradan ekran görüntüsü alınmaz. |
| Supergym | `SUPERGYM-88` | **Tanıtım.** Tamamen uydurma veri. Ekran görüntüleri, mağaza görselleri ve demolar buradan. |

Supergym-88'in içeriğini `marte06/scripts/seed_supergym_demo.cjs` üretir:
20 üye, 5 antrenör, dersler, programlar, ödemeler, ölçümler. Script
deterministik ve tekrar çalıştırılabilir. Demo giriş bilgileri
`marte06/scripts/README-supergym-demo.md` içinde.

Bir ekranı tanıtım görselinde boş bırakmamak için oraya veri gerekiyorsa,
elle Firestore'a yazmak yerine seed script'ine ekle — yoksa bir sonraki
`--purge` temizliğinde kaybolur.

---

## 8. Kod stili

- Çevredeki kodun yorum yoğunluğunu, adlandırmasını ve deyimlerini taklit et.
- Yorumlar **neden**'i açıklar, ne'yi değil. Bariz olanı yazma.
- Ölü kodu bırakma. Bir özellik kaldırıldıysa bileşeni, route'u ve tipi de
  kaldır.
- Mock/placeholder üretime çıkmaz. Geçici bir şey bırakılıyorsa neden
  bırakıldığı yorumda yazar.
- Türkçe kullanıcı metinleri; kod, değişken ve yorumlar İngilizce.

---

## 9. Kapsam ve iletişim

- İstenmeyen refactor yapma. Yolda bir sorun görürsen **bildir**, kendi
  başına düzeltme (kullanıcı isterse düzelt).
- Bir şey çalışmıyorsa veya doğrulanmadıysa **öyle söyle**. "Çalışıyor"
  demeden önce çalıştığını gör.
- Geri alınamaz işlemler (production deploy, veri silme, dış servise gönderim)
  öncesinde onay al.
- Tamamlanan `plan.md` maddelerini işaretle ve altına nasıl çözüldüğünü yaz.

## Kukla editörü (hareket çizimleri)

Hareket figürlerinin açı kareleri `src/data/rigArchetypes.json` içinde ve
**editörü var**:

```
npm run rig      # http://127.0.0.1:8123
```

Hareketi seç, kareyi seç, figürün eklemini sürükle, ekipmanı (kök nokta, bar,
yük, sahne, düzlem) değiştir, Kaydet. Kaydet doğrudan `rigArchetypes.json`
üstüne yazar — değişiklik git diff'te görünür.

Kullanım notları:
- **Zaman çubuğu** kareler ARASINI da gösterir. Geçiş hataları orada yaşar
  (kolun uzun yoldan dönüp yerin içinden geçmesi böyle bulundu). Ara karede
  düzenleme kapalıdır: o poz hiçbir kareye ait değildir.
- **Gölge** komşu karelerin izini çizer; çömelmenin dibini yazarken tepesini
  görmenin tek yolu.
- **Denetim uyarısına tıklamak** sorunun yaşandığı ana götürür.
- `⌘Z` geri alır, `⇧⌘Z` ileri alır, `⌘S` kaydeder, boşluk oynatır. Ok tuşları
  seçili kaydırıcıyı 1° (Shift ile 5°) oynatır.
- **Diske dön** kaydedilmemiş her şeyi atıp dosyadaki hâle döner.
- **Uzak bacak / uzak kol** anahtarları yandan görünümde ikinci uzvu gizler.
  İki tarafı aynı işi yapan hareketlerde (squat, deadlift) uzak bacak derinlik
  yerine gürültü ekleyebiliyor. Gizleme yalnızca çizimi etkiler: iskelet, yere
  oturma ve kadraj değişmez, yani figür kımıldamaz.

İki kural:

- **Motor kopyalanmaz.** Editör `src/utils/rig.ts`, `rigEdit.ts` ve
  `rigAudit.ts` dosyalarını `tsc` ile derleyip çalıştırır; yani uygulamanın
  çalıştırdığı kodun aynısı. Ayrı bir çizim kopyası yazmak, uygulamada bozuk
  olanın editörde düzgün görünmesine yol açar — bu iki kez oldu.
- **Denetim kuralları tek yerde.** `rigAudit.ts` hem testlerde hem editörde
  çalışır. Editörde kırmızı görünen bir şey testte de düşer.
