# D1 şeması (F0)

Kaynak: `api/migrations/0001_init.sql`. Firestore ayrıntısı: `docs/SCHEMA.md`.
Zaman = unix ms (INTEGER), para = **tam sayı kuruş** (1 TL = 100; API ve D1'deki her tutar kuruştur, istemci kendi sınırında TL'ye çevirir; Firestore'dan taşırken `api/scripts/migrate` lirayı ×100 yapar), esnek gövdeler JSON `data`
sütunu (sorgulanan alanlar ayrı sütun).

| Firestore | D1 | Not |
|---|---|---|
| (Auth uid) | `users`, `identities` | iç `users.id`; `identities(provider, subject)` Firebase uid'i eşler |
| `tenants`, `tenants/private/contact` | `tenants`, `tenant_contacts` | sayaçlar sütun |
| `tenant_memberships` | `memberships` | PK `(tenant_id, member_id)`; `{tenantId}_{uid}` anahtarı kalktı; `roles` JSON |
| `member_notes`, `member_admin_notes`, `member_addresses` | aynı adlı | PK `(tenant_id, member_id)` |
| `classes` (+ `bookedUserIds`, `bookingCredits`) | `classes`, `class_bookings` | dizi/map satıra açıldı |
| `class_cancellation_refunds`, `checkins` | aynı adlı | |
| `programs`, `program_templates`, `workout_logs`, `measurements` | aynı adlı | gövde JSON |
| `payments` | `payments` | |
| `gym_packages`, `promotions`, `member_packages`, `member_credits`, `package_change_requests` | aynı adlı | `used <= total` CHECK |
| `member_entitlements` | — | `member_packages` üzerinde görünüm; ayna gerekmedi |
| `pt_sessions`, `trainer_availability`, `calendar_shares` | aynı adlı | |
| `trainer_busy_slots` | — | `pt_sessions` sorgusu, kimlik sütunsuz |
| `push_tokens`, `announcements`, `renewal_requests`, `exercise_reports` | aynı adlı | |

Çevrimiçi tutarlılık: Firestore tetikleyicilerinin işi (sayaç, ayna, push) uç
içinde `db.batch()` ya da Queue'ya gider; `reconcileMirrors` yerine CHECK ve
tek-batch yazım tercih edilir.
