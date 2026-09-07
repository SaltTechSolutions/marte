# TODOS

Ertelenen işler. Her kayıt neden ertelendiğini ve nereden başlanacağını taşır.
Kaynak: `/plan-eng-review` 2026-09-06.

---

## Omuz ve boyun ROM formülünü doğrula, sonra tabloya ekle

**Ne:** `toLocal()` türetmesinin omuz ve boyun için klinik eklem açısıyla aynı
referans eksenini kullanıp kullanmadığını doğrulamak; doğruysa iki eklemi de
`rigAudit.ts`'teki ROM tablosuna eklemek.

**Neden:** Denetim bugün 4 eklem kapsıyor (diz, kalça, dirsek, gövde). Omuz ve
boyun dışarıda, çünkü omuz türetmesi yatık pozlarda şüpheli değerler üretti.

**Bağlam:** Ölçüm (2026-09-06, 30 arketip × 21 kare): `hip_thrust`,
`glute_bridge` ve `bird_dog` omuzda −150°..−153° okundu, AAOS ekstansiyon bandı
−60°. Bu bir sarmalama hatası mı yoksa gerçek anatomik sorun mu belirsiz;
inceleme bu türetmeye 5/10 güven verdi. Boyun ölçümünde hiç ihlal çıkmadı.
Kullanılan formül: `omuz = norm(180 - (upperA - thoraxA))`,
`boyun = norm(neckA - thoraxA)`.

**Artı:** ROM tablosu altı eklemi kapsar; `hip_thrust` şüphesi kapanır.
**Eksi:** Anatomi bilgisi gerektiriyor, koddan tek başına çözülmüyor.

**Bağlı:** Önce sagittal düzlem referans ekseninin açıkça tanımlanması gerekiyor.
Önden görünüm ayrı bir sorun: `frontElbow()` ([src/rig.ts:472](src/rig.ts:472))
dirseği anatomik açıyla değil sezgisel bir kuralla yerleştiriyor, yani önden
görünümde eklem açısı zaten anlamlı değil.

---

## Ayak bileği açısını modele ekle

**Ne:** `RigPose`'a gerçek bir ayak bileği eklem açısı eklemek.

**Neden:** Model bugün ayak bileği açısı taşımıyor. Ayak yönü
`footDirFor(mode)` sabiti ([src/rig.ts:669](src/rig.ts:669)), topuk kalkışı ise
piksel cinsinden `ankleLift`. Bu yüzden ayak bileği ROM denetimi model
değişmeden imkânsız.

**Bağlam:** İnceleme sırasında "7 eklem denetlenecek" denmişti; doğrusu 6, ve
ayak bileği o 6'nın dışında. Codex bu hatayı yakaladı. Dorsi/plantar fleksiyon
topuk kalkışında, çömelme derinliğinde ve şınav duruşunda gerçekten anlamlı.

**Artı:** Topuk kalkışı piksel yerine açıyla ifade edilir, model tutarlılaşır.
**Eksi:** Geriye uyumsuz. 30 arketibin verisini ve devir sözleşmesini etkiler.

**Bağlı:** Devir sözleşmesinin sürümlenmesi (bu turda ekleniyor) bu değişikliği
güvenli kılan ön koşul.

---

## Vendored Muscle-Map kopyasının bakımı

**Ne:** `Muscle-Map-for-React-Native` deposunun kopyalanan halini sürdürmek;
React Native sürüm yükseltmelerinde kırılırsa düzeltmek.

**Neden:** Kütüphane npm'de değil, kurulumu klasör kopyalamak ve depo 5
commit'lik. Bakım borcu bilerek üstlenildi (karar `d1`, 2026-09-05).

**Bağlam:** Alternatif `react-native-body-highlighter@3.2.0` npm'de ve bakımlı
ama 24 slug taşıyor ve alt bölge ayrımı yok (upper/lower chest yok). Bu turda
kanonik 36 gruplu sözlük BİZE ait olacak ve renderer'a eşlenecek, yani kütüphane
ölürse veri değil yalnızca eşleme tablosu değişir. Çıkış yolu budur.

**Artı:** RN yükseltmesi kırdığında panik yerine plan olur.
**Eksi:** Henüz gerçekleşmemiş bir risk.

**Bağlı:** Eşleme tablosu (bu turda yazılıyor) olmadan renderer değişimi ucuz olmaz.

---

