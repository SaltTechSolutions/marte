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

## 2026-09-11 — PR #1 `main` ile birleştirildi; rig tarafında main esas alındı

**Yapıldı.** `uzak-diz-ters-bukulme` (81 commit) ile `main` (43 commit) 11
Eylül'de ayrışmıştı ve PR #1 çakışıyordu; ortak ata `9d1964f7`. 43 dosyada
çakışma çıktı. `origin/main` dala birleştirildi (rebase yok, force-push yok).

**Karar: rig alanında main esas.** Dalın rig işi main'de bağımsız olarak
AŞILMIŞ durumda — main'de 40 arketip / 45 hareket var, dalda 35 / 38; üstelik
dalın kapattığı boşlukların hepsi (triceps, dikey çekiş, bacak curl) main'de
başka kimliklerle zaten kapalı: `triceps-pushdown`, `pullup`, `lat-pulldown`,
`leg-curl`. Dolayısıyla `packages/rig/**` ve uygulamanın rig türevi dosyaları
bütünüyle main'den alındı; sonuç main ile BİREBİR (fark yalnız manifest
damgası). Dalın rig dışındaki katkısı (tema kontrastı, site gizlilik, firestore
kuralları, backend seans çakışması, `docs/plan.md`, CI) olduğu gibi korundu.

**Bilerek yapılmadı — B modeli taşınmadı.** 11 Eylül kaydındaki karar
uygulandı: `programmes.json` + `validateProgrammes` + iki ekran silindi.
Bunlar dalda "eklenen dosya" oldukları için çakışma ÜRETMİYOR, yani sessizce
hayatta kalır ve iki program sözlüğünü geri getirirlerdi. Silinenler:
`packages/rig/data/programmes.json`, `apps/.../src/data/programmes.ts(+test)`,
`programmes.tsx`, `programme-detail.tsx`, `rigProgrammes.json` ve export
sözleşmesindeki üç satır.

**Bilerek yapılmadı — `mesh-silhouette.mjs` taşınmadı.** Main 11 Eylül'de
siluetleri MakeHuman mesh'inden değil profil verisinden üretmeye geçti
(`build-body-parts.mjs`). Eski üretici depoda kalsaydı `parts:mesh` komutu
main'in siluetlerini ezerdi. `normalize-part.mjs`'teki `head: 28` ve `parse`
export'u da geri alındı — ikisi de yalnız o script için eklenmişti.

**Bilerek yapılmadı — kendi koruma testim silindi.** `exerciseGroups.test.ts`
main'in `exerciseLibrary.test.ts` içindeki iki kuralın aynısını yapıyordu
("her raf kimliği gerçek", "her hareket tam bir rafta"). Kapsam kaybı yok.

**Açık — editörün şeması oturum boyunca eskiyor.** `scripts/editor.mjs`
şemayı yalnız açılışta derliyor; sunucu açıkken şema kaynağı değişirse
kaydetme "bilinmeyen alan" diye reddediyor. Dalda buna bir çözüm vardı
(kaydetmede yeniden derleme + require önbelleği temizliği); main'in
tasarımında karşılığı olmadığı için TAŞINMADI — kök yönerge istenmeyen
refactoru yasaklıyor. Geçici çare: editörü yeniden başlatmak.

**Nerede.** Birleşme commit'i; `packages/rig` main ile birebir.

## 2026-09-11 — 19 program şablonu üretime yazıldı (PER-18 kapandı)

**Yapıldı, kullanıcı onayıyla.** `seed_program_templates.cjs --apply`
çalıştırıldı; `program_templates` koleksiyonu boştan 19 global belgeye geçti.
Dürüstlük denetimi yazmadan önce koştu ve temiz çıktı.

**Doğrulandı, varsayılmadı.** Yazımdan sonra üretim tekrar okundu: 19 belge,
sınırı yazılmamış 0, hedef katmanında görünen 10 şablon, dört ısınma bloğu
(8/7/7/5 hareket), `abs-beginner` üstünde `limits` 3 madde, `targets`
absUpper/absMid/absLower, `sessionsPerWeek` 3, beş künye tam metniyle.
Betiğin ikinci dry-run'ı "19 güncelleme, 0 yeni" diyor — yani hepsi yerinde.

