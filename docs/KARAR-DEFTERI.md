# Karar defteri

Oturumdan oturuma taşınması gereken şey yapılan iş değil — **verilen karar ve
bilerek yapılmayan şey**. Git zaten ne değiştiğini biliyor; niçin
değiştiğini ve neyin reddedildiğini bilmiyor.

En yeni kayıt en üstte. Kayıtlar **silinmez**, yalnızca "Açık" maddeleri
kapandıkça işaretlenir.

## Nasıl yazılır

Kod değiştiren her oturumun sonunda tek bir kayıt. Beş başlık, kısa tutulur:

```markdown
## YYYY-AA-GG — üç beş kelimelik başlık

**Yapıldı.** Bir paragraf. Ayrıntı commit'te; buraya sonuç yazılır.

**Karar.** Bundan sonra böyle olacak diye bağlanan şey + tek cümle gerekçe.

**Bilerek yapılmadı.** Değerlendirilip reddedilen seçenek + neden. Bu başlık
en değerlisi: bir sonraki oturum aynı fikri yeniden keşfedip uygulamasın.

**Açık.** Kapanmamış iş, bilinen kusur, doğrulanmamış varsayım.

**Nerede.** Ayrıntının yaşadığı dosya(lar).
```

Bir başlığın içeriği yoksa satırı yaz, "—" koy. Boş bırakma: "reddedilen bir
şey yok" ile "yazmayı unuttum" farklı şeyler.

---

## 2026-09-11 — uzak ayak baldırı izliyor

**Yapıldı.** Geri bildirim: arka bacağa bağlı ayak bazı figürlerde iyi,
bazılarında kötü. Sebep sabit bir değerdi — uzak ayak `footDirOf` ile hareket
başına TEK bir yön alıyordu ve o yön YERE BASAN ayak için doğru (düz zeminde
ayak yataydır). Uzak baldır savrulunca ayak yerinde kalıyor, bilekten kopmuş
gibi duruyordu. Ölçüldü (yakın bileğe göre sapma): `bird_dog` 6° ve
`dead_bug` 6° — fark edilmiyor; `step_up` 28°, `carry` 64°, hamle 107°.
"Bazısında iyi bazısında kötü" tam olarak bu dağılım.

`footDirFarOf` eklendi: bilek sapmayı yutabildiği kadar yutuyor, artanı ayak
dönerek karşılıyor. Sapma sonrası hepsi bileğin gerçek aralığında (≤50°), zaten
iyi olanlar hiç değişmedi. Hamlede arka ayak kendiliğinden parmak ucuna kalktı
(topuk-parmak yükseklik farkı 1px → 40px).

Ayrıca telefon önizlemesi uzak AYAĞI hiç çizmiyordu, uygulama çiziyordu —
önizleme uygulamayı değil eksik bir figürü gösteriyordu. Eklendi.

**Karar.** **Yere basan ayağın yönü ile havadaki ayağın yönü aynı kaynaktan
gelmez.** Sabit yön yalnızca zemine basan ayak için doğrudur; serbest ayak
baldırını izler, bileğin ROM'u kadar gecikmeyle. Sınırlar AAOS: dorsifleksiyon
20°, plantarfleksiyon 50°; normal olarak değil SINIR olarak kullanılıyor.

**Bilerek yapılmadı.** Uzak ayağın `pinToe`'su hâlâ YAKIN bacağın
`ankleLift`'inden geliyor; ayrı bir kaynak istiyor ama bildirilen kusur bu
değildi. Hamlenin arka ayağı iniş boyunca zeminden 38 birim yükseliyor
(gerçek hamlede parmak yerde kalır) — poz verisi işi, ayrı.

**Nerede.** `packages/rig/src/rig.ts` (`footDirFarOf`),
`packages/rig/editor/editor.js`, `apps/gymentra-mobile/src/components/RigFigure.tsx`.

## 2026-09-11 — kalça gövdeye bağlandı, uzak bacak yerine oturdu (Bridgman)