## Uygulamaya gerçek bir yazı tipi seç

**Ne:** GymEntra için sistem fontu yerine gerçek bir yazı tipi ailesi seçmek ve
bir tipografi ölçeği tanımlamak.

**Neden:** Hem editör hem onaylanan mockup `-apple-system` kullanıyor. Tasarım
kural listesi bunu açıkça "tipografiden vazgeçtim sinyali" sayıyor: ürün her
uygulamaya benziyor, hiçbir karakter taşımıyor.

**Bağlam:** `/plan-design-review` 2026-09-06, Pass 4. Kas şeması işinin parçası
değil, ayrı bir marka kararı olduğu için ertelendi. GymEntra'nın hâlihazırda bir
yazı tipi olabilir; görmeden seçmek geri alınacak bir karar üretir.

**Artı:** Ürün görsel kimlik kazanır, tipografi kararı ne kadar geç alınırsa o
kadar çok ekranı etkiler.
**Eksi:** Sistem fontu her cihazda mükemmel render olur, sıfır yükleme maliyeti
getirir ve dinamik yazı boyutuna kendiliğinden uyar. Bunlar gerçek kayıplar.

**Bağlı:** GymEntra deposuna erişim. Bir DESIGN.md yazılacaksa (bugün yok) bu
karar oraya ait.

---

## Poz modeline derinlik ekseni ekle (3/4 açılı figür)

**Ne:** `RigPose`'a bir yatay düzlem (derinlik) ekseni eklemek, `skeleton()`'ın
izdüşümü hesaplaması ve figürün gerçek 3/4 açıyla çizilebilmesi.

**Neden:** Onaylanan mockup B'deki açılı figür motorla üretilemiyor. README'nin
yazdığı sınır bu: bağımsız bir 3B model yok, gövde rotasyonu poz olarak temsil
edilemiyor. 2B yan görünümü döndürmek ya da eğmek 3/4 vermiyor — uzuvlar
kısalmadığı için yamuk bir yan görünüm çıkıyor, derinlik oluşmuyor.

**Bağlam:** `/plan-design-review` 2026-09-06'da B varyantı onaylandı; oradaki
derinlik hissinin iki kaynağı vardı. Biri **perspektif barbell** (çubuk
derinliğe uzanıyor, uçlardaki tabaklar elips) ve o yapıldı — mobil önizlemede
çizim konvansiyonu olarak duruyor. Diğeri figürün kendi açısıydı ve o bu kayda
kaldı. Kullanıcı bunu bilerek erteledi (2026-09-06).

**UCUZ KESTİRME DENENDİ VE YETMEDİ (2026-09-06).** Uzak uzuvların 2B'deki
sahte kaydırmasını gerçek bir Z'ye çevirip kamerayı döndürmek denendi; ucuza
3/4 vereceği sanılmıştı. Ölçüm (standing_row_hinged, 0° → 26°): uyluk
105.0 → 102.4, baldır 100.0 → 99.8, diz açısı 38.0° → 34.6°. Şekil neredeyse
hiç değişmiyor. Sebep: poz sagittal düzlemde yazıldığı için bir taraftaki
bütün eklemler AYNI derinlikte, ve aynı derinlikteki noktaları döndürmek
onları göreli olarak değiştirmiyor — olan tek şey %10 yatay sıkışma. Deney
editörün "Karşılaştır" ekranında kanıt olarak duruyor. Bu işin ucuz yolu
YOK: eklem başına enine düzlem açısı gerekiyor.

**Artı:** Hareketin okunurluğu artar; yan görünümde üst üste binen uzuvlar
ayrışır. Önden görünümün bugünkü şematik izdüşümü de gerçek bir çözüme kavuşur.
**Eksi:** En pahalı ve en yayılan değişiklik. Devir sözleşmesini kırar,
30 arketibin kare verisi etkilenir, `rigAudit`'in ROM bantları yeni eksene de
bakmak zorunda kalır ve uygulamanın `RigFigure.tsx`'i de yeniden yazılır.

**Bağlı:** Ayak bileği açısı kaydıyla aynı kök sorunda buluşuyor — modelin
anatomik ifade gücü. İkisi birlikte planlanmalı; ayrı ayrı yapmak `RigPose`'u
iki kez kırar. Devir sözleşmesinin sürümlenmesi (manifest, 2026-09-06) bu
değişikliği güvenli kılan ön koşul.