**Açık — gerçek antrenör onayı alınmadı.** Belgenin kendi önerisi bu,
özellikle ekipman için: Tarabya'da trap bar, ab wheel, chest-supported row
makinesi var mı bilinmiyor. Onay tablosu `docs/hareket-adlari-onay.md`'de
hazır. Şablonlar `isActive: true` ile yayında; onay sonrası düzeltme aynı
betikle üstüne yazılır (idempotent, belge kimliği = şablon kimliği).

**Nerede.** Firestore `program_templates` (üretim), `docs/plan.md` PER-18.


## 2026-09-11 — ısınma ön bloğu bağlandı (PER-18'in karşılıksız sözü)

**Yapıldı.** PER-18 2 Eylül'de "ısınma her programın otomatik ön bloğudur,
'Antrenmana başla' önce ısınmayı getirir; antrenör kapatabilir" diye karar
vermişti. Kodda karşılığı yoktu: `Program.warmup` yazılıyor, **hiçbir ekran
okumuyordu** — dört ısınma şablonu veride duruyor ve kimse görmüyordu. Artık
üye "Antrenmana başla" dediğinde ısınma ekranı geliyor; antrenör kurucudaki
onay kutusuyla kapatabiliyor.

**Isınma KAYDA GİRMİYOR — bilerek.** `workout_logs`'a yazılsaydı "geçen
sefer" karşılaştırması, hacim ve set sayımı ısınma setleriyle kirlenirdi:
12 tekrar ısınma köprüsü ile 12 tekrar antrenman köprüsü aynı şey değil.
Ekran gösteriyor, sayan şey seans ekranı.

**Ayrı ekran, seans ekranına blok değil.** Seans ekranı terli elle ve tek
egzersize odaklanarak kullanılıyor, tab çubuğu bile gizli; ısınmayı oraya
koymak o odağı bozardı. Ayrıca **kayıt ancak ısınmadan çıkarken açılıyor**:
ısınmayı görüp vazgeçen üye arkada yarım bir antrenman kaydı bırakmıyor.

**Isınma KOPYALANMIYOR.** Program yalnızca kimliği taşıyor, içeriği şablondan
okunuyor — günlerin aksine. Gerekçe: antrenörün üyeye özel düzenlediği şey
ısınma değil; şablon düzelirse eski programlar da düzelmiş ısınmayı görsün.

**Kapatmak alanı SİLİYOR** (`deleteField`), boş metin yazmıyor: "ısınma yok"
ile "ısınma kimliği boş" aynı şey değil. Kapalıyken açmak `warmup-general`
getiriyor — elle yazılmış programın hiç ısınması olmuyordu ve antrenörün dört
şablon kimliğini ezbere bilmesi beklenemez.

**Açık.** Isınma ekranı ancak seed üretime basıldıktan sonra dolu görünür;
şablon okunamazsa liste boş kalıyor ama antrenman engellenmiyor.

**Nerede.** `apps/gymentra-mobile/src/app/member/workout/warmup.tsx` (yeni),
`.../workout/index.tsx`, `.../trainer/builder.tsx`,
`src/data/firebase/programRepo.ts`, `programTemplateRepo.ts`,
`src/data/programTemplate.ts`.


## 2026-09-11 — dört arketipte elle düzenleme; glute_bridge'in gövdesi yeniden çözüldü

**Kullanıcının editörde yaptığı düzenlemeler** (benim değil):
`bulgarian_split_squat` `bodyDx: 12` + t=0.45'te arka bacak,
`hip_thrust` `propDx: -56` + kol açıları ve yeni `foreF`/`upperF`,
`hanging_knee_raise` uç karelerde `shinA` 214 → 182.5,
`glute_bridge` uç karelerde `thighA` 50 → 40.9, `shinA` 170 → 164.7.

