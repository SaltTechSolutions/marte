# Gymentra — Onaylanmış geliştirme kararları ve Claude Code devri

Tarih: 9 Eylül 2026

Durum: Uygulama geliştirmesi için kullanıcı tarafından kabul edilen kapsam.
Bu belge oluşturulurken uygulama kodu değiştirilmedi. Kutular uygulama ve
doğrulama tamamlandıktan sonra işaretlenmelidir.

## 1. Amaç ve çalışma sınırı

Üç persona: yönetici (aynı zamanda antrenör olabilir), antrenör ve üye.
Salon ile üye arasındaki para alışverişi uygulamanın dışında gerçekleşir.
Banka/POS/ödeme kuruluşu entegrasyonu eklenmeyecek. Uygulama manuel kayıt,
bildirim, gerekli taraf onayları ve izlenebilir işlem geçmişi sağlayacak;
paranın gerçekten el değiştirdiğine ilişkin hakemlik yapmayacak.

Bu belge konuşmanın SON kararlarını taşır. İlk incelemedeki “her tahsilatta
çift onay” önerisi kabul edilmedi. Yöneticinin pozitif tahsilat kaydında üyeye
bildirim yeterlidir. Katalog fiyatının değişmesi de tek başına hata değildir.

İnceleme kaynak kodu, kurallar ve mevcut plan belgeleri üzerinden yapıldı;
canlı cihaz/üretim testi yapılmadı. Bekleme listesi işlemi, ödeme toplamının
200 kayıtla eksilmesi ve yönetici yetki ayrışması bellekte örneklerle kontrol
edildi. Canlıdaki sürüm ve eşzamanlı Claude değişiklikleri uygulama öncesinde
yeniden kontrol edilmelidir.

Mevcut takip kaynağı `docs/plan.md` ile bu belgedeki CX kimliklerini eşleştir.
Eski “tamamlandı” işaretlerini bağlı tüm akışların doğru olduğunun kanıtı
sayma. Uygulama sonrasında ilgili plan ve şema maddelerini birlikte güncelle.

## 2. CX-01 — Manuel ödeme, bildirim ve değişiklik onayları (P1)

- [ ] Aşağıdaki işlem kurallarını istemci ve sunucu/kurallar tarafında uygula.

| İşlem | Kesinleşme kuralı |
|---|---|
| Yönetici pozitif tahsilat kaydeder | Hemen kesinleşir; üyeye bildirilir. Üye onayı gerekmez. |
| Üye ödeme yaptığını bildirir | Yönetici onayını bekler; onaysız tutar kesin tahsilata eklenmez. |
| Üyenin başlattığı kayıt sonradan değiştirilir | Üye onayı gerekir; kabul gelene kadar önceki onaylı kayıt geçerlidir. |
| Yönetici kendi tahsilat kaydını azaltır veya kaldırır | Üye onayı gerekir; negatif hareket kuralı düzeltmeyle aşılamaz. |
| Yönetici para iadesi kaydeder | CX-02 uygulanır. |

Uygulama ayrıntıları:

- İlk başlatan kişi/rol değişiklik zinciri boyunca korunmalı. Veli tarafından
  başlatılan kayıt varsa mevcut temsil yetkisi modeliyle uyumlu ele alınmalı.
- İlk başlatan, değişikliği isteyen, onaylayan, zaman, gerekçe ve önceki
  kayıtla ilişki saklanmalı. Onaylı tutar ve geçmiş üzerine yazılmamalı.
- Üyenin başlattığı kayıt, yeni kimlikle yeniden oluşturularak onaydan
  kaçırılamamalı. Düzeltme eski kayda bağlı olmalı.
- Bir düzeltme reddedilirse eski onaylı kayıt korunmalı. Bekleyen değişiklik
  onaylı bakiye veya tahsilat toplamını değiştirmemeli.
- Tutar alanında sıfır, negatif ve geçersiz sayılar reddedilmeli. Kullanıcı
  `-500` yazmak yerine “İade kaydet” veya “Hatalı kaydı düzelt” seçmeli ve
  pozitif büyüklük girmeli. Hareketin yönünü işlem türü belirlemeli.
- Para iadesi ile kayıt hatasını düzeltme farklı işlem türleridir. Biri para
  çıkışı beyanıdır; diğeri eski kaydın düzeltilmesidir.
