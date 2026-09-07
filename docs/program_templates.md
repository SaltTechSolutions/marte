# GymEntra — Hazır Program Şablonları (PER-18)

**Tarih:** 2 Eylül 2026 · **Makine tarafından okunan hâli:** `marte06/scripts/program_templates.seed.json` · **Seed:** `marte06/scripts/seed_program_templates.cjs`

> **Sorumluluk notu.** Bu şablonlar genel sağlıklı yetişkinler için, yayımlanmış kılavuz ve araştırmalara dayanarak hazırlanmış başlangıç noktalarıdır; tıbbi tavsiye değildir. Atamadan önce salonun sertifikalı antrenörü üyenin sağlık durumuna, geçmişine ve ekipmana göre gözden geçirip uyarlamalıdır. Kalp-damar hastalığı, kontrolsüz tansiyon, gebelik, yakın zamanda ameliyat veya sinir belirtisi olan üyelere hekim onayı olmadan atanmaz.

## Nasıl okunmalı

- **Seviye:** *başlangıç* = 0–6 ay düzenli antrenman; *orta* = 6+ ay, temel hareket tekniği oturmuş. Isınmalar seviyesizdir.
- **Tekrar aralıkları** ACSM 2009 pozisyon bildirisinden: başlangıçta 8–12 tekrar / 1–3 set, ilerledikçe 6–12 tekrar / çoklu set, çok eklemli hareketlerde 2–3 dk dinlenme.
- **İlerleme kuralı ("2-for-2", NSCA):** bir egzersizde **iki seans üst üste** her sette hedef tekrarın **2 fazlasını** yapabiliyorsan ağırlığı artır — üst vücutta ~2,5 kg, alt vücutta ~5 kg (~%5).
- **Ağırlık alanı boş (`null`)** gelir: antrenör ilk seansta belirler. Şablon "kaç kilo" söylemez, "kaç tekrar, kaç dinlenme, nasıl ilerle" söyler.
- **Isınma** her programın önüne otomatik gelir (`warmup` alanı); antrenör kapatabilir.
- **Tempo (aksi yazılmadıkça):** 2 sn kontrollü iniş, kısa duraklama, 1 sn kaldırış. Hızlı iniş = teknik hatası.
- **RIR (reps in reserve):** "RIR 1–2" = seti bitirdiğinde 1–2 tekrar daha yapabilecek hissi. Başlangıç şablonlarında RIR 3 hedeflenir; ilk 4 hafta kimse tükenişe gitmez.
- **İlk seans protokolü:** her egzersizde antrenör hareketi gösterir, üye 1 set hafif yapar, antrenör ağırlığı belirler ve kaydeder. İlk seansta tam hacim yapılmaz.
- **Eşdeğer hareketler (alet doluysa / ekipman yoksa):** aynı hareket kalıbında değiştir, egzersizi atlama —

  | Kalıp | Seçenekler |
  |---|---|
  | Squat | goblet squat · leg press · hack squat · back/front squat |
  | Kalça menteşesi (hinge) | kettlebell deadlift · RDL · hip thrust · trap bar deadlift |
  | Yatay itiş | makine göğüs pres · dumbbell pres · bench press · şınav |
  | Yatay çekiş | oturarak kürek · tek kol dumbbell row · chest-supported row · barbell row |
  | Dikey itiş | makine omuz pres · dumbbell omuz pres · overhead press |
  | Dikey çekiş | lat pulldown · bant destekli barfiks · barfiks |
  | Tek bacak | split squat · reverse lunge · step-up · Bulgarian split squat |
  | Core | plank · ölü böcek · Pallof pres · side plank · bird-dog |

- **İsimlendirme dürüst:** "karın inceltme" yok (bölgesel yağ kaybı için kanıt yok — Vispute 2011, Kostek 2007), "postür düzeltme" yok (kanıt karışık). Bunların yerine *core güçlendirme* ve *sırt-omuz güçlendirme* var; iddia sadece kanıtı olan şey.

## Antrenör personası incelemesi (2 Eylül 2026)

Gerçek antrenör onayı yerine ilk sürüm, antrenör personası (Deniz — 8 yıl salon,
NSCA-CPT) gözüyle incelendi. Yapılan değişiklikler ve reddedilenler:

**Değiştirildi**
- **Kısa ısınma eklendi** (`warmup-short`, 4 dk): 15–20 dakikalık core ve
  sırt-omuz bloklarının önüne 9 dakikalık genel ısınma koymak programın
  yarısı kadar sürüyordu.
- **Başlangıçta RDL → önce kettlebell deadlift:** hinge öğrenilmeden RDL bel
  ağrısının bir numaralı sebebi. 5. haftadan RDL, antrenör hinge'i onaylayınca.
- **Başlangıçta Bulgarian split squat → reverse lunge (destekli):** denge
  talebi yeni üyeyi düşürüyor, literal anlamda.
- **Alt/Üst Orta: ağır squat ve ağır deadlift ayrı günlere:** aynı seansta
  4×5 squat + 3×4 deadlift + 4 dk dinlenmeler salon üyesi için hem 90 dk
  hem gereksiz omurga yükü. Deadlift hipertrofi gününe, RDL güç gününe.
- **Tam Vücut Orta süresi 60 → 70 dk:** üç ana hareket × 3 dk dinlenme
  60'a sığmıyordu; row dinlenmesi 2 dk'ya indi.
- **Yağ Kaybı Başlangıç 5 gün → 3 gün + opsiyonel kardiyo:** yeni üyenin
  haftada 5 gün salona gelmesi gerçekçi değil; ilk şikâyet "programa
  yetişemiyorum" olurdu. Kardiyo salon dışında yürüyüş olarak da sayılır.
