# marte

SaltTechSolutions'ın Gymentra ürün monorepo'su. 2026-09-07'de beş ayrı depodan
`git subtree` ile, geçmişleri korunarak birleştirildi.

| yol | ne | eski depo |
|---|---|---|
| `apps/gymentra-mobile` | Expo / React Native mobil uygulama (iOS + Android) | SaltTechSolutions/gymentra-mobile |
| `apps/gymentra-site` | Statik site: gizlilik, koşullar, hesap silme | SaltTechSolutions/gymentra-site |
| `backend` | Firebase arka ucu: Cloud Functions, Firestore/Storage kuralları, bakım scriptleri | SaltTechSolutions/marte06 (web arayüzü kaldırıldı) |
| `packages/rig` | Antrenman simülatörü: figür motoru, denetim kuralları, kas verisi | Tarki1151/antrenman-simulatoru |
| `docs` | Plan, şema, mağaza notları | — |
| `assets/logo` | Logolar | — |

Eski depolar GitHub'da arşivli; geçmişleri burada.

Her uygulama şimdilik kendi `node_modules`'ünü taşıyor; ortak workspace ayrı iş.
`packages/rig` → `apps/gymentra-mobile` devri hâlâ `npm run export -- --to ../../apps/gymentra-mobile`
ile (tek yönlü; bkz. `packages/rig/README.md`).