- Tutar hesapları kuruş hassasiyetinde tutarlı olmalı. Tekrarlanan istek,
  çift dokunma ve iki cihazdan onay aynı hareketi iki kez uygulamamalı.
- Bildirim yalnızca geçici push'a bağlı kalmamalı: işlem ve bekleyen aksiyon
  uygulamada kalıcı olarak görülebilmeli. Push teslimi üye onayı sayılmaz.

Mevcut bulgu: `recordPayment` doğrudan `confirmed` oluşturuyor; bu davranış
kalacak. Ancak bu oluşturma için üyeye bildirim akışı eksik görünüyor.
`reversePayment` ise şimdi üye onayı olmadan ters kayıt uyguluyor.

Başlangıç dosyaları:
`apps/gymentra-mobile/src/data/firebase/paymentRepo.ts`,
`apps/gymentra-mobile/src/app/admin/payments.tsx`,
`apps/gymentra-mobile/src/app/member/payments.tsx`,
`apps/gymentra-mobile/src/data/types.ts`,
`backend/functions/src/notifications.ts`, `backend/firestore.rules`.

## 3. CX-02 — İade beyanı, karşı taraf yanıtı ve dosyayı kapatma (P1)

- [ ] Paket değişikliğinin otomatik kesin para iadesi oluşturmasını kaldır.
- [ ] İade anlaşması, ödeme beyanı ve üyenin teslim alma yanıtını ayır.

Akış:

1. İade tutarı üzerinde anlaşılır. Bu adım para teslim edildi anlamına gelmez
   ve kesinleşmiş nakit iade hareketi oluşturmaz.
2. Yönetici “İadeyi yaptım” der; tutar, yöntem, gerçek ödeme tarihi, gerekçe ve
   varsa açıklama/referans kaydedilir. Yöntem otomatik “nakit” varsayılmaz.
3. Üye “Aldım” veya “Almadım / tutar farklı” yanıtını verir.
4. Yanıt gelmezse veya itiraz varsa salon sahibi gerekçe girerek dosyayı
   “Salon kararıyla kapat” işlemiyle operasyonel olarak sonuçlandırabilir.

Sonuçların anlamı korunmalı:

| Sonuç | Anlam |
|---|---|
| Karşılıklı onaylandı | Salon ödediğini, üye aldığını doğruladı. |
| Salon kararıyla kapatıldı — üye itirazlı | Salon dosyayı kapattı, üye parayı aldığını kabul etmedi. |
| Salon kararıyla kapatıldı — üye yanıt vermedi | Salon dosyayı kapattı, üyeden yanıt yok. |

Kurallar:

- Salon sahibinin son operasyonel kararı bulunur; bu karar hiçbir zaman
  “üye onayladı” veya “paranın teslimi uygulama tarafından doğrulandı” olmaz.
- Sessizlik otomatik onay değildir. İtiraz ve tarafların geçmiş beyanları
  silinmez. Kullanıcı uygulama işletmecisine hakemlik için yönlendirilmez.
- Salonun kapatma kararı CX-01'deki onaylı tahsilatı silmez ve paket haklarını
  kendiliğinden değiştirmez. Genel bir “onayı atla” yetkisine dönüşmez.
- Salon kendi defterinde çıkışı gösterebilir; raporlar karşılıklı onaylı
  iadelerle yalnızca salon beyanıyla kapanan iadeleri ayrı gösterebilmeli.
- Dosya/iş akışı durumu ile karşı taraf mutabakat durumu birbirinden bağımsız
  korunmalı. Yönetici kapanışı bekleyen işler kuyruğunu sonuçlandırır.
- “Salon sahibi”nin mevcut yetki modelindeki karşılığını kontrol et; sıradan
  antrenöre kapatma yetkisi verme. Birden fazla yönetici varsa bu yetkinin
  hangi hesaplarda olduğu görünür ve sunucuda denetlenebilir olmalı.

Mevcut bulgu: `backend/functions/src/packages.ts` içindeki
`approvePackageChange`, `refundAmount` varsa doğrudan `cash`, `confirmed`,
`refund` kaydı oluşturuyor. Paket kabulü para tesliminin kanıtı değildir.

## 4. CX-03 — Salonun grup dersini iptalinde hak iadesi (P1)