- **HIIT için "hekim onayı" → PAR-Q+ taraması:** her üyeyi hekime
  göndermek uygulanmaz; PAR-Q+ standart tarama, "evet" varsa hekim.
- **Eşdeğer hareketler tablosu eklendi:** kalabalık saatte alet doluysa
  antrenörün elinde hazır alternatif olsun; üye egzersizi atlamasın.
- **Tempo, RIR ve ilk seans protokolü** "Nasıl okunmalı"ya eklendi —
  şablon bunları söylemeyince her antrenör farklı uyguluyor.
- **"Dünyanın en iyi germesi" → "Lunge + gövde rotasyonu":** kimse o
  isimle bilmiyor.

**Bilerek reddedildi**
- **Upright row** sırt-omuz şablonuna alınmadı — Andersen protokolünde var,
  ama omuz sıkışması (impingement) riski salon pratiğinde yaygın; reverse
  fly ve face pull aynı işi görüyor.
- **Mekik ve düz bacak kaldırma** core şablonlarına alınmadı — bel disk
  yükü yüksek, başlangıç üyesinde gereksiz.
- **Kadın/erkek ayrı şablon** yapılmadı — hareket seçimi cinsiyete göre
  değişmez; farklılık ağırlık ve hedefte, o da antrenörün kopyada yaptığı
  düzenleme.
- **Egzersiz görseli** hâlâ yok — telif; PER-18'in "görsel sonra" kararı.

