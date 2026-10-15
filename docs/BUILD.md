# GymEntra mobil — build, OTA ve disk

`apps/gymentra-mobile/AGENTS.md` §7'den taşındı. Build, `eas update` veya disk
temizliği işine başlamadan önce oku.

## `eas update`

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

## Yerel build

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

Uyarılar:

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

## Disk tıkandığında temizlik

*(Karar: kullanıcı, 8 Eylül 2026 — "gereksiz build'leri arada bir silelim ki
yine tıkanmayalım".)* Yer **kod tabanında değil**: depo 1.4 GB ve içinde build
çıktısı tutulmuyor, `android/`–`ios/` klasörleri CNG ile üretiliyor. Silinecek
yerler depo dışında:

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

## Tanıtım verisi (Supergym)

Supergym-88'in içeriğini `marte06/scripts/seed_supergym_demo.cjs` üretir:
20 üye, 5 antrenör, dersler, programlar, ödemeler, ölçümler. Script
deterministik ve tekrar çalıştırılabilir. Demo giriş bilgileri
`marte06/scripts/README-supergym-demo.md` içinde.

Bir ekranı tanıtım görselinde boş bırakmamak için oraya veri gerekiyorsa,
elle Firestore'a yazmak yerine seed script'ine ekle — yoksa bir sonraki
`--purge` temizliğinde kaybolur.