**Yapıldı.** Kullanıcı figüre bakıp iki şey söyledi: arka bacak vücudun parçası
değil eklenti gibi duruyor, kalça gövdeden kopuk. İkisi de doğruydu; kaynağa
gidildi (George B. Bridgman, *Constructive Anatomy*, 1920 — tam metni
chestofbooks.com'da).

1. **Uzak kalça kayması 18 → 7 birim.** Tam yandan bakışta iki kalça eklemi
   aynı noktaya düşer; kaydırma bir okunurluk payıdır ve büyüklüğü örtük bir
   kamera dönüşü demektir. Leğen genişliği ≈43 birim olduğuna göre 18 birim
   ≈25°'lik bir dönüş — oysa depo 3/4 ve açılı gösterimden BİLEREK vazgeçmişti.
   Yani figüre sessizce reddedilmiş bir dönüş giriyordu ve uzak bacak neredeyse
   leğenin arka kenarından çıkıyordu. 7 birim ≈ 9°.
2. **Leğen kütlesi eklendi** (`pelvisMass`). Bridgman gövdeyi üç değişmez
   kütleyle kuruyor — baş, göğüs, leğen — ve parçaların birbirine uç uca değil
   GEÇMELİ ("morticed") bağlandığını söylüyor. Çizimde leğen hiç yoktu: parça
   kipinde bilerek atlanmıştı, bel parçası kalça ekleminde bitiyor uyluk aynı
   noktadan başlıyordu. Kenar çizgisi görünür olunca o değme yeri dikişe
   dönüştü. Blok kalça ekleminin altına taşıyor ki uyluk üstüne binsin.
3. **Uzak uzuv yeniden DOLU.** Bir önceki tur onu kart renginde içi boş
   çizmişti; yanlıştı. Atmosferik perspektifin kuralı uzaktaki biçimin
   KONTRASTININ azalması, dolgusunun kalkması değil — içi boş uzuv gövdenin
   arkasındaki bacak gibi değil, gövdeye açılmış delik gibi okunuyor.

**Karar.** **Derinliği kaydırma değil ton ve örtüşme taşır.** Uzak uzuv
gövdenin yanında durur, karttan hafifçe ayrılan bir tonla dolu çizilir ve hattı
yakınınkinden ~2.3 kat zayıftır. Leğen bloğunun önü belden ileri çıkmaz
(ibiğin genişlemesi YANALdır); derinlik arkada, gluteal kütlede.

**Bilerek yapılmadı.** Leğen bloğu simetrik bırakılmadı: ilk hâli önde bir
çıkıntı yapıyordu, ön 20 / arka 27'ye ayrıldı. Kaymayı tamamen sıfırlamak da
denenmedi — 0'da uzak bacak yakınının tam arkasına düşüyor ve hamlede iki
bacağı ayırt etmek zorlaşıyor.

**Açık.** Siluetler hâlâ stilize; antrenör onayından geçmedi. Uygulamanın
çizimi simülatörde çalıştırılmadı.

**Nerede.** `packages/rig/src/rig.ts` (`hipF`, `pelvisMass`),
`apps/gymentra-mobile/src/theme/figureColors.ts`,
`apps/gymentra-mobile/src/components/RigFigure.tsx`,
`packages/rig/editor/editor.js`.

## 2026-09-11 — uzuv siluetleri profilden üretiliyor; ters bükülen diz yakalandı

**Yapıldı.** `data/bodyParts.json` artık elle çizilmiş değil,
`scripts/build-body-parts.mjs` tarafından ÜRETİLİYOR: her kemik için boyunca
birkaç istasyonda ön (+X) ve arka (−X) yarı genişlik yazılı, script bunlardan
kapalı bir Catmull-Rom dış hat kuruyor. Kütlenin nerede olduğu artık
düzenlenebilir veri — quadriceps karnı, baldır karnı, göğüs kafesinin açılması,
belin incelmesi hepsi görünüyor. Eski yollar 7–8 komutluk tek daralmaydı.

Gözle bakarken kullanıcı arka bacağın "sakat göründüğünü" söyledi; ölçünce
**uzak dizin ters yöne büküldüğü** çıktı: `carry` −30°, `unilateral_lunge`
−26.8°. İkisi de düzeltildi (`carry` 3 → 5 kare, gerçek bir salınım profili;
`unilateral_lunge`'ın ayakta karesi +10° bükülü). Bunun yan etkisi olarak
`carry`'nin zemin gömülmesi de kapandı ve **depoda hiç denetim uyarısı
kalmadı**.

**Karar.** **ROM bandı mutlak değerle yazılırsa işaret kaybolur.** Uzak diz
bandı `Math.abs(...)` alıp yalnızca `hi: 160` denetliyordu; ters bükülme o
mutlak değerin içinde yıllarca görünmedi. Yakın dizin `lo: -15` bandı vardı,
uzak dizinki yoktu. Eklendi ve eklendiği anda iki gerçek arketibi yakaladı.
`unilateral_lunge`'ın bozuk değerleri 7 Eylül'deki bir zemin düzeltmesinden
geliyordu: o oturum bükülmeyi 26.8° "bükük" diye okumuştu, oysa −26.8°'ydi.

**Bilerek yapılmadı.** `docs/uzuv-parcalari-nasil-uretilir.md`'deki tam zincir
(CC0 MakeHuman modeli → Blender ortografik render → uzuvlara bölme →
`normalize-part.mjs`) ÇALIŞTIRILAMADI: bu makinede ne Blender ne MakeHuman ne
Inkscape ne potrace kurulu, ve MakeHuman'ın model üretimi zaten arayüz işi.
Belge ve `normalize-part.mjs` duruyor; o zincir bir gün çalıştırıldığında
değişen tek şey yine `data/bodyParts.json` olur, script silinir. Kalınlıklar
uydurulmadı: bugünkü siluetlerin çevresi korundu (Drillis & Contini segment
oranlarıyla rig'in kemik boylarından türetilen boy ≈ 430 birim, o boyda
beklenen uyluk yarı-derinliği ≈ 21, bugünkü 18 idi — ölçek zaten doğruydu,
eksik olan biçimdi).

**Açık.** (1) Siluetler tarama değil, yüzey anatomisine göre kurulmuş stilize
biçimler; antrenör onayından geçmedi. (2) Omuz/boyun ROM formülü ve ayak
bileği açısı hâlâ TODOS'ta. (3) Uygulamanın çizimi yine simülatörde
çalıştırılmadı.

**Nerede.** `packages/rig/scripts/build-body-parts.mjs`,
`packages/rig/data/{bodyParts,rigArchetypes}.json`,
`packages/rig/src/rigAudit.ts`, `packages/rig/tests/{rig,rigAudit}.test.ts`.

## 2026-09-11 — figür kartın üstünde görünür oldu, uzuv dikişleri kapandı

**Yapıldı.** Figürün renkleri artık ÜSTÜNDE DURDUĞU yüzeyden (`surf`, yani
`Card`) türetiliyor. Eskiden `surf2`/`bg0`'dan türetiliyordu ve karanlık temada
`skinFar` tam olarak kartın rengine düşüyordu: ölçülen kontrast **1.00:1** —
uzak uzuv hiç çizilmiyor gibiydi. Türetme `theme/figureColors.ts`'e taşındı ve
testlendi. Yol boyunca ölü bir dal çıktı: `hexToHsl` parlaklığı 0–1 ölçeğinde
veriyor, koşul `> 50` yazılmıştı, yani **aydınlık tema dalı hiç çalışmıyordu**.
Ayrıca uzuvların dikişleri kapatıldı: her parça ayrı konturlanınca uzvun
ortasından enine bir çizgi geçiyordu, eklem topu da siluetin dışına taşınca
yumru yapıyordu.

**Karar.** **Yakın/uzak ayrımını DOLGU değil KENAR ÇİZGİSİ taşıyor.** Renk tek
boyutlu ama kısıt üç tane (yakın↔kart, uzak↔kart, yakın↔uzak); üçünü birden
dolgu açıklığıyla çözmeye kalkınca yakın uzuv gümüşe kadar açılıyor. Uzak uzuv
kart renginde İÇİ BOŞ, yakın uzuv dolu, ikisi de görünür hatla. Dört temada da
her iki hat WCAG 1.4.11'in 3:1 eşiğini geçiyor; `figureColors.test.ts` bunu
sınıyor, yani kat sayı ya da tema rengi değişirse test düşer.

Uzuvlar **zincir** olarak çiziliyor: altta hat renginde şişirilmiş kopya, üstte
konturu olmayan dolgu. Zincir sınırı çizim sırasını taşıyor — gövde ile yakın
kol ayrı zincirler, çünkü kolun gövdenin önünden geçtiği yerde hat isteniyor.
`--line` sahne eşyasının (sehpa, kablo, makine) ince hattı olarak kaldı;
figürün hattı `--edge`/`--edgeFar`. Editörün sahne zemini de uygulamanın
kartıyla aynı renge alındı: poz, ekranda duracağı zeminin üstünde yazılıyor.

**Bilerek yapılmadı.** **Kadraj işi (planın 4. maddesi) İPTAL.** Raporda
`boundsFor`'un `y1 = max(y1, GROUND + 20)` satırının `leg_press_seated`'te
kadrajın %26'sını harcadığı yazıyordu; o ölçüm YANLIŞTI — yalnızca iskeletin
sınırını alıyordu, oysa o boşluğu makine ayakları, kablo kolonu ve zemin
çizgisi dolduruyor. Prop'lar dahil edilerek tekrar ölçüldü: 40 arketipte en
büyük alt pay **15 birim (%3)**. Satır işini yapıyor, dokunulmadı.

Eklem topu yarıçaplarını uzuv genişliğinden türetmek de yapılmadı: siluetlerin
uçtaki yarı genişlikleri ölçüldü (diz 12/15, dirsek 9/10) ve bugünkü sabitler
(13, 10) zaten doğru aralıkta; asıl kusur yarıçap değil, ayrı konturlamaydı.

**Açık.** (1) Uygulamanın kendi çizimi ÇALIŞTIRILARAK doğrulanmadı —
simülatör bu oturumda kullanılmadı; doğrulama editörün aynı çizimi üzerinden
ve yapısal eşlik üzerinden yapıldı. (2) Uzuv siluetleri hâlâ elle çizilmiş
kaba taslak (`bodyParts.json`); üretim yolu yazılı ama 3B iş bekliyor.
(3) `carry` salınımında diz düzleşmesi duruyor.

**Nerede.** `apps/gymentra-mobile/src/theme/figureColors.ts` (+ testi),
`apps/gymentra-mobile/src/components/RigFigure.tsx`,
`packages/rig/editor/{index.html,editor.js}`.

## 2026-09-11 — metinler koddan veriye, antrenör adları girildi

**Yapıldı.** Kullanıcıya görünen her metin `build_exercise_library.py`'den
`packages/rig/data/exercises.json`'a taşındı: `en`, `difficulty`, `equipTr`,
`equipEn`, `setsHint`, `restHint`, `steps`. Taşıma elle değil, üreticinin
kendi `EXO` listesini okuyan tek seferlik bir scriptle yapıldı; kanıtı
üretilen `exerciseLibrary.ts`'in taşımadan sonra BİREBİR aynı çıkması
(59777 bayt). Üretici bu alanları artık veriden okuyor ve eksik alanda
duruyor. Editöre metin paneli eklendi ("Metin" düğmesi), `PUT /exercises`
yolu `exercises.json`'ı yazıyor. Ardından antrenörden gelen tablo
(`docs/hareket-adlari-arastirma.csv`) uygulandı: 45 Türkçe ad tarif edici
hâle geldi ve 186 adımlık yeni anlatım girildi.

**Karar.** **Metin veride yaşıyor; düzeltme editörden girilir, Python
düzenlenmez.** Alan sırası kayıtta sabitleniyor (`orderCatalog`) ki tarayıcı
yeni alanı sona eklediğinde diff okunmaz olmasın. Adım anlatımlarının
İngilizcesi bu oturumda ÇEVİRİ ile yazıldı — antrenör onayından geçmedi.
`squat` yazımı bağlandı (tabloda "squad" geçiyordu).

**Bilerek yapılmadı.** CSV'nin Türkçe anlatımını alıp bugünkü İngilizceyi
olduğu gibi korumak denenmedi: 45 hareketin 45'inde madde sayısı tutmuyor ve
içerik örtüşmüyordu, konumsal eşleme her adımın altına başka bir şey söyleyen
bir İngilizce satır basardı. Adımları tek dile düşürmek de reddedildi —
`exercise-detail.tsx` her adımın altında İngilizcesini gösteriyor.
`primary`/`secondary` kasların `rigMuscles.json` ile çiftlenmesine
dokunulmadı: bu oturumun işi metindi.

**Açık.** (1) Adımların İngilizcesi ve 45 Türkçe adın tamamı antrenör
onayından geçmedi. (2) 14 harekette eski Türkçe eş ad artık hiçbir alanda
geçmiyor (ör. "Ölü böcek", "Yüz çekişi"); salon adı yalnızca İngilizce
alanda duruyor, arama o addan bulmuyor. (3) `exerciseByName`'in gevşek
eşlemesi adlar tarif ediciye dönünce kırılmıştı; iki yönlü hâle getirildi,
ama tek kelimelik girişlerde kasıtlı olarak kapalı.

**Nerede.** `packages/rig/data/exercises.json`,
`backend/scripts/build_exercise_library.py`, `packages/rig/scripts/editor.mjs`,
`packages/rig/editor/{index.html,editor.js}`, `packages/rig/src/rigSchema.ts`.

## 2026-09-11 — pushdown kablosu, tek tabak kuralı, metinler için devir notu

**Yapıldı.** Triceps pushdown'a kablo istasyonu verildi (`prop: null`
taşıyordu, yani boşluğa itiyordu) ve ayakta duran figürde makara kolonu ÖNE
alındı — "tepede" kuralı direği gövdenin içinden geçiriyordu. Halter tabağı
artık tek kuralla çiziliyor: nerede tutulursa tutulsun yakın tabak en üstte
ve saydam; sırt/kalça halteri gövdenin arkasındaydı ve telefon önizlemesi
back squat ile hip thrust'ta hiç tabak çizmiyordu. 45 hareket için
`docs/hareket-adlari-arastirma.csv` üretildi.

**Karar.** **Kullanıcıya görünen metin veride yaşar, kodda değil.** Bugün
`steps`, ekipman, zorluk ve set/dinlenme ipuçları
`backend/scripts/build_exercise_library.py` içinde sabit; antrenörün
düzeltmesi Python düzenlemeden girilemiyor. Taşıma planı
`docs/metin-duzenleme-plani.md`'de, kapsam kullanıcı tarafından seçildi
(ad + alt ad + adımlar + ekipman/zorluk/ipucu; adımlar TR+EN kalıyor).

**Bilerek yapılmadı.** Çizim notu (`note`) düzenlenebilir alan yapılmadı:
iç not, uygulamaya gitmiyor. Yayındaki editöre Artifact veritabanıyla kayıt
yolu AÇILMADI — kullanıcı yerelde devam etmeyi seçti, orada `npm run editor`
zaten depoya yazıyor. Adlar için web araması yapılmadı; tablo boş sütunlarla
verildi, çünkü kaynaksız ad üretmek bugünkü sorunun kendisi.

**Açık.** Metin taşıma işinin tamamı (plan dosyasındaki 5 adım). Ayak
yönleri tek tek gözden geçirilmedi. Önceki oturumların açıkları duruyor.

**Nerede.** `docs/metin-duzenleme-plani.md`,
`docs/hareket-adlari-arastirma.csv`, `packages/rig/editor/editor.js`,
`apps/gymentra-mobile/src/components/RigFigure.tsx`,
`packages/rig/data/rigArchetypes.json`.

---

## 2026-09-11 — ayak ucu tutamağı, tutamak uçtan görünüyor

**Yapıldı.** Editöre **ayak ucu tutamağı** eklendi: sürüklenince pozu değil
hareketin `footDir` değerini yazıyor (`footDirFromToe` motorda, `dragFootDir`
`rigEdit`'te). Kablo tutamağı artık kabloya dik uzun bir kapsül değil, UÇTAN
görünen bir disk. Kablo küreğinin ayak plakası dik değil, ayağın taban
düzlemine oturuyor ve zemine bağlanıyor; harekete `footDir: 30` verildi.

**Karar.** **Gövdeye dik duran çubuk yandan UÇTAN görünür.** Tutamağı
kabloya dik uzun bir kapsül olarak çizmek onu sagittal düzlemde yatırıyordu:
elde eğik bir sopa, kürekte direksiyon gibi okunuyordu. Halter tabağı zaten
bu sözleşmeyi kullanıyordu, tutamak da ona uydu.

**Karar.** **Ayak yönü gözle ayarlanır.** Ayak bileği açısı modelde yok ve
eklenmiyor (TODOS.md'deki gerekçe duruyor); ama `footDir` hareket başına tek
bir sayı olduğu için tutamakla verilebiliyor. Tutamak tüm kareleri birden
değiştirir, etiketi bunu söylüyor.

**Bilerek yapılmadı.** `RigPose`'a kare başına ayak bileği açısı eklenmedi —
geriye uyumsuz, 40 arketibin verisini ve devir sözleşmesini etkiliyor.
Pulldown ile kürek tutamağı da artık aynı görünüyor: yandan bakınca gerçekten
aynılar, genişlik farkı sagittal düzlemde görünmez.

**Açık.** Ayak yönleri tek tek gözden geçirilmedi; tutamak artık var, ama
hangi hareketin ayağı hâlâ yanlış duruyor sayılmadı. Önceki oturumun açık
maddeleri (uzman onayı, ad tablosu, üretim seed'i) duruyor.

**Nerede.** `packages/rig/src/rig.ts` (`footDirFromToe`, `footExtra`),
`packages/rig/src/rigEdit.ts`, `packages/rig/editor/editor.js`,
`apps/gymentra-mobile/src/components/RigFigure.tsx`.

---

## 2026-09-10 — istasyonlar gerçekçileşti, makine göğüs presi kaldırıldı

**Yapıldı.** Yeni hareketlerin durağan hâlleri tek tek gözden geçirildi.
Barfikste dizler geriye büküldü (`thighA: 205, shinA: 285`) — düz bacakla
asılan figürün ayağı zemine değiyor, hareket "barın altında durmak" gibi
okunuyordu. Oturarak kürek sandalyeden alçak sehpaya taşındı: `cableFrom:
'low'` için ayrı bir çizim dalı yazıldı (sırtlıksız alçak minder, zemin
direği, dikey ayak plakası) ve bacaklar öne uzatıldı (`thighA: 100, shinA:
85`). `chest_press_seated` arketibi ve `machine-chest-press` hareketi
tamamen silindi; `chest-supported-row` `standing_row_hinged`'e bağlandı ve
iki ALIAS satırı `bench-press`'e yönlendirildi (41→40 arketip, 46→45
hareket).

**Karar.** **Çizilemeyen makine çizilmez.** Makine göğüs presi karmaşık
mekanizmalı bir alettir; iki boyutlu siluetle çizilince hangi aletle
yapıldığı anlaşılmıyordu. Ürünün derdi makine kullanmak değil hareketin
doğru yapılması: aynı kas kalıbını veren makinesiz sürüm (`bench-press`)
zaten vardı, hareket ona bağlandı.

**Bilerek yapılmadı.** Makine göğüs presine daha iyi bir çizim aranmadı —
`sled` ve `legpad` istasyonlarının aksine bunun tanınabilir tek bir silueti
yok. Ölü böceğe de dokunulmadı: gövde yerde, uyluk dik, baldır yatay, kollar
tavana — poz zaten doğru okunuyor.

**Açık.** 11 poz ve yeni kas verisi hâlâ uzman onayı bekliyor
(`poseReviewed: false`, `reviewed: false`). Ad tablosu antrenör onayında
(`docs/hareket-adlari-onay.md`). `seed_program_templates.cjs` üretime karşı
çalıştırılmadı.

**Nerede.** `packages/rig/data/rigArchetypes.json`,
`packages/rig/editor/editor.js` (`drawProps`),
`apps/gymentra-mobile/src/components/RigFigure.tsx`,
`backend/scripts/build_exercise_library.py`.

---

## 2026-09-10 — makine hareketleri, hedef paketleri, çizim katmanları

**Yapıldı.** Figür motoruna `seat` kök noktası eklendi ve motorda duran ama
hiç kullanılmayan `supine` ilk kez kullanıldı; eksik 12 hareketin pozları
yazıldı (30→41 arketip, 34→46 hareket). PER-18'in iki yıldır seed JSON'da
öylece duran şablonları uygulamaya bağlandı (tipler, Firestore kuralları + 4
kural testi, dönüştürücü, repo, kopyalama fonksiyonu, antrenörde şablon
seçici, üyede hedef ekranı) ve üstüne dört kanıta dayalı hedef paketi
eklendi. Editör tek HTML'e paketlenip salt okunur inceleme sayfası olarak
yayınlanabilir hâle geldi (`npm run review`).

Üç sessiz kayıp kapandı: `LIBRARY_GROUPS` kütüphanede olmayan 12 kimliğe
atıfta bulunuyordu ve iki okuyucu da bilinmeyeni sessizce atıyordu (leg
press, lat pulldown, face pull, triceps pushdown hiç görünmüyordu); ALIAS
tablosunda **20 şablon satırı** "hareket yok"a bağlıydı, yani üye programının
önemli bir kısmı anlatımsız açılıyordu; `build_exercise_library.py` monorepo
taşımasından kalan yola yazıyordu.

**Karar.**
- **Her `prop` bir İSTASYON tarif eder, tek parça değil.** `prop` tek değer
  aldığı için "koltuk + kızak" gibi bileşim yazılamıyor; yalnızca kızağı
  seçmek figürü koltuksuz bırakıyordu. `sled`, `cable` ve `legpad` kendi
  koltuklarını da çiziyor.
- **Ekipman direncin yönünü göstermek zorunda.** Tabaklı halter, yastıksız
  bacak makinesi ve havada duran levha üçü de aynı sorunun örneğiydi:
  hareket görünüyor, KUVVET görünmüyordu.
- **Sahne durağan, kızak değil.** Ekipmanın konumu kural olarak 0. karenin
  iskeletinden okunur (sehpa, basamak, barfiks barı yerinde durmalı, yoksa
  figürle birlikte kayar). Bacak presi platformu bu kuralın **istisnası**:
  ayak ona basılı kalır ve ikisi birlikte gider, o yüzden geçerli kareden
  çizilir ve itiş eksenine dik durur.
- **3/4 ve açılı gösterimden TAMAMEN vazgeçildi.** Ne editörde ne uygulamada
  açılı figür olacak. Kaldırıldı: derinlik izdüşümü (`skel3`, `proj`),
  `cmpFigure`'ın `depth` kipi, Karşılaştır ekranındaki "Derinlik denemesi"
  hücresi ve **mobil önizlemedeki perspektif halter** — sonuncusu bu yönün
  son kalıntısıydı ve uygulama onu hiç çizmediği için önizleme yalan
  söylüyordu. Ölçüm ve gerekçe `packages/rig/TODOS.md`'de reddedilen yön
  olarak duruyor; okunurluk bundan sonra 2B içinde çözülür.
- **Elde tutulan halter kafadan SONRA çizilir**, iki çizicide de. `plate`'in
  notu bunu ilk günden söylüyordu, kod söylemiyordu; tabak bilerek saydam ve
  saydamlık tam bu durum için konmuştu.
- **Bölgesel yağ kaybı yok, bölgesel kas gelişimi var.** Ürünün bütün hedef
  dili bu ayrıma bağlı. "Karın inceltme" adı yasak kalıyor (PER-18 kararı);
  yeni paket **"Karın Kasları"** — kası hedefler, görünürlüğün yağ oranına
  bağlı olduğunu bir kez açıkça söyler ve Yağ Kaybı şablonuna bağlar.
- Popüler talebi isim değil **`goal` alanı** karşılar: üye kendi diliyle
  seçer, uygulama dürüst adlı programa götürür ve nedenini tek cümle söyler.
- **Şablon atanmaz, kopyalanır.** Canlı bağ olsaydı kanıt güncellendiğinde
  antrenörün üstünde çalıştığı programın altından veri çekilirdi.
- **Global şablonlara istemciden yazma izni yok** — yalnızca seed betiği
  (admin SDK). Aksi hâlde ortak kanıta dayalı içeriği herhangi bir salon ezer.
- **Türkçe hareket adının tek kaynağı `packages/rig/data/exercises.json`.**
  Üretici adı oradan okur; ikinci kopya tutulmaz.
- Yeni `ProgramExercise` alanlarının hepsi **opsiyonel** — zorunlu olsalardı
  yazılmış her program ve her `workout_log` geçersiz olurdu.

**Subtree şüphesi — KAPANDI, bir daha açılmayacak.** Kullanıcı kararı
(2026-09-10): eski depo monorepo ile birleştirildi ve arşivlendi; orada son
duruma ait bilgi yok, peşine düşülmeyecek. Bu depo `packages/rig` için tek
doğruluk kaynağıdır.

Şüphe yine de araştırıldı ve tarihler kaybolan iş olmadığını gösteriyor: "Bazı şeyler eski haline gelmiş"
şüphesi araştırıldı: kesim commit'i `fbb1fb2c` **2026-09-07 16:29:35**,
monorepo'ya alınışı **16:34:36** — beş dakika sonra. Kesim, varsayılan dala
yapılan PR #1 birleştirmesi, yani o andaki depo ucu. O beş dakikada kimse
push etmediyse (eden kişi zaten devri yapan olurdu) devirde hiçbir şey
kaybolmadı; eski depolar da README'ye göre arşivli.

Bulgular bunu doğruluyor: üç kusurun üçü de deponun **kendi içindeki eski
tutarsızlıklar**, kaybolmuş iş değil. Tabak/kafa sırası `git log -L` ile ilk
commit'e (`a49474a8`) kadar izleniyor, hiç değişmemiş. Perspektif halter
zaten vardı ve `TODOS.md` onu bilinçli konvansiyon diye kaydetmiş. Önizleme
kapsül çizimi ilk yazıldığından beri öyle.

"Çizim katmanlarını netleştirmiştik" hatırası da gerçek commit'lere denk
geliyor ve **hepsi monorepo'da**: `04832fa2` (karşılaştırmadaki 2B hücresi,
6 Eyl), `30b45bfa` (uzak eldeki ağırlık gövdenin arkasına, 7 Eyl),
`2ab47d48` (sırtüstü figür aynalandı, 7 Eyl). Hiçbirinde yapılmamış olan
şey tabak/kafa sırasıydı — gerileme değil, boşluk.

**Bilerek yapılmadı.**
- **Birincil hareket adları Türkçeleştirilmedi.** Mevcut adların hepsi zaten
  bu deponun antrenör incelemesinden geçmiş şablonlarının kullandığı adlar;
  eksik olan karşılıktı, o `trAlt` olarak eklendi.
- **8 harekete Türkçe karşılık yazılmadı** (goblet squat, back squat, plank,
  bird-dog, Pallof pres, McGill curl-up, Bulgarian split squat, bant
  pull-apart): kimsenin söylemediği bir Türkçe ad, adsızlıktan kötü.
- **Göğüs destekli küreğe ayrı arketip verilmedi** — oturarak kürekle aynı
  kalıp. Arketip ile hareket aynı şey değil.
- **Kalça ROM bandı gevşetilmedi, İKİYE AYRILDI.** İşaret yalnızca `stand`
  modunda anlamlı (diz bandı bu ayrımı zaten yapıyordu); sırtüstü figürde
  gövde yönü döndüğü için formül masa üstü pozu imkânsız sayıyordu. Büyüklük
  denetimi her modda duruyor.

**Kapandı (aynı oturum).** Bacak presinde figür zeminin 110px üstünde
**hiçbir şeyin üstünde** oturuyordu: `prop` tek değer aldığı için `sled`
seçmek `seatback`'i düşürüyordu. Bir kızak yalnızca bacak presinde
bulunduğuna göre `sled` artık bütün makineyi çiziyor (koltuk + sırt dayaması
+ zemine inen ayak + platform). Ekipman çizimi `drawProps` olarak ortak
fonksiyona alındı — telefon önizlemesi ekipmanı **hiç** çizmiyordu, yani
sehpasız, barsız, koltuksuz bir figür gösteriyordu. Gölge (onion skin)
düğmesi ve özelliği kaldırıldı: kullanılmıyordu. Uygulamadaki tabağa editörle aynı saydamlık
verildi (`fillOpacity .62`) — kafadan sonra çizilmeye başlayınca kafayı
tamamen örtüyordu, bu oturumda açılan hataydı. Mobil önizleme artık
uygulamanın çizdiğini çiziyor: parça siluetleri, `headProfile`, ana sahnenin
düz tabağı. `TODOS.md` kaydı reddedilen yön olarak yeniden yazıldı.

Uygulamadaki **ikinci editör kopyası silindi** (`tools/rig-editor/`,
`scripts/rig-editor.mjs`, `npm run rig`): canonical editörün eski bir
kopyasıydı ve uygulamanın ÜRETİLMİŞ `rigArchetypes.json`'ına yazıyordu, yani
tek yön sözleşmesini kıran şeyi `AGENTS.md` tavsiye ediyordu. O bölüm
`packages/rig`'i gösterecek şekilde yeniden yazıldı; neyin neden silindiği
orada bir not olarak duruyor.

**11 yeni pozun gözle durum kontrolü (2026-09-10).** Hepsi tek tek
incelendi. İkisi düzeltildi, dördü karar bekliyor:

- **McGill curl-up havada duruyordu** — eller belin altına konunca el en
  alçak temas noktası oldu ve bütün gövdeyi kaldırdı; sonra bükük dizin
  ayağı aynısını yaptı. Kollar gövde hizasına, bacak açıları yere yatacak
  şekilde çözüldü, `footDir: 25` ile ayak parmakları yukarı. Sırtüstü figürde
  kural: gövde VE ayak ikisi birden zemin düzleminde olmalı.
- **Triceps pushdown'da elde dambıl çiziliyordu** (`load: 'dumbbell'`,
  `standing_arm_isolation`'dan kopyalanmış) — kablo hareketi, kaldırıldı.
- **`cable` istasyonu eklendi.** Dört harekette (lat pulldown, oturarak
  kürek, makine göğüs presi, yüz çekişi) `bar: 'hands'` elde TABAKLI HALTER
  çiziyordu — direncin nereden geldiği görünmüyordu. Artık makara + kablo +
  tutamak var. **`cableFrom` çizim süsü değil, kuvvetin yönü:** `high`
  (pulldown), `front` (yüz çekişi), `low` (oturarak kürek — kablo yerden
  yükselir), `back` (göğüs presi — kaldıraç kolu arkadan gelir). İlk denemede
  presin makarası ÖNDEYDİ, yani kablo eli öne çekiyordu ve hareket kürek gibi
  okunuyordu; kürekte de makara el hizasındaydı ve yatay bir sırık gibi
  duruyordu.
- **`legpad` istasyonu eklendi.** Leg extension ve leg curl yastıksızdı;
  kullanıcının deyişiyle "gücün ne yöne uygulandığı belli olmuyordu". Rulo
  ayağın GİTTİĞİ yönde duruyor (direnç harekete karşı koyar), bir kolla
  koltuğa bağlı. Yön veriden değil hareketin kendisinden çıkıyor.

**Açık.**
- 12 poz ve yeni kas verisi **gözle/uzman onayı bekliyor**
  (`poseReviewed: false`, `reviewed: false`).
- Ad tablosu antrenör onayı bekliyor → `docs/hareket-adlari-onay.md`.
- `seed_program_templates.cjs` üretime **çalıştırılmadı**.

**Nerede.** `packages/rig/{src,data,editor,scripts}` · `docs/program_templates.md`
· `docs/hareket-adlari-onay.md` · `backend/scripts/{build_exercise_library.py,program_templates.seed.json}`
· `apps/gymentra-mobile/src/{data,app,components}` · `backend/firestore.rules`

---

## Defter öncesi

Bu tarihten önceki kararlar dağınık ama kayıtlı. En değerli üç yer:

- **`docs/program_templates.md`** — "Antrenör personası incelemesi" bölümü,
  özellikle **"Bilerek reddedildi"** listesi (upright row neden alınmadı,
  mekik neden yok, kadın/erkek şablonu neden yapılmadı). Bu liste sayesinde
  o kararlar aylar sonra ayakta kaldı.
- **`packages/rig/TODOS.md`** — ertelenen işler; her kayıt neden ertelendiğini
  ve nereden başlanacağını taşıyor. "Ucuz kestirme denendi ve yetmedi"
  ölçümü burada.
- **`docs/plan.md`** — tamamlanan maddelerin altındaki dated "Çözüldü" ve
  "✅ Karar" notları.

Yazılı olmayan kararlar korunmadı; bu defter tam olarak onun için var.
