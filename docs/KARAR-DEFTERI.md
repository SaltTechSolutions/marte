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

**Açık.**
- ⚠️ **Uygulamadaki tabakta `fillOpacity` yok.** Halteri kafadan sonraya
  aldım (editörde tabak %62 saydam, sorun yok) ama `RigFigure.tsx`'te
  saydamlık kararı hiç uygulanmamış — uygulamada tabak artık kafayı tamamen
  örtüyor. **Bu bu oturumda açılan bir hata, önce bu düzelmeli.**
- **Mobil önizleme (`drawPose`) ne uygulamaya ne ana sahneye benziyor:**
  kapsül uzuvlar + daire kafa + **perspektif elips halter**. Bu sonuncusu
  terk edilen 3/4 yönünün son kalıntısı. `mkLimb` parça desteğini zaten
  taşıyor, çağrılarda `name` argümanı verilmiyor.
- `TODOS.md:109` "perspektif barbell yapıldı, önizlemede duruyor" diyor;
  yön tamamen bırakıldığı için bu kayıt artık yanlış.
- 12 poz ve yeni kas verisi **gözle/uzman onayı bekliyor**
  (`poseReviewed: false`, `reviewed: false`).
- Ad tablosu antrenör onayı bekliyor → `docs/hareket-adlari-onay.md`.
- `seed_program_templates.cjs` üretime **çalıştırılmadı**.
- `apps/gymentra-mobile`'daki `npm run rig`, canonical editörün eski bir
  kopyası ve uygulamanın **üretilmiş** `rigArchetypes.json`'ına yazıyor —
  tek yön sözleşmesini kırıyor. `AGENTS.md`'nin "Kukla editörü" bölümü de
  hâlâ onu tarif ediyor.
- `Tarki1151/antrenman-simulatoru` deposu oturuma eklenemedi (izin), yani
  subtree'nin alındığı `fbb1fb2c`'nin o deponun son hâli olup olmadığı
  **doğrulanmadı**. Bu turdaki bulguların hiçbiri subtree kaynaklı kayba
  işaret etmiyor, ama şüpheyi kesin kapatan tek şey o karşılaştırma.

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
