# GymEntra — Geliştirme Kuralları

GymEntra, spor salonları için beyaz etiketli bir üyelik/antrenman yönetim
mobil uygulamasıdır. Expo SDK 57 (React Native) + Firebase.
Üç rol: **üye**, **antrenör**, **salon yöneticisi**.

---

## 0. Expo DEĞİŞTİ

Kod yazmadan önce sürüme özel dokümanı oku:
https://docs.expo.dev/versions/v57.0.0/

Ezberden Expo/React Native API'si yazma. SDK 57 birçok API'yi değiştirdi.

---

## 1. Referans dosyaları — ne zaman okunmalı

Token verimliliği için bu dosyalar **her oturumda değil, yalnızca ilgili iş
yapılırken** okunur:

| Dosya | Ne zaman oku |
|---|---|
| `../SCHEMA.md` | Veritabanı şeması, koleksiyon ilişkisi, güvenlik kuralı, yeni sorgu veya index işi yaparken. **Veri katmanına dokunan her değişiklikten önce zorunlu.** |
| `../plan.md` | İyileştirme/hata giderme işine başlarken; bir madde tamamlanınca güncellemek için |
| `../designplan.md` | UI/UX tasarım işi yaparken |

**Şema değiştiyse `SCHEMA.md` aynı commit içinde güncellenir.** Kod ile
şema dosyası çelişirse kod doğrudur; dosya hemen düzeltilir.

---

## 2. Önce UX

Bu bir mobil uygulamadır ve **neredeyse tamamen telefondan** kullanılacaktır.
v1'de tablet desteği yok, yalnızca dikey yön.

- Her UI ve akış kararı önce kullanılabilirlik üzerinden savunulmalı.
  "Güzel görünüyor" gerekçe değildir.
- **Dokunma hedefi en az 44pt.** Birincil aksiyon 56pt (`TouchTarget`).
- **Başparmakla erişim.** Sık kullanılan aksiyonlar ekranın alt yarısında
  olmalı. Üst köşeler tek elle zor erişilir.
- **Ekran başına tek birincil aksiyon.** O aksiyon dolu/vurgulu buton
  (`critical` veya `primary`); geri kalanı `secondary`/`ghost`.
  Birincil aksiyonu `ghost` yapmak onu pasif gösterir — yapma.
- **Kullanıcı her akıştan çıkabilmeli.** Kilitli akış yasak. Yıkıcı bir
  işlemden çıkarken onay sor, ilerlemeyi kaydet.
- **Dört durum her zaman düşünülmeli:** `loading` / `ready` / `empty` /
  `error`. Boş ile yükleniyor aynı görünmemeli; hata sessizce yutulmamalı.
- **Platform yerelliği.** iOS'ta kenardan geri kaydırma, Android'de sistem
  geri tuşu çalışmalı. Özel geri butonu yalnızca gerçek modal ekranlarda.
- **`Screen` iç içe kullanılmaz.** Rol layout'ları (`member/`, `trainer/`,
  `admin/`) zaten bir tane render ediyor; içeride ikincisi çentik payını iki
  kez uygular. Tab bar'ı olmayan ekranlar `Screen`'i doğrudan kullanır ve
  varsayılan olarak dört kenarı da alır.
- **Geri bildirim: kalıcı satır içi metin = form doğrulaması, geçici toast
  = işlem sonucu.** `useToast()` ile `success`/`error`. Sonucu ekranda
  zaten görünen işleme başarı mesajı koyma (canlı güncellenen liste,
  dönen anahtar) — yalnızca hatayı bildir. Her şeyi duyurmak
  bildirimleri okunmadan kapatılan gürültüye çevirir.
- **Yazma işlemi `catch`siz bırakılmaz.** `try/finally` hatayı sessizce
  yutar; kullanıcı butona basar, hiçbir şey olmaz.
- Metinler Türkçe, sade ve insani. Teknik jargon ve hata kodu kullanıcıya
  gösterilmez.

---

## 3. Mimari

**Katmanlar — sınırlar aşılmaz.**

```
src/app/**          Ekranlar (Expo Router). UI + ekran durumu.
                    Doğrudan Firestore çağrısı YAPMAZ.
src/data/firebase/  Repo katmanı. Tüm Firestore erişimi burada.
src/data/types.ts   Alan modeli. Firebase tipi sızdırmaz (Timestamp → Date).
src/components/     Sunum bileşenleri. Veri çekmez, iş kuralı bilmez.
src/context/        Global durum (auth, tema).
src/services/       Dış servis kurulumu (firebase, socialAuth).
src/theme/          Token'lar ve tema türetme.
```

- Ekran, `firebase/firestore` içinden **hiçbir şey** import etmez. Her zaman
  bir repo fonksiyonu çağırır.
- Repo fonksiyonları alan tipi döndürür (`Program`, `PtSession`), ham
  `DocumentSnapshot` değil. Dönüşüm `convert.ts` içinde.
- Bileşenler ham hex renk kullanmaz — `useAppTheme()` token'ları. Beyaz
  etiket runtime tema değişimi buna bağlı.

**Yeni bir veri özelliği eklerken sıra:**
`types.ts` → `convert.ts` → `*Repo.ts` → `firestore.rules` →
`firestore.indexes.json` (gerekirse) → ekran → `SCHEMA.md`.

---

## 4. React kuralları

