# GymEntra — Tasarım Planı (Claude Design brief'i)

Bu dosya, uygulamanın mevcut tasarım dilinin modern iOS ve Android
standartlarına göre denetimi ve Claude Design'a verilecek iş listesidir.

**Denetim tarihi:** 19 Ağustos 2026
**Platform:** iOS 17+ ve Android 13+ · **yalnızca telefon** (v1'de tablet yok)
**Yön:** yalnızca dikey (portrait)
**Temel ilke:** Her karar önce UX. Görsel süsleme, kullanılabilirliği
bozuyorsa yanlıştır.

---

## Mevcut durumun değerlendirmesi

### Sağlam olan taraflar

- **Gerçek bir tasarım token sistemi var.** `src/theme/tokens.ts` içinde
  anlamsal renk paleti (`bg0/bg1/surf/surf2/line/txt/sub/p/g1-g3/danger/warn/ok`),
  tip ölçeği, boşluk, radius ve dokunma hedefi sabitleri tanımlı. Ekranlar ham
  hex kullanmıyor — bu, beyaz etiket (her salon kendi rengi) için doğru temel.
- **Çalışan runtime tema türetme.** `derivePalette()` tek bir marka renginden
  Material-You benzeri tonal yüzeyler üretiyor; anlamsal renkler (danger/warn/ok)
  türetmeye dahil değil — doğru karar.
- **Açık/koyu tema desteği** token seviyesinde mevcut.
- **Dokunma hedefleri** çoğunlukla 44pt+ (`TouchTarget.min = 44`,
  `critical = 56`), tab bar ve buton bileşenleri buna uyuyor.
- **Tip ölçeği** Inter ile tutarlı (34/28/22 başlık, 17 gövde, 13 yardımcı,
  11 etiket).

### Temel sorun

**Tasarım tek bir "koyu, neon-yeşil, özel" görünüme göre kurgulanmış ve her
iki platformun da yerel diline yabancı.** Ne iOS'un HIG'ine ne Android'in
Material 3'üne yaslanıyor; ikisinin arasında, kendi kurallarını uyduran bir
ara dil. Bu, "özel marka" isteniyorsa savunulabilir bir tercihtir — ancak şu
an bilinçli bir tercih değil, boşluk. Aşağıdaki maddeler bunu kapatmak içindir.

---

## Bulgular ve işler

### D0 — Platform yerelliği (en yüksek etki)

- [x] **D0-1 · Geri navigasyonu platforma uygun değil.**
      Ekranlarda özel `‹` / `✕` metin butonları var (`admin/checkin.tsx`,
      `member/payments.tsx`, `member/workout/session.tsx`). iOS'ta kullanıcı
      **kenardan kaydırarak geri** gitmeyi bekler; Android'de **sistem geri
      jesti / tuşu** çalışmalıdır. `app.json`'da
      `android.predictiveBackGestureEnabled: false` — Android 14+ öngörülü geri
      animasyonu kapalı.
      **İş:** Expo Router `Stack` başlıklarını platform yerel davranışıyla
      kullan; özel geri butonlarını kaldır ya da yalnızca gerçek modal
      ekranlarda bırak. Android geri tuşunun her ekranda doğru davrandığını
      doğrula.
      **Çözüm:** Asıl sorun butonlar değildi — üç rol layout'u da `<Slot />`
      kullanıyordu. `Slot` eşleşen çocuğu **navigatör geçmişi olmadan** render
      eder, yani push edilen detay ekranlarının geri jesti, geçiş animasyonu ve
      Android geri desteği hiç yoktu; sekme kökleri ve detay ekranları yerinde
      takas ediliyordu. Üçü de `Stack`'e çevrildi: sekme kökleri
      `headerShown: false` (kendi başlıklarını çiziyorlar), push edilen detay
      ekranları yerel başlığı açıyor — platform doğru geri butonu, iOS kenar
      kaydırması ve Android geri tuşu böyle bedavaya geliyor.
      `TabBar` `router.push` yerine `router.replace` kullanıyor: sekmeler
      birbirinin akranı, yığın değil — push etmek her sekme ziyaretini üst üste
      yığıyordu, Android geri tuşu uygulamadan çıkmak yerine sekme geçmişinde
      geriye yürüyordu. `admin/today`, `admin/calendar`, `trainer/member`
      içindeki el yapımı `‹` butonları kaldırıldı (yerel butonu tekrarlıyor ve
      44pt'nin altındaydılar). `app.json` → `predictiveBackGestureEnabled: true`.
      Android geri tuşu davranışı **cihazda doğrulanmadı** — simülatör iOS.

- [x] **D0-2 · Alert/onay diyalogları platform yerel değil.**
      Antrenmandan çıkışta `Alert.alert` kullanılıyor (doğru), ancak
      uygulamanın geri kalanında onay gerektiren yıkıcı işlemler (üyeliği
      reddet, randevu iptal, ödeme reddi) **hiç onay sormuyor**.
      **İş:** Yıkıcı işlemler için tutarlı bir onay deseni; iOS'ta
      `ActionSheetIOS`/Alert, Android'de Material dialog.

      **Çözüldü (19 Ağustos 2026).** `src/utils/confirm.ts` →
      `confirmDestructive({ title, message, confirmLabel, onConfirm })`.
      `Alert.alert` her iki platformda da zaten yerel diyalog çiziyor
      (iOS alert, Android Material) — özel bir bileşen yazmak platform
      yerelliğini **azaltırdı**, bu yüzden yazılmadı.

      Onay butonu "Tamam" değil **fiil** taşıyor ("Reddet", "İptal et",
      "Kaldır"), böylece kullanıcı ne olacağını okumadan da görüyor.

      Eklendiği yerler — hepsinin ortak özelliği geri dönüşü olmaması:
      - Katılım isteğini reddet (kural yalnızca `pending → rejected`'a izin
        veriyor, geri alınamaz)
      - Ödeme bildirimini reddet (aynı kısıt; mesajda üye adı ve tutar var)
      - PT randevusunu iptal et (arayüzde iptali geri alma yolu yok)
      - Programdan egzersiz kaldır (builder anında kaydediyor)

      **Bilinçli olarak eklenmediği yerler:** ders rezervasyonu iptali
      (`AGENTS.md` bunu açıkça "geri alınabilir, onay sorma" diye
      tanımlıyor, zaten Snackbar veriyor) ve takvim paylaşımını kaldırma
      (tek dokunuşla geri verilebilen bir anahtar). Her şeye onay koymak,
      insanları okumadan kapatmaya alıştırır — asıl onayları da işe
      yaramaz hale getirir.

- [x] **D0-3 · Tab bar iki platformda da yabancı.**
      Özel `TabBar` bileşeni her iki platformda aynı görünüyor. iOS'ta blur'lu
      alt sekme çubuğu, Android'de Material 3 `NavigationBar` (aktif göstergesi
      "pill" şeklinde) beklenir.
      **İş:** Platform-koşullu tab bar veya en azından iOS'ta
      `expo-blur` ile yarı saydam zemin, Android'de M3 aktif gösterge.

      **Çözüldü (20 Ağustos 2026) — blur hariç.**

      Android'e M3 seçim göstergesi geldi: aktif simgenin arkasında `surf2`
      dolgulu pill, biraz büyük glyph, daha küçük ve kalın etiket. iOS'ta
      pill tamamen çöküyor — orada seçili sekme yalnızca tint'lenir, pill
      koymak yanlış olurdu. Erişilebilirlik de eksikti: `accessibilityRole`,
      `accessibilityState.selected` ve etiket eklendi.

      Ayrıca gerçek bir hata düzeldi: alt boşluk `paddingBottom: 18` diye
      sabitti. iPhone home indicator'ın altında (34pt) bu az, alt inset'i
      olmayan donanımda fazla. Artık `Math.max(insets.bottom, 10)` —
      10 çubuğun kendi nefes payı, gerisi sisteme ait. Üst kenar da
      `StyleSheet.hairlineWidth`.

      **iOS blur bilinçli olarak ertelendi.** `expo-blur` kurulu değil, yani
      yeni bir native build gerekiyor; asıl mesele ise blur'un ancak içerik
      çubuğun **altından kayarsa** bir anlam taşıması. Şu anda tab bar flex
      kolonunda, içeriğin üstünü örtmüyor — bu haliyle blur, opak ekran
      arkaplanını bulanıklaştırıp birebir aynı görüntüyü verirdi. Doğru
      yapılması ~15 ekranın alt boşluğunun yeniden düzenlenmesi demek;
      ayrı bir madde olarak ele alınmalı (bkz. D0-6 güvenli alan işi).

- [x] **D0-4 · Haptic geri bildirim tutarsız.**
      Yalnızca check-in ve antrenman set tamamlamada var. Buton basışları,
      seçim değişiklikleri, hata durumları sessiz.
      **İş:** Haptic haritası tanımla: seçim = `selectionAsync`, başarı =
      `notificationAsync(Success)`, hata = `notificationAsync(Error)`,
      birincil aksiyon = `impactAsync(Medium)`.

      **Çözüldü (19 Ağustos 2026).** `src/utils/haptics.ts` →
      `hapticSelection` · `hapticAction` · `hapticSuccess` · `hapticError`.

      Ekranlara tek tek değil **ortak bileşenlere** bağlandı, asıl yeri
      orası: `Button` (ghost → seçim, dolu → aksiyon, çünkü ghost genelde
      geri adım), `Chip`, `MonthCalendar` gün seçimi, `Stepper`. Böylece
      yeni bir ekran hiçbir şey yapmadan doğru davranışı alıyor.

      Mevcut üç dağınık çağrı (check-in, antrenman seansı, stepper) da bu
      söz dağarcığına taşındı — aynı dokunuş ekrana göre farklı hissettiği
      sürece bu cila değil, tutarsızlık olarak okunuyordu.

      Hepsi ateşle-unut: web'de yok, Taptic Engine'i olmayan cihazlarda
      sessizce yok sayılıyor ve eşlik ettiği işlemi asla geciktirmiyor.

- [x] **D0-5 · Klavye yönetimi eksik.**
      Form ekranlarında (`register`, `gym-code`, `create-gym`, ödeme ekleme)
      `KeyboardAvoidingView` yok. Klavye açılınca alanlar ve butonlar
      kapanabiliyor. Klavyeyi kapatmak için boşluğa dokunma da yok.
      **İş:** Tüm form ekranlarına klavye kaçınma + dışarı dokununca kapatma.

      **Çözüldü (19 Ağustos 2026).** Metin girişi olan **7 ekranın
      hiçbirinde** klavye yönetimi yoktu. İki bileşen eklendi:

      - `FormScreen` — `<Screen>` yerine geçer; `KeyboardAvoidingView` +
        kaydırma + dışarı dokununca kapatma. `register`, `gym-code`,
        `create-gym`, `checkin` bunu kullanıyor.
      - `KeyboardAwareScroll` — zaten kaydırılan ekranlar için `ScrollView`
        yerine geçer. `member/payments`, `admin/payments`, `admin/classes`.

      Üç ayrıntı önemliydi:
      - `behavior` yalnızca iOS'ta `padding`; Android pencereyi kendi
        yeniden boyutlandırdığı için orada vermek payı iki kez sayar.
      - `keyboardShouldPersistTaps="handled"` olmadan ilk dokunuş sadece
        klavyeyi kapatır, butonlar **iki kez** basılmayı gerektirirdi.
      - Sayısal klavyede `return` tuşu yok; dışarı dokunma/sürükleme
        olmadan kapatmanın tek yolu sistem jestiydi ve kimse denemez.

      Yol üstünde: check-in ekranının kilit mesajı eskimişti — ekran artık
      `canCheckIn` ile korunuyor ama metin "Salon yönetici oturumu gerekli"
      diyordu. Yetki verilmemiş bir antrenöre yanlış bilgi veriyordu;
      "Üye kabul yetkin yok — salon yöneticisi bu yetkiyi sana verebilir"
      olarak düzeltildi.

- [x] **D0-6 · Güvenli alan (safe area) doğrulanmalı.**
      `Screen` bileşeni var ama çentikli/dinamik adalı cihazlarda ve Android
      gesture navigation barında alt/üst boşlukların doğru olduğu her ekranda
      test edilmemiş.

      **Çözüldü (20 Ağustos 2026).** Denetim iki ayrı hata çıkardı.

      **1. Alt kenar hiç uygulanmıyordu.** `Screen`, `edges` olarak
      `['top','left','right']` veriyordu — alt inset hiçbir yerde yoktu. Tab
      bar'ı olan ekranlarda bu görünmüyordu (çubuk boşluğu dolduruyordu), ama
      tab bar'sız **9 ekranın hepsinde** (`checkin`, `paywall`, 5 onboarding
      ekranı, antrenman seansı) içerik home indicator'ın altına giriyordu.
      `Screen` artık varsayılan olarak dört kenarı da sahipleniyor; alt inset'i
      kendi tüketen üç rol layout'u `edges={['top','left','right']}` geçiyor.

      **2. İç içe `Screen` üst inset'i iki kez uyguluyordu.** Altı rol ekranı
      (`admin/settings`, `admin/today`, `member/payments`,
      `member/workout/{index,session}`, `trainer/builder`) layout zaten bir
      `Screen` render ederken içeride ikinci bir tane daha açıyordu.
      `SafeAreaView` bir üst bileşenin inset'i tükettiğini bilmez, dolayısıyla
      çentik payı iki kere eklenmişti. Hepsi kaldırıldı ve bileşenin
      dokümantasyonuna iç içe kullanmama uyarısı yazıldı.

      Ayrıca antrenman seansında bitiş butonunun `marginBottom: spacing.xl`
      sabiti `Math.max(insets.bottom, spacing.md)` oldu — o ekranda tab bar
      gizli olduğu için alt inset'i talep eden başka hiçbir şey yok.

      iOS simülatöründe doğrulandı (kayıt ekranının alt metni ~34pt yukarı
      taşındı). **Android gesture navigation barı cihazda doğrulanmadı.**

