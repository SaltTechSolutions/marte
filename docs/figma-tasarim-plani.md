# GymEntra — Figma dosyası: denetim ve düzeltme planı

**Dosya:** [GymEntra Design System](https://figma.com/design/G6MlCtuwPgFUKdErsqCbwp/GymEntra-Design-System)
**Denetim ve düzeltme turu:** 8 Eylül 2026
**Karşılaştırma tabanı:** `apps/gymentra-mobile/src` (bugünkü hâli)

Bu dosya `docs/designplan.md`'in kardeşi. O, **uygulamanın** tasarım denetimi;
bu, **Figma dosyasının** denetimi. İkisi arasındaki fark önemli: designplan
"uygulamada ne yanlış" diyor, bu dosya "tasarım artık uygulamayı anlatmıyor"
diyor.

---

## Temel sorun

Dosyada 22 ekran vardı ve **hiçbiri değişkene, stile ya da bileşene bağlı
değildi.** Ölçülen hâliyle:

- 388 dolgunun **0'ı** renk değişkenine bağlıydı,
- 156 metnin **0'ı** metin stili kullanıyordu,
- dosyada **hiç bileşen yoktu** — durum çubuğu, sekme çubuğu ve home
  indicator 22 ekranda tek tek elle çizilmişti,
- Foundations sayfasındaki 14 renk değişkeni, 4 mod (GymEntra/Tarabya ×
  Koyu/Açık) ve 6 metin stili **hiçbir ekranda kullanılmıyordu.**

Sonucu şuydu: "08L · Ana Ekran (Light)" ve "16L · Panel (Light)" birer mod
değil, **elle yeniden renklendirilmiş kopyalardı**. Ana ekran değişince
kopyalar değişmiyordu ve nitekim değişmemişti. Tasarım dosyası bir sistem
değil, 22 ayrı resimdi.

İkinci sorun içerikti: son aylarda eklenen **paket/kredi sistemi, ödeme
bildirimi, PT randevusu, duyurular, ebeveyn-çocuk üyeliği, kapıda check-in,
rol değiştirme** özelliklerinin hiçbiri dosyada yoktu. Antrenör sekme
çubuğu 4 sekme gösteriyordu, uygulamada 5 var; sekme adı "Danışanlar"dı,
uygulamada "Üyelerim".

---

## Bu turda yapılanlar

### S1 · Token sistemi gerçekten bağlandı

- **~790 dolgu ve kenarlık** renk değişkenlerine bağlandı. Geriye yalnızca
  **5 ham renk** kaldı: "Marka ayarları" ekranındaki renk seçici daireleri —
  onlar zaten seçilebilir ham renkleri temsil ediyor, bağlanmamaları doğru.
- Her ekran çerçevesi ait olduğu **moda sabitlendi** (Üye/Onboarding/Antrenör
  → GymEntra Dark, Admin → Tarabya Dark, `08L` → GymEntra Light, `21L` →
  Tarabya Light). Artık açık tema bir mod değişimi; yeniden çizim değil.
- `08L` ve `21L` sıfırdan, yeni ana ekranların **klonu** olarak üretildi.
  Bundan sonra ana ekran değişince ikisi de değişir.

### S2 · Eksik semantik renkler tokenlaştırıldı

Ekranlarda sistemde karşılığı olmayan 9 renk vardı. Hepsi Color koleksiyonuna,
dört modda da değeriyle eklendi:

| token | ne için | neden gerekliydi |
|---|---|---|
| `color/onPrimary` | birincil buton üstündeki metin/ikon | kodda `colors.onp` var, Figma'da yoktu — `#0A0F0D` ham geziyordu |
| `color/okSurface` · `warnSurface` · `dangerSurface` | durum rozetlerinin zemini | `#123A28` `#3A2E12` `#3A1414` ham kullanılıyordu |
| `color/lineStrong` | vurgulu kenarlık | `#FFFFFF@0.16` |
| `color/dim` | pasif ikon/metin | `#FFFFFF@0.32` |
| `color/scrim` | modal perdesi | `#000000@0.25` |
| `color/qrInk` · `color/qrPaper` | QR modülleri ve zemini | QR **her temada** koyu-üstüne-açık kalmalı, yoksa okunmaz. Bunlar bilinçli olarak moddan bağımsız sabit. |

Ayrıca kenarlıklardaki `@0.09` / `@0.10` sapmaları `color/line`'a normalize
edildi (token `@0.08`).

### S3 · Tipografi kısmen ölçeğe oturdu

Ekranlarda **20 farklı punto** vardı; uygulamada ise 6 basamaklı bir ölçek
(`Type` in `tokens.ts`) ve bir avuç ham değer var. Yani tasarımın büyük
kısmı **uygulanabilir değildi.**

- `designplan.md` D2-5'in istediği **15pt basamağı eklendi** (`GymEntra/Callout`,
  `Callout Bold`) — dosyada 25 yerde 15/Bold kullanılıyordu, ölçekte karşılığı
  yoktu.
