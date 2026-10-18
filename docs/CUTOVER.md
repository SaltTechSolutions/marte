# Cloudflare'e tek seferde geçiş — runbook

Durum: **hazırlık**. Aşağıdaki her "ONAY" adımı sahibinin açık onayını ister (üretim deploy'u, üretim D1, veri taşıma,
mağaza sürümü). Hiçbiri kendiliğinden çalışmaz. Önkoşullar: `docs/CLOUDFLARE-GECIS.md` F0–F4 tamam, `docs/KURAL-TEST-MATRISI.md`
0 F3 / 0 GAP, `api/` testleri iki motorda yeşil (`npx vitest run` ve `REAL_D1=1 npx vitest run`).

## 0. Önkoşul kontrolü (bugün yapılabilir, onay gerekmez)
- [ ] `cd api && npx tsc --noEmit && npx vitest run && REAL_D1=1 npx vitest run --maxWorkers=3`
- [ ] Mobil: `EXPO_PUBLIC_BACKEND=api` ile `npx tsc --noEmit && npx vitest run`
- [ ] Staging'de geçerli bir Firebase kullanıcısıyla uçtan uca duman testi (kullanıcı girişi gerekir): `/v1/me`, katılma, onay, paket atama, ders rezervasyonu, PT randevusu, ödeme bildirimi.
- [ ] Staging cron'ları çalışıyor mu: `wrangler tail --env staging` (dakikalık outbox satırı).
- [ ] Secret'lar (`wrangler secret put … --env production`): `RESEND_API_KEY`, `REVENUECAT_WEBHOOK_SECRET` (= Firebase'deki `REVENUECAT_WEBHOOK_TOKEN` değeri). **Değerleri yazdırma.**

## 1. Üretim altyapısı — ONAY
1. `npx wrangler d1 create gymentra-prod` → `wrangler.jsonc` içindeki `gymentra-prod` `database_id` yer tutucusunu doldur.
2. `npx wrangler d1 migrations apply gymentra-prod --remote` (yalnız şema; veri yok).
3. Özel alan adı: `api.gymentra.salt-tech-apps.com` (`routes: [{ pattern, custom_domain: true }]`; `*.workers.dev` bazı Türk ISS'lerinde engelli).
4. `wrangler deploy` (üretim). Doğrula: `curl -s https://api.gymentra.salt-tech-apps.com/healthz`, `/v1/me` → 401, `/.dev.vars` → 404.
5. D1 yedeği: Time Travel açık mı kontrol et; kesim öncesi `wrangler d1 export` ile SQL dökümü al.

## 2. Mobil sürüm (mağaza) — ONAY
- Build'e `EXPO_PUBLIC_BACKEND=api` ve `EXPO_PUBLIC_API_URL=https://api.gymentra.salt-tech-apps.com` gömülür (**build-time**; OTA ile açılmaz, çünkü fingerprint değişir).
- iOS TestFlight + Android internal test; bu sürüm Firebase'e hiç yazmaz. Mağaza incelemesi sürerken eski sürümler Firebase'de çalışmaya devam eder.
- Eski istemcilerin cutover sonrası yazmasını **engelle**: bkz. Adım 4.

## 3. Veri taşıma — ONAY (üretim verisi okunur)
`api/scripts/migrate/README.md` adım adım. Özet: export (salt-okunur) → transform → **staging'e uygula + reconcile** → dondurma penceresi → son export → üretime uygula → reconcile.
Dondurma penceresi süresince Firebase yazmaları kapalı olmalı (Adım 4'ün kural değişikliği).

## 4. Kesim günü sırası — ONAY
1. Mağazada yeni sürüm yayında ve yeterli kullanıcıda (Play kademeli artış/App Store aşamalı yayın). Eşik: aktif kullanıcıların çoğu yeni sürümde.
2. **Dondurma:** `backend/firestore.rules` `allow write: if false` (salt-okunur) sürümünü deploy et → eski istemciler yazamaz, "güncelle" uyarısı görür (**Uygulamada bugün bir zorunlu-güncelleme/`minVersion` mekanizması YOK** — kodda aranıp bulunamadı. Bu adım eski sürümde "izin reddedildi" hataları olarak görünür. Kesimden önce, şu an mağazada olan sürüme OTA ile (yalnız iOS; Android güncellemesi durduruldu, bkz. memory) bir "Uygulamayı güncelle" ekranı göndermek ya da kullanıcı sayısı çok azken bunu kabul etmek **ayrı bir karardır**.)
3. Son export → transform → üretim D1'e uygula → `reconcile.mjs` PASS.
4. RevenueCat webhook adresini `https://api.gymentra.salt-tech-apps.com/v1/webhooks/revenuecat` yap.
5. Duman testi (yönetici + üye + antrenör hesabıyla). Cron'lar ve outbox izleme.
6. Firebase Functions zamanlayıcılarını (`creditRollover`, `sweepPackageStatuses`, hatırlatmalar…) **kapat**: aksi halde iki sistem aynı bildirimi/yenilemeyi üretir. (Functions deploy'u ile `onSchedule`/trigger'lar kaldırılır.)

## 5. Geri alma (dürüst)
- D1 yazmaları açılmadan önce: sadece Firebase kurallarını eski haline döndür; kayıp yok.
- D1 yazmaları açıldıktan sonra otomatik geri dönüş **yok**: ters aktarım betiği yazılmadı. Seçenekler: bakım modu + ileri düzeltme, ya da D1 Time Travel ile kesim anına dönüp o andan sonraki yazmaları kaybetmek. DNS'i geri almak rollback değildir.
- Bu yüzden Adım 4.2–4.3 arasındaki pencere kısa ve kesimden önce staging'de bir prova şarttır.

## 6. Kesim sonrası
- [ ] 48 saat: hata oranı, kuyruk gecikmesi (`outbox` `pending`/`dead` sayısı), kredi bakiyesi sapması, 5xx.
- [ ] Firebase proje: Auth hariç servisleri kapat; Firestore dökümünü sakla (silme ayrı onay).
- [ ] `docs/KARAR-DEFTERI.md` ve gizlilik politikası (veri işleyen taraf değişti: Cloudflare) güncelle — `pb-privacy-legal`.