---

### D1 — Bilgi mimarisi ve akış (UX)

- [x] **D1-1 · Üye alt sekmeleri fazla ve dengesiz.**
      5 sekme: Bugün, Üye Kartım, Dersler, Program, Gelişim. "Üye Kartım"
      aslında bir **eylem** (check-in), sekme değil — ve tam ekran bir QR'dan
      ibaret. iOS'ta bu tür şeyler genelde ana ekranda öne çıkan bir kart veya
      hızlı erişim olur.
      **İş:** Ya "Üye Kartım"ı Bugün ekranında büyük bir birincil karta
      dönüştür (sekmeyi 4'e indir), ya da sekme kalacaksa ekranı zenginleştir
      (bugünkü giriş durumu, son girişler, üyelik bitiş tarihi).

      **Çözüldü (20 Ağustos 2026) — ama teşhis yanlıştı.**

      Ekran "tam ekran bir QR'dan ibaret" değildi: QR'ın altında **gizli bir
      profil ekranı** vardı — çıkış yap, rol değiştir, salondan ayrıl, yasal
      metinler, hesabımı sil. Asıl bilgi mimarisi hatası buydu. Yıkıcı hesap
      işlemleri, üyenin turnikede elinde tuttuğu şeyin bir kaydırma altına
      gömülmüştü; hesap ayarları ise "Üye Kartım" adlı bir sekmenin arkasında,
      kimsenin bakmayacağı yerde duruyordu.

      **Sekmeyi kaldırmak yerine ayırdım.** Kaldırmak kapıdaki hızı bozardı:
      check-in sık ve zamana duyarlı bir eylem, başka bir sekmedeyken QR'a
      ulaşmak iki dokunuş olurdu. Bunun yerine:

      - `member/card` yalnızca kendi işini yapıyor — QR, kısa kod, isim ve
        **bugünkü giriş durumu** ("Bugün giriş yapıldı · 09:14"). Bu son
        madde "kayıt gerçekten geçti mi?" sorusunu resepsiyona geri dönmeden
        yanıtlıyor; sekmenin varlığını hak etmesini sağlayan da bu.
      - Hesap işlemleri yeni `member/profile` ekranına taşındı, Bugün
        başlığındaki avatar düğmesinden açılıyor. Altıncı sekme açmadım:
        burası ara sıra gidilen bir yer, sürekli geçiş yapılan değil.
      - Çıkış artık `confirmDestructive` onayı istiyor ve navigasyonu
        `AuthRedirect`'e bırakıyor (elle `router.replace` çağrısı kalktı).

      **Üyelik bitiş tarihi yapılmadı:** veri modelinde böyle bir alan yok.
      `expiresAt` yalnızca salonun kendi aboneliğinde (`tenants`), üyelikte
      değil. Salon sahibiyle netleşti: üyeliğin değil, **üyelik paketinin**
      bitişi olacak — `plan.md` içindeki **PKG** fazı. Bugün ekranındaki
      "Gold Üye · 24 gün kaldı" ve "8 Ders · 5 kaldı" kartları PKG-7'de
      gelecek.

- [x] **D1-2 · "Bugün" ekranı zayıf.**
      Sadece bugünün dersi + haftalık antrenman halkası. Üyenin gerçekten
      merak ettikleri yok: bir sonraki PT randevum, ödeme durumum, üyeliğim ne
      zaman bitiyor, bu hafta kaç kez geldim.
      **İş:** Bugün ekranını gerçek bir "gösterge paneli" olarak yeniden
      kurgula. Öncelik sırası: bugünkü eylem → yaklaşan → durum.

      **Çözüldü (20 Ağustos 2026).** İstenen öncelik sırası birebir kuruldu:
      **bugünkü eylem** (Üye Kartım düğmesi, bugünün dersi) → **yaklaşan**
      (bir sonraki PT randevusu) → **DURUMUM** (haftalık antrenman halkası +
      bu hafta kaç kez salona gelindiği, ödeme durumu).

      Ödeme kartı artık pasif bir bağlantı değil: bekleyen bildirim varsa
      tutarıyla birlikte uyarı renginde, yoksa son onaylanan ödemeyi tarihiyle
      gösteriyor.

      **Yeni sorgu gerekti:** üyenin kendi PT randevuları. Güvenlik kuralı
      bunu zaten açıkça izin veriyordu (`memberId == request.auth.uid`) ama
      hiçbir repo fonksiyonu yoktu — yani üye, kendisi için alınmış bir
      randevuyu uygulamada hiçbir yerde göremiyordu.
      `watchUpcomingSessionsForMember` eklendi (`limit(3)`, ana kart yalnızca
      ilkini gösteriyor). **Composite index gerekiyor ve henüz deploy
      edilmedi** — `tenantId + memberId + date`. Deploy edilene kadar randevu
      kartı sessizce boş kalır (sorgu düşer, `watch.ts` sarmalayıcısı loglar).

      Yol üstünde kaldırılan: başlıktaki 🔔 emojisi tıklanabilir görünüyordu
      ama `Pressable` değildi — sahte bir çağrı. Yerine gerçekten çalışan
      hesap düğmesi geldi.

- [x] **D1-3 · Boş durumlar (empty states) yetersiz.**
      Çoğu ekran boşken tek satır gri metin gösteriyor. Boş durum, ürünün en
      öğretici anıdır — ne olduğunu, neden boş olduğunu ve bir sonraki adımı
      söylemeli.
      **İş:** Her liste için illüstrasyon/ikon + başlık + açıklama + birincil
      eylem içeren tutarlı bir `EmptyState` bileşeni.

      **Çözüldü (20 Ağustos 2026).** `components/EmptyState.tsx` — daire içinde
      ikon + başlık + açıklama + isteğe bağlı eylem. Dokuz listeye uygulandı.

      `action` bilinçli olarak isteğe bağlı: izleyicinin yapabileceği bir şey
      olmayan boş liste (üyenin henüz ödemesi yok) alakasız bir yere götüren
      buton büyütmemeli. Eylem konulan yerler gerçekten sonraki adımı
      veriyor — programsız liste "Üyelere git", boş ders listesi "İlk dersi
      ekle", eşleşmeyen arama "Aramayı temizle".

- [x] **D1-4 · Yükleniyor durumları yok.**
      Ekranlar veri gelene kadar boş görünüyor; kullanıcı "boş mu, yükleniyor
      mu" ayırt edemiyor. `states.tsx` galerisinde tasarlanmış ama gerçek
      ekranlarda kullanılmamış.
      **İş:** İskelet (skeleton) yükleyiciler — özellikle liste ekranlarında.
      `plan.md` P2-1 (hata durumu) ile birlikte `loading | ready | empty | error`
      dört durumu her liste için netleştir.

      **Çözüldü (20 Ağustos 2026).** Kök sebep bileşen eksikliği değildi:
      `Skeleton` zaten vardı ama hiçbir ekranda kullanılmıyordu. Asıl sorun
      **26 liste durumunun hepsinin `useState<T[]>([])` ile başlamasıydı** —
      yani "yükleniyor" ile "boş" veri modelinde ayrılmıyordu bile, ekran ne
      yaparsa yapsın ayırt edemezdi.

      İlk snapshot gelene kadar `undefined`, `[]` gerçekten "hiç yok" anlamına
      geliyor artık. `components/ListSkeleton.tsx` gerçek satırların şeklinde
      yer tutucu basıyor; genişlikler kasıtlı olarak eşit değil, tek tip
      barlar yükleme hatası gibi okunuyordu.

      **Yol üstünde bulunan hata:** `admin/payments` ve `member/payments`
      ekranlarındaki izleyicilerin **hata geri çağrısı hiç yoktu** — AGENTS.md
      §5'in zorunlu tuttuğu şey. Eskiden bu yalnızca yanıltıcıydı (hata boş
      liste gibi görünüyordu); iskeletle birlikte sonsuza kadar dönen bir
      yükleme olurdu. İkisine de `ErrorNotice` + tekrar deneme bağlandı.
      `admin/members` ve `admin/staff` iskeletleri de hata durumuna öncelik
      verecek şekilde sıralandı.

      Dönüştürülen ekranlar: `trainer/{index,programs}`,
      `admin/{members,payments,classes,staff,today}`,
      `member/{classes,payments}`.

      **Dönüştürülmeyenler** (liste değil, gösterge paneli niteliğinde; her
      biri birden çok küçük veri kümesini özetliyor): `trainer/profile`,
      `trainer/member`, `trainer/calendar`, `member/progress`, `admin/index`.
      Bunlar D1-2 kapsamında yeniden kurgulanacağı için ayrıca elden geçmeli.

      **Simülatörde görsel olarak doğrulanmadı** — listeleri görmek için oturum
      açmak gerekiyor ve bu simülatörde dokunmalar kaydedilmiyor (iki kez
      denendi). Tip denetimi ve lint temiz.

