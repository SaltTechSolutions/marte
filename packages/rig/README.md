# Antrenman Simülatörü

Hareket figürünün motoru, kare editörü ve mekanik denetimi. Kendi başına
çalışır; GymEntra yalnızca **çıktısını** tüketir.

```bash
npm install
npm run editor      # http://127.0.0.1:8123 — hareketleri düzenle
npm run review      # editörü tek bir HTML'e paketler (dist/review.html)
npm test            # mekanik denetim + şema + ROM bantları
npm run export      # uygulamaya devredilecek dosyaları dist/ altına üretir
```

## Neden ayrı

Motor, editör ve denetim birlikte gelişiyor ve hızlı değişiyor; uygulamanın
ihtiyacı olan şey ise yalnızca "şu hareket şöyle görünüyor". İkisini aynı
depoda tutmak, her poz denemesini uygulamanın test ve derleme döngüsüne
sokuyordu.

## Ne var, ne yok

| Burada | Uygulamada |
|---|---|
| Motor (`src/rig.ts`) | Aynısının kopyası (`dist/` üzerinden) |
| Sürükleme çözücüsü (`src/rigEdit.ts`) | **Yok** — yalnızca editörün işi |
| Denetim kuralları (`src/rigAudit.ts`) | Aynısının kopyası |
| Şema doğrulaması (`src/rigSchema.ts`) | Aynısının kopyası |
| Kare verisi (`data/rigArchetypes.json`) | Aynısının kopyası |
| Editör (`editor/`, `scripts/editor.mjs`) | **Yok** |
| React Native çizimi | **Yalnızca uygulamada** (`RigFigure.tsx`) |

Çizim iki yerde ayrı yazılmak zorunda: burada tarayıcı SVG'si, uygulamada
`react-native-svg`. Ama **kinematik tek yerde** — figürün nereye geldiğini
hesaplayan kod yalnızca burada yaşıyor, uygulamaya kopyalanıyor.

## Devir sözleşmesi

`npm run export` (typecheck ve testlerin arkasında) on üç dosya üretir:

```
dist/rig.ts               motor
dist/rigAudit.ts          denetim kuralları
dist/rigSchema.ts         veri biçim doğrulaması
dist/muscles.ts           kas bölgesi sözlüğü (39 bölge, Türkçe etiketler)
dist/archetypes.ts        kare verisini tipleyen ve YÜKLEME ANINDA doğrulayan sarmalayıcı
dist/rigArchetypes.json   30 arketipin kare verisi
dist/exercises.json       34 hareketin kataloğu (kimlik → ad + arketip)
dist/rigMuscles.json      hareket başına birincil/ikincil kaslar
dist/anatomy.json         kas haritasının ön/arka çizim yolları
dist/bodyParts.json       uzuv siluet parçaları
dist/rig.test.ts          motor testleri          ┐ devredilen KODUN
dist/rigAudit.test.ts     denetim testleri        │ testleri de
dist/rigSchema.test.ts    şema testleri           ┘ devrediliyor
dist/manifest.json        sürüm, tarih, git commit'i, her dosyanın sha256'sı
```

**Testler neden devrediliyor.** Uygulama bir süre kendi elle kopyalanmış
`rig.test.ts`'ini taşıdı; 34 satır geride kaldı ve her motor değişikliğinde
kırıldı. Devredilen kodun testi de devredilmezse, uygulama tarafında
doğrulanmayan bir motor ya da bayatlamış bir test kalıyor — ikisi de kötü.
`rigEdit` (sürükleme çözücüsü) ve `normalize-part` testleri BURADA KALIYOR:
o kod devredilmiyor, testi de gitmemeli.

**Yol çevirisi.** İki depo dosyaları farklı yerlere koyuyor (`src/rig.ts` ↔
`src/utils/rig.ts`, `tests/` ↔ `src/utils/`). Export, depo içi göreli
yolları uygulamanın `@/` takma adına çeviriyor. Karşılığı olmayan bir göreli
yol çıkarsa export DURUYOR — yoksa hata uygulamada, bizim göremediğimiz
yerde çıkardı.

Arketip ile hareket aynı şey değil: 30 arketip 34 hareketi çiziyor.
`unilateral_lunge` üçüne birden hizmet ediyor (lunge + rotasyon, walking,
reverse) ama kas profilleri farklı, o yüzden kas verisi arketibe değil
**harekete** bağlı. Hareket kimliklerini bu depo sahipleniyor.