- [ ] Tek ders ve seri iptalinde o ders için harcanmış hakları bir kez iade et.
- [ ] İptal edilen ders, katılımcılar ve iade hareketlerinin geçmişini koru.

Bugün `deleteClass` ve `deleteClassSeriesFrom` ders belgelerini siliyor.
`notifyOnClassCancelled` bildirim gönderiyor; harcanmış krediyi geri veren
bağlı işlem bulunamadı. Kullanıcı dersi ve hakkını birlikte kaybedebiliyor.

Salon iptalinde ders başlangıcına yakınlık yüzünden hak yakılmamalı.
Bekleme listesindeki üyeye harcanmamış hak iade edilmemeli. Aynı iptal tekrar
işlendiğinde çift iade olmamalı; rezervasyonla eşzamanlı iptal güvenli olmalı.
İptal edilen dersin bekleme listesinden yeni katılımcı alınmamalı.

Başlangıç: `src/data/firebase/classRepo.ts` (mobil),
`backend/functions/src/groupClasses.ts`, `classes.ts`, `notifications.ts`.

## 5. CX-04 — Bekleme listesinden kesin kayda geçiş (P1)

- [ ] Yer açıldığında üyelik, ders tarihinde geçerli hak ve kapasiteyi kontrol et.
- [ ] Kotalı pakette kesin kayıtla birlikte doğru krediyi bir kez tüket.

Bugün `promoteFromClassWaitlist` yalnızca iki kullanıcı listesini değiştiriyor;
kredi tüketmiyor. Beklerken hak tüketilmemesi doğru ve korunmalı.

Sınırsız pakette kredi düşülmez. Hakkı olmayan/paketi bitmiş kişi sessizce
derse alınmaz; sonuç ve neden görünür olmalı. Sıralama kuralı açık olmalı;
uygun olmayan ilk kişi tüm kuyruğu belirsiz biçimde kilitlememeli.
Eşzamanlı yeni rezervasyon, iki iptal veya tekrarlanan tetikleyici kapasiteyi
aşmamalı, mevcut katılımcıları ezmemeli ve çift hak tüketmemeli.

Başlangıç: `backend/functions/src/classes.ts`, `groupClasses.ts`.

## 6. CX-05 — PT dersinde tutarlı hak tüketimi (P1)

- [ ] Randevuyu üye veya personelin oluşturması aynı paket dersinde aynı sonucu versin.
- [ ] Personel için “Paketten kullan / Ücretsiz deneme / Paket dışı ders” ayrımı ekle.

Bugün `bookPtSessions` kredi tüketiyor, `createPtSessionByStaff` tüketmiyor.
Tamamlama da sonradan kredi düşmüyor. Paket dersi seçildiyse hak yeterliliği,
geçerliliği ve tüketimi sunucuda rezervasyonla birlikte uygulanmalı.
Ücretsiz veya paket dışı ders, paket hakkından düşülmüş gibi gösterilmemeli.
Paket dışı ders otomatik olarak tahsil edilmiş para kaydı üretmemeli.

Mevcut rezervasyonda hak tüketme yaklaşımı korunabilir; tamamlamada tekrar
tüketilmemeli. İptal, devamsızlık ve iade aynı ortak kurallara bağlanmalı.

Başlangıç: `backend/functions/src/sessions.ts`, mobil
`src/data/firebase/ptSessionRepo.ts`, `src/app/trainer/calendar.tsx`.

## 7. CX-06 — En fazla 7 gün geçerli, koşulları sabit teklif (P1)

- [ ] Gönderilmiş teklifi fiyat ve bütün haklarıyla sabitle.
- [ ] Kabul anında sunucuda son geçerlilik zamanını kontrol et.

Kullanıcıyla açıkça kararlaştırılan kurallar:

- Teklif gönderimden itibaren en fazla 7 gün geçerlidir. Varsayılan 7 gün
  kullanılabilir; daha uzun geçerlilik oluşturulamaz.
- Üye son kabul tarihini ve saatini görür. Kabul anı son zamana ulaştığında
  veya geçtiğinde teklif kabul edilemez; periyodik temizleme beklenmez.
- Fiyat, indirim, süre, ders sayısı, kullanım ve dondurma koşulları teklif
  gönderildiği anda sabitlenir. Kampanya bitse veya katalog/kampanya değeri
  değişse bile geçerli teklifin şartları korunur.