- [x] **D1-5 · Geri bildirim (toast/snackbar) tutarsız.**
      Bazı ekranlarda `setSnack` ile özel bildirim, bazılarında `setError` ile
      satır içi kırmızı metin, bazılarında hiçbir şey.
      **İş:** Tek bir `Toast`/`Snackbar` deseni; hata mesajları için tek stil.

      **Çözüldü (20 Ağustos 2026).** Eski `Snackbar` deseninde üç gerçek hata
      vardı, sadece tutarsızlık değil:

      1. **Kaydırma içeriğinin sonunda** render ediliyordu. Elli üyelik bir
         listede onay mesajı ekranın çok altında kalıyordu — kullanıcı hiç
         görmüyordu.
      2. **Hiç kapanmıyordu.** Dokunulana kadar orada duruyordu.
      3. **Butonun etiketi yalan söylüyordu.** Varsayılan `actionLabel`
         "Geri Al"dı ama `onAction` yalnızca mesajı kapatıyordu — var olmayan
         bir geri almayı tarif ediyordu. "Ders eklenemedi / Geri Al" gibi
         anlamsız çiftler çıkıyordu.

      Yerine `components/Toast.tsx`: kök layout'ta tek bir `ToastProvider`,
      `useToast()` ile `success` / `error` / `show`. Yüzen (tab bar'ın
      üstünde, güvenli alan farkında), kendi kendine kapanan (hata 5 sn,
      başarı 3 sn — hata okunur, başarı göz ucuyla görülür), tonuna göre
      renkli ve ikonlu. Eylem artık isteğe bağlı ve konduğunda gerçek bir iş
      yapıyor. D0-4 haptik söz dağarcığı da buraya bağlandı — geri bildirim
      onu kullanmayan tek yerdi.

      **Yol üstünde bulunan asıl boşluk:** yedi yazma işleminin `catch`
      bloğu **hiç yoktu** — sadece `try/finally`. Hata olduğunda söz vaadi
      sessizce reddediliyor, kullanıcı hiçbir şey görmüyordu: ödeme kaydetme,
      ödeme onay/red, check-in yetkisi verme, antrenör rolü verme, üye ödeme
      bildirimi, program aktifleştirme, takvim paylaşımı. Hepsine hata
      bildirimi eklendi.

      **Her işleme başarı mesajı konmadı.** Sonucu ekranda zaten görünen
      işlemler (rol anahtarı canlı snapshot'tan dönüyor, onaylanan ödeme
      bekleyenlerden geçmişe geçiyor) yalnızca hata durumunda konuşuyor.
      Her şeyi duyurmak, bildirimleri okunmadan kapatılan gürültüye çevirir.

      **Satır içi form hataları bilinçli olarak korundu.** Onboarding
      ekranlarındaki `setError` toast'a çevrilmedi: "şifre çok kısa" kaybolan
      bir bildirim değil, alanın yanında duran kalıcı bir metin olmalı.
      Kural: **kalıcı satır içi metin = form doğrulaması, geçici toast =
      işlem sonucu.**

      Ölü kalan `components/Snackbar.tsx` kaldırıldı.

      **Simülatörde görsel olarak doğrulanmadı** — toast'ı tetikleyen her akış
      oturum açmayı gerektiriyor, bu simülatörde dokunmalar kaydedilmiyor.