**Biri testi düşürdü, çözümü istendi.** `glute_bridge`'de uyluk açısını
düşürmek kalçayı alçaltıyor, gövde de onunla iniyor ve omuz kayması 24px'e
çıkıyordu (sınır 12). Kuralı gevşetmek yanlış olurdu: omuzun yerde kalması
hareketin TANIMI, denetimin keyfi bir eşiği değil.

**Çözüm: gövde açısı bacaktan TÜREVDİR.** Uç karelerde `torso` ve `thoraxA`
sayısal olarak yeniden çözüldü (`torso` 274.8 → 284.9, `thoraxA` 268.6 →
278.7) — kısıt, omuzun üst karedeki y'sine (504) oturması; sırtın gövdeye
göre duruşu (`thoraxA − torso` = −6.2) korundu, yani biçim kullanıcının
bıraktığı gibi. Sonuç: kayma 24.4 → **3.7px**, yani elle düzenlemeden önceki
hâlinden de (10.5px) iyi.

**Arketibin notuna yazıldı:** uyluk açısı değişirse gövde açısı yeniden
çözülmek zorunda. Bu bağ kodda zorlanmıyor — zorlansaydı editörde kalçayı
sürüklemek gövdeyi de oynatırdı ve düzenleme imkânsızlaşırdı. Denetim
yakalıyor, not da nedenini söylüyor.

**Nerede.** `packages/rig/data/rigArchetypes.json`.


## 2026-09-11 — iki program modelinden `program_templates` kaldı, dürüstlük şemaya bağlandı

**Karar (kullanıcı).** "Bilimsel paketler" adıyla İKİ ayrı iş vardı ve ikisi
de `main`'e girmemişti: `program_templates` (PER-18, 19 şablon, Firestore —
bu dal) ve hazır paket programlar (`programmes.json`, 6 paket —
`uzak-diz-ters-bukulme` dalı, 81 commit ayrışmış). Aynı işi iki ayrı sözlükle
yapıyorlardı ve hangisinin kalacağına dair yazılı karar yoktu. **A kaldı;
B'nin şema zorlaması A'nın sözlüğüne çevrilerek taşındı.**

**Dürüstlük artık iyi niyete değil koda bağlı.** `limits` zorunlu, yanlış
yönlendiren ifade yasak, kaynak zorunlu, hipertrofi hacmi denetleniyor.
Kurallar `backend/scripts/programTemplateAudit.cjs`'de ve **hem testte hem
seed betiğinin içinde** koşuyor — kural yalnızca testte olsaydı betiği elle
çalıştıran kişi onu atlayabilirdi.

**Kural ilk çalıştırmada iki gerçek eksik buldu**, tıpkı geldiği yerde
bulduğu gibi: *Kol Hipertrofisi* triceps uzun başına haftada 7 set veriyordu
(kendi özeti 10–20 diyordu; setler 14 → 20'ye çıkarıldı) ve *Kalça
Hipertrofisi*nin yan kalça hacmi sıfırdı — katalogda gluteus medius'u birincil
çalıştıran hareket yok, bu artık `limits`'te yazılı ve iddia edilmiyor.

**Bilerek YAPILMADI — üst sınır.** B'de 40 setlik tavan vardı, taşınmadı:
bu veride ölçüldü ve yanlış ateşledi (*Karın Kasları* 20 dakikalık blokta
haftada 51 "absMid seti" sayılıyor, çünkü altı hareketin altısı da o kası
birincil listeliyor). Sayım yukarı yanlı; alt sınırda bu güvenli tarafta,
üst sınırda yanlış suçlamaya dönüyor.

**Bilerek YAPILMADI — `evidence`.** B her iddiayı serbest metin gerekçeyle
eşliyordu. Burada `sources` + 18 künyelik kök kaynakça aynı işi daha iyi
yapıyor: anahtar çözülüyor mu diye denetlenebiliyor, serbest metin
denetlenemiyor.

**Bilerek YAPILMADI — B'nin 6 paketi içerik olarak taşınmadı.** Kapsamları
A'nın 15 programıyla büyük ölçüde örtüşüyor (kol, kalça-bacak, gövde-bel,
sırt-omuz). Örtüşmeyeni ayrıca değerlendirmek gerekir; kör kopya iki ayrı
sözlüğü tek depoda yeniden üretirdi.

