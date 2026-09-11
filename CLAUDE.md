# marte — monorepo kök yönergesi

SaltTechSolutions'ın GymEntra ürün monorepo'su. Beyaz etiketli salon
üyelik/antrenman uygulaması; üç rol: **üye**, **antrenör**, **salon yöneticisi**.

## İlk iş: defteri oku

**Her oturumun başında [`docs/KARAR-DEFTERI.md`](docs/KARAR-DEFTERI.md)'nin
en üstteki üç kaydını oku.** Orada ne yapıldığı değil, **ne karara bağlandığı
ve neyin bilerek yapılmadığı** yazıyor. Bu dosya olmadan önceki oturumların
kararları görünmez ve geri alınır — nitekim geri alındı.

**Her oturumun sonunda**, kod değiştiysen deftere bir kayıt ekle. Kayıt
commit'le aynı iş: koda dokunup deftere dokunmamak, işi yarım bırakmaktır.

## Ne nerede

| yol | ne | yönergesi |
|---|---|---|
| `apps/gymentra-mobile` | Expo SDK 57 / React Native mobil uygulama | `AGENTS.md` (uzun ve bağlayıcı) |
| `apps/gymentra-site` | Statik site: gizlilik, koşullar, hesap silme | — |
| `backend` | Firebase: Functions, kurallar, seed/backfill | `backend/CLAUDE.md` |
| `packages/rig` | Hareket figürü motoru, kare editörü, denetim | `packages/rig/CLAUDE.md` + `README.md` |
| `docs` | Plan, şema, mağaza notları, **karar defteri** | — |

Bir dizinde çalışıyorsan o dizinin yönergesi kökün önüne geçer.

## Kalıcı kayıt nereye yazılır

Dördü ayrı soruya cevap veriyor; birbirinin yerine geçmezler:

| soru | dosya |
|---|---|
| Bu oturumda ne karara bağlandı? | `docs/KARAR-DEFTERI.md` |
| Sırada ne var, ne tamamlandı? | `docs/plan.md` |
| Bu iş neden ertelendi, nereden başlanır? | `packages/rig/TODOS.md` (rig'e özel) |
| Veri nasıl duruyor? | `docs/SCHEMA.md` — **veri katmanına dokunan her değişiklikle aynı commit'te** |

**Bir kararın gerekçesi koda en yakın yere de yazılır.** Bu depo bunu zaten
iyi yapıyor: `program_templates.md`'nin "Bilerek reddedildi" listesi ve
`rigAudit.ts`'in "bu sayılar normal aralık değil, imkânsızlık eşiği" notu
sayesinde o kararlar aylar sonra ayakta kaldı. Yorumsuz bırakılanlar kalmadı.

## Değişmeyen kurallar

- **Türkçe kullanıcı metinleri; kod, değişken ve yorumlar İngilizce.**
- **Doğrulamadan "çalışıyor" deme.** Çalıştığını gör, göremediysen öyle söyle.
- **İstenmeyen refactor yok.** Yolda sorun görürsen bildir, kendi başına
  düzeltme — deftere "açık" olarak yaz.
- **Geri alınamaz işlemler onay ister:** üretime deploy, veri silme, dış
  servise gönderim, mağaza sürümü.
- **`packages/rig` → `apps/gymentra-mobile` devri TEK YÖNLÜDÜR.**
  `npm run export` ile gider; uygulama tarafında düzeltilen bir açı bir
  sonraki devirde geri gelir.