- Üye süresi içinde kabul ederse teklif edilen fiyatla bütün teklif haklarını
  alır. Güncel katalog fiyatıyla yeniden hesap yapılmaz.
- Kampanyanın genel kullanım sınırı varsa verilmiş geçerli teklifin taahhüdü
  korunacak şekilde ele al: teklif gönderiminde kapasite ayırmak gibi bir
  çözüm seç. Sınır sonradan doldu diye kabulde fiyat/hak değiştirme.
- Süre bitince salon yeni teklif göndermelidir. Eski teklif otomatik olarak
  güncel fiyatlı teklife dönüşmez. Yeni teklif, eski tekliften ayrı görünür.
- Salon koşulları değiştirmek isterse eski teklifi açıkça geri çekip yeni
  teklif gönderir. Eski teklif içeriği sessizce düzenlenmez.
- Teklifin geçerliliği ile paketin kullanım süresi ayrıdır. Yeni paket kabul
  tarihinde başlar; son gün kabul edilen 30 günlük paket yine 30 gün verir.
- Yenilemede başlangıç mevcut paketin bitişine göre teklifte açıkça gösterilir.
  Mevcut paket kabulden önce bitmişse yeni kullanım süresi geçmişe tüketilmez.
- Gelecekte başlayacak yenileme, mevcut paketi kabul anında erken iptal
  etmemeli veya yeni hakları başlangıcından önce kullanılabilir yapmamalı.

Katalog ve satın alınmış paket ayrımı:

- Önceden alınmış paketin bedeli, süresi ve hakları katalog fiyatının
  artması/azalmasıyla değişmez. Ek borç veya alacak doğmaz.
- Yeni fiyat yeni satış/yenileme teklifinde kullanılır.
- Bu işin bulgusu “katalog fiyatı değişiyor” değildir; kabul edilen teklif ile
  uygulanan şartların farklılaşmasıdır.

Mevcut kodda `expiresAt` ve teklif özetleri var; sıfırdan paralel bir sistem
kurma. `approvePackageChange` güncel katalog/kampanyayı okuyup bedeli yeniden
hesaplıyor; kampanya bitince geçerli teklifin kabulünü reddedebiliyor.
Bu davranışlar yeni karara göre değişmeli. Teklif şartlarını yalnızca UI'da
saklamak yeterli değil; sunucu bunları güvenilir kaynaktan sabitlemeli.

Başlangıç: mobil `src/data/firebase/packageChangeRepo.ts`,
`src/app/member/package-offer.tsx`, `src/app/admin/propose-package-change.tsx`,
`backend/functions/src/packages.ts`, `backend/firestore.rules`.

## 8. CX-07 — Eksiksiz ödeme raporları ve bekleyen işler (P1)

- [ ] Geçmiş listelerini sayfala; toplam ve onay kuyruğunu liste sınırından ayır.

`watchPaymentsForTenant` son 200, üye geçmişi son 50 kaydı getiriyor.
Aylık gelir, altı aylık trend ve bekleyen onaylar salonun sınırlı listesinden
türetiliyor. 201 adet 100 TL için 20.100 yerine 20.000 TL gösterilebiliyor.
Eski bekleyen işlem yeni kayıtlar yüzünden görünmez olmamalı.

Sınırsız tüm koleksiyon dinleme ile çözme. Tarih aralığına uygun sorgu/toplam
ve ayrı bekleyen durum sorguları kullan. Sayfalama eski kayda erişim sağlamalı.
CX-01/02 durumlarını toplamlarla uyumlu ele al. Gerçek ödeme tarihi ile kayıt
tarihi farklıysa raporun hangi tarihi kullandığını açıkça belirle ve göster.

Başlangıç: mobil `paymentRepo.ts`, `src/utils/reports.ts`,
`src/utils/revenue.ts`, `src/app/admin/index.tsx`, `src/app/admin/reports.tsx`.

## 9. CX-08 — Yönetici ve antrenör yetki tutarlılığı (P2)

- [ ] Yönetici antrenörlük yaptığında ekran ve sunucu aynı yetki kararını versin.

