# Hareket metinleri düzenlenebilir olsun — devir notu

**Durum: yapılmadı.** Bu dosya yerelde devam edecek oturum için yazıldı;
karar alınmış, kod yazılmamıştır. Bittiğinde bu dosya silinir ve sonuç
`docs/KARAR-DEFTERI.md`'ye geçer.

## İstenen

Antrenörden gelen düzeltmeler (**hareket adı ve anlatımı**) editörden
girilebilsin, kaydedilsin ve mobil uygulamaya devredilebilsin.

## Neden bugün yapılamıyor — iki engel

**1. Kullanıcıya görünen metinlerin çoğu veri değil, KOD.**
`backend/scripts/build_exercise_library.py` her hareketin `steps`,
`equip_tr`, `equip_en`, `diff`, `sets`, `rest` değerlerini `add(...)`
çağrılarının içinde sabit taşıyor (bkz. satır ~312'den sonrası). Yani bir
düzeltme ancak Python düzenlenerek girilebiliyor. Editöre alan eklemek
yetmez; metinler önce veri dosyasına taşınmalı.

Bugün veride olan tek metin: `packages/rig/data/exercises.json` içindeki
`name` ve `alt`.

**2. Yayındaki editörün kaydedecek yeri yok.**
`npm run editor` yerelde bir HTTP sunucusu açıyor ve `PUT /data`
`data/rigArchetypes.json`'ın üstüne yazıyor. Artifact olarak yayınlanan
kopyada böyle bir sunucu olmadığı için Kaydet düğmesi gizli
(`scripts/review-page.mjs:97`) ve PUT açıkça reddediliyor. Yerelde
çalışırken bu engel yok; uzaktan düzenleme istenirse Artifact veritabanı
(`capabilities: {db: {}}`) üzerinden gidilir — sayfa değişikliği yazar,
ajan okuyup depoya işler.

## Kararlar (kullanıcı, 11 Eylül 2026)

- Düzenlenebilir olacak: **ad + alt ad**, **nasıl yapılır adımları**,
  **ekipman, zorluk, set/dinlenme ipucu**.
- Çizim notu (`note`) düzenlenebilir alan DEĞİL: o iç not, uygulamaya
  gitmiyor.
- Adımlar **TR + EN** kalıyor. Uygulama bugün her adımın altında
  İngilizcesini gösteriyor (`exercise-detail.tsx`); tek dile düşmek
  ekranda görünür bir kayıp olurdu.

## Yapılacak sıra

1. **Metinleri veriye taşı.** `packages/rig/data/exercises.json` her
   hareket için `steps: [[tr, en], …]`, `equipTr`, `equipEn`,
   `difficulty`, `setsHint`, `restHint` taşısın. Taşıma tek seferlik bir
   script ile Python'dan üretilir; **elle kopyalama yok**, yoksa 45
   hareketin metni sessizce ayrışır.
2. **Üretici veriden okusun.** `build_exercise_library.py` bu alanları
   `add(...)` argümanı yerine `exercises.json`'dan alsın. Adlarda zaten
   kurulu olan **sapma koruması** metinlere de uygulanır: veride olmayan
   bir alan üretimi kırsın, sessizce boş geçmesin.
3. **Editöre metin paneli.** Seçili hareketin ad/alt ad/adım/ipucu
   alanları düzenlensin; Kaydet `exercises.json`'ı da yazsın (bugün
   yalnızca `rigArchetypes.json` yazılıyor — `scripts/editor.mjs`'e
   ikinci bir PUT yolu gerekir).
4. **Devir.** `npm run export -- --to ../../apps/gymentra-mobile` ve
   ardından üreticinin çalıştırılması; `exerciseLibrary.ts` ÜRETİLMİŞ
   dosyadır, elle düzenlenmez.
5. **Doğrulama.** `packages/rig`: `npm run typecheck && npm test`.
   Uygulama: `npx tsc --noEmit && npx expo lint && npm test`.

## Bağlı açık iş

`docs/hareket-adlari-arastirma.csv` — 45 hareketin Türkçe adları için
araştırma tablosu. Doldurulunca adlar aynı yoldan (`exercises.json` →
üretici → uygulama) girer. Adların bugünkü hâli kaynaksızdır: eğitim
verisinden yazıldı, doğrulanmadı.