- Gerçekten kullanılan ağırlık türevleri stilleştirildi: `Helper Bold`,
  `Body Bold`, `Body Black`, `Label Medium`.
- **215 metin** paylaşılan stile bağlandı.
- Sekme çubuğu ve mikro etiketlerdeki **106 adet 10pt**, ölçekteki 11pt
  `Label`'a çekildi (uygulamada tab etiketi zaten 11pt).

Kalan ölçek dışı metinler ikinci turda kapatıldı (aşağıda S7).

### S4 · Bileşen kütüphanesi kuruldu

Foundations sayfasında yeni bir **Components** bölümü var:

- `Status bar`, `Home indicator`, `Nav bar` (başlıklı push ekranları için)
- `Tab bar / Member`, `Tab bar / Trainer`, `Tab bar / Admin` — her biri
  **5 varyantlı** (`active=<sekme>`)

22 ekrandaki elle çizilmiş kopyaların hepsi bu bileşenlerin örnekleriyle
değiştirildi. Yol üstünde iki gerçek hata düzeldi:

- Home indicator **22 ekranın hepsinde** farklı yerdeydi; hepsi tek konuma
  hizalandı.
- Antrenör sekme çubuğu **4 sekmeydi**, uygulamada 5 var (Üyeler · Takvim ·
  Dersler · Programlar · Profil). 5 sekmeli hâli kuruldu ve "Danışanlar"
  adı "Üyeler" olarak düzeltildi.

### S5 · İkon seti genişletildi

Foundations'taki gizli `Ionicons source` çerçevesine, uygulamanın gönderdiği
**tam aynı `Ionicons.ttf`'ten** 9 glif çıkarılıp eklendi:
`people-circle` · `ribbon` · `swap-horizontal` · `megaphone` · `bar-chart` ·
`search` · `chevron-forward` · `cash` · `notifications`.

Çıkarma yöntemi tekrar edilebilir; `fontTools` ile glif konturu 20×20 SVG
path'e dönüştürülüyor. Yeni ikon gerektiğinde aynı yol kullanılmalı — elle
çizilen ya da başka setten alınan ikon, Figma ile uygulamayı ayırır.

### S6 · Ekranlar uygulamaya hizalandı

Yeniden kurulanlar:

| ekran | ne değişti |
|---|---|
| `08 · Ana Ekran` | Tamamen yeniden kuruldu. Eskisi "2 KPI + bugünkü ders + 2 kısayol + hafta noktaları" idi; uygulama artık salon başlığı + hesap düğmesi, duyuru, paket teklifi, Üye Kartım birincil aksiyonu, bugünkü ders, **paket + kredi kartı**, yaklaşan PT randevusu ve randevu alma girişini gösteriyor. |
| `09 · Üye Kartım` | **Sözlü kısa kod** eklendi (kamera çalışmazsa okunan 6 hane) — uygulamada var, tasarımda yoktu. "Son güncelleme: 8 dk önce" yerine uygulamanın gerçekten yazdığı "Bugün giriş yapıldı · 09:14". Yalnızca geliştirmede duran **"Check-in'i simüle et" düğmesi kaldırıldı.** |
| `17 · Üyelerim` | Salon başlığı, **"Giriş kabul et"** kartı (kapıdaki personel için), **arama alanı** ve sayılı filtre çipleri eklendi; başlık düzeltildi. |
| `21 · Panel` | Yeniden kuruldu: canlı check-in sayacı, **üç** KPI kartı (eskiden iki), Raporlar girişi, yenileme talepleri ve katılım istekleri. Uygulamada olmayan "Bugünkü dersler" listesi kaldırıldı. |
| `08L` · `08XL` · `21L` | Yeni ana ekranlardan yeniden üretildi. `08XL` artık gerçek bir Dynamic Type kanıtı: metin %135 ölçeklenince hangi satırların taştığı görünüyor. |