**Gerçek antrenör onayı yine de önerilir** — özellikle ekipman listesi
(Tarabya'da trap bar, ab wheel, chest-supported row makinesi var mı?) ve
Türkçe hareket adlarının salonda kullanılan karşılıkları için.

## Şablon listesi

| ID | Başlık | Seviye | Gün/hafta | Süre |
|---|---|---|---|---|
| `warmup-general` | Isınma — Genel (RAMP) | all | — | 9 dk |
| `warmup-lower` | Isınma — Alt vücut günü | all | — | 10 dk |
| `warmup-upper` | Isınma — Üst vücut günü | all | — | 9 dk |
| `warmup-short` | Isınma — Kısa (4 dk) | all | — | 4 dk |
| `fullbody-beginner` | Tam Vücut Başlangıç — A/B | beginner | 3 gün (A-B-A, sonra B-A-B), aralarda en az 1 gün dinlenme | 45 dk |
| `fullbody-intermediate` | Tam Vücut Orta — A/B/C | intermediate | 3 gün (Pzt-Çar-Cum) | 70 dk |
| `upperlower-beginner` | Alt/Üst Split Başlangıç — 4 gün | beginner | 4 gün (Üst-Alt-dinlenme-Üst-Alt-dinlenme-dinlenme) | 50 dk |
| `upperlower-intermediate` | Alt/Üst Split Orta — 4 gün, güç + hipertrofi | intermediate | 4 gün | 65 dk |
| `fatloss-beginner` | Yağ Kaybı Başlangıç — direnç + tempolu kardiyo | beginner | 3 gün direnç (A-B-A) — kardiyo günleri OPSİYONEL (salon dışında yürüyüş de sayılır); ayrıca günlük adım | 50 dk |
| `fatloss-intermediate` | Yağ Kaybı Orta — direnç + aralıklı (HIIT) | intermediate | 5 gün: 3 direnç + 2 HIIT (direnç günlerinden ayrı günlerde) | 55 dk |
| `core-beginner` | Core Güçlendirme Başlangıç — McGill 3'lüsü | beginner | Haftada 3–4 gün; ana antrenmanın sonuna veya ayrı güne | 15 dk |
| `core-intermediate` | Core Güçlendirme Orta — yüklü anti-rotasyon | intermediate | Haftada 3 gün | 20 dk |
| `desk-beginner` | Sırt ve Omuz Güçlendirme — Masa Başı Çalışanlar, Başlangıç | beginner | Haftada 3 gün × 20 dk (Andersen 2008 protokolü) | 20 dk |
| `desk-intermediate` | Sırt ve Omuz Güçlendirme — Orta, tam üst sırt | intermediate | Haftada 3 gün | 35 dk |

---

## Isınma — Genel (RAMP)

`warmup-general` · seviye **all** · ısınma bloğu · ~9 dk · ekipman: yok · ısınma: `—`

Her antrenmanın önüne gelen 8–10 dakikalık genel ısınma. RAMP: Raise (nabız), Activate (kas aktivasyonu), Mobilise (eklem hareket açıklığı), Potentiate (ana harekete hazırlık). Statik germe yok — antrenman öncesi uzun statik germe performansı düşürür.

### Isınma

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Yerinde hafif koşu / ip atlama | 2 dk | — | Konuşabilecek tempoda. Nabzı yükselt, terletme. |
| Kol çevirme (öne / arkaya) | 1×10 | — | Her yöne 10. Omuzları kulaktan uzak tut. |
| Kalça köprüsü (glute bridge) | 1×12 | — | Üstte kalçayı 1 sn sık; beli kavis yapma. |
| Kedi-deve (cat-cow) | 1×10 | — | Nefesle: nefes al – kavis, ver – yuvarla. |
| Lunge + gövde rotasyonu (world's greatest stretch) | 1×5 | — | Her tarafa 5. Ön diz 90°, dirseği yere, sonra göğsü tavana aç. |
| Vücut ağırlığıyla squat | 1×10 | — | Topuk yerde, dizler ayak ucu yönünde. |
| Bant ile omuz dış rotasyon (yoksa boş elle) | 1×12 | — | Dirsek gövdeye yapışık, yavaş. |
| Ana hareketin hafif ilk seti | 1×8 | 60 sn | Günün ilk egzersizini çalışma ağırlığının ~%50'siyle 8 tekrar. |

**İlerleme:** Isınma ilerletilmez; süre sabit. Soğuk günlerde ilk bloğu 3 dk yap.

**Notlar:**
- Antrenmandan önce 30 sn'den uzun statik germe yapma (Behm 2016).
- Sakatlık geçmişi olan bölgeye o bölgenin ısınmasını ekle (alt/üst vücut şablonları).

**Kaynaklar:** Jeffreys I (2007); Behm DG et al (2016); Garber CE et al (2011)

---

## Isınma — Alt vücut günü

`warmup-lower` · seviye **all** · ısınma bloğu · ~10 dk · ekipman: yok, boş bar · ısınma: `—`

Squat / deadlift / leg press günleri için. Genel ısınmanın üstüne kalça, diz ve ayak bileği hareket açıklığı + kalça aktivasyonu.

### Isınma

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Bisiklet / kürek / yürüyüş bandı | 3 dk | — | Hafif tempo, 3 dk. |
| Bacak sallama (öne-arkaya, yana) | 1×10 | — | Her bacak, her yön 10. Kontrollü, hızlanma. |
| Ayak bileği duvar mobilizasyonu | 1×10 | — | Topuk yerde, diz duvara doğru. Her bacak 10. |
| Kalça köprüsü | 1×15 | — | Üstte 2 sn tut. |
| Yan yatarak bacak kaldırma / bantlı yan adım | 1×12 | — | Her tarafa 12. Kalça dışını hisset. |
| Goblet squat (hafif dumbbell) | 2×8 | 30 sn | Derinliği her sette biraz artır. |
| Günün ilk hareketi — boş bar / hafif | 2×5 | 60 sn | Çalışma ağırlığının %40 ve %60'ı ile 5'er tekrar. |

**İlerleme:** Sabit.

**Kaynaklar:** Jeffreys I (2007); Behm DG et al (2016)

---

## Isınma — Üst vücut günü

`warmup-upper` · seviye **all** · ısınma bloğu · ~9 dk · ekipman: direnç bandı, boş bar · ısınma: `—`

Bench / omuz / sırt günleri için. Omuz kuşağı, torasik omurga ve rotator manşet hazırlığı.

### Isınma

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Kürek / kol ergometresi / ip atlama | 150 sn | — | 2–3 dk hafif. |
| Kol çevirme + omuz silkme | 1×10 | — | Her yöne 10. |
| Torasik açılma (yan yatarak kitap açma) | 1×8 | — | Her tarafa 8. Kalça sabit, göğüs döner. |
| Bant pull-apart | 2×15 | 15 sn | Kürek kemiklerini birbirine sık. |
| Bant ile dış rotasyon | 1×15 | — | Her kol 15. Dirsek 90°, gövdeye yakın. |
| Scapular şınav / duvarda scapular kaydırma | 1×10 | — | Kürek kemiklerini it–çek, dirsek kilitli. |
| Günün ilk hareketi — boş bar / hafif | 2×6 | 60 sn | Çalışma ağırlığının %40 ve %60'ı ile. |

**İlerleme:** Sabit.

**Kaynaklar:** Jeffreys I (2007); Behm DG et al (2016)

---

## Isınma — Kısa (4 dk)

`warmup-short` · seviye **all** · ısınma bloğu · ~4 dk · ekipman: yok · ısınma: `—`

15–20 dakikalık core ve sırt-omuz blokları için. 9 dakikalık genel ısınma bu programların yarısı kadar sürer; burada yalnızca nabız + hedef bölge aktivasyonu.

### Isınma

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Yerinde yürüyüş / hafif zıplama | 1 dk | — | 1 dk. |
| Kol çevirme + kedi-deve | 1×8 | — | Her biri 8. |
| Kalça köprüsü | 1×10 | — |  |
| Bant pull-apart (veya boş elle kürek kemiği sıkma) | 1×12 | — |  |
| Ölü böcek | 1×6 | — | Her tarafa 6 — core'u uyandır. |

**İlerleme:** Sabit.

**Kaynaklar:** Jeffreys I (2007)

---

## Tam Vücut Başlangıç — A/B

`fullbody-beginner` · seviye **beginner** · 3 gün (A-B-A, sonra B-A-B), aralarda en az 1 gün dinlenme · ~45 dk · ekipman: makine, dumbbell, bar · ısınma: `warmup-general`

İlk 8–12 haftası için. ACSM başlangıç önerisi: büyük kas gruplarına haftada 2–3 gün, 1–3 set × 8–12 tekrar, çok eklemli hareket öncelikli. Amaç hareket kalıbını öğrenmek ve düzenli gelmek — ağırlık ikinci planda.

### A günü

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Goblet squat | 3×10 | 90 sn | Dumbbell göğüste, dirsekler dizlerin içinden. Topuk yerde. |
| Göğüs pres (makine veya dumbbell) | 3×10 | 90 sn | Kürek kemikleri sıkı, bilekler dirseğin üstünde. |
| Lat pulldown | 3×10 | 90 sn | Barı göğsün üstüne çek, dirsekler aşağı-geri. |
| Kettlebell deadlift (1–4. hafta) → Romanian deadlift (5. haftadan) | 3×10 | 90 sn | Önce kalça menteşesi (hinge) öğrenilir: kalçayı geri it, sırt düz. Antrenör hinge'i onaylamadan RDL'ye geçme. |
| Plank | 3×30 sn | 45 sn | Kalça ne yukarı ne aşağı; karnı sık, nefes al. |

### B günü

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Leg press | 3×10 | 90 sn | Ayaklar omuz genişliği, dizler ayak ucu yönünde. Dizi kilitleme. |
| Omuz pres (makine veya dumbbell) | 3×10 | 90 sn | Beli kavis yapma; karnı sık. |
| Oturarak kürek (seated row) | 3×10 | 90 sn | Göğsü aç, dirsekler gövdeye yakın, omuz kulaktan uzak. |
| Reverse lunge (geriye adım) — destekle | 2×8 | 90 sn | Her bacak 8. Denge için bir el makineye tutunabilir. Bulgarian split squat başlangıç için değil. |
| Ölü böcek (dead bug) | 3×8 | 45 sn | Her tarafa 8. Bel yere yapışık kalsın. |

**İlerleme:** Haftalık: bir egzersizde 2 seans üst üste her sette hedef tekrarı (10) tamamlayabildiysen ağırlığı bir sonraki seansta %5 (üst vücut ~2,5 kg, alt vücut ~5 kg) artır — '2-for-2' kuralı (NSCA). 1–4. hafta 2 set, 5. haftadan itibaren 3 set.

**Notlar:**
- İlk 2 hafta ağırlığı 'rahat 12 tekrar yapabildiğin' seviyede tut; hareket kalıbı önce.
- Kas ağrısı normaldir, eklem ağrısı değildir — eklem ağrısında o hareketi antrenöre sor.

**Kaynaklar:** ACSM (2009) (2009); Garber CE et al (2011); WHO (2020) (2020); Haff GG, Triplett NT (eds.) (2016) (eds.)

---

## Tam Vücut Orta — A/B/C

`fullbody-intermediate` · seviye **intermediate** · 3 gün (Pzt-Çar-Cum) · ~70 dk · ekipman: bar, dumbbell, makine, kablo · ısınma: `warmup-general`

En az 6 ay düzenli çalışmış üye için. Haftada kas grubu başına 10+ set (Schoenfeld 2017), her kas grubu haftada 2–3 kez (Schoenfeld 2016). Üç günün her biri farklı ana hareketle başlar; ağır (5), orta (8), hafif-hacim (12) günleri.

### A — Ağır

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Back squat | 4×5 | 180 sn | Çalışma ağırlığı: 5 tekrarı 1–2 tekrar yedekle bitir (RIR 1–2). |
| Bench press | 4×5 | 180 sn | Ayaklar yere basılı, kürek kemikleri sıkı. |
| Barbell row | 3×6 | 120 sn | Gövde ~45°, barı karın altına. |
| Yüz çekişi (face pull) | 3×15 | 60 sn | Dirsekler yukarı-geri, omuz sağlığı için. |
| Asılı bacak kaldırma / diz çekme | 3×10 | 60 sn | Sallanma; kontrollü indir. |

### B — Orta

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Romanian deadlift (bar) | 3×8 | 150 sn | Bar bacağa sürtünsün; hamstring gerginliğini hisset. |
| Dumbbell omuz pres | 3×8 | 120 sn | Oturarak; beli sıkıştırma. |
| Lat pulldown veya barfiks | 3×8 | 120 sn | Barfiks yapabiliyorsan onu tercih et. |
| Walking lunge | 3×10 | 90 sn | Her bacak 10 adım. |
| Pallof pres | 3×12 | 60 sn | Her tarafa 12. Gövde dönmesin — anti-rotasyon. |

### C — Hacim

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Leg press | 3×12 | 90 sn | Tam açıklık, tempo 2 sn iniş. |
| Incline dumbbell pres | 3×12 | 90 sn | Bank 30°. |
| Tek kol dumbbell row | 3×12 | 90 sn | Her kol 12. Omuz kulaktan uzak. |
| Leg curl | 3×12 | 75 sn | Üstte 1 sn sık. |
| Lateral raise | 3×15 | 60 sn | Dirsek hafif kırık, omuz hizasına kadar. |
| Side plank | 3×30 sn | 30 sn | Her tarafa 30 sn. Kalça düşmesin. |

**İlerleme:** Ağır günde 4×5'i RIR 1 ile bitirebildiysen +2,5/5 kg. Orta ve hacim günlerinde önce tekrar (8→10, 12→15), sonra ağırlık. Her 5–6. hafta bir 'deload': set sayısını yarıya indir, ağırlığı %10 düşür.

**Notlar:**
- Çok eklemli hareketlerde 2–3 dk dinlenme performansı ve gelişimi artırır (Schoenfeld 2016) — dinlenmeyi kısaltma.
- Her ana harekette haftalık en iyi seti kaydet — 'geçen sefer' göstergesi bunun için.

**Kaynaklar:** ACSM (2009) (2009); Schoenfeld BJ, Ogborn D, Krieger JW (2017) (2017); Schoenfeld BJ, Ogborn D, Krieger JW (2016) (2016); Schoenfeld BJ et al (2016); Haff GG, Triplett NT (eds.) (2016) (eds.)

---

## Alt/Üst Split Başlangıç — 4 gün

`upperlower-beginner` · seviye **beginner** · 4 gün (Üst-Alt-dinlenme-Üst-Alt-dinlenme-dinlenme) · ~50 dk · ekipman: makine, dumbbell, bar · ısınma: `warmup-general`

Tam vücut başlangıcı 8–12 hafta tamamlamış, haftada 4 gün gelebilen üye için. Her kas grubu haftada 2 kez, günlük hacim tam vücuttan düşük — toparlanma daha kolay.

### Üst A

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Bench press (bar veya dumbbell) | 3×8 | 120 sn | Bilekler düz, bar göğüs ortasına. |
| Oturarak kürek | 3×10 | 90 sn | Göğsü aç, kürek kemiklerini sık. |
| Dumbbell omuz pres | 3×10 | 90 sn |  |
| Lat pulldown | 3×10 | 90 sn |  |
| Biceps curl + triceps pushdown (süperset) | 2×12 | 60 sn | Biri bitince diğerine geç, sonra dinlen. |

### Alt A

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Goblet squat veya leg press | 3×10 | 120 sn |  |
| Romanian deadlift (dumbbell) | 3×10 | 120 sn | Kalça geri, bar bacağa yakın. |
| Leg extension | 2×12 | 75 sn | Üstte 1 sn tut. |
| Leg curl | 2×12 | 75 sn |  |
| Plank | 3×40 sn | 45 sn |  |

### Üst B

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Incline dumbbell pres | 3×10 | 90 sn | Bank 30°. |
| Tek kol dumbbell row | 3×10 | 90 sn | Her kol 10. |
| Lateral raise | 3×15 | 60 sn |  |
| Yüz çekişi (face pull) | 3×15 | 60 sn | Omuz sağlığı; hafif ağırlık. |
| Hammer curl + overhead triceps (süperset) | 2×12 | 60 sn |  |

### Alt B

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Bulgarian split squat | 3×8 | 90 sn | Her bacak 8. |
| Hip thrust (bar veya makine) | 3×10 | 120 sn | Üstte kalçayı 1 sn sık, çene içeride. |
| Calf raise | 3×15 | 60 sn | Tam açıklık, üstte 1 sn. |
| Ölü böcek | 3×10 | 45 sn | Her tarafa 10. |

**İlerleme:** 2-for-2: iki seans üst üste tüm setlerde hedef tekrar → ağırlık +%5. Süperset ve izolasyonlarda önce tekrar artır (12→15).

**Notlar:**
- 4 gün gelemediğin hafta: Üst A + Alt A + Üst B yap, Alt B'yi sonraki haftanın başına al.
- Bu hacim başlangıç için üst sınıra yakın; uyku 7 saatin altındaysa her günden bir set çıkar.

**Kaynaklar:** ACSM (2009) (2009); Schoenfeld BJ, Ogborn D, Krieger JW (2016) (2016); Haff GG, Triplett NT (eds.) (2016) (eds.)

---

## Alt/Üst Split Orta — 4 gün, güç + hipertrofi

`upperlower-intermediate` · seviye **intermediate** · 4 gün · ~65 dk · ekipman: bar, dumbbell, makine, kablo · ısınma: `warmup-general`

Haftanın ilk yarısı güç (4–6 tekrar, uzun dinlenme), ikinci yarısı hipertrofi (8–15 tekrar). Kas grubu başına haftalık 12–18 set. Klasik 'DUP' (günlük dalgalı periyodizasyon) düzeni.

### Üst — Güç

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Bench press | 4×5 | 180 sn | RIR 1–2. |
| Weighted barfiks veya ağır lat pulldown | 4×5 | 180 sn |  |
| Overhead press (bar) | 3×6 | 150 sn | Kalçayı sık, beli kavis yapma. |
| Barbell row | 3×6 | 150 sn |  |
| Yüz çekişi | 3×15 | 60 sn |  |

### Alt — Güç

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Back squat | 4×5 | 180 sn | RIR 1–2. |
| Romanian deadlift (bar) | 3×8 | 150 sn | Ağır çekiş bu gün değil — squat'ın omurga yükü yeter. |
| Leg press | 3×8 | 120 sn |  |
| Asılı bacak kaldırma | 3×10 | 60 sn |  |

### Üst — Hipertrofi

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Incline dumbbell pres | 3×10 | 90 sn |  |
| Kablo kürek (chest-supported row) | 3×12 | 90 sn |  |
| Dumbbell omuz pres | 3×10 | 90 sn |  |
| Lat pulldown (geniş) | 3×12 | 90 sn |  |
| Lateral raise | 4×15 | 45 sn |  |
| Biceps curl + triceps pushdown (süperset) | 3×12 | 60 sn |  |

### Alt — Hipertrofi

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Deadlift (trap bar tercih)  | 3×6 | 240 sn | Haftanın tek ağır çekişi. Tekniği bozan tekrarda dur. |
| Hack squat veya front squat | 3×10 | 120 sn |  |
| Walking lunge | 3×12 | 90 sn | Her bacak 12. |
| Leg curl | 3×12 | 75 sn |  |
| Calf raise | 4×12 | 60 sn |  |
| Pallof pres | 3×12 | 45 sn | Her tarafa. |

**İlerleme:** Güç günleri: 4×5 tamamlanınca +2,5/5 kg. Hipertrofi günleri: tekrar aralığının üstüne çık, sonra ağırlık. 4 hafta yükle + 1 hafta deload.

**Notlar:**
- Ağır squat ve ağır deadlift bilerek ayrı günlerde — aynı seansta iki ağır omurga yükü salon üyesi için gereksiz risk. İki alt gün arasında en az 72 saat.
- Bu şablon 6+ ay düzenli antrenman ve doğru squat/deadlift tekniği varsayar — antrenör teknik onayı vermeden atama.

**Kaynaklar:** ACSM (2009) (2009); Schoenfeld BJ, Ogborn D, Krieger JW (2017) (2017); Schoenfeld BJ et al (2016); Haff GG, Triplett NT (eds.) (2016) (eds.)

---

## Yağ Kaybı Başlangıç — direnç + tempolu kardiyo

`fatloss-beginner` · seviye **beginner** · 3 gün direnç (A-B-A) — kardiyo günleri OPSİYONEL (salon dışında yürüyüş de sayılır); ayrıca günlük adım · ~50 dk · ekipman: makine, dumbbell, kardiyo aleti · ısınma: `warmup-general`

Yağ kaybı diyetle başlar; antrenman kas kütlesini korur ve kalori açığına katkı verir. Direnç antrenmanı + aerobik kombinasyonu yalnız birinden üstün (Willis 2012). Anlamlı kilo kaybı için haftalık ≥250 dk orta yoğunluk hedefi (Donnelly 2009) — bu şablon 150 dk ile başlar, yürüyüşle 250'ye çıkarılır.

### Direnç A

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Goblet squat | 3×12 | 60 sn |  |
| Göğüs pres (makine) | 3×12 | 60 sn |  |
| Oturarak kürek | 3×12 | 60 sn |  |
| Kalça köprüsü / hip thrust | 3×12 | 60 sn |  |
| Plank | 3×30 sn | 30 sn |  |
| Bitiş: bisiklet / kürek | 10 dk | — | 10 dk, konuşabilecek tempo. |

### Direnç B

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Leg press | 3×12 | 60 sn |  |
| Lat pulldown | 3×12 | 60 sn |  |
| Dumbbell omuz pres | 3×12 | 60 sn |  |
| Step-up (kutu) | 3×10 | 60 sn | Her bacak 10. Üstteki bacakla it, alttakiyle sıçrama. |
| Ölü böcek | 3×10 | 30 sn |  |
| Bitiş: yürüyüş bandı eğimli | 10 dk | — | 10 dk, eğim %5–8, hız yürüyüş. |

### Kardiyo günü (opsiyonel, ×2)

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Tempolu kardiyo (bisiklet / eliptik / yürüyüş bandı / dışarıda tempolu yürüyüş) | 30 dk | — | 30 dk. Konuşabiliyor ama şarkı söyleyemiyorsun — orta yoğunluk (RPE 5–6/10). Salona gelmek şart değil. |

**İlerleme:** Her 2 haftada kardiyo süresine +5 dk (30→45). Direnç: 12 tekrar rahatlayınca ağırlık +%5. Günlük adım hedefi: 6.000 → 10.000'e 4 haftada.

**Notlar:**
- Yeni üyenin haftada 5 gün salona gelmesi gerçekçi değil; önce 3 direnç gününü 4 hafta aksatmadan getir, kardiyo günlerini sonra ekle.
- Karın egzersizi karın yağını yakmaz (Vispute 2011) — mekik sayısını değil kalori açığını artır.
- Haftalık kilo hedefi vücut ağırlığının %0,5–1'i; daha hızlısı kas kaybettirir.
- Beslenme bu şablonun kapsamı dışında — diyetisyen yönlendirmesi antrenörün işi.

**Kaynaklar:** Donnelly JE et al (2009); Willis LH et al (2012); WHO (2020) (2020); Garber CE et al (2011); Vispute SS et al (2011)

---

## Yağ Kaybı Orta — direnç + aralıklı (HIIT)

`fatloss-intermediate` · seviye **intermediate** · 5 gün: 3 direnç + 2 HIIT (direnç günlerinden ayrı günlerde) · ~55 dk · ekipman: bar, dumbbell, makine, kardiyo aleti · ısınma: `warmup-general`

En az 6 ay direnç antrenmanı geçmişi olan üye için. HIIT öncesi PAR-Q+ taraması; herhangi bir 'evet' cevabında hekim onayı olmadan HIIT eklenmez, orta yoğunluklu kardiyo verilir. HIIT ile orta yoğunluklu sürekli kardiyo vücut kompozisyonunda benzer sonuç verir, HIIT %40 daha az sürede (Wewege 2017). Direnç hacmi korunur; kalori açığında kası koruyan şey budur.

### Direnç A — Alt ağırlıklı

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Back squat | 4×8 | 120 sn |  |
| Romanian deadlift | 3×10 | 120 sn |  |
| Walking lunge | 3×12 | 60 sn | Her bacak 12. |
| Lat pulldown | 3×10 | 90 sn |  |
| Asılı diz çekme | 3×12 | 45 sn |  |

### Direnç B — Üst ağırlıklı

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Bench press | 4×8 | 120 sn |  |
| Barbell / kablo row | 4×10 | 90 sn |  |
| Dumbbell omuz pres | 3×10 | 90 sn |  |
| Dumbbell devre: curl → lateral raise → pushdown | 3×12 | 60 sn | Üçünü arka arkaya, sonra 60 sn dinlen. |
| Side plank | 3×40 sn | 30 sn | Her tarafa 40 sn. |

### Direnç C — Tam vücut devre

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Devre: goblet squat → şınav → dumbbell row → kettlebell swing → mountain climber | 4×12 | 90 sn | Her hareket 12 tekrar (climber 20), hareket arası 15 sn, tur arası 90 sn. 4 tur. |

### HIIT günü (×2)

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Isınma: hafif kardiyo | 5 dk | — | 5 dk. |
| Aralık: 30 sn sert / 90 sn hafif (bisiklet, kürek veya koşu bandı) | 8×30 sn | 90 sn | Sert bölümde RPE 8–9/10; 8 tur. Konuşamıyorsan doğru yoğunluktasın. |
| Soğuma: hafif kardiyo | 5 dk | — | 5 dk. |

**İlerleme:** HIIT: 8 tur → 10 → 12 (her 2 haftada +2 tur), sonra sert bölümü 30→40 sn. Direnç: ağırlığı korumaya çalış — kalori açığında ağırlık artışı beklenmez, düşmemesi başarıdır.

**Notlar:**
- HIIT ve ağır bacak günü arasına en az 24 saat.
- Eklem ağrısı veya baş dönmesinde HIIT'i orta yoğunluklu 30 dk kardiyoya çevir; sonuç aynı, sadece süre uzar.
- Kilo kaybı 2 hafta durursa önce beslenmeyi, sonra günlük adımı kontrol et — antrenman hacmini artırmadan.

**Kaynaklar:** Wewege M et al (2017); Willis LH et al (2012); Donnelly JE et al (2009); Schoenfeld BJ, Ogborn D, Krieger JW (2017) (2017); Garber CE et al (2011); Warburton DER et al (2011)

---

## Core Güçlendirme Başlangıç — McGill 3'lüsü

`core-beginner` · seviye **beginner** · Haftada 3–4 gün; ana antrenmanın sonuna veya ayrı güne · ~15 dk · ekipman: mat · ısınma: `warmup-short`

Gövde stabilitesi: omurgayı hareket ettirmeden yüke direnmek (anti-ekstansiyon, anti-lateral fleksiyon, anti-rotasyon). McGill'in 'Big 3'ü bel yükünü düşük tutarak dayanıklılık kurar. Bu bir karın 'inceltme' programı DEĞİLDİR — bölgesel yağ kaybı yoktur.

### Core

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| McGill curl-up | 3×8 | 30 sn | Eller belin altında, bir diz bükük. Baş ve omuzları 2–3 cm kaldır, 8 sn tut. Boyun bükülmez. |
| Side bridge (dizden) | 3×15 sn | 30 sn | Her tarafa 3×15 sn. Kalça, omuz, diz bir çizgide. |
| Bird-dog | 3×6 | 30 sn | Her tarafa 6, üstte 5 sn tut. Bel düz — sırtta bir bardak su dökülmesin. |
| Ölü böcek | 3×8 | 30 sn | Her tarafa 8. Nefes ver, bel yere yapışık. |
| Plank (dizden veya ayaktan) | 3×20 sn | 30 sn | Kalçayı sık, karın içeride. |

**İlerleme:** Piramit yöntemi (McGill): tekrarı değil set düzenini değiştir — 5-3-1 → 6-4-2 → 8-6-4. Side bridge 15→20→30 sn; sonra ayaktan. 4. haftada plank 40 sn olunca 'orta' şablona geç.

**Notlar:**
- Bel ağrısı olan üyeye bu şablon fizyoterapist/hekim onayı olmadan atanmaz.
- Mekik ve bacak kaldırma bilinçli olarak yok: bel disk yükü yüksek, başlangıç için gereksiz.

**Kaynaklar:** McGill SM (2010) (2010); Vispute SS et al (2011); Kostek MA et al (2007)

---

## Core Güçlendirme Orta — yüklü anti-rotasyon

`core-intermediate` · seviye **intermediate** · Haftada 3 gün · ~20 dk · ekipman: kablo/bant, kettlebell, tekerlek (ab wheel), mat · ısınma: `warmup-short`

Başlangıcı bitirmiş üye için: yüklü anti-rotasyon ve anti-ekstansiyon, tek taraflı taşıma. Sporun ve ağır squat/deadlift'in gövde talebi bu.

### Core

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Pallof pres | 3×12 | 45 sn | Her tarafa 12. Kollar uzayınca 2 sn tut, gövde dönmesin. |
| Ab wheel rollout (dizden) | 3×8 | 60 sn | Bel çökmeden gidebildiğin kadar; kalçayı sık. |
| Suitcase carry (tek el kettlebell) | 3×30 sn | 45 sn | Her elde 30 sn yürü. Gövde dik, yana eğilme. |
| Side plank (ayaktan) + üst bacak kaldırma | 3×30 sn | 30 sn | Her tarafa. |
| Bird-dog (dirsek-diz temaslı) | 3×8 | 30 sn | Her tarafa 8. Uzat–topla, bel sabit. |
| Asılı diz çekme | 3×10 | 45 sn | Sallanma. Kontrollü indir. |

**İlerleme:** Pallof: ağırlık +1 kademe her 2 haftada. Rollout: dizden 12 tekrar → ayaktan duvara. Carry: 30 sn → 45 sn → ağırlık.

**Notlar:**
- Ağır squat/deadlift gününde bu bloğu antrenmanın SONUNA koy; önce yaparsan gövde yorgun girer.

**Kaynaklar:** McGill SM (2010) (2010); Haff GG, Triplett NT (eds.) (2016) (eds.)

---

## Sırt ve Omuz Güçlendirme — Masa Başı Çalışanlar, Başlangıç

`desk-beginner` · seviye **beginner** · Haftada 3 gün × 20 dk (Andersen 2008 protokolü) · ~20 dk · ekipman: dumbbell, direnç bandı · ısınma: `warmup-short`

Boyun-omuz ağrısı olan ofis çalışanlarında haftada 3×20 dk spesifik güç antrenmanı ağrıyı anlamlı azalttı (Andersen 2008); günlük 2 dk bile fayda gösterdi (Andersen 2011). Bu şablon 'postürü düzeltmez' — üst sırt ve omuz kuşağını güçlendirir, bu da masa başında yorulmayı geciktirir. Kanıt olan iddia budur.

### Sırt-Omuz

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Bant pull-apart | 3×15 | 30 sn | Kürek kemiklerini birbirine sık, omuz kulaktan uzak. |
| Dumbbell reverse fly (öne eğik) | 3×12 | 45 sn | Hafif ağırlık; dirsek hafif kırık, arka omuzu hisset. |
| Tek kol dumbbell row | 3×12 | 45 sn | Her kol 12. Dirsek gövdeye yakın, kürek kemiği önce hareket eder. |
| Lateral raise | 3×12 | 45 sn | Omuz hizasına kadar, sallanmadan. |
| Omuz silkme (shrug) | 3×12 | 45 sn | Üstte 1 sn tut, kontrollü indir. |
| Bant dış rotasyon | 2×15 | 30 sn | Her kol. Dirsek 90°, gövdeye yapışık. |
| Çene içeri çekme (chin tuck) | 2×10 | 20 sn | Başı geriye kaydır, 5 sn tut. Çeneyi kaldırma. |

**İlerleme:** 12 tekrar rahatlayınca ağırlık +1 kademe. Andersen protokolü progresif yüklenme kullandı: 8. haftada başlangıç ağırlığının ~1,5 katına ulaşmak normal.

**Notlar:**
- Sinir belirtisi (kola yayılan uyuşma, elde güç kaybı) varsa şablon atanmaz, hekime yönlendirilir.
- Masa başında her 30–45 dk'da 2 dk ayağa kalkıp bant pull-apart — Andersen 2011'in bulgusu tam olarak bu.

**Kaynaklar:** Andersen LL et al (2008); Andersen LL et al (2011); ACSM (2009) (2009)

---

## Sırt ve Omuz Güçlendirme — Orta, tam üst sırt

`desk-intermediate` · seviye **intermediate** · Haftada 3 gün · ~35 dk · ekipman: kablo, dumbbell, bar, bant · ısınma: `warmup-upper`

Başlangıç protokolünü 8 hafta tamamlamış üye için: çekiş hacmi itiş hacminin ~2 katı (üst sırt / göğüs dengesi), torasik hareket açıklığı ve rotator manşet.

### Sırt-Omuz

| Egzersiz | Doz | Dinlenme | İpucu |
|---|---|---|---|
| Yüz çekişi (face pull) | 4×15 | 45 sn | Kablo göz hizasında; dirsekler yukarı-geri, dış rotasyonla bitir. |
| Chest-supported dumbbell row | 4×10 | 75 sn | Göğüs banka yaslı — bel devre dışı, sadece sırt. |
| Lat pulldown (nötr tutuş) | 3×12 | 75 sn |  |
| Dumbbell reverse fly | 3×15 | 45 sn |  |
| Dumbbell omuz pres (oturarak) | 3×10 | 75 sn | Tek itiş hareketi — bilinçli olarak az. |
| Kablo dış rotasyon | 3×15 | 30 sn | Her kol. |
| Torasik açılma (foam roller üstünde) | 2×8 | 20 sn | Roller kürek kemiği altında, eller ense, 8 kez geriye açıl. |
| Dead hang (barda asılma) | 2×30 sn | 45 sn | Omuzları gevşet, nefes al. |

**İlerleme:** Çekişlerde 2-for-2. Face pull ve dış rotasyonda ağırlık değil tekrar/tempo (3 sn kontrollü dönüş).

**Notlar:**
- Bu şablon bir 'göğüs günü'yle birlikte atanıyorsa haftalık itiş/çekiş dengesini antrenör kontrol etsin.

**Kaynaklar:** Andersen LL et al (2008); ACSM (2009) (2009); Schoenfeld BJ, Ogborn D, Krieger JW (2017) (2017)

---

## Kaynakça

- **ramp** — Jeffreys I. (2007). Warm up revisited – the 'RAMP' method of optimising performance preparation. UKSCA Journal, 6, 12–18.
- **acsm2009** — ACSM (2009). Position Stand: Progression models in resistance training for healthy adults. Med Sci Sports Exerc, 41(3), 687–708.
- **acsm2011** — Garber CE et al. (2011). ACSM Position Stand: Quantity and quality of exercise for developing and maintaining fitness in apparently healthy adults. Med Sci Sports Exerc, 43(7), 1334–1359.
- **who2020** — WHO (2020). Guidelines on physical activity and sedentary behaviour.
- **nsca** — Haff GG, Triplett NT (eds.) (2016). NSCA Essentials of Strength Training and Conditioning, 4th ed. (2-for-2 kuralı, dinlenme aralıkları).
- **schoenfeld2017** — Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci, 35(11), 1073–1082.
- **schoenfeld2016freq** — Schoenfeld BJ, Ogborn D, Krieger JW (2016). Effects of resistance training frequency on measures of muscle hypertrophy: a systematic review and meta-analysis. Sports Med, 46(11), 1689–1697.
- **schoenfeld2016rest** — Schoenfeld BJ et al. (2016). Longer interset rest periods enhance muscle strength and hypertrophy in resistance-trained men. J Strength Cond Res, 30(7), 1805–1812.
- **mcgill** — McGill SM (2010). Core training: evidence translating to better performance and injury prevention. Strength Cond J, 32(3), 33–46. ('Big 3': curl-up, side bridge, bird-dog)
- **vispute** — Vispute SS et al. (2011). The effect of abdominal exercise on abdominal fat. J Strength Cond Res, 25(9), 2559–2564. (Bölgesel yağ kaybı bulunmadı.)
- **kostek** — Kostek MA et al. (2007). Subcutaneous fat alterations resulting from an upper-body resistance training program. Med Sci Sports Exerc, 39(7), 1177–1185. (Bölgesel yağ kaybı bulunmadı.)
- **andersen2008** — Andersen LL et al. (2008). Effect of two contrasting types of physical exercise on chronic neck muscle pain. Arthritis Rheum, 59(1), 84–91. (Haftada 3×20 dk spesifik güç antrenmanı.)
- **andersen2011** — Andersen LL et al. (2011). Effectiveness of small daily amounts of progressive resistance training for frequent neck/shoulder pain. Pain, 152(2), 440–446.
- **donnelly** — Donnelly JE et al. (2009). ACSM Position Stand: Appropriate physical activity intervention strategies for weight loss and prevention of weight regain. Med Sci Sports Exerc, 41(2), 459–471. (Anlamlı kilo kaybı için ≥250 dk/hafta.)
- **willis** — Willis LH et al. (2012). Effects of aerobic and/or resistance training on body mass and fat mass in overweight or obese adults. J Appl Physiol, 113(12), 1831–1837.
- **wewege** — Wewege M et al. (2017). The effects of HIIT vs. moderate-intensity continuous training on body composition in overweight and obese adults: a systematic review and meta-analysis. Obes Rev, 18(6), 635–646.
- **parq** — Warburton DER et al. (2011). The Physical Activity Readiness Questionnaire for Everyone (PAR-Q+). Health & Fitness Journal of Canada, 4(2), 3–23.
- **behm** — Behm DG et al. (2016). Acute effects of muscle stretching on physical performance, range of motion, and injury incidence in healthy active individuals: a systematic review. Appl Physiol Nutr Metab, 41(1), 1–11. (Isınmada uzun statik germe performansı düşürür; dinamik tercih edilir.)