- **Hook'lar koşulsuz ve en üstte.** Erken `return`'den sonra hook çağrılmaz.
  Guard gerekiyorsa **sarmalayıcı bileşen deseni** kullan: dış bileşen
  yetki/veri kontrolü yapıp erken döner, tüm hook'lar iç bileşende yaşar.
  (Örnek: `trainer/calendar.tsx`, `admin/settings.tsx`.)
- **Effect içinde `setState` ile senkronizasyon yapma.** Türetilebilen değer
  render sırasında hesaplanır; başlangıç değeri `useState`'in lazy
  initializer'ıyla verilir.
- Abonelikler `useEffect` içinde kurulur ve **temizleyici döndürülür**
  (`return unsubscribe`).
- `npx expo lint` **sıfır hata** vermeli. Uyarılar gözden geçirilir.

---

## 5. Firestore kuralları

- **Her sorgu `tenantId` ile filtrelenir.** Çok kiracılı izolasyon hem sorguda
  hem güvenlik kuralında zorlanır. İstemciye asla güvenilmez.
- **Sorgular sınırlı olmalı.** `limit()` ve/veya tarih penceresi olmadan
  koleksiyon dinleme yapma — okuma maliyeti ve gecikme doğrudan buna bağlı.
- **Ham `onSnapshot` kullanma.** `data/firebase/watch.ts` içindeki
  `watchQuery` / `watchDoc` sarmalayıcılarını kullan. Hata geri çağrısı
  atlanırsa izin hatası ekranı sessizce sonsuz yüklemede bırakır; sarmalayıcı
  her düşen aboneliği bağlam adıyla loglar ve isteğe bağlı `onError`'a iletir.
  Her `watch*` fonksiyonu son parametre olarak `onError?: WatchErrorHandler`
  almalı; liste ekranları bunu `ErrorNotice` ile yüzeye çıkarmalı.
- Eşitlik dışı filtre veya farklı alanda `orderBy` varsa **composite index**
  gerekir → `marte06/firestore.indexes.json`.
- Denormalize alanlar (`memberName`, `trainerName`, `tenantName`) bilinçlidir:
  istemci başka kullanıcının Auth profilini okuyamaz. Ancak **kaynak değişince
  kopyalar da güncellenmeli** — aksi halde eski isimler kalır.

**Güvenlik kuralı veya index değişikliği:**
1. `firebase deploy --only firestore:rules --dry-run` ile doğrula.
2. Değişikliği ve etkisini kullanıcıya açıkla.
3. **Production'a çıkmadan önce kullanıcıdan açık onay al.** Bu proje canlı
   bir Firebase projesini (marte06 web uygulamasıyla ortak) kullanır.

---

## 6. Güvenlik

- Sır (`.env`, `serviceAccount.json`) asla commit edilmez. Her ikisi de
  `.gitignore` içinde — kontrol et.
- `EXPO_PUBLIC_*` değişkenleri **istemci paketine gömülür**, gizli değildir.
  Gerçek sır asla buraya konmaz.
- Standalone build'ler `.env` dosyasını görmez → değerler **EAS Environment
  Variables** olarak tanımlanmalı (`eas env:create`). Bu unutulursa uygulama
  `auth/invalid-api-key` ile çöker.
- Yetki kontrolü istemcide **UX içindir**, güvenlik değildir. Gerçek kontrol
  her zaman Firestore kuralında.
- Kullanıcı verisi silme/anonimleştirme Cloud Function üzerinden yapılır;
  istemciye toplu silme yetkisi verilmez.

---

## 7. Doğrulama

Her değişiklikten sonra, iddia etmeden önce çalıştır:

```bash
npx tsc --noEmit && npx expo lint
```

- Yeni **native modül** veya `app.json` plugin değişikliği → yeni EAS build
  gerekir. Sadece JS değişikliği → yeniden yükleme yeterli. Kullanıcıya
  hangisinin gerektiğini açıkça söyle.
- Simülatörde görsel doğrulama yapılabiliyorsa yap. Dokunmalar kaydedilmiyorsa
  körlemesine tıklama yapma — kullanıcıdan doğrulama iste.
- Test hesabı şifresi: `48162026` (tüm test hesapları).

---

## 8. Kod stili

- Çevredeki kodun yorum yoğunluğunu, adlandırmasını ve deyimlerini taklit et.
- Yorumlar **neden**'i açıklar, ne'yi değil. Bariz olanı yazma.
- Ölü kodu bırakma. Bir özellik kaldırıldıysa bileşeni, route'u ve tipi de
  kaldır.
- Mock/placeholder üretime çıkmaz. Geçici bir şey bırakılıyorsa neden
  bırakıldığı yorumda yazar.
- Türkçe kullanıcı metinleri; kod, değişken ve yorumlar İngilizce.

---

## 9. Kapsam ve iletişim

- İstenmeyen refactor yapma. Yolda bir sorun görürsen **bildir**, kendi
  başına düzeltme (kullanıcı isterse düzelt).
- Bir şey çalışmıyorsa veya doğrulanmadıysa **öyle söyle**. "Çalışıyor"
  demeden önce çalıştığını gör.
- Geri alınamaz işlemler (production deploy, veri silme, dış servise gönderim)
  öncesinde onay al.
- Tamamlanan `plan.md` maddelerini işaretle ve altına nasıl çözüldüğünü yaz.