Yeni eklenen 10 ekran:

- **Üye:** `14 · Ödemelerim` (ödeme bildirimi + geçmiş), `15 · Randevu al`
  (antrenör, kredi, gün ve saat seçimi), `16 · Hesabım` (çocuklar, bilgiler,
  bildirim tercihleri, rol değiştirme, yasal, çıkış, hesap silme)
- **Antrenör:** `18 · Takvim` (ay ızgarası + günün randevuları),
  `19 · Derslerim` (tarih adımlayıcı + yoklama)
- **Yönetici:** `23 · Kapıda check-in` (kamera + 6 haneli kod + sonuç kartı),
  `24 · Paketler` (paket kataloğu, kaldırılmış paket durumu dâhil)

Sayfalar yeniden numaralandırıldı ve uygulamanın gezinme sırasına göre
dizildi. Kapak güncellendi.

### S7 · Tipografi ölçeğe oturdu *(F1-2 turu)*

Ölçek kilitlendi: **34 · 28 · 22 · 17 · 15 · 13 · 11**, gerçekten kullanılan
ağırlıklarıyla birlikte (`Helper Black` ve `Callout Black` de eklendi).

**69 metin** en yakın basamağa çekildi; eşitlikler yukarı çözüldü — metni
küçültmek zaten şikâyetin kendisiydi:

`12→13 · 14→15 · 16→17 · 18→17 · 19→17 · 20→22 · 23→22 · 24→22 ·
26→22 · 30→28 · 32→34 · 44→34`

İlk taslakta `26→28` yazmıştım; **yanlıştı**. Bu puntodaki düğümlerin hepsi
ekran başlığı ("Dersler", "Gelişim", "Bench Press", "Üyelerim",
"Onay bekleniyor") ve uygulama bunların tamamını `variant="h3"` yani **22pt**
ile çiziyor. En yakın basamak 28 olsa da doğru cevap 22: amaç ölçeğe uymak
değil, **uygulanabilir olmak**. Aynı gerekçeyle `04 · Onaylandı`'nın
"Hoş geldin!" başlığı 28'den 22'ye indirildi — `onboarding/approved.tsx`
onu h3 ile çiziyor.

Sonuç: **443 metnin 397'si** paylaşılan bir stile bağlı. Geri kalanlar:

- `08XL` çerçevesi — Dynamic Type kanıtı, puntoları bilerek ölçek × 1.35.
- **8 düğüm** ölçek dışı bırakıldı, hepsi aynı sebeple: bunlar metin değil,
  **metin olarak çizilmiş ikon**. Aşağıda F4-4'e taşındı.

Görsel doğrulama: dört sayfa da ekran görüntüsüyle kontrol edildi, hiçbir
yerde taşma ya da örtüşme oluşmadı (büyümeler auto-layout tarafından
soğuruldu).

- [x] **F1-1 · Ölçek kilitlendi.** Foundations'taki tip ölçeği bloğu artık
      yedi basamağın hepsini gösteriyor ve her satır kendi stiline bağlı —
      blok, belgelediği şeyin canlı örneği.
- [x] **F1-2 · Ölçek dışı metinler oturtuldu.**
- [x] **F1-3 · 15pt koda eklendi.** `tokens.ts` → `Type.callout`
      (15/21/500), `Text` bileşeni → `variant="callout"`.
      `designplan.md` D2-5 bunu zaten istiyordu.

      **Basamak tanımlandı, ekranlar henüz taşınmadı.** Figma'da hangi
      metnin Callout olduğu belli (`GymEntra/Callout*` stilleri); kodda
      bugün o metinler `helper` (13pt). Taşıma ekran ekran ve görsel
      doğrulamayla yapılmalı — tek seferde `helper`→`callout` değiştirmek
      gerçekten 13pt olması gereken yardımcı metinleri de büyütürdü.