- [x] **D1-6 · Antrenör "Üyeler" listesinde arama/sıralama yok.**
      50+ üyeli bir salonda liste kullanılamaz hale gelir.
      **İş:** Arama alanı + sıralama (ada göre / son aktiviteye göre).

      **Çözüldü (20 Ağustos 2026).** Filtrelerin üstünde arama alanı — belirli
      bir kişiye en hızlı yol o, filtrelerin arkasına saklanmamalı. Ad ve
      e-posta üzerinde arıyor.

      **Arama Türkçe farkında.** Düz `toLowerCase()` Türkçeyi iki yönden
      bozuyor: "I"yı "ı" yerine "i"ye eşliyor ve aksanları bıraktığı için
      sorgu hiç tutmuyor. `utils/search.ts` önce tr yerelinde küçültüyor, sonra
      aksanlı harfleri tabanına düşürüyor — antrenör "gulsah" yazınca "Gülşah",
      "isik" yazınca "Işık" geliyor. Sıralama da `localeCompare(…, 'tr')`:
      Ahmet, Çağla, Işık, İrem, Şule, Zeynep.

      **"Son aktiviteye göre" bilinçli olarak yapılmadı.** Üyelik kaydında son
      aktiviteyi tutan hiçbir alan yok; bu sıralama, zaten iki koleksiyon
      dinleyen bir ekranda her üyenin giriş geçmişini taramak demekti. Yerine
      katılım tarihi (`approvedAt`) kondu — "bana yeni gelen kim?" sorusunu
      elde olan veriyle aynı şekilde yanıtlıyor.

      Boş durumun artık üçüncü bir sebebi var (eşleşmeyen arama) ve mesaj
      buna göre ayrışıyor. `Chip` bileşenine sıralama düğmesi için `icon`
      desteği eklendi.

      Katlama ve sıralama Node'da örneklerle doğrulandı; ekranın kendisi
      simülatörde **görsel olarak doğrulanmadı** (oturum açmak gerekiyor,
      simülatörde dokunmalar kaydedilmiyor).

