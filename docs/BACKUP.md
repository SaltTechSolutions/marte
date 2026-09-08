# Yedekleme ve geri yükleme

Firebase projesi `tarabyamarte`, Firestore `(default)`, konum `europe-north1`.
Bu dosya kurulu olanı ve **veri kaybında ne yapılacağını** anlatır. Kurulum
8 Eylül 2026'da yapıldı (plan.md D-3); öncesinde hiçbir yedek yoktu.

## Kurulu olan

| Ne | Değer | Ne işe yarar |
|---|---|---|
| Point-in-time recovery (PITR) | **7 gün** (öncesi 1 saat) | Son 7 gün içinde **herhangi bir ana** dönülebilir |
| Günlük yedek zamanlaması | her gün, **7 gün** saklama | Günlük tam kopya; PITR penceresi kaçarsa buradan dönülür |
| Silme koruması | **açık** | Veritabanının kendisi komutla silinemez |

Kurulum komutları (tekrar gerekirse, ör. ikinci bir proje için):

```bash
gcloud firestore databases update --database='(default)' --project=tarabyamarte --delete-protection
gcloud firestore databases update --database='(default)' --project=tarabyamarte --enable-pitr
gcloud firestore backups schedules create --database='(default)' --project=tarabyamarte --recurrence=daily --retention=7d
```

Durum kontrolü:

```bash
gcloud firestore databases describe --database='(default)' --project=tarabyamarte \
  --format="value(pointInTimeRecoveryEnablement,versionRetentionPeriod,deleteProtectionState)"
gcloud firestore backups list --project=tarabyamarte
```

İlk yedek zamanlama kurulduktan sonraki **24 saat içinde** düşer; `backups list`
o zamana kadar boş görünür, bu normaldir.

## Neyi korur, neyi korumaz

**Korur:** Firestore `(default)` veritabanının tamamı — üyelikler, paketler,
krediler, randevular, ödeme defteri, programlar, duyurular.

**Korumaz — bilerek, ayrı işler:**
- **Cloud Storage nesneleri** (`tarabyamarte.firebasestorage.app`): üye
  profil fotoğrafları ve salon logoları. Bucket'ta sürümleme **kapalı**.
  Açılabilir ama bir gerilim var: avatar yolu sabit
  (`members/{uid}/avatar.jpg`) ve her yükleme öncekinin üzerine yazıyor;
  sürümleme açılırsa **silinen hesabın fotoğrafı eski sürüm olarak yaşamaya
  devam eder** — `deleteMyAccount`'un temizlediğini geri getirir, KVKK
  açısından yanlış olur. Açılacaksa mutlaka kısa ömürlü bir yaşam döngüsü
  kuralıyla (ör. güncel olmayan sürümler 30 gün sonra silinir) açılmalı.
- **Firebase Auth kullanıcıları:** Firestore yedeği hesapları kapsamaz.
  Elle dışa aktarma: `firebase auth:export <dosya> --project tarabyamarte`.
  Çıktı kişisel veri içerir — depoya **commit edilmemeli**, `secrets/`
  altına konmalı (o dizin `.gitignore`'da).
- **Kurallar, indexler, functions kaynağı:** bunlar zaten git'te
  (`backend/firestore.rules`, `firestore.indexes.json`, `functions/`).

## Geri yükleme

**Önce bilinmesi gereken:** geri yükleme **her zaman yeni bir veritabanı
oluşturur**; var olanın üzerine yazamaz. Yani "geri al" tek komut değil, üç
adım: yeni veritabanına yükle → doğrula → veriyi taşı ya da uygulamayı
oraya yönlendir. Uygulama `(default)`'a bağlı olduğu için son adım bir
karardır, otomatik değildir.

### Senaryo 1 — yanlış toplu yazma, 7 gün içinde fark edildi

En sık beklenen kaza: bir backfill script'i yanlış alanı ezdi. PITR ile
hatadan **hemen önceki** ana dönülür.

```bash
# 1) Bozulmadan önceki bir zaman damgası seç (mikrosaniye çözünürlüğünde, UTC)
gcloud firestore export gs://<bucket>/kurtarma-2026-09-08 \
  --snapshot-time='2026-09-08T07:30:00Z' --project=tarabyamarte

# 2) Yalnızca bozulan koleksiyonu geri al (tamamını değil)
gcloud firestore import gs://<bucket>/kurtarma-2026-09-08 \
  --collection-ids=<koleksiyon> --project=tarabyamarte
```

`import` **birleştirir**: aynı kimlikli dokümanların üzerine yazar, dosyada
olmayanlara dokunmaz. Yani yanlışlıkla *silinen* dokümanlar geri gelir,
kazadan sonra eklenen doğru dokümanlar silinmez. Koleksiyonu daraltmak
önemli — tümünü geri almak, kazadan beri yapılmış doğru yazmaları da eski
hâline döndürür.

### Senaryo 2 — hata 7 günden eski ya da PITR penceresi kaçtı

Günlük yedekten yeni bir veritabanına yüklenir:

```bash
gcloud firestore backups list --project=tarabyamarte          # yedek kimliğini al
gcloud firestore databases restore --project=tarabyamarte \
  --source-backup=projects/tarabyamarte/locations/europe-north1/backups/<ID> \
  --destination-database=kurtarma-20260908
```

Sonra `kurtarma-20260908` üzerinde doğrulama yapılır; doğruysa ihtiyaç
duyulan koleksiyonlar oradan export/import ile `(default)`'a taşınır.
**İş bitince kurtarma veritabanı silinir** — durduğu sürece depolama
ücreti işler.

### Senaryo 3 — veritabanı silindi

Silme koruması bunu engelliyor. Yine de olursa: koruma kapatılıp veritabanı
gerçekten silinmişse, `--destination-database='(default)'` ile yedekten
doğrudan geri yüklenebilir (yalnızca `(default)` yokken mümkündür).

## Tatbikat

**Yayından önce bir kez restore denenmeli.** Yedeğin varlığı geri
yüklenebildiğini kanıtlamaz: yedek listesi dolu görünüp restore'un yetki ya
da konum yüzünden düştüğü hâli üretimde öğrenmek istemeyiz. Tatbikat:
yedekten `tatbikat-YYYYAAGG` veritabanı oluştur, birkaç dokümanı gözle
doğrula, veritabanını sil. Yarım saatlik iş.

## Karar bekleyenler

- **Haftalık zamanlama** (ör. 14 hafta saklama): bugün yalnızca günlük var,
  yani koruma penceresi **7 gün**. Geç fark edilen bozulma (üç hafta önceki
  bir backfill) bugünkü kurulumla kurtarılamaz. Maliyeti kuruşlar; karar
  ürün tarafında.
- **Storage sürümleme**: yukarıdaki KVKK gerilimi yüzünden açılmadı.
- **Auth dışa aktarma**: bugün elle. Otomatikleşecekse çıktının nereye
  yazılacağı (şifrelenmiş bir bucket) ayrıca kararlaştırılmalı.

## Maliyet

PITR ve yedek depolaması GiB/ay üzerinden ücretlendirilir. Veritabanı bugün
ücretsiz katman ölçeğinde (`freeTier: true`, tek salon), dolayısıyla üçünün
toplam aylık maliyeti kuruşlar mertebesinde. Ölçek büyüdüğünde bu kalem de
büyür; bütçe alarmı ayrı bir madde (plan.md D-4).