---

## Kalan hatalar ve plan

### F2 — Ölçek dışı kalan diğer sistem kaçakları

- [ ] **F2-1 · Boşluk ve köşe yarıçapı değişkenlere bağlı değil.** Spacing
      (6 değişken) ve Radius (4 değişken) koleksiyonları var ama hiçbir
      auto-layout `itemSpacing`'i ya da `cornerRadius`'ı onlara bağlı değil.
      Renklerde yapılanın aynısı burada da yapılmalı.
- [ ] **F2-2 · Katman adları anlamsız.** Dosyada yüzlerce "Frame" var.
      Yeni kurulan ekranlarda adlar anlamlı ("Paketim", "Krediler", "Nav bar");
      eski ekranlarda değil. Code Connect ya da tasarım-koda geçiş
      düşünülüyorsa bu şart.
- [ ] **F2-3 · Kart/satır/çip/rozet bileşen değil.** Sekme çubuğu ve durum
      çubuğu bileşenleşti, ama kart, liste satırı, çip, rozet, buton hâlâ
      her ekranda kopya. Sıradaki bileşenler: `Card`, `InfoCard row`,
      `Chip`, `StatusBadge`, `Button`, `TextField`, `EmptyState`.

### F3 — Hâlâ eksik olan ekranlar

Uygulamada 60 rota var; dosyada 29 ekran. Kapsanmayan ve **kapsanması gereken**
alanlar, öncelik sırasıyla:

- [ ] **F3-1 · Yönetici üye yönetimi:** `admin/members`, `admin/member`,
      `admin/edit-member`, `admin/assign-package`,
      `admin/propose-package-change`. Yöneticinin en çok vakit geçirdiği yer
      ve dosyada hiç yok.
- [ ] **F3-2 · Yönetici raporlar** (`admin/reports`) — panelde girişi var,
      ekranı yok.
- [ ] **F3-3 · Duyurular ve promosyonlar** (`admin/announcements`,
      `admin/promotions`, `admin/promotion-form`).
- [ ] **F3-4 · Ekip ve yetkiler** (`admin/staff`) — kapıda check-in yetkisi
      buradan veriliyor, `23 · Kapıda check-in` ekranının önkoşulu.
- [ ] **F3-5 · Ebeveyn/çocuk üyeliği** (`member/child`,
      `member/guardian-requests`) — `16 · Hesabım`'da girişi var, akışı yok.
- [ ] **F3-6 · Egzersiz kütüphanesi ve kas haritası** (`exercise-library`,
      `exercise-detail`, `MuscleMap`, `RigFigure`) — görsel olarak dosyadaki
      her şeyden farklı, tasarım kararı gerektiriyor.
- [ ] **F3-7 · Rezervasyonlarım** (`member/bookings`) — ana ekrandaki
      "Tümü ›" buraya gidiyor.
- [ ] **F3-8 · Salon QR / karekodla katılma** (`gym-qr`, `onboarding/gym-code`
      QR yolu). `02 · Salon Kodu` ekranındaki QR tarama hâlâ "yakında" —
      `designplan.md` D4 bunu "ya tamamla ya kaldır" diye işaretlemişti,
      karar hâlâ verilmedi.

### F4 — `designplan.md`'den devreden ve tasarım tarafında karşılığı olmayanlar

- [ ] **F4-1 · Yükseklik/derinlik sistemi yok (D2-3).** Her kart aynı
      `surf` + 1px `line`. Figma'da hiç `EFFECT` stili tanımlı değil.
      2-3 basamaklı bir gölge/elevation ölçeği hem dosyaya hem koda gerekiyor.
- [ ] **F4-2 · Hareket dili yok (D2-6).** Dosyada hiç prototip bağlantısı,
      hiç Smart Animate yok. En azından sekme geçişi, kart açılımı ve
      check-in başarı animasyonu prototiplenmeli.