Export hedefi biliyorsa dosyaları uygulamanın **gerçekten ithal ettiği**
yerlere yazıyor (`src/utils/`, `src/data/`) ve başlarındaki "üretilmiştir,
elle düzenleme" satırı orada da duruyor. **Tek yön vardır:** simülatörden
uygulamaya. Uygulamada düzeltilen bir açı, bir sonraki devirde sessizce geri
gelir — bu yüzden export onu sessizce geri getirmiyor, önce durup söylüyor.

```
npm run export                                  # yalnızca dist/
npm run export -- --to /yol/gymentra-mobile     # dist/ + hedef
npm run export -- --to ... --dry                # ne yazılacağını göster
npm run export -- --to ... --force              # hedefteki elle değişiklikleri ez
```

Yol `--to`, `GYMENTRA_DIR` ya da `.export-target` dosyasından okunuyor
(sonuncusu gitignore'da: makineye özel). Hedefin `package.json` adı
`gymentra-mobile` değilse yazılmıyor.

Her export hedefe bir alındı bırakıyor: `src/data/rigManifest.json`, dosya
başına sha256. Bir sonraki export hedefteki dosyaları o alındıyla
karşılaştırıyor; biri export dışında değişmişse HİÇBİR ŞEY yazılmıyor ve
hangisi olduğu söyleniyor. Aynı alındı uygulamanın runtime'da okuyabileceği
manifest: karışık sürüm de orada görünür. Manifest ayrıca üretimin commit
edilmemiş bir çalışma ağacından çıkıp çıkmadığını (`source.dirty`) kaydeder.

## Modeli bilmeden dokunma

- Açılar dünya uzayında, derece: 0 = yukarı, saat yönünde artar. Figür +x
  yönüne bakar.
- Kareler AÇI tutar, koordinat değil; segment boyları sabit. Geçiş eklem-yerel
  uzayda yapılır — bu yüzden uzuvlar bükülür, kendi etraflarında dönmez.
- Beş kök nokta: ayak yerde, dört ayak, sehpa, sırtüstü, barda asılı. Bir
  hareketin nereye bastığı çizimin temelidir.
- Önden görünüm, yan çözümün dikey seviyelerini okuyan şematik bir
  izdüşümdür; bağımsız bir 3B model yok. Gövde rotasyonu gibi gerçek dönüşler
  bu modelde temsil edilemiyor.

## Editör

Solda hareketler (Türkçe adlar `data/exercises.json`'dan), ortada figür ve
zaman çubuğu, sağda denetim + ekipman + açılar.

- Eklemi tut ve sürükle. Kemik boyu sabit: eklem hedefe bakan yöne döner.
  Kalçayı sürüklemek iki kemiği birden çözer (çömelme derinliği).
- **Ayak ucu tutamakları POZUN değil HAREKETİN ayarı**: yakın ayak ucu
  `footDir`'i, uzak ayak ucu `footDirFarAdj`'ı yazıyor ve ikisi de TÜM
  karelere birden uygular. Uzak ayağınki mutlak yön değil pay, çünkü o yön
  her karede baldırdan türetiliyor (bkz. `footDirFarOf`). Uzak ayak ucu
  yalnızca uzak bacak çiziliyorsa görünür.
- **Yerleşim paneli** figürü ve sahne eşyasını ayrı ayrı kaydırır
  (`bodyDx/bodyDy`, `propDx/propDy`). Ayak ucu tutamakları gibi bu da tüm
  karelere birden uygular. Eşya konumları iskeletten türetildiği için figür
  kayınca eşya da kayar; eşya kaydırması aradaki bağı gevşetir. Gövdeyi yukarı
  çekmek ayağı yerden keserse denetim **söyler** — kaydırma denetimi
  susturmuyor, kendisi de denetleniyor.
- Zaman çubuğu kareler ARASINI da gösterir — geçiş hataları orada yaşar.
  Ara karede düzenleme kapalıdır.
- Denetim uyarısına tıklamak sorunun yaşandığı ana götürür.
- `⌘Z` / `⇧⌘Z` / `⌘S`, boşluk oynatır, ok tuşları seçili kaydırıcıyı 1° (Shift
  ile 5°) oynatır. **Diske dön** kaydedilmemiş her şeyi atar.

Kaydet doğrudan `data/rigArchetypes.json` üstüne yazar; değişiklik git
diff'inde görünür.

### Uzaktan inceleme

`npm run review` editörü **tek bir HTML dosyasına** paketler
(`dist/review.html`): motor derlenir, `editor/editor.js` esbuild ile
paketlenir, sunucunun servis ettiği beş JSON sayfaya gömülür ve `fetch`'in
üstüne bir vekil konur. `editor/editor.js` ve `editor/index.html` HİÇ
DEĞİŞMEZ — sayfa neyi gösteriyorsa editörün gösterdiği odur.

Ne işe yarar: editör yalnızca 127.0.0.1'i dinliyor. Pozları onaylayacak kişi
başka bir makinedeyse ekran görüntüsü yetmiyor — geçiş hataları ara karelerde
yaşıyor ve kaydırılamayan bir tabaka onları gizliyor. Paketlenen sayfa
herhangi bir yere konabilir ve zaman çubuğu çalışır.

**Kaydetmez.** Sunucu yok, `PUT /data` gidecek bir yer yok; kaydet ve diske
dön düğmeleri gizlenir. Sürükleme açık kalır — "bu açı 46 değil 52 olmalı"
demenin yolu açıyı deneyip panelden okumaktır.

## Denetim kuralları tek yerde

`src/rigAudit.ts` hem testlerde hem editörde çalışır: editörde kırmızı görünen
bir şey testte de düşer. Kurallar mekaniği koruyor — eklem zeminin altına
geçemez, topuk ayak boyundan fazla kalkamaz (basamak hariç: orada yükselten
şey ayak değil), desteğe yaslanan hareketlerde omuz kaymaz, döngü kapanmak
zorunda.

Eklem açısı sınırları `ROM_BANDS` tablosunda veri olarak duruyor: diz, dirsek,
kalça ve gövde. Sayılar "normal aralık" değil **anatomik imkânsızlık** eşiği —
derin çömelme klinik normalleri zaten aşar, onları sınır yapmak doğru
hareketleri hata sayardı. Omuz, boyun ve ayak bileği tabloda yok; gerekçeleri
`TODOS.md`'de.

### Katman sırası

Figürün arkadan öne çizim sırası `rig.ts`'de veri: `SIDE_LAYERS` ve
`FRONT_LAYERS`, her katmanın gerekçesiyle (`LAYER_WHY`). Çizim kodu bunu
çalışma anında okumuyor — üç ayrı çizim gövdesi var (editörün ana sahnesi,
telefon önizlemesi, uygulamanın `RigFigure.tsx`'i) ve ikisi farklı SVG
lehçesi. Bunun yerine her katmanın başında bir `KATMAN` işareti duruyor ve
iki test (`tests/layerOrder.test.ts` burada, `RigFigure.layers.test.ts`
uygulamada) bu işaretlerin kaynaktaki sırasını diziyle karşılaştırıyor.

Neden: 11 Eylül 2026'da üç katman hatası arka arkaya çıktı — halter tabağı
gövdenin arkasında, yakın kol kafanın arkasında, sahne eşyası uzak bacağın
önünde — ve üçünü de kullanıcı gözle buldu. Üçü de aynı kuralın ihlaliydi
(**katman sırası yakınlık sırasıdır**) ama kural yalnızca yorumlarda
yazılıydı. Test sıranın yanında KURALI da denetliyor: diziyi yeniden
sıralamak yetmiyor, gerekçeyi de bozmak gerekiyor.

Verinin ŞEKLİ ayrı bir soru: `src/rigSchema.ts` yüklenirken ve editör
kaydederken çalışır. Bilinmeyen bir `mode`, sıfırdan başlamayan bir kare
dizisi ya da 2000ms altı bir süre motora hiç ulaşamaz — mekanik denetim
elinde düzgün biçimli bir hareket olduğunu varsayıyor.

## Sırada ne var

- Uygulamanın `RigFigure.tsx`'ini yeni şekillere bağlamak: `footPath` ve
  `capsule` motordan geliyor, ama `headProfile`, `handPath`,
  `shoulderWedge` ve uzuv siluetleri henüz çağrılmıyor — bileşen o
  bölgeleri kendi iç SVG'siyle çiziyor.
- Hareket başına kaslar ve anlatım metni de buradan devredilebilir — bugün
  onlar uygulamanın kütüphanesinde.