`canCoach` yöneticiye izin veriyor, randevu sunucusu hedefte yalnız `trainer`
rolünü kabul ediyor. Yetenek ile hangi sekmelerin gösterildiği ayrımını koru;
çalıştırmayan yöneticiye zorunlu antrenör navigasyonu ekleme. Antrenörlük yapan
yönetici kendi takviminde randevu oluşturabilmeli ve uygun biçimde seçilebilmeli.

Başlangıç: mobil `src/data/membership.ts`, rol/takvim ekranları,
`backend/functions/src/sessions.ts`, ilgili güvenlik kuralları.

## 10. CX-09 — Antrenör devrinde çakışma ve bilgilendirme (P2)

- [ ] Devretme/devralmada hedef antrenörün aktifliğini, yetkisini ve çakışmayı denetle.

`reassignSession` doğrudan antrenör alanlarını değiştiriyor. Yeni randevudaki
çakışma kontrolü burada yok. Kontrol ve atama sunucuda birlikte yapılmalı;
eşzamanlı rezervasyonla çakışma oluşmamalı. Kaynak/hedef antrenörün takvimleri
ve doluluk aynaları tutarlı güncellenmeli. Üyeye değişiklik bildirilmeli.
Devir yeni bir ders değildir: ikinci kez kredi tüketmemeli.

## 11. CX-10 — Ders durumları, yanlış yoklama ve düzeltme (P2)

- [ ] Gelecek dersi “Tamamla / Gelmedi” yapmayı hem UI'da hem sunucuda engelle.
- [ ] Yanlış işaretleme için yetkili, gerekçeli ve geçmişi koruyan düzeltme yolu ekle.

Bugün takvimde bu işlemlerde tarih kontrolü yok. İşlemden sonra butonlar
kaybolduğu için normal düzeltme yolu da kapanıyor. “Tamamlandı” ve “gelmedi”
için anlamlı zaman eşiğini mevcut ders/iptal politikasıyla uyumlu belirle.
Düzeltme hak iadesi/tüketimini yanlışlıkla tekrarlamamalı. Üye durumun ve
ders hakkına etkisinin nedenini görebilmeli.

Başlangıç: mobil `src/app/trainer/calendar.tsx`, `ptSessionRepo.ts`,
`backend/functions/src/sessions.ts`, `backend/firestore.rules`.

## 12. CX-11 — Kabul edilen persona geliştirmeleri

- [ ] Yönetici: “Bugün ilgilenilecekler” ekranında bekleyen onaylar, itirazlar,
  kapanmamış dersler ve yaklaşan paket bitişlerini bir araya getir.
- [ ] Yönetici: Paket bedeli, anlaşılan ödeme takvimi, taksitler ve onaylı
  tahsilatları ilişkilendiren manuel hesap takibi sağla. “Paketi yok” ile
  “borcu var” aynı şey değildir. Entegrasyon olmaması manuel borç takibini
  engellemez; paket atama otomatik “ödendi” anlamına gelmez.
- [ ] Antrenör: Derste hangi paketten kaç hak kullanıldığını göster;
  gün sonunda işaretlenmemiş ders/yoklama kontrolü sağla.
- [ ] Üye: Alınan, rezervasyona ayrılan, kullanılan, iade edilen ve süresi
  dolan hakların hareket dökümünü sun. Ayrılan hak tamamlanınca ikinci kez
  tüketilmez; gösterilen kategoriler çifte sayılmaz.
- [ ] Üç persona: İşlem ayrıntısında tutar/hak, ilişkili paket/ders, başlatan,
  onaylayan, zaman, gerekçe ve değişiklik geçmişini yetkisine göre göster.

Mevcut ekranları yeniden kullan; çalışan rapor/üyelik/yoklama özelliklerini
tekrar inşa etme. Yeni UX kararları bu kabul edilmiş kapsamı aşarsa öneriyi
kullanıcıya sun. Teknik durum adlarını kullanıcıya sade Türkçe ile göster.

## 13. Uygulama sırası ve doğrulama

Önerilen sıra: CX-01/02 veri ve durum modeli → CX-03/04/05 hak bütünlüğü →
CX-06 teklif taahhüdü → CX-07 raporlama → CX-08/09/10 → CX-11 yüzeyleri.
Bağımsız işler güvenle ayrılabilir; ortak para/hak kuralları merkezileştirilmeli.

Asgari kabul senaryoları:

1. Yönetici pozitif tahsilat girer: kayıt kesin, üye bildirimi var; onay istenmez.
2. Üye bildirir, yönetici onaylar; yönetici düzeltme ister: üye kabul edene
   kadar eski tutar geçerli; ret eski kaydı korur; tekrar onay çift işlem yapmaz.
3. Yönetici kendi tahsilatını ters kayıtla kaldırmaya çalışır: onay atlanamaz.
4. Negatif/geçersiz tutar UI ve doğrudan istemci isteğinde reddedilir.
5. Paket düşürme kabulü para teslim edilmeden kesin nakit iadesi üretmez.
6. İadede üye kabulü, itirazı ve sessizliği ayrı kalır; salon kapanışı hiçbir
   durumda üye onayını taklit etmez; yalnız yetkili kişi kapatabilir.
7. Tek/seri salon iptali harcanan krediyi bir kez iade eder; geçmiş korunur.
8. Bekleme listesi kotalı/sınırsız/geçersiz hak ve eşzamanlı kayıtlarla denenir.
9. Aynı paket dersi üye/personel yolunda aynı krediyi tüketir; deneme tüketmez.
10. Teklif gönder, fiyatı/kampanyayı değiştir veya kampanyayı bitir: süre içinde
    kabul eski fiyat ve tüm eski hakları verir. Çift kabul tek paket oluşturur.
11. Sürenin hemen öncesi kabul geçer; tam son anda ve sonrasında geçmez.
    Yeni teklif ayrı kayıttır; kabul eski bir süpürme görevine bağlı değildir.
12. Son gün kabul edilen 30 günlük paket 30 gün verir; ileri yenileme mevcut
    hakları erken kapatmaz veya yeni hakları erken harcatmaz.
13. 201+ ödeme ve eski bekleyen kayıtla toplamlar/kuyruk eksiksizdir;
    düzeltme, iade, bekleyen ve salon kararıyla kapanan tutarlar doğru ayrılır.
14. Yalnız yönetici ve yönetici+antrenör hesaplarıyla koçluk/takvim denenir.
15. Dolu antrenöre devir reddedilir; boş antrenöre devirde kredi değişmez.
16. Gelecek ders tamamlanamaz/devamsız yapılamaz; yanlış geçmiş yoklama
    gerekçeyle düzeltilebilir, hak toplamı ve geçmiş tutarlıdır.
17. Üye/antrenör/yönetici ve farklı salon hesaplarıyla yetkisiz onay, kapatma,
    teklif düzenleme ve başka üyenin verisine erişim engelleri doğrulanır.

Mevcut test altyapısını kullan; kritik kuralları emülatörde, kullanıcı
akışlarını uygun test salonunda doğrula. Üretim verisiyle deney yapma.
Eski kayıtlarda başlatan/onaylayan bilgisi yoksa uydurma; eski kayıt olarak
belirt ve güvenli uyumluluk/migrasyon yaklaşımını açıkla. Geçmiş iade kaydını
kanıtsız olarak “üye aldı” ya da “almadı” diye yeniden sınıflandırma.

## 14. Claude Code için teslim kuralları

- Yerel AGENTS/CLAUDE talimatlarını ve ilgili güncel şemayı oku.
- Kod dosyalarını 500 satırı aşmayacak biçimde küçük/modüler tut; ortak
  para, onay, kredi ve yetki kurallarını tekrar tekrar yazma.
- Geliştirme sırasında mevcutsa `Run.sh` güncelle; yoksa kullanıcının proje
  talimatındaki başlat/restart, durdur, commit mesajlı GitHub push, log,
  build ve Q ile uygulamayı durdurarak çıkış menüsünü hazırla.
- Bu belgeyi oluşturan Codex kod/Run.sh değişikliği yapmadı; bunlar uygulama
  aşamasının sorumluluğudur.
- Başka ajanın değişikliklerini ezme; commit kapsamını kontrol et. Tamamlanan
  işlerde plan/şema güncelle, ilgili kontrolleri çalıştır ve Git'e gönder.
- Canlı Firebase kuralı/Functions dağıtımı için mevcut açık onay koşullarını
  koru. Kodun bitmesi üretime dağıtım yapıldığı anlamına gelmez.
- Teslimde CX kimliğiyle neyin tamamlandığını, testini ve kalan sınırlamaları
  belirt. Test edilmeden veya sadece UI değiştirilerek kutu işaretleme.