- [ ] **F4-3 · Erişilebilirlik notları yok (D3).** Ekranlarda dokunma hedefi
      (44/56pt) kılavuzu, ekran okuyucu etiketi anotasyonu ve odak sırası yok.
      Foundations'a bir "a11y" bloğu; ekranlara Figma anotasyonu.
- [ ] **F4-4 · Metin olarak çizilmiş ikonlar ve emoji.** Tipografi turunda
      bunlar tek tek tespit edildi; ölçeğe *kasten* oturtulmadılar çünkü
      sorunları punto değil, ikon olmaları:

      | ekran | düğüm | olması gereken |
      |---|---|---|
      | `04 · Onaylandı` | `✓` 44pt | `checkmark` ikonu |
      | `12 · Antrenman Modu` | `✕` 18pt | `close` ikonu |
      | `12 · Antrenman Modu` | `✓` 14pt × 4 | `checkmark-circle` ikonu |
      | `26 · Abonelik / Paywall` | `🎉` 32pt | `sparkles` ya da illüstrasyon |
      | `25 · Marka Ayarları` | `T` 30pt | logo baş harfi — display, ölçek dışı kalması doğru |

      Ayrıca metin içine gömülü `👋` (ana ekran selamı), `✈` (çevrimdışı),
      `▲` (canlı), `●` (durum rozeti), `→` `›` (yönlendirme) var. D2-1
      bunların hepsini Ionicons'a çevirmeyi istiyor; tasarım dosyası
      uygulamayı taklit ettiği için hatayı da taklit ediyor.

      Somut kanıt: `14 · Ödemelerim`'e `⏳` yazmayı denedim, Inter'de o glif
      yok ve Figma onu **sessizce düşürdü** — aynı şeyin cihazda platformdan
      platforma farklı render olacağının doğrudan göstergesi.

---

## Denetimden çıkan **kod** bulguları

Bunlar Figma değil, uygulama hataları — tasarım dosyasını koda karşı
ölçerken ortaya çıktılar.

### K1 · Birincil butonlardaki metin WCAG AA'yı geçmiyor *(P1)*

`src/theme/contrast.ts`:

```ts
export function onColorFor(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#0A0F0D' : '#FFFFFF';
}
```

Eşik 0.45 çok yüksek. Dört tenant birincil renginin dördü de altında kalıyor,
yani `colors.onp` **her zaman `#FFFFFF` dönüyor**:

| tenant | birincil | parlaklık | onColorFor | beyaz kontrast | koyu kontrast |
|---|---|---|---|---|---|
| GymEntra Dark | `#10B981` | 0.364 | `#FFFFFF` | **2.54:1** ✗ | 7.62:1 ✓ |
| GymEntra Light | `#059669` | 0.229 | `#FFFFFF` | — | — |
| Tarabya Dark | `#F97316` | 0.325 | `#FFFFFF` | **2.80:1** ✗ | 6.89:1 ✓ |
| Tarabya Light | `#EA580C` | 0.245 | `#FFFFFF` | — | — |

AA normal metin için 4.5:1, büyük metin için 3:1 istiyor. `onp`, `Button`
(`variant="primary"`) ve seçili `Chip` içinde kullanılıyor — yani **her
birincil buton ve her seçili çip** şu anda okunması zor.

İlginç olan: Figma dosyası bunu **doğru** çizmişti (`#0A0F0D`, koyu üstü
turuncu/yeşil). Yanlış olan kod.

- [x] **K1-1 · Düzeltildi.** Sabit eşik kaldırıldı; `onColorFor` artık iki
      mürekkepten kontrastı yüksek olanı seçiyor (`contrastRatio` de dışa
      açıldı). Eşik olmadığı için beyaz ya da neon bir marka renginde de
      doğru sonucu veriyor. Dört tenant biriminin dördü de artık koyu
      mürekkep alıyor: 5.13 · 5.43 · 6.89 · 7.62 — hepsi AA üstü.
