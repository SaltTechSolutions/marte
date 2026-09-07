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

## Poz modeline derinlik ekseni ekle (3/4 açılı figür) — KAPANDI (2026-09-07)

**Karar:** 2B yan görünümde kalındı. 3/4 açılı figür hedefi bırakıldı.

**Neden:** Üç kez denendi, üçü de aynı tavana çarptı: (1) uzak uzuvların sahte
kaydırmasını gerçek Z'ye çevirip kamerayı döndürmek — figür şekil değiştirmedi;
(2) yan siluetten kesit varsayımıyla (gövde dikdörtgen, uzuvlar elips) açılı
parça setleri üretmek — "sakat bir insan gibi"; (3) MakeHuman CC0 mesh'inden
50° siluet üretmek — parçalar düzeldi ama figür hâlâ düzgün insan vermedi.
Asıl engel parça kalitesi değil yapı: katı kartlar eklemde dönüyor, kameraya
uzanan uzuv kısalıp yuvarlanmıyor, kafa/el/ayak yan profil kalıyor. 2B parça
rig'i 3/4 görünüm veremiyor; gerçek çözüm deri ağırlıklı 3B (three.js) olurdu
ve o ayrı bir ürün kararı.

**Ne kazanıldı:** Mesh'ten üretilen yan siluetler kaldı (`npm run parts:mesh`).
Perspektif de kaldırıldı — uzak tarafın kaydırılmasının tek amacı özdeş uzuvları
ayırmaktı; artık özdeş hareket yapan uzak uzuv çizilmiyor (`showFarLeg`,
`showFarArm`), farklı hareket yapan zaten x'te ayrı düşüyor. Yan görünüm saf
ortografik. Önden görünüm ayrı işte gerçek yapılıyor.
---

## ROM bantları MuJoCo ile karşılaştırıldı (2026-09-07)

Kaynak: [MuJoCo humanoid.xml](https://github.com/google-deepmind/mujoco/blob/main/model/humanoid/humanoid.xml),
Apache 2.0 — ticari kullanım serbest. Fizik simülasyonu için basitleştirilmiş
bir gövde; anatomi atlası değil, ama eklem aralıkları bağımsız bir referans.

| bant | bizim | MuJoCo | fark |
|---|---|---|---|
| diz | —..160 | —..160 | **tam tutuyor** |
| uzak diz | —..160 | —..160 | **tam tutuyor** |
| bilek | −35..50 | −50..50 | bizimki daha dar (bilerek) |
| diz ters yönde | −15.. | −2.. | bizimki 13° gevşek |
| kalça | −35..150 | −20..150 | üst tam, alt 15° gevşek |
| gövde | −45..90 | −30..75 | iki uçta da 15° gevşek |
| dirsek | —..160 | —..150 | 10° gevşek |

Diz fleksiyonunun 160'ta birebir tutması iyi işaret: iki kaynak da gerçek
anatomiye dayanıyor.

**Gevşek uçlar SIKILMADI, çünkü sıkmak doğru pozları yakalardı.** Ölçüldü —
MuJoCo'nun sınırlarıyla üç arketip düşüyor ve üçü de o aralığa ulaşmayı
AMAÇLAYAN hareketler:

- `glute_bridge` kalçayı 23° açıyor (MuJoCo 20) — köprünün tanımı bu
- `quadruped_spine` gövdeyi 32° geriye açıyor (MuJoCo 30) — kedi-deve'nin
  "deve" evresi
- `seated_overhead_press` dizde 8° hiperekstansiyon (MuJoCo 2) — oturmuş
  bacakta gevşek diz; insanlarda 5-10° fizyolojik normal

MuJoCo'nun aralıkları yürüyen bir robotun kararlı simülasyonu için seçilmiş,
egzersizin uç pozları için değil.

**Ama karşılaştırma gerçek bir açık buldu.** Dirsek 162-163°ye çıkan bir kare
vardı ve denetim SUSUYORDU: `auditExercise` 21 kare örneklüyordu ve ihlal iki
örnek arasında kalıyordu. Kaba örnekleme, olmayan bir kuraldan farksız.

Düzeltildi: örnekleme 41'e çıktı (31 arketibin tam taraması 84ms → 157ms) ve
`lunge_reach`e dönüş süpürmesi karesi eklendi — el omuza 23px yaklaşıp dirseği
katlıyordu. Gidiş yolunda böyle bir kare vardı, dönüşe konmamıştı.