---

### D2 — Görsel dil

- [ ] **D2-1 · Emoji ikonlar üretim kalitesinde değil.**
      Hâlâ birçok yerde emoji ikon var: `🔒` (yetki ekranları), `📈` `📋` `📷`
      `⏳` `🎉` `📞`, `⠿` (sürükleme tutamağı), `⇄`, `✓`/`✕` metin karakterleri.
      Emoji platformdan platforma farklı render olur, tema rengini almaz,
      ölçeklenmez. (Profil ekranındaki `👤` iOS'ta alakasız mavi bir ikon
      olarak çıkıyordu — bunu zaten baş harf avatarıyla değiştirdik.)
      **İş:** Tüm emojileri `@expo/vector-icons` (Ionicons) veya SF Symbols /
      Material Symbols ile değiştir. Tek bir ikon seti seç ve ona sadık kal.

- [ ] **D2-2 · Marka logosu uygulamada hiç görünmüyor.**
      `branding.logoUrl` veri modelinde var, yönetici yükleyebiliyor — ama
      yalnızca yöneticinin kendi ayarlar ekranındaki küçük önizlemede
      render ediliyor. Üye kartında, sekme başlıklarında, splash sonrasında
      hep "salon adının ilk harfi" olan renkli kare gösteriliyor.
      Beyaz etiket ürünün ana vaadi bu ve çalışmıyor.
      **İş:** Logo render eden ortak bir `TenantLogo` bileşeni (yoksa baş harfe
      düşen). Üye kartı, Bugün ekranı başlığı ve onboarding'de kullan.