- [x] **K1-2 · Test eklendi.** `src/theme/contrast.test.ts`:
      (a) taranan her renkte seçilen mürekkep gerçekten daha yüksek
      kontrastlı olmalı, (b) `derivePalette()` çıktısı iki-mürekkep tabanının
      (4.39:1, tam geçiş noktası) altına düşmemeli, (c) gönderilen dört
      tenant birimi ≥ 4.5:1, (d) regresyon: yeşiller ve turuncular koyu
      mürekkep almalı. 351 testin tamamı geçiyor.

      Not: iki mürekkeple en kötü hâlde ~4.4:1 alınabiliyor (geçiş
      noktasının kendisinde, `#967240` gibi orta parlaklıkta bir kahve).
      Bunu 4.5'in üstüne çıkarmanın tek yolu üçüncü bir mürekkep ya da
      `derivePalette`'in ana rengi o bantttan uzaklaştırması — bugünkü
      hiçbir salon o bantta değil, ayrı bir iş olarak durabilir.

### K2 · `sub` rengi açık temada sınırın altındaydı *(düzeltildi)*

`designplan.md` D2-4 bunu tahmin etmişti. İlk ölçümü yalnızca `bg0` üstünde
yapmıştım; dört yüzeyin hepsine bakınca durum **daha kötü** çıktı — en zayıf
kombinasyon `bg0` değil, çip ve rozetlerin oturduğu `surf2`:

| palet | eski `sub` | en düşük | nerede |
|---|---|---|---|
| GymEntra Light | `#64748B` (slate-500) | **4.20:1** | `surf2 #EDF1F7` |
| Tarabya Light | `#78716C` (stone-500) | **4.04:1** | `surf2 #F1EBDF` |
| Koyu paletler | — | 6.04 / 6.09 ✓ | — |

`sub`, 11-13pt'de okunuyor, yani AA 4.5:1 istiyor.

- [x] **K2-1 · Düzeltildi.** Her iki açık palette `sub` yarım basamak
      koyulaştırıldı: `#5B6980` ve `#6B645F`. İkisi de dört yüzeyin hepsinde
      **4.90:1**. Figma'daki `color/sub` değişkeni ve Foundations'taki hex
      etiketleri de aynı değerlere çekildi — `08L` ve `21L` çerçeveleri
      değişkene bağlı olduğu için kendiliğinden güncellendi.
- [x] **K2-2 · Nöbetçi test eklendi.** `contrast.test.ts` → "palette
      legibility": gönderilen dört paletin ve türetilmiş paletlerin
      (120 hue × 2 mod) `txt` ve `sub` değerleri dört yüzeyin hepsinde
      ≥ 4.5:1 olmalı. Bu test, kaçırdığım `surf2` kombinasyonunu yakalar.

**Türetilmiş paletler zaten geçiyordu** ve değiştirilmedi: `derivePalette`'in
`sub`'ı (`s:0.06`, açıkta `l:0.4`, koyuda `l:0.65`) en kötü hâlde 4.72 / 5.00
veriyor.

### K4 · Açık temada `p` ve semantik renkler AA'yı geçmiyordu *(düzeltildi)*

K2'yi ölçerken çıktı. `sub` dışındaki ön plan renkleri, en düşük değerleriyle
(hepsi `bg1`/`surf2` üstünde; beyaz `surf` üstünde geçiyorlardı):

| palet | `p` | `danger` | `warn` | `ok` |
|---|---|---|---|---|
| GymEntra Light | **3.32** | **4.26** | **4.43** | **3.32** |
| Tarabya Light | **3.00** | **4.07** | **4.23** | **4.22** |
| Koyu paletler | 5.48-6.04 ✓ | 5.54 ✓ | 9.18 ✓ | 7.97-8.81 ✓ |

`StatusBadge` ve `Chip` zeminini `surf2` yapıp metni bu renklerle yazıyor;
`p` ayrıca bağlantı metni ve kart ikonu olarak kullanılıyor.

**Düzeltmesi tek başına duran bir renk ayarı değildi.** `p` koyulaşınca
`onColorFor` beyaza dönüyor — ve pulse butonunun etiketi `p`'nin değil,
`g1→g2→g3` gradyanının üstünde duruyor. Ölçünce açık temanın gradyanının
**bugün de hiçbir mürekkeple** AA'yı geçmediği çıktı:

