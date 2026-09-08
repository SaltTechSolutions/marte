# Antrenman Simülatörü

Hareket figürünün motoru, kare editörü ve mekanik denetimi. Kendi başına
çalışır; GymEntra yalnızca **çıktısını** tüketir.

```bash
npm install
npm run editor      # http://127.0.0.1:8123 — hareketleri düzenle
npm test            # mekanik denetim + şema + ROM bantları (48 test)
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
dist/programmes.json      hazır paket programlar
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
- Önden görünüm: gövde ve bacak dikey seviyelerini yan çözümden okur, kollar
  TEK pozdan 3B yönle izdüşürülür (`upperA` yükselme, `armAz` düzlem — 0 öne,
  90 yana; ön kol için `foreAz`). Kol boyu her karede doğru, yana açılan kol
  öne bakışta kısalır. Parçalar mesh'in 90° silueti (`bodyParts.json` →
  `front`). Bağımsız bir 3B model yok; gövde rotasyonu (eksenel dönüş)
  temsil edilemiyor.
- Katman sırası (ressam sırası) her iki tüketicide aynı: yan görünümde uzak
  bacak → uzak kol → gövde → yakın bacak → yakın kol → kafa → tabak; önden
  bacaklar → gövde → kafa → kollar → yük. Saf yan görünümde bu sıra
  anatomik olarak doğrudur: yakın taraf hep kamera tarafında.

## Editör

Solda hareketler (Türkçe adlar `data/exercises.json`'dan), ortada figür ve
zaman çubuğu, sağda denetim + ekipman + açılar.

- Eklemi tut ve sürükle. Kemik boyu sabit: eklem hedefe bakan yöne döner.
  Kalçayı sürüklemek iki kemiği birden çözer (çömelme derinliği).
- Önden görünümde dirsek ve el sürüklenir: ekrandaki yanal/dikey konum ile
  kemik boyundan kolun 3B yönü çıkar (yükselme `upperA`/`foreA`, düzlem
  `armAz`/`foreAz`); ileri bileşenin işareti bugünkü pozdan gelir.
- Zaman çubuğu kareler ARASINI da gösterir — geçiş hataları orada yaşar.
  Ara karede düzenleme kapalıdır.
- Gölge komşu karelerin izini çizer.
- Denetim uyarısına tıklamak sorunun yaşandığı ana götürür.
- `⌘Z` / `⇧⌘Z` / `⌘S`, boşluk oynatır, ok tuşları seçili kaydırıcıyı 1° (Shift
  ile 5°) oynatır. **Diske dön** kaydedilmemiş her şeyi atar.

Kaydet doğrudan `data/rigArchetypes.json` üstüne yazar; değişiklik git
diff'inde görünür.

## Denetim kuralları tek yerde

`src/rigAudit.ts` hem testlerde hem editörde çalışır: editörde kırmızı görünen
bir şey testte de düşer. Kurallar mekaniği koruyor — eklem zeminin altına
geçemez, topuk ayak boyundan fazla kalkamaz (basamak hariç: orada yükselten
şey ayak değil), desteğe yaslanan hareketlerde omuz kaymaz, döngü kapanmak
zorunda, **ağırlık merkezi** (vücut + yük, Dempster oranları) ayakta dururken
destek tabanının içinde kalmak zorunda (`denge`) — dışına çıkan figür gerçekte
düşer, yani gösterilen poz yapılamaz.

Yan görünüm **saf ortografik**: uzak taraf kaydırılmaz, perspektif yok. Özdeş
hareket yapan uzak uzuv çizilmez (`showFarLeg`/`showFarArm` kural, elle
geçersiz kılınabilir); farklı hareket yapan zaten x'te ayrı düşer. Basılı arka
ayak bir **kısıt**: karede `plantF` işaretliyse motor arka bacağı ayağı
yerinde tutacak şekilde çözer (hamle, step-up, Bulgar squat). Ayakta parmak
tabanı eklemi var: topuk kalkınca ayak topu yerde kalır, parmaklar düz.

Eklem açısı sınırları `ROM_BANDS` tablosunda veri olarak duruyor: diz, dirsek,
kalça ve gövde. Sayılar "normal aralık" değil **anatomik imkânsızlık** eşiği —
derin çömelme klinik normalleri zaten aşar, onları sınır yapmak doğru
hareketleri hata sayardı. Omuz, boyun ve ayak bileği tabloda yok; gerekçeleri
`TODOS.md`'de.

Verinin ŞEKLİ ayrı bir soru: `src/rigSchema.ts` yüklenirken ve editör
kaydederken çalışır. Bilinmeyen bir `mode`, sıfırdan başlamayan bir kare
dizisi ya da 2000ms altı bir süre motora hiç ulaşamaz — mekanik denetim
elinde düzgün biçimli bir hareket olduğunu varsayıyor.

## Hazır programlar ve yanlış vaat koruması

`data/programmes.json` altı hazır program taşıyor (temel güç, kol
kalınlaştırma, gövde ve bel, sırt-omuz dayanıklılığı, kalça-bacak, masa başı
molası). Her programın `promise` (ne yapar), `limits` (ne YAPMAZ),
`progression` ve özet `evidence` alanları var.

Buradaki asıl mesele veri biçimi değil, kullanıcıya söylenen şeyin doğru
olması. Üç kural şemada, yani export'u durduran yerde:

1. **`limits` boş olamaz.** Bir program ne yapmadığını yazmadan yayına
   giremez; yazılmayan sınırı kullanıcı kendi beklentisiyle dolduruyor.
2. **Vaatte yanlış yönlendiren ifade yasak** — bölgesel yağ kaybı, inceltme,
   detoks, "garanti". Kalıplar Türkçe ek alıyor ve Unicode harf sınıfıyla
   eşleşiyor: düz alt dizge de `\w` de "yağı yakar"ı kaçırıyordu. Yasak
   yalnızca `name` ve `promise` alanlarına bakıyor, çünkü `limits` içinde bu
   ifadelerin İNKÂR EDİLİRKEN geçmesi gerekiyor.
3. **Hipertrofi hedefli program, hedef aldığı her kasa haftada en az 10
   birincil set vermek zorunda.** Sayı veriden hesaplanıyor: setler × haftalık
   tekrar, kasın birincil olduğu hareketlerde. "Kol kalınlaştırma" adlı ama
   haftada dört set kol çalıştıran bir programı gözle fark etmek zor — liste
   dolu görünüyor. Bu kural yazılırken `kalca-bacak` paketinin arka bacağa
   yalnız 7 set verdiğini buldu.

**"Bel incelme" diye bir program YOK ve olmayacak.** Bölgesel yağ kaybı
gösterilememiş bir şey: karın egzersizi karın yağını azaltmıyor. Aynı ihtiyaç
`govde-ve-bel` altında, bel çevresini toplam yağ kaybının belirlediği ve onu
ağırlıklı olarak beslenmenin sürdüğü açıkça yazılarak karşılanıyor.

`reviewed: false` alanı içeriğin bir uzman kontrolünden geçmediğini söylüyor
ve uygulamada kullanıcıya gösteriliyor.

## Sırada ne var

- Uygulamanın `RigFigure.tsx`'ini yeni şekillere bağlamak: `footPath` ve
  `capsule` motordan geliyor, ama `headProfile`, `handPath`,
  `shoulderWedge` ve uzuv siluetleri henüz çağrılmıyor — bileşen o
  bölgeleri kendi iç SVG'siyle çiziyor.
- Hareket başına kaslar ve anlatım metni de buradan devredilebilir — bugün
  onlar uygulamanın kütüphanesinde.
