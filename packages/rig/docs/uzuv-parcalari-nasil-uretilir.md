# Uzuv parçaları nasıl üretilir

`data/bodyParts.json`'daki yollar MakeHuman'ın CC0 insan mesh'inden
üretiliyor; bu belge o üretimi ve altındaki kararları anlatıyor.

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

## Üretim

```bash
curl -sL https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj -o /tmp/base.obj
npm run parts:mesh -- --obj /tmp/base.obj --az 0  --write
npm run parts:mesh -- --obj /tmp/base.obj --az 90 --write
npm test && npm run export
```

İlk komut yan seti (`parts`), ikincisi ÖN seti (`front`, 90°) yazıyor. Mesh
depoda DEĞİL (1.7 MB, ve zaten tek kaynak var); üretilmiş veri depoda.

### Kaynak ve lisans

[MakeHuman](http://www.makehumancommunity.org/) temel mesh'i (`base.obj`,
19.158 köşe) **CC0**: dosyanın kendi başlığında yazıyor, `LICENSE.ASSETS.md`
koşulsuz. Ticari kullanım serbest, atıf gerekmiyor. (Eski sürüm belgede
"resmî sürümün dışa aktarması şart" deniyordu — o koşul yok.)

Mesh'in bize verdiği iki şey: gövde yüzeyi (`body` grubu) ve **eklem
merkezleri** (`joint-*` işaretçi grupları — kalça, diz, omuz, omurga...).
Eklem merkezlerini elle işaretlemek bu işin en zahmetli adımıydı; bedavaya
geldi.

### Script ne yapıyor

`scripts/mesh-silhouette.mjs`:

1. OBJ'yi okur, eklem gruplarının ağırlık merkezini alır.
2. Her kemiğimizi iki mesh eklemine bağlar (uyluk = `l-upper-leg → l-knee`,
   gövde = `spine-2 → neck`, ...). Sol taraf; sağ zaten ayna.
3. Her kemik, **eksenine belli yarıçaptan yakın** ve boy aralığındaki köşeleri
   alır. Öbür bacak, kollar, el ve ayak yarıçapın ya da boyun dışında kalıyor.
4. Köşeleri `--az` açısından **ortografik** izdüşürür, kemik boyunca 40
   istasyonda ön/arka sınırı okur (konveks kabuk değil — baldırın içbükey
   yerleri korunuyor), 7px pencere ve 5'li ortalamayla düzler.
5. Kemiği `(0,0)→(0,len)`'e oturtup yolu yazar.

**Neden "en yakın kemiğe ata" değil.** Denendi: sağ bacak sol uyluğa, kafa
boyna, el ön kola gidiyordu. Yem kemiklerle bastırılınca köprücük göğsün
önünü yuttu ve her kenar dişli kaldı. Yarıçap kuralı bu bağımlılığı kesiyor.

**Uyluk kemik başının üstüne taşıyor** (%22): kalça kası kemiğin üstünde ve
arkasında; kesilince figür kalçasız kalıyordu. Taşan kısım tepeye doğru
kosinüsle kapanıyor, yoksa kare bir çıkıntı gibi duruyordu.

**Parçalar her iki uçta %8 taşıyor:** düz kesilmiş iki parça bükülü dizde
dış tarafta köşe açıyordu.

### Ölçek ve orantı

1 mesh birimi = 24.92 px, uyluğa göre (105 px). Bu ölçekte:

| kemik | bizim | mesh | gerilme |
|---|---|---|---|
| thigh | 105 | 105 | ×1.00 |
| shin | 100 | 95 | ×1.05 |
| upper | 78 | 57 | **×1.37** |
| fore | 68 | 56 | ×1.21 |
| lumbar | 55 | 52 | ×1.06 |
| thorax | 85 | 77 | ×1.10 |
| neck | 24 | 27 | ×0.88 |

Bacak ve gövde tutuyor. **Kollarımız gerçek insandan orantısız uzun** ve
siluet kemiğe gerildiği için kollar mesh'tekinden ince görünüyor. Kemik
boylarını değiştirmek 31 arketipin her karesini etkilediği için burada
yapılmadı; ayrı bir iş.

### Yerel uzayda +X

Kemik `(0,0)`'dan `(0,len)`'e, yani aşağı. Yerel +X'in dünyada nereye baktığı
kemiğin yönüne bağlı: aşağı bakan kemiklerde (uyluk, baldır, üst kol) ön,
yukarı bakanlarda (bel, gövde, boyun) arka. Script bunu kendisi tutarlı
çıkarıyor çünkü izdüşürülmüş kemik yönünün dikini alıyor.

Ön kol asimetrik ve bu DOĞRU: ön kol dirsekte döndüğünde fleksör tarafı da
onunla döner. Elle çizilmiş eski set burayı "yön değiştiriyor" diye simetrik
bırakmıştı.

### Elle düzeltme gerekirse

`scripts/normalize-part.mjs` hâlâ duruyor: elde bir yol varsa `--a`/`--b`
kemik uçlarıyla yerel uzaya çevirip doğruluyor. Ama düzeltme mesh'te ya da
script'te yapılmalı, veride değil — veri üretiliyor, elle dokunulan yer bir
sonraki üretimde silinir.

## Doğrulama

`npm test` şemayı çalıştırıyor: `len`'ler kemik boylarıyla, açılı set yan
setle AYNI parçaları taşımalı. Uyuşmazsa export hiçbir şey yazmadan durur.

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

## Ön set

`--az 90` ile aynı mesh'ten üretiliyor. Önden görünüm bu parçalarla çiziliyor;
kollar tek pozdan 3B izdüşümle yerleşiyor (`armAz`/`foreAz`, bkz. `RigPose`).
Parçalar mesh'in SOL uzuvları: ekranda sağda görünen taraf (figürün solu)
olduğu gibi, soldaki taraf `scale(-1 1)` ile aynalanarak çizilir. Önden
bakışta kemik izdüşümde kısalabildiği için parça `partTransformScaled` ile
kemik boyunca ölçeklenir (öne eğik gövde, bükük diz).

Kafa da bir parça (`head`, kemik boyun kökü → kafa merkezi, 28px; siluet
çeneden tepeye). Yan sette de var; yan görünüm bugün hâlâ `headProfile()`
çiziyor, geçiş ayrı iş.

**Şema ne zorluyor:** ön set varsa yan setle AYNI parçaları taşımak zorunda.
Açılı (3/4) set yok — 2B kararı, `TODOS.md`.
