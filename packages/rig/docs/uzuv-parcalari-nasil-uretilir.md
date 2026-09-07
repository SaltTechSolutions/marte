# Uzuv parçaları nasıl üretilir

`data/bodyParts.json`'daki yollar bugün elle çizilmiş kaba bir taslak. Bu belge
onların yerine gerçek anatomik siluetlerin nasıl konacağını anlatıyor.

Amaç 3B modeli uygulamaya taşımak DEĞİL. Model üretim zamanında bir kez
kullanılıyor, çıktı 2B yol oluyor, mobil tarafa hiç 3B gitmiyor.

## Hedef biçim

Her parça kendi YEREL uzayında çiziliyor:

- Kemik `(0,0)`'dan `(0,len)`'e uzanır — yani **aşağı doğru**, +Y yönünde
- **+X figürün baktığı yön.** Aşağı sarkan bir uyluk için: quadriceps (ön)
  +X tarafında, hamstring (arka) −X tarafında
- Ölçekleme yok: parça kemiğin tam boyunda çiziliyor

Kemik boyları sabit ve şema bunları zorunlu tutuyor:

| Parça | `len` | Nedir |
|---|---|---|
| `thigh` | 105 | kalça → diz |
| `shin` | 100 | diz → ayak bileği |
| `upper` | 78 | omuz → dirsek |
| `fore` | 68 | dirsek → el |
| `lumbar` | 55 | kalça → bel |
| `thorax` | 85 | bel → göğüs |
| `neck` | 24 | göğüs → boyun |

`len` kemik boyuyla uyuşmazsa export durur. Bu kasıtlı: uyuşmazlık figürü
çizilmez yapmıyor, sadece eklemde boşluk açıyor — yani sessiz bir kusur.

## Adımlar

### 1. CC0 bir insan modeli edin