- [ ] **D2-3 · Yükseklik/derinlik (elevation) sistemi yok.**
      Her kart aynı `surf` + 1px `line` kombinasyonu. Hiyerarşi yok; birincil
      kart ile ikincil kart görsel olarak eşit.
      **İş:** 2-3 seviyeli yükseklik ölçeği (iOS'ta yumuşak gölge, Android'de
      M3 elevation tonu).

- [ ] **D2-4 · Renk kontrastı doğrulanmamış.**
      `sub` rengi (`#9CA3AF`) koyu temada `bg0` üzerinde ~4.9:1 — küçük metin
      için sınırda. `label` boyutu 11pt ve `tone="sub"` çok yaygın kullanılıyor.
      **İş:** Tüm token kombinasyonlarını WCAG AA'ya (normal metin 4.5:1,
      büyük metin 3:1) göre doğrula; `derivePalette()` çıktısı için de otomatik
      kontrol ekle — kullanıcı açık sarı bir marka rengi seçerse palet
      okunamaz hale gelebilir.

- [ ] **D2-5 · Tipografi ölçeği dar.**
      34/28/22/17/13/11 — 17 ile 13 arasında boşluk var, çoğu ikincil metin
      13pt'ye sıkışıyor ve `sub` rengiyle birleşince okunabilirlik düşüyor.
      **İş:** 15pt ara basamak ekle; `label` (11pt) yalnızca gerçek etiketler
      için kullanılsın, gövde metni olarak kullanılmasın.

