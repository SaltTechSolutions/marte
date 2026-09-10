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

**Subtree şüphesi — tarihlerle kapandı.** "Bazı şeyler eski haline gelmiş"
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

**Açık.**
- 12 poz ve yeni kas verisi **gözle/uzman onayı bekliyor**
  (`poseReviewed: false`, `reviewed: false`).
- Ad tablosu antrenör onayı bekliyor → `docs/hareket-adlari-onay.md`.
- `seed_program_templates.cjs` üretime **çalıştırılmadı**.
- `apps/gymentra-mobile`'daki `npm run rig`, canonical editörün eski bir
  kopyası ve uygulamanın **üretilmiş** `rigArchetypes.json`'ına yazıyor —
  tek yön sözleşmesini kırıyor. `AGENTS.md`'nin "Kukla editörü" bölümü de
  hâlâ onu tarif ediyor.
- `Tarki1151/antrenman-simulatoru` ile **birebir diff yapılamadı**: oturum
  farklı sahipten depo eklemiyor (`add_repo` v1 sınırı, izin değil) ve depo
  kimlik doğrulaması istiyor. Kesin karşılaştırma için o depoyu ilk kaynak
  alan yeni bir oturum gerekir:
  `git log --oneline fbb1fb2c..origin/main -- editor/ src/`.

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