[MakeHuman](http://www.makehumancommunity.org/) resmî uygulamasından dışa
aktarılan modeller **CC0**: ticari kullanım serbest, atıf gerekmiyor
([lisans açıklaması](http://www.makehumancommunity.org/content/license_explanation.html)).
Değiştirilmemiş resmî sürümün dışa aktarma işlevini kullanmak şart — bu koşul
lisansın kendisinde yazıyor.

Modeli oluştururken orantıya dikkat: bizim iskeletimizde uyluk 105, baldır 100
birim. Model bu orana yakın olmalı, yoksa 4. adımdaki ölçekleme uzuvları
gerçekte olduğundan kalın ya da ince gösterir.

### 2. Yandan ortografik render al

Blender'da (ya da tercih ettiğin 3B aracında):

- Kamerayı **ortografik** yap. Perspektif kamera uzak uzuvları küçültür ve
  parça tek bir kemiğe oturacağı için o küçülme yanlış yere gider.
- Kamerayı tam yandan konumlandır. Açılı görünüm AYRI bir yoldan çözülüyor
  (aşağıya bak); parçaların kendisi yan düzlemde çiziliyor.
- Modeli **nötr pozda** bırak: uzuvlar düz, kollar yanda. Poz vermek gerekmiyor,
  çünkü pozu rig veriyor.
- Yüksek çözünürlükte, düz renk (silüet) render al. Gölge ve doku gerekmiyor;
  ihtiyacımız olan şey dış hat.

### 3. Uzuvlara böl

İki yol var.

**Blender'da mesh olarak:** model rigli geliyorsa kemik etkisine göre ayır
(`Separate by Loose Parts` değil, vertex grubuna göre). Daha doğru sonuç verir
ama 3B bilgisi ister.

**Render üstünde vektör olarak:** render'ı Inkscape'e al, her uzvu ayrı bir yol
olarak çiz. Daha erişilebilir yol ve bu iş için yeterli, çünkü zaten silueti
istiyoruz.

Hangi yolu seçersen seç, **eklem merkezlerini işaretle**. Her parça için iki
nokta gerekiyor: kemiğin başlangıcı ve bitişi (uyluk için kalça merkezi ve diz
merkezi). Bir sonraki adım bu iki noktaya dayanıyor.

Eklemlerde parçalar biraz ÇAKIŞSIN. Rig eklem yerlerine üst üste binen toplar
çiziyor, ama uç açılarda çakışma payı dikişi kapatan şey.

### 4. Yerel uzaya çevir

Bu adım hatanın sessiz olduğu yer: yanlış origin ya da yanlış dönüş, parçayı
kemiğe yanlış oturtur ama figür yine çizilir.

Elindeki `A` (kemik başı) ve `B` (kemik sonu) noktalarıyla, her koordinat için:

1. **Öteleme:** `A`'yı orijine taşı — her noktadan `A`'yı çıkar
2. **Dönüş:** `B − A` vektörünü +Y'ye çevir. Dönüş açısı
   `θ = atan2(−(Bx − Ax), By − Ay)`, sonra her noktayı `−θ` kadar döndür
3. **Ölçek:** `|B − A|`'yı tablodaki `len`'e eşitle — her koordinatı
   `len / |B − A|` ile çarp

Sonuç: kemik `(0,0)`'dan `(0,len)`'e uzanan bir yol.

Yay komutları (`A`) bu dönüşümde doğru çevrilmiyor — yarıçap ve bayrakların
yeniden hesaplanması gerekiyor. Inkscape'te `Path > Object to Path` ve
eğrilere düzleştirme ile yaylardan kurtul; `M`, `L`, `C`, `Q`, `Z` yeterli.

**Bunu elle yapma.** `scripts/normalize-part.mjs` dönüşümü yapıyor ve sonucu
kendi kendine doğruluyor — kemik başı gerçekten `(0,0)`'a, sonu `(0,len)`'e
düşmüş mü:

```bash
node scripts/normalize-part.mjs --part thigh --a 300,200 --b 298,305 --d "M 300 200 ..."
```

`--a` kemiğin başı, `--b` sonu, ikisi de yolun kendi koordinat uzayında.
Script ayrıca ön (+X) ve arka (−X) genişliğini yazıyor: kütle arkada ağır
basıyorsa parça aynalanmıştır ve uyarı veriyor. `--write` eklersen sonucu
doğrudan `data/bodyParts.json`'a yazar. Göreli komutları mutlağa, `H`/`V`'yi
`L`'ye çeviriyor; yay komutuna açık hatayla itiraz ediyor.

### 5. Yaz ve doğrula

Yolları `data/bodyParts.json`'a koy, `source` alanını güncelle, sonra:

```bash
npm test && npm run export
```

Şema `len`'leri kemik boylarıyla karşılaştırıyor; uyuşmazsa export hiçbir şey
yazmadan duruyor.

Gözle kontrol için editörü aç ve **Parça** düğmesiyle kapsül çizim arasında
geçiş yap:

```bash
npm run editor
```

Bakılacak şeyler: eklemlerde boşluk var mı, uzuvlar uç açılarda (çömelmenin
dibi, omuz presinin tepesi) kopuyor mu, uzak taraf uzuvları yakınla aynı
görünüyor mu.

## Sınır

Parçalar deforme olmuyor — dönüyor, esnemiyor. Gerçek bir dizde kas yumuşar ve
deri katlanır, burada iki katı şekil eklemde dönüyor. Rig eklemlere üst üste
binen toplar çizdiği ve ROM bantları açıları sınırladığı için bu çoğu pozda
görünmüyor, ama sıfırlanmıyor.

Deformasyon isteniyorsa yol mesh tabanlı deri (skinning) — o zaman parça değil
ağırlık haritası gerekir ve mobil maliyeti tamamen başka bir tartışma açar.

## Açılı (3/4) görünüm — parça setini ikiye katlamadan

Açılı bakış için ikinci bir siluet seti çizmek GEREKMİYOR. Ölçüldü: 45°'de
uzuvların silueti neredeyse hiç değişmiyor (uyluk ×1.03, pazu ×1.00, baldır
×0.97) çünkü kesitleri yuvarlak. Değişen şey GÖVDE — yandan dar, açılı
bakışta geniş.

Bu yüzden her parça bir `ratio` taşıyor: **yanal genişlik / ön-arka
derinlik**. Açılı bakışta siluetin genişlik çarpanı buradan çıkıyor:

    genişlik çarpanı = sqrt(cos²α + ratio² · sin²α)

Elips kesitli bir cismin izdüşüm genişliği bu; türetmesi tek satır ve her
açı için çalışıyor, oysa baked bir 2. set tek bir açıya çakılı kalırdı.

| Parça | ön-arka | yanal | `ratio` | 45°'de çarpan |
|---|---|---|---|---|
| `thorax` | 11cm | 16cm | 1.455 | ×1.25 |
| `lumbar` | 10cm | 14cm | 1.400 | ×1.23 |
| `thigh` | 8cm | 8.5cm | 1.063 | ×1.03 |
| `shin` | 5.5cm | 5cm | 0.909 | ×0.97 |
| `upper` | 4.5cm | 4.5cm | 1.000 | ×1.00 |
| `fore` | 4cm | 3.5cm | 0.875 | ×0.96 |
| `neck` | 6cm | 6cm | 1.000 | ×1.00 |

Şema `ratio`yu 0.5-2.5 arasında tutuyor: dışına çıkan bir değer ölçüm
değil yazım hatasıdır.

**Sınır — kayda geçsin.** Çarpan siluetin GENİŞLİĞİNİ düzeltiyor, ŞEKLİNİ
değil. Gerçek 3/4'te gövde hem yanını hem önünü gösterir; bizim parçamız
genişlemiş bir yan siluet olarak kalıyor. Daha ileri gitmek istenirse yol
gerçekten ikinci bir set çizmek — ama önce bu çarpanın yetip yetmediği
ekranda görülmeli, çünkü ölçüm uzuvlar için yetmesi gerektiğini söylüyor.