| GymEntra Light gradyan | `g1 #059669` | `g2 #0891B2` | `g3 #2563EB` |
|---|---|---|---|
| koyu mürekkep | 5.13 | 5.25 | **3.74** |
| beyaz mürekkep | **3.77** | **3.68** | 5.17 |

Yani tek renk seçmek yetmiyordu, gradyanın `p` ile aynı tarafa geçmesi
gerekiyordu.

- [x] **K4-1 · Açık paletler yeniden ayarlandı.** `p`, gradyan durakları ve
      semantik üçlü birer basamak koyulaştırıldı. Sonuç, dört yüzeyin
      hepsinde en düşük değerler:

      | palet | `sub` | `p` | `danger` | `warn` | `ok` | pulse gradyanı (beyaz) |
      |---|---|---|---|---|---|---|
      | GymEntra Light | 4.90 | 4.84 | 5.71 | 6.25 | 4.84 | 5.48 / 5.36 / 6.70 |
      | Tarabya Light | 4.90 | 5.07 | 5.45 | 5.97 | 5.57 | 6.02 / 5.18 / 4.92 |

      Koyu paletlere dokunulmadı; hepsi zaten 5.25 üstündeydi.
- [x] **K4-2 · Türetilmiş paletler de kapsandı.** Buradaki asıl hata sabit
      açıklık eşiğiydi: HSL 0.42, sarıda maviye göre üç kat parlak, yani tek
      bir eşik bazı ton için hep yanlış. `contrast.ts` → `adjustForContrast`
      eklendi (bir rengi, hedef kontrastı yakalayana kadar diğerinden uzağa
      iter) ve `derivePalette` içinde şuraya uygulandı: açık `p` (yüzeye
      karşı), koyu `p` (`surf2`'ye karşı — düşük doygunluklu bir marka orada
      3.96'ya düşüyordu), gradyan durakları (mürekkebe karşı) ve semantik
      üçlü (türetilmiş yüzeye karşı — sıcak bir `surf2` üstünde red-400
      4.46'da kalıyordu).
- [x] **K4-3 · Test genişletildi.** `FOREGROUNDS` artık `p`/`danger`/`warn`/`ok`'i
      de içeriyor, türetilmiş palet taraması 3 doygunluk × 120 ton × 2 mod'a
      çıktı, ve pulse gradyanı için ayrı bir test var: `onColorFor(p)`'nin
      seçtiği tek mürekkep üç durağın hepsinde ≥ 4.5:1 olmalı.

### K3 · Antrenör sekme adı ile ekran başlığı çelişiyor *(P3)*

`trainer/_layout.tsx` sekmeyi "Üyeler", `Stack.Screen` başlığını "Üyeler",
ekranın kendi `<Text variant="h3">` başlığı ise "Üyelerim" yazıyor. Üçü de
görünür. Birine karar verilmeli — Figma'da "Üyelerim" seçildi (ekran başlığı),
sekme "Üyeler" kaldı; bu tutarlı ama bilinçli olmalı.

---

## Sıradaki tur için önerilen sıra

Kod tarafındaki bulguların hepsi (~~K1~~, ~~K2~~, ~~K4~~) ve ~~F1~~
tamamlandı; kontrast artık 354 testlik takımda nöbetçiye bağlı. Kalanlar:

1. **F1-3'ün devamı** — ekranları `callout` basamağına taşı. Basamak artık
   kodda var ama kimse kullanmıyor; Figma hangi metnin 15pt olduğunu
   söylüyor, ekran ekran uygulanması gerekiyor.
2. **F3-1 / F3-2** — yönetici üye yönetimi ve raporlar; dosyadaki en büyük boşluk.
3. **F2-3** — kart/satır/çip bileşenleri; bundan sonraki her ekranı ucuzlatır.
4. **F4-4 / F4-1** — metin olarak çizilmiş ikonların temizliği (listesi
   hazır), sonra elevation.
5. **K3** — antrenör sekmesi "Üyeler" / ekran başlığı "Üyelerim"; hangisi
   olacağına karar verilmeli.
