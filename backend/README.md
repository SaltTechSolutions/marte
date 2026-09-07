# backend — Gymentra arka ucu

Gymentra mobil uygulamasının (`apps/gymentra-mobile`) Firebase arka ucu.
Firebase projesi: `tarabyamarte` (bkz. `.firebaserc`).

Bu klasör eskiden `marte06` web uygulamasıydı. Web arayüzü 2026-09-07'de
kaldırıldı (yalnızca mobil uygulama kaldı); Vite/React kodu bu deponun
geçmişinde duruyor, gerekirse oradan çıkarılır. Firebase Hosting yayını
ayrı bir iş olarak kapatılacak.

## İçerik

| yol | ne |
|---|---|
| `functions/` | Cloud Functions (TypeScript). Callable'lar, Firestore tetikleyicileri, RevenueCat webhook'u, bildirimler |
| `firestore.rules`, `storage.rules` | Güvenlik kuralları — gerçek kapı bunlar, istemci tarafı yalnızca UX |
| `firestore.indexes.json` | Bileşik indeksler |
| `tests/firestore.rules.test.ts` | Kural testleri, emülatörde koşar |
| `scripts/` | Backfill, seed, dışa aktarma ve egzersiz kütüphanesi üretim scriptleri |
| `docs/` | Auth işlemleri ve kural test senaryoları |

## Çalıştırma

```bash
npm ci && npm --prefix functions ci
npm run test:rules        # Firestore emülatörü + kural testleri (JDK 21+ gerekir)
npm run test:functions    # Cloud Functions birim testleri
npm --prefix functions run build
npm --prefix functions run deploy
```

Kural ve indeks dağıtımı: `npx firebase-tools deploy --only firestore,storage`.

## Bağlar

- Mobil uygulama `functions/src` içindeki fonksiyon adlarını ve
  `firestore.rules` içindeki limitleri kendi tarafında yansıtır
  (`apps/gymentra-mobile/src/data/seats.ts`, `membershipRepo.ts`,
  `availabilityContract.test.ts`). Kural ya da fonksiyon imzası değişirse o
  dosyalar da değişmeli.
- Veri modeli: `docs/SCHEMA.md` (monorepo kökü).
