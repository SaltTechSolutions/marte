# backend — Gymentra arka ucu

Firebase (Auth/Firestore/Storage/Functions) arka ucu; istemci
`apps/gymentra-mobile`. Web arayüzü yok (2026-09-07'de kaldırıldı).

## Yığın
- Cloud Functions: TypeScript, `functions/src`, `npm --prefix functions run build`.
- Kurallar: `firestore.rules`, `storage.rules`; testler emülatörde
  (`npm run test:rules`, JDK 21+; `scripts/with-jdk.cjs` bulur).

## Kurallar
- Kural ya da callable imzası değişince mobildeki yansımaları da güncelle
  (`apps/gymentra-mobile/src/data/seats.ts`, `membershipRepo.ts`).
- `secrets/`, `.env`, `archive/` asla commit edilmez.
- Deploy üretime gider (`tarabyamarte`); onaysız deploy yapma.