- [ ] **D2-6 · Hareket/animasyon neredeyse yok.**
      `react-native-reanimated` bağımlılıkta var ama kullanılmıyor.
      Ekran geçişleri, liste öğesi giriş/çıkışları, genişleyen satırlar
      (`▾`/`›`) anlık — mekânsal süreklilik hissi yok.
      **İş:** Ölçülü hareket dili: liste öğeleri için `Layout` animasyonu,
      genişleme için yükseklik animasyonu, ekran geçişleri platform varsayılanı.
      Süre 200-300ms, `Reduce Motion` erişilebilirlik ayarına saygı.

---

### D3 — Erişilebilirlik

- [ ] **D3-1 · Ekran okuyucu etiketleri yok.**
      Hiçbir bileşende `accessibilityLabel`, `accessibilityRole`,
      `accessibilityState` yok. QR kart, takvim ızgarası, stepper'lar ve ikon
      butonları ekran okuyucu için tamamen anlamsız.
      **İş:** Tüm etkileşimli bileşenlere erişilebilirlik özellikleri.
      Özellikle: takvim günleri ("19 Ağustos Salı, 3 randevu, seçili"),
      stepper ("Ağırlık, 40 kilogram, artır/azalt"), ikon butonları.

- [ ] **D3-2 · Dinamik yazı tipi boyutu desteklenmiyor.**
      Tüm boyutlar sabit `fontSize`. Kullanıcı sistem yazı boyutunu
      büyütürse arayüz uyum sağlamıyor — iOS'ta yaygın bir erişilebilirlik
      beklentisi.
      **İş:** `PixelRatio.getFontScale()` ile ölçekleme veya en azından
      kritik metinlerde `allowFontScaling` davranışını doğrula; taşma
      durumlarını test et.