**Açık.** Seed üretime HÂLÂ çalıştırılmadı — `program_templates` canlıda boş,
yani antrenör şablon seçicisi ve üyenin "Hedefim" ekranı boş duruyor. Ayrıca
ısınma ön bloğu yazılıyor ama antrenman ekranında okunmuyor: PER-18'in
"antrenmana başla önce ısınmayı getirir" sözü kodda karşılıksız.

**Nerede.** `backend/scripts/programTemplateAudit.cjs`,
`backend/tests/programTemplates.test.ts`, `backend/scripts/exercise_muscles.json`
(üretilmiş), `backend/scripts/program_templates.seed.json`,
`apps/gymentra-mobile/src/app/member/goals.tsx`, `docs/SCHEMA.md`,
`docs/program_templates.md`.


## 2026-09-11 — katman sırası veri oldu, üç çizici teste bağlandı

**Yapıldı.** Aynı gün üç katman hatası arka arkaya çıktı (halter tabağı,
yakın kol, sahne eşyası) ve **üçünü de kullanıcı gözle buldu**. Üçü de aynı
kuralın ihlaliydi — katman sırası yakınlık sırasıdır — ama kural yalnızca
yorumlarda yazılıydı, hiçbir yerde veri değildi, o yüzden hiçbir test onu
kontrol edemiyordu. Sıra artık `rig.ts`'de: `SIDE_LAYERS`, `FRONT_LAYERS`,
`LAYER_WHY`. Üç çizim gövdesinin (editör ana sahne, telefon önizlemesi,
uygulamanın `RigFigure.tsx`'i) her katmanının başına bir `KATMAN` işareti
kondu; iki test bu işaretlerin kaynaktaki sırasını diziyle karşılaştırıyor.

**Karar.** Çizim kodu diziyi **çalışma anında okumuyor**. Okusaydı üç
renderer tek döngüye iner ve sözleşme kendiliğinden sağlanırdı; ama bu büyük
bir yeniden yazım ve `react-native-svg` ile tarayıcı SVG'sinin ilkelleri
farklı. Seçilen daha ucuzu: sıra veri, uyum testle kanıtlanıyor. Ayrışma
imkânsız değil — ama sessiz de değil.

**Test sıraya değil KURALA da bakıyor.** Diziyi yeniden sıralayıp işaretleri
de taşımak testi geçirir; bu yüzden ayrı bir test `SIDE_LAYERS` üstünde
değişmezleri denetliyor (uzak uzuvlar eşyadan önce, eşya gövdeden önce, kafa
yakın koldan önce, tabak en üstte). İkisini birden bozmak gerekiyor.

**Doğrulandı, varsayılmadı.** Her iki test de bilerek bozulmuş sırada
çalıştırıldı ve ateşledi — `rigAudit`'teki ölü `ayak` kuralının dersi:
yalnızca "sustuğunu" doğrulayan test hiçbir şey kanıtlamıyor.

**Bilerek yapılmadı.** İlkel listesi karşılaştırması (iki çizicinin ürettiği
şekil ve sayılar) yapılmadı: bunun için editörü DOM'da, uygulamayı
`react-test-renderer` ile çalıştırmak gerekiyor ve iki depo birbirinin test
ortamını göremiyor. Bulunan üç hata da SIRA hatasıydı, ilkel hatası değil.

**Nerede.** `packages/rig/src/rig.ts`, `packages/rig/tests/layerOrder.test.ts`,
`apps/gymentra-mobile/src/components/RigFigure.layers.test.ts`.


## 2026-09-11 — sahne eşyası uzak uzuvlardan sonra çiziliyor

**Yapıldı.** Kullanıcı bildirdi: bazı hareketlerde arkada kalan bacak
alet/sehpa/kutunun ÖNÜNE geçiyor. Sahne eşyası en önce çiziliyordu (zeminden
hemen sonra), yani katman sırasının en arkasındaydı ve uzak bacak üstüne
biniyordu. Yeni sıra: zemin → UZAK UZUVLAR → sahne eşyası → gövde → yakın
bacak → kafa → yakın kol → halter tabağı.

**Karar.** **Katman sırası "yakınlık" sırasıdır** — bu kural aynı gün üçüncü
kez uygulandı: önce halter tabağı ("yakın tabak en üstte"), sonra yakın kol
(kafayı örtmeli), şimdi sahne eşyası (uzak uzvu örtmeli). Kural kodda bir
yerde yazılıydı ama her katman için ayrı ayrı uygulanmamıştı.

**Bilerek yapılmadı.** Eşya ile YAKIN uzuvlar arasına kural konmadı: yakın
taraf zaten eşyadan sonra çiziliyor, yani basamağa çıkan ayak kutunun üstünde
görünüyor. Doğru olan bu.

**Nerede.** `packages/rig/editor/editor.js` (`draw`, `drawPose`),
`apps/gymentra-mobile/src/components/RigFigure.tsx`.

## 2026-09-11 — yakın kol kafadan sonra çiziliyor

**Yapıldı.** Kullanıcı bildirdi: kol kafanın önünden geçtiği durumlarda arkadan
geçiyormuş gibi görünüyor. Doğruydu — yakın kol KAFADAN ÖNCE çiziliyordu, yani
kafa kolun üstüne biniyordu. Yan görünümde yakın kol izleyiciyle kafa arasında
durur, kafayı ÖRTMELİ. Ölçüldü: altı arketipte yakın dirsek/el kafa
yarıçapının içine giriyor — `hip_thrust` 17px, `glute_bridge` 18px, `bird_dog`
18px, `dead_bug_supine` 21px, `hanging_knee_raise` 24px, `pull_up_hang` 25px.
Yeni sıra: gövde → yakın bacak → KAFA → yakın kol + el + dambıl → halter tabağı.

Aynı turda omuz kapağının yarıçapı 20 → 16'ya indi: üst kolun o uçtaki yarı
genişliği 13 ve 20'de omuz kolun üstünde ayrı bir yumru gibi okunuyordu.
Referans yandan çizimde omuz kolun devamıdır, ayrı bir top değil.

**Karar.** **Katman sırası "yakınlık" sırasıdır.** Halter tabağı için zaten
yazılıydı ("yakın tabak en üstte"); aynı kural yakın kol için de geçerli ve
kodda uygulanmamıştı.

**Nerede.** `packages/rig/editor/editor.js`,
`apps/gymentra-mobile/src/components/RigFigure.tsx`.

## 2026-09-11 — kafa hattı ve erkek gövde profili

**Yapıldı.** İki kusur, ikisi de kullanıcının gözüyle bulundu.

**1. Kafanın hattı gövdeninkinden ince görünüyordu.** Sebep: baş zincirden
geçmeyen tek parçaydı. Zincirin hattı şeklin TAMAMEN DIŞINDA duruyor (altta
şişirilmiş kopya, üstte dolgu); düz kontur ise yola ORTALANIR, yani yarısı
içeride kalır ve görünen kalınlık yarıya düşer. Ana sahnede daha da kötüydü —
orada kafa sahne eşyasının soluk `--line` rengiyle konturlanıyordu. Dört çizim
yeri de (ana sahne, önizleme, karşılaştırma, önden görünüm) ortak `headNodes`
üzerinden zincire alındı. Önden görünümde çene de kafayla aynı zincire girdi;
çene editörde hiç çizilmiyordu, uygulamada çiziliyordu.

**2. Yandan göğüs profili yanlıştı.** Kullanıcı iki anatomi referansı verdi
(yandan erkek figür, ve önden/arkadan/yandan üçlü). Bridgman'ın gövde profili
bölümüyle birlikte üç düzeltme çıktı:
- Göğüs OMUZ HİZASINDA en derindir; daralma göğüste değil BOYUNDA olur. İlk
  denemem üst ucu 19/21'e indiriyordu ve figür omzun hemen altında boğum
  yapıyordu.
- Önden gövde tek düz eğri değil: pektoralin alt kenarında çöküntü var.
- Arka kavis ABARTILMAZ: referansta üst sırt düzdür, en çıkık arka nokta
  KALÇAdır. `pelvisMass` arka derinliği 27 → 31.

**Karar.** **Referans varsa ölçü ondan alınır.** Bridgman metni "ne olduğunu"
söylüyor ama "ne kadar" demiyor; oranları kullanıcının verdiği yandan çizimden
okudum. Bu bir ölçüm değil GÖZLE okuma — siluetler hâlâ stilize.

**Açık.** Referansa göre hâlâ ayrışan iki yer var: omuz topu (r=20) üst kolun
üstünde ayrı bir yumru gibi okunuyor, ve kalça–uyluk geçişinde zincir sınırı
kaba bir yatay hat bırakıyor.

**Nerede.** `packages/rig/scripts/build-body-parts.mjs` (thorax profili),
`packages/rig/src/rig.ts` (`pelvisMass`), `packages/rig/editor/editor.js`
(`headNodes`), `apps/gymentra-mobile/src/components/RigFigure.tsx`.

## 2026-09-11 — önizleme dambılı ve elleri çizmiyordu

**Yapıldı.** Telefon önizlemesi halter tabağını çiziyordu ama DAMBILI hiç
çizmiyordu — dokuz arketip dambıllı, dokuzunda da ağırlık görünmüyordu. Aynı
yerde ELLER de eksikti. Sebep kapsamdı: `dumbbellAt` ve `handAt` yardımcıları
`draw()` içine gömülüydü, `drawPose` (önizleme) onlara erişemiyordu. İkisi de
modül seviyesine çıkarıldı ve önizleme uygulamadaki sırayla çiziyor: uzak
ağırlık uzak kolun ardında (gövdeden önce), yakın ağırlık yakın kolun ardında
(baştan önce). Karşılaştırma ekranına da eklendi.

**Karar.** **Çizim yardımcısı tek bir çizim yolunun içine gömülmez.** Üç yol
var (ana sahne, telefon önizlemesi, karşılaştırma) ve bir yardımcı birinin
kapsamında yaşarsa ötekiler onu sessizce atlıyor. Denetlenebilir hâle geldi:
üç yolun çizdiği ilkel sayıları artık karşılaştırılabiliyor.

**Bilerek yapılmadı.** Üç yolun aynı şeyi çizdiğini doğrulayan otomatik bir
test yazılmadı: üçü ayrı ayrı DOM/metin üretiyor ve ortak bir "çizim listesi"
soyutlaması yok. Onu kurmak çizim mimarisini değiştirmek demek; bu turda
sayım elle karşılaştırıldı.

**Açık.** `drawPose` gövde parçalarını `trunkPart` ile, uygulama `part()` ile
çiziyor — aynı sonucu veriyorlar ama adlar ayrı; ileride biri değişirse öteki
sessiz kalır.

**Nerede.** `packages/rig/editor/editor.js` (`dumbbellAt`, `handAt`).

## 2026-09-11 — dikey kaydırma zemine basan kiplerde kapatıldı

**Yapıldı.** Yeni kaydırma kontrolü kullanıcının elinde hemen kırıldı: `squat`
yukarı kaydırılıp KAYDEDİLDİ (`bodyDy: -28`), denetim "figür havada" dedi ve
kullanıcı elle düzeltemedi. Geçersiz veri temizlendi; asıl kusur kontrolün
kendisiydi.

Ayakta, dört ayak ve sırtüstü kiplerde figürün dikey dayanağı ZEMİN: `stand`'de
ayak doğrudan `GROUND - 12 - ankleLift`'e konuyor, `quad`/`supine`'de temas
noktaları her karede zemine çekiliyor. Bu kiplerde dikey kaydırmanın
yapabileceği tek şey figürü havada bırakmak. Kontrol buna izin verip sonra
uyarıyordu — yani kullanıcıya düzeltemediği bir hata üretme imkânı veriyordu.

Artık şema reddediyor ve editörde ↑/↓ ile y kutusu o kiplerde KAPALI, sebebi
yazılı ("Bu harekette figür yere basıyor: dikey kaydırma yok. Sahne eşyasını
kaydır."). Yatay kaydırma her kipte açık; sehpa/koltuk/asılı kiplerde dikey de
açık.

**Karar.** **Otomatik düzeltmek yerine üretilmesini engelle.** Kullanıcı
"bunları otomatik düzeltemez mi?" diye sordu. Düzeltmek belirsiz: figürü geri
indirmek kaydırmayı silmek demek, yani kullanıcının kastını tahmin etmek.
Geçersiz durumun üretilememesi hem kesin hem açıklanabilir; uyarı da yerinde
duruyor, çünkü başka yollardan (elle JSON) hâlâ gelebilir.

**Bilerek yapılmadı.** Denetim uyarılarına genel bir "Düzelt" düğmesi
yapılmadı: kuralların çoğunda tek bir doğru düzeltme yok (ters bükülen diz
hangi açıdan düzeltilecek?), ve yanlış tahmin eden bir düzeltme sessizce pozu
bozardı.

**Nerede.** `packages/rig/src/rigSchema.ts` (`GROUND_RESTING`),
`packages/rig/editor/editor.js`, `packages/rig/data/rigArchetypes.json`.

## 2026-09-11 — gövde ve sahne eşyası kaydırması

**Yapıldı.** Arketipe dört alan eklendi: `bodyDx/bodyDy` figürün tamamını,
`propDx/propDy` sahne eşyasını kaydırıyor. Editörde "Yerleşim" paneli (oklar +
sıfırlama + x/y kutuları). Gövde kaydırması `skeleton()` içinde, merkezleme ve
yere oturtmanın EN SONUNDA uygulanıyor — tersi olsaydı yere oturtma dikey
kaydırmayı her karede geri alırdı. Eşya kaydırması yalnızca çizimde, iki
çizicide de tek `translate` olarak (`propShift`).

**Karar.** **Kaydırma denetimin dışına çıkmıyor.** Gövde kaydırması iskelete
girdiği için kadraj ve denetim de görüyor. Ama bir boşuk çıktı: ayakta duran
figürün yerden kesilmesi daha önce YAPISAL OLARAK imkânsızdı (yere oturtma her
karede temas noktasını zemine çekiyordu), o yüzden bunu denetleyen kural da
yoktu — `temas` kuralı yalnızca `quad` ve `supine` modlarını kapsıyordu.
`bodyDy` o güvenceyi delince kural eklendi: `stand` modunda (basamak hariç)
basan ayak zeminden 10px'ten fazla yukarıdaysa uyarı. Ölçüldü: basamaksız 22
arketipin hepsinde boşluk −1.9, yani bugünkü veri rahatça geçiyor.

Eşya kaydırması iskelete GİRMİYOR: mobilya figürün mekaniğini değiştirmemeli,
kadrajı da kaydırmamalı. Şema `propDx/propDy`'yi eşyası olmayan arketipte
reddediyor.

**Bilerek yapılmadı.** Eşya için sürükleme tutamağı yapılmadı: eşya şekilleri
türlere göre çok farklı ve tutamağın hangi noktaya oturacağı her biri için
ayrı karar isterdi. Oklar hem kesin hem keşfedilebilir.

**Nerede.** `packages/rig/src/rig.ts` (`propShift`, `skeleton`),
`packages/rig/src/rigAudit.ts`, `packages/rig/src/rigSchema.ts`,
`packages/rig/editor/{index.html,editor.js}`,
`apps/gymentra-mobile/src/components/RigFigure.tsx`.

## 2026-09-11 — uzak ayak ucu tutamağı

**Yapıldı.** Yakın ayağın ucundaki tutamak (`footDir`) DURUYORDU — 40 arketibin
hepsinde çiziliyor ve çalışıyor, hiç kaldırılmamış. Eksik olan uzak ayağınkiydi:
aynı gün eklenen `footDirFarOf` uzak ayağın yönünü baldırdan TÜRETİYOR ve elle
düzeltilemiyordu. `toeF` tutamağı eklendi.

**Karar.** **Uzak ayak ucu MUTLAK yön değil PAY yazıyor** (`footDirFarAdj`).
Yakın ayaktaki gibi mutlak yazsaydı tek sayı bütün kareler için sabitlenirdi ve
uzak baldır savrulunca ayak yine bilekten kopardı — düzeltmeye çalıştığımız
kusur tam olarak oydu. Pay, türetmenin üstüne biniyor: varsayılan davranış
korunuyor, elle düzeltme onun üstünde yaşıyor.

Tutamak yalnızca uzak bacak çiziliyorken görünüyor; gizli bir bacağın ayağını
ayarlamak hiçbir şeyi değiştirmez, ölü tutamak olurdu. `rigEdit.test.ts` bunu
sınıyor.

**Bilerek yapılmadı.** `dragHandles` imzası poz alacak şekilde genişletildi
(uzak ayak ucunun yeri kareye bağlı). Alternatif, tutamağı editörde ayrı
hesaplamaktı; o zaman tutamak listesi iki yerde yaşardı.

**Nerede.** `packages/rig/src/rig.ts` (`footDirFarAdj`, `dragFootDirFar`),
`packages/rig/src/rigEdit.ts`, `packages/rig/src/rigSchema.ts`,
`packages/rig/editor/editor.js`, `packages/rig/README.md`.

## 2026-09-11 — omuz presi oturdu; editör düzenlemeleri kurallarla uzlaştırıldı

**Yapıldı.** `seated_overhead_press` arketibi `mode: 'stand'` ve prop'suzdu:
adı da katalogdaki adımları da ("Dik veya hafif geriye eğimli sırt desteğine
otur") oturmayı anlatırken çizim AYAKTA yapıyordu. `mode: 'seat'` + `seatback`,
uyluk 90 / baldır 180 (öteki oturan arketiplerin değerleri).

Aynı oturumda kullanıcı editörde üç arketibi düzenleyip kaydetti; üç koruma
kuralı düştü. Kullanıcının yönü korunarak uzlaştırıldı:

- **`unilateral_lunge` — kural düzeltildi, veri değil.** Kullanıcı arka ayağı
  yere indirmişti; bu ANATOMİK OLARAK DOĞRU (gerçek hamlede arka parmak yerde
  kalır). "İki bacak ayrışması" kuralı yalnızca DİKEY farkı ölçüyordu ve
  ayaklar aynı yüksekliğe gelince yanlış ateşledi. Ölçü gerçek mesafeye
  çevrildi: hamlede 250, uzak bacak kopya olsaydı ≈7 — kural amacını koruyor.
  Ayrıca `shinF` 188.9 → 191, çünkü 188.9 ayağı zeminin 2.2px altına sokuyordu
  (kural 2'de kesiyor).
- **`glute_bridge` — kol değişikliği kaldı, göğüs açısı geri alındı.** `foreA`
  ve yeni `upperF` duruyor. `torso`/`thoraxA` değişikliği omzu destekten
  30.4px kaldırıyordu (kural <12) ve bu ikisi doğrudan çelişiyor: kalça
  köprüsünde omuz yerde durur. Kullanıcının değerine en yakın uyumlu çift
  arandı, 11.4° uzakta çıktı — yani o göğüs açısı kuralla bağdaşmıyor.
- **`step_up`** — hiçbir kuralı düşürmüyordu, olduğu gibi bırakıldı.

**Karar.** **Bir kural gerçek bir düzeltmeyi reddediyorsa önce kuralın ÖLÇÜSÜ
sorgulanır.** Hamlede kırılan şey veri değil, dikey farkı vekil alan testti.
Ama kuralın amacı (uzak bacak yakınının kopyası olmasın) korunarak değiştirildi,
gevşetilerek değil.

**Bilerek yapılmadı.** Kullanıcının `glute_bridge` göğüs açısı korunmadı:
korunabilseydi omuz destekten kalkardı, o da hareketin tanımını bozardı.

**Açık.** Sehpa/gövde kaydırma alanı hâlâ yok — prop'lar iskeletten türetiliyor,
gövde kipin kök noktasına sabit. Şema ve devir sözleşmesi işi.

**Nerede.** `packages/rig/data/rigArchetypes.json`, `packages/rig/tests/rig.test.ts`.

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
