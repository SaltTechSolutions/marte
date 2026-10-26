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
| `api` | Cloudflare Worker (Hono + D1 + R2) — Firebase'in yerine geçen arka uç; **staging'de canlı, üretim kesimi bekliyor** | `docs/CLOUDFLARE-GECIS.md`, `docs/D1-SEMA.md`, `docs/CUTOVER.md` |
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

## Team
<!-- Agent-facing, keep it in English. Only what differs from the global studio model (`sirket` skill). -->
- Not a game (gym app; the motion figure in `packages/rig` is not gameplay): phase 2b never applies.
- QA tier 1 by area: mobile `cd apps/gymentra-mobile && npm run typecheck && npm run lint && npm test`; api `cd api && npm run typecheck && npm test`; backend `cd backend && npm test && npm run test:rules` (Firestore emulator, JDK 21+); rig `cd packages/rig && npm run typecheck && npm test`.
- QA tier 2: iOS simulator through simlock. Screenshots only from the demo gym (Supergym); the test gym holds real people's data (both in `apps/gymentra-mobile/AGENTS.md` §7). If taps do not register, stop and report; no blind tapping.
- Traps: read `docs/BUILD.md` before any build, `eas update` or disk cleanup (local builds only, JDK trap).
- Reviewer: Firestore/Storage rules and callable signatures (mirrored in `apps/gymentra-mobile/src/data/`), capability checks only via `src/data/membership.ts`, D1 schema (`docs/D1-SEMA.md`) while `api` is live on staging with the production cutover pending (`docs/CUTOVER.md`); `backend` deploys hit production.
- Agents: `docs/KARAR-DEFTERI.md` is ~175 KB: read only its top three entries. `AGENTS.md` §4b "Roller" means app user roles, not agent roles.
- Playbooks: `pb-expo-eas` (mobile), `pb-cloudflare` (api), `pb-privacy-legal` (`apps/gymentra-site`: privacy, terms, account deletion).
- Public repo: `SaltTechSolutions/marte` is public on GitHub, so every committed file is published. Keep this project's task index and phase files in `~/Codes/_merkez/docs/tasks/marte/`, not in `docs/tasks/` here, and never commit credentials, member data or unfixed security findings.