- [ ] **D3-3 · Renk tek başına anlam taşıyor.**
      Ödeme durumu, program durumu, randevu durumu yalnızca renkle ayrılıyor
      (yeşil/turuncu/gri). Renk körlüğü olan kullanıcı ayırt edemez.
      **İş:** Duruma ikon veya metin etiketi eşlik etsin.

---

### D4 — Ekran bazlı notlar

| Ekran | Durum | İş |
|---|---|---|
| `onboarding/register` | İyi | Sosyal giriş butonları platform kılavuzlarına uygun (Apple: resmi buton stili tercih edilir) |
| `onboarding/gym-code` | Orta | QR tarama "yakında" olarak devre dışı — ya tamamla ya kaldır |
| `onboarding/pending` | Orta | "📞 Salonu ara" butonu hiçbir şey yapmıyor — salon telefonuna bağla veya kaldır |
| `member/index` (Bugün) | Zayıf | D1-2 |
| `member/card` | Orta | Logo (D2-2), çevrimdışı çalışma (plan.md P2-2) |
| `member/classes` | Orta | Rezervasyon durumu görünürlüğü |
| `member/workout/session` | İyi | Yeni düzen (alt sabit zamanlayıcı + tek birincil aksiyon) doğru |
| `member/progress` | İyi | Yeni düzen anlamlı; grafik etkileşimi (dokunma ile değer) eklenebilir |
| `member/payments` | Orta | Boş/yükleniyor durumları |
| `trainer/index` (Üyeler) | Orta | Arama yok (D1-6); dokununca taslak yaratma hatası (plan.md P2-4) |
| `trainer/calendar` | İyi | Yeni ay ızgarası + gün seçimi doğru; hareket ve erişilebilirlik eksik |
| `trainer/programs` | İyi | Yeni eklendi |
| `trainer/profile` | İyi | Yeni düzen; istatistik kartları çalışıyor |
| `admin/*` | Zayıf | Bu denetimde ele alınmadı — ayrı bir tur gerekiyor |

---

## Claude Design'a verilecek brief özeti

**Bağlam.** GymEntra, spor salonları için beyaz etiketli bir üyelik/antrenman
yönetim uygulaması. Üç rol: üye, antrenör, salon yöneticisi. Her salon kendi
markasını (ad, logo, birincil renk, açık/koyu tema) belirliyor; uygulama bu
renkten tüm paleti runtime'da türetiyor.

**Kısıtlar.**
- Yalnızca telefon, yalnızca dikey. Tablet v1'de yok.
- Koyu tema birincil, açık tema desteklenmeli.
- Palet tek bir marka renginden türetilmeli — sabit hex kullanılamaz.
- React Native / Expo SDK 57. Native modül eklemek yeni derleme demek;
  mümkünse mevcut bağımlılıklarla çözülmeli.

**İstenen çıktılar (öncelik sırasıyla).**
1. **Platform yerel navigasyon ve etkileşim deseni** (D0) — geri, diyalog,
   tab bar, haptic, klavye.
2. **Durum sistemi** (D1-3, D1-4, D1-5) — boş / yükleniyor / hata / hazır
   dördü için tutarlı bileşenler.
3. **İkon sistemi** (D2-1) — emojilerin tamamının yerine geçecek tek set.
4. **Marka logosu entegrasyonu** (D2-2) — beyaz etiketin görünür olması.
5. **Erişilebilirlik geçişi** (D3).
6. **Hareket dili** (D2-6).
7. **Üye "Bugün" ekranı yeniden kurgusu** (D1-2) ve **sekme yapısı kararı**
   (D1-1).

**Değiştirilmemesi gerekenler.**
- Anlamsal token mimarisi (`tokens.ts`) — doğru kurulmuş, üzerine inşa edilmeli.
- Runtime palet türetme mantığı (`derivePalette`).
- Antrenman seansı ve takvim ekranlarının yeni düzeni.
