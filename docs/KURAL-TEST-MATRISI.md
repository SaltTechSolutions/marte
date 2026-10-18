# Kural testi → API testi eşleme matrisi (F2 kapanış)

Kaynak: `backend/tests/firestore.rules.test.ts`, **250 test** satır düzeyinde eşlendi (statik sayım 250 `it`/`test`; raporlanan 251 ile 1'lik fark açıklanamadı, Firestore emülatörlü koşuda doğrulanacak).
Durum: **ESLENDİ 228**, **F3 0**, **N/A 22**, **GAP 0**.
- ESLENDİ: aynı izin/ret davranışını doğrulayan geçen API testi var. Testler `api/test/matrix-{A,B,C,D,fixes}.test.ts`, adlar `[L<satır>]` ile başlar.
- F3: ilgili uç henüz yok (paket/kredi/PT/veli/salon/hesap silme); F3 bitmeden kapanmış sayılmaz.
- N/A: Firestore mekaniği, API'de karşılığı yok ve güvenli (route yokluğu testle 404 doğrulandı).
- GAP: kural ile API arasında önemli fark. İki satır bulundu (L2701, L2901), ikisi de düzeltildi ve testlendi.

**Kurallardan bilinçli farklar:** son olmayan yönetici ayrılabilir (kurallar her yöneticiyi engelliyordu, `deleteMyAccount` korumasıyla uyumlu); boş yönetici notu satırı siler; ayarlanmamış antrenör müsaitliği üyeye 404, yabancıya 403 (Firestore boş belge döndürüyordu); yenileme talebi okuması çağıran kapsamlı liste; push token cihaza ait (son girene taşınır); program şablonları başka salona sızmaz; ödeme/ölçüm gövdesindeki `memberId`/`status` yok sayılır. Geçişte `active_admin_count`/`active_member_count` gerçek sayılarla doldurulmalı (varsayılan 0, sınırı gevşetir).

| Satır | Grup | Test | Durum | API testi / gerekçe |
|---|---|---|---|---|
| 58 | Firestore rules | unauthenticated users cannot read protected collections | ESLENDI | [L58] unauthenticated callers get 401 on every protected read |
| 91 | Tenants and tenant memberships | unauthenticated users cannot read tenants or memberships | ESLENDI | [L91] unauthenticated callers cannot read a tenant or a membership row |
| 97 | Tenants and tenant memberships | any signed-in user can look up a tenant by reading it | ESLENDI | [L97] any signed-in user (even unbootstrapped) can look a tenant up by code, safe DTO only |
| 102 | Tenants and tenant memberships | an admin can save settings in a gym that has no ownerUid | ESLENDI | F3 dilimi: tenants.test.ts `[L102]` |
| 127 | Tenants and tenant memberships | ownerUid stays immutable — an admin cannot introduce one | ESLENDI | F3 dilimi: tenants.test.ts `[L127]` |
| 132 | Tenants and tenant memberships | a user can create only their own pending member join request at the deterministic id | ESLENDI | [L132] join creates only the caller's own pending member row; body cannot raise status/roles or target another user |
| 161 | Tenants and tenant memberships | only a tenant admin can approve a pending membership | ESLENDI | [L161] only a tenant admin can approve a pending membership |
| 180 | Tenants and tenant memberships | tenant admin can read pending requests for their tenant; a stranger cannot | ESLENDI | [L180] admin sees pending requests of their gym; a stranger sees nothing |
| 195 | Tenants and tenant memberships | creating a tenant requires self-assigning as ownerUid, with a non-empty code and name | ESLENDI | F3 dilimi: tenants.test.ts `[L195]` |
| 207 | Tenants and tenant memberships | a tenant owner can self-grant its admin membership, but not for a tenant they do not own | ESLENDI | F3 dilimi: tenants.test.ts `[L207]` |
| 282 | Classes | only a tenant admin can create a class | ESLENDI | [L282] only staff with the right to can create a class: member 403, admin 201 |
| 294 | Classes | a member with unlimited group-class entitlement can book an open class by adding only their own uid | ESLENDI | [L294] unlimited entitlement books the caller only; booking for someone else is refused |
| 306 | Classes | a member with no group-class entitlement cannot book at all (PKG-4) | ESLENDI | [L306] a member with no group-class entitlement cannot book (no waitlist route exists either); waitlist join itself is F3 |
| 313 | Classes | a quota\ | ESLENDI | [L313] a quota (non-unlimited) entitlement cannot book on this path |
| 320 | Classes | an expired entitlement cache cannot book — endsAt is checked against request.time (PKG-4) | ESLENDI | [L320] an expired entitlement cannot book |
| 336 | Classes | a member cannot book past capacity — must join the waitlist instead | ESLENDI | [L336] booking past capacity is refused (waitlist-join success half is F3) |
| 348 | Classes | a member can cancel their own booking even with no current entitlement — cancelling is never gated | ESLENDI | [L348] cancelling needs no entitlement, but only your own booking |
| 361 | Classes | a non-member cannot book a class even if they know its id | ESLENDI | [L361] a non-member cannot book even knowing the class id |
| 366 | Classes | a tenant admin can edit or delete any class for their tenant | ESLENDI | [L366] a tenant admin can edit and delete any class of the gym |
| 374 | Check-ins | only a tenant admin can record a check-in; a member cannot self-check-in | ESLENDI | [L374] a member cannot self-check-in; an admin can |
| 404 | Check-ins | check-ins are immutable and only readable by the tenant admin or the checked-in member | ESLENDI | matrix-fixes.test.ts: check-in geçmişi (kendisi/yönetici/`checkin` izni/onaylı veli) |
| 433 | Check-ins | accessReason must be a known value (PKG-3) | ESLENDI | [L433] accessReason must be a known value |
| 534 | Rejoining a gym after leaving or being rejected (P0-6) | someone who left can apply again | ESLENDI | [L534] someone who left can apply again |
| 540 | Rejoining a gym after leaving or being rejected (P0-6) | someone who was rejected can apply again | ESLENDI | [L540] someone who was rejected can apply again |
| 546 | Rejoining a gym after leaving or being rejected (P0-6) | rejoining cannot go straight to active — it is an application | ESLENDI | [L546] rejoining cannot go straight to active |
| 552 | Rejoining a gym after leaving or being rejected (P0-6) | a former trainer cannot carry the trainer role through a rejoin | ESLENDI | [L552] a former trainer does not keep the trainer role through a rejoin |
| 559 | Rejoining a gym after leaving or being rejected (P0-6) | a former trainer cannot keep a delegated permission through a rejoin | ESLENDI | [L559] a former delegated permission is dropped on rejoin |
| 567 | Rejoining a gym after leaving or being rejected (P0-6) | a SUSPENDED member cannot let themselves back in — that is an admin decision | ESLENDI | [L567] a suspended member cannot let themselves back in |
| 573 | Rejoining a gym after leaving or being rejected (P0-6) | nobody can rejoin on someone else\ | ESLENDI | [L573] nobody can rejoin on someone else's behalf |
| 579 | Rejoining a gym after leaving or being rejected (P0-6) | rejoining cannot rewrite the shortCode the check-in desk relies on | ESLENDI | [L579] rejoining cannot rewrite the shortCode |
| 585 | Rejoining a gym after leaving or being rejected (P0-6) | rejoining cannot move the membership to another gym | ESLENDI | [L585] rejoining cannot move the membership to another gym |
| 593 | Trainer list visibility to members (PKG-8) | a member can read a trainer row in their own gym | ESLENDI | [L593] a member can read a trainer row in their own gym |
| 600 | Trainer list visibility to members (PKG-8) | a member still cannot read another member's row | ESLENDI | [L600] a member cannot read another member's row |
| 607 | Trainer list visibility to members (PKG-8) | a member cannot read another gym's trainer | ESLENDI | [L607] a member cannot read another gym's trainer |
| 614 | Trainer list visibility to members (PKG-8) | a pending (not yet active) member cannot read the trainer list | ESLENDI | [L614] a pending member cannot read the trainer list |
| 635 | Tenant isolation — classes | a member of the gym can read its classes | ESLENDI | [L635] a member of the gym can read its classes |
| 641 | Tenant isolation — classes | a signed-in user with no membership cannot read another gym\ | ESLENDI | [L641] a signed-in user with no membership cannot read the gym's classes |
| 646 | Tenant isolation — classes | a member of a DIFFERENT gym cannot read this gym\ | ESLENDI | [L646] a member (even an admin) of a DIFFERENT gym cannot read this gym's classes |
| 652 | Tenant isolation — classes | a pending (not yet approved) member cannot read classes | ESLENDI | [L652] a pending member cannot read classes |
| 660 | Cross-tenant injection — workout_logs, measurements, payments | a member cannot write a workout log into a gym they do not belong to | ESLENDI | [L660] a member cannot write a workout log into a gym they do not belong to |
| 673 | Cross-tenant injection — workout_logs, measurements, payments | a member can write a workout log into their own gym | ESLENDI | [L673] a member can write a workout log into their own gym |
| 686 | Cross-tenant injection — workout_logs, measurements, payments | a member cannot log a workout as somebody else | ESLENDI | [L686] a member cannot log a workout as somebody else (row is always filed under the caller) |
| 699 | Cross-tenant injection — workout_logs, measurements, payments | a measurement must belong to the caller and to a gym they are in, with a sane weight | ESLENDI | [L699] a measurement belongs to the caller and a gym they are in, with a sane weight |
| 717 | Cross-tenant injection — workout_logs, measurements, payments | measurements are append-only — nobody can edit or delete history | NA | no PUT/PATCH/DELETE route for measurements (404); backed by test [L717] measurements are append-only: no edit or delete route exists |
| 733 | Cross-tenant injection — workout_logs, measurements, payments | a member cannot spam a payment notice into a gym they do not belong to | ESLENDI | [L733] a member cannot spam a payment notice into a gym they do not belong to |
| 748 | Cross-tenant injection — workout_logs, measurements, payments | a member may only file a PENDING notice; never a confirmed one | ESLENDI | [L748] a member can only file a PENDING notice; a requested "confirmed" is ignored |
| 774 | Cross-tenant injection — workout_logs, measurements, payments | payment amount and method are validated | ESLENDI | [L774] payment amount and method are validated |
| 784 | Cross-tenant injection — workout_logs, measurements, payments | a GymEntra payment can never be deleted, even by a global admin | NA | no DELETE route for payments (404, even admin); backed by test [L784] a payment can never be deleted: no delete route, even for admin |
| 804 | PT sessions | a trainer can only book onto their OWN calendar | ESLENDI | F3 dilimi: pt.test.ts `[L804]` |
| 827 | PT sessions | the assigned trainer cannot move a session to another gym or swap the member | ESLENDI | F3 dilimi: pt.test.ts `[L827]` |
| 846 | PT sessions | a colleague may take over only WITH a calendar share, and only to themselves | ESLENDI | F3 dilimi: pt.test.ts `[L846]` |
| 882 | PT sessions | a shared-with colleague cannot hand the session to a THIRD trainer | ESLENDI | F3 dilimi: pt.test.ts `[L882]` |
| 907 | PT sessions | a session with a creditId can never be created directly by a client, even the trainer (PKG-8) | ESLENDI | F3 dilimi: pt.test.ts `[L907]` |
| 921 | PT sessions | credit-linked session cancellation closed to direct writes | ESLENDI | F3 dilimi: pt.test.ts `[L921]` |
| 961 | Trainer availability and busy slots (PKG-7, PKG-8) | any tenant member can read availability; only the trainer or an admin can write it | ESLENDI | [L961] any tenant member reads availability; only the trainer or an admin writes it |
| 1004 | Trainer availability and busy slots (PKG-7, PKG-8) | busy slots are readable by any tenant member, writable by no client | ESLENDI | [L1004] busy slots: any tenant member reads, nobody writes through the API |
| 1024 | Calendar shares | a trainer can only share their OWN calendar | ESLENDI | [L1024] a trainer can only share their OWN calendar |
| 1044 | Calendar shares | sharing with yourself is rejected | ESLENDI | [L1044] sharing with yourself is rejected |
| 1076 | Trainer owns their own classes (PER-8) | a trainer can schedule a class for themselves | ESLENDI | [L1076] a trainer can schedule a class for themselves |
| 1082 | Trainer owns their own classes (PER-8) | but not one that lands on a colleague | ESLENDI | [L1082] but not one that lands on a colleague |
| 1090 | Trainer owns their own classes (PER-8) | an admin can schedule one for any trainer | ESLENDI | [L1090] an admin can schedule one for any trainer |
| 1096 | Trainer owns their own classes (PER-8) | the owning trainer can take the register | ESLENDI | F3 dilimi: groupClasses.test.ts `[L1096]` |
| 1103 | Trainer owns their own classes (PER-8) | another trainer cannot touch it | ESLENDI | [L1103] another trainer cannot edit or delete it |
| 1111 | Trainer owns their own classes (PER-8) | the owner cannot move the class to another gym or hand it away | ESLENDI | [L1111] the owner cannot move the class to another gym or hand it away |
| 1120 | Trainer owns their own classes (PER-8) | the owner can cancel their own class | ESLENDI | [L1120] the owner can cancel their own class |
| 1127 | Trainer owns their own classes (PER-8) | a class with no trainerId stays admin-only, as it was | ESLENDI | [L1127] a class with no trainerId stays admin-only |
| 1140 | Trainer owns their own classes (PER-8) | a member still cannot take the register | ESLENDI | [L1140] a member cannot edit, delete or otherwise modify a class (take the register) |
| 1158 | Pending applicant can reach the gym (PER-1) | someone waiting on a decision can read the contact details | ESLENDI | F3 dilimi: tenants.test.ts `[L1158]` |
| 1167 | Pending applicant can reach the gym (PER-1) | an active member still can, as before | ESLENDI | F3 dilimi: tenants.test.ts `[L1167]` |
| 1174 | Pending applicant can reach the gym (PER-1) | a stranger cannot — applying is what grants it, not signing up | ESLENDI | F3 dilimi: tenants.test.ts `[L1174]` |
| 1180 | Pending applicant can reach the gym (PER-1) | applying to one gym does not open another gym\ | ESLENDI | F3 dilimi: tenants.test.ts `[L1180]` |
| 1189 | Pending applicant can reach the gym (PER-1) | an applicant still cannot write it | ESLENDI | F3 dilimi: tenants.test.ts `[L1189]` |
| 1201 | Password reset throttling (PER-2) | ${path} istemciye tamamen kapalı — yönetici bile okuyamaz | NA | password_reset_throttle/ip are Admin-SDK-only Firestore collections; the API has no route for them (throttling itself is a F3 callable concern) |
| 1230 | Member profile: height and photo (PER-20) | a member sets their own height and photo; an absurd height is refused | ESLENDI | matrix-B: [L1230] member sets own height and photo; absurd height refused |
| 1238 | Member profile: height and photo (PER-20) | an admin may correct the height of a member they created; height cannot ride along on a role change | ESLENDI | matrix-B: [L1238] admin corrects height of a managed member; height cannot ride along on a role change |
| 1253 | Member profile: height and photo (PER-20) | an admin does not correct the height of a member who signed up themself | ESLENDI | matrix-B: [L1253] admin does not correct the height of a member who signed up themself |
| 1263 | Announcements (PER-16) | an admin posts; members and trainers read | ESLENDI | matrix-B: [L1263] admin posts; members and trainers read |
| 1272 | Announcements (PER-16) | a member or trainer cannot post; nobody edits; an admin deletes | ESLENDI | matrix-B: [L1272] member/trainer cannot post; nobody edits; admin deletes |
| 1283 | Announcements (PER-16) | someone outside the gym cannot read it; a blank title is refused | ESLENDI | matrix-B: [L1283] outsider cannot read; blank title refused |
| 1306 | Deterministik kimlikli boş dokümanlar okunabilmeli | member_entitlements — a member with no packages yet | ESLENDI | matrix-B: [L1306] member_entitlements: empty packages list readable (entitlements is a view over member_packages) |
| 1313 | Deterministik kimlikli boş dokümanlar okunabilmeli | trainer_availability — a trainer who has not set hours yet | ESLENDI | matrix-B: [L1313] trainer_availability: unset hours -> 404 for members (authorised), 403 for outsiders |
| 1320 | Deterministik kimlikli boş dokümanlar okunabilmeli | member_notes — a member nobody has written a note about | ESLENDI | matrix-B: [L1320] member_notes: never-written note reads as {text:''} |
| 1327 | Deterministik kimlikli boş dokümanlar okunabilmeli | user_settings — already id-based, kept here so it stays that way | ESLENDI | F3 dilimi: account.test.ts `[L1327]` |
| 1338 | Renewal requests (PER-15) | a member opens a renewal request for themselves | ESLENDI | matrix-B: [L1338] member opens a renewal request for themselves and reads it |
| 1345 | Renewal requests (PER-15) | the member can subscribe before any request exists | ESLENDI | matrix-B: [L1345] member can subscribe (list) before any request exists |
| 1357 | Renewal requests (PER-15) | a missing document is not a hole: still only your own id | ESLENDI | matrix-B: [L1357] an empty state is not a hole (list is caller-scoped) |
| 1367 | Renewal requests (PER-15) | not for someone else, not under a foreign id | ESLENDI | matrix-B: [L1367] id is always tenant_caller; body memberId/id/tenantId ignored |
| 1374 | Renewal requests (PER-15) | the member can withdraw, then open again | ESLENDI | matrix-B: [L1374] withdraw then open again (also api.test F2 writes: renewal) |
| 1382 | Renewal requests (PER-15) | staff read it; an admin closes it as handled; a trainer cannot | ESLENDI | matrix-B: [L1382] staff read it; admin handles; trainer cannot |
| 1392 | Renewal requests (PER-15) | another member cannot read it | ESLENDI | matrix-B: [L1392] another member cannot read it |
| 1406 | Member notes (PER-14c) | a trainer can write and read a note about a member | ESLENDI | matrix-B: [L1406] trainer writes and reads a note |
| 1413 | Member notes (PER-14c) | an admin can read and edit the same note — one shared note per member | ESLENDI | matrix-B: [L1413] admin reads and edits the same note |
| 1422 | Member notes (PER-14c) | the member cannot read the note about themselves — that is the point | ESLENDI | matrix-B: [L1422] the member cannot read the note about themselves |
| 1430 | Member notes (PER-14c) | a note cannot be re-addressed: doc id pins tenant and member | ESLENDI | matrix-B: [L1430] note cannot be re-addressed (path only; 404 for non-member) |
| 1436 | Member notes (PER-14c) | updatedBy must be the writer; empty and oversize text are refused | ESLENDI | matrix-B: [L1436] updatedBy is the writer; empty and oversize refused |
| 1456 | Exercise reports (PER-19) | a trainer can file a report about a bundled explainer | ESLENDI | matrix-B: [L1456] trainer files a report |
| 1462 | Exercise reports (PER-19) | an admin can too | ESLENDI | matrix-B: [L1462] admin files a report |
| 1468 | Exercise reports (PER-19) | a member cannot — they are not the ones who can judge a pose | ESLENDI | matrix-B: [L1468] a member cannot |
| 1474 | Exercise reports (PER-19) | staff of one gym cannot file against another gym | ESLENDI | matrix-B: [L1474] staff of one gym cannot file against another gym |
| 1480 | Exercise reports (PER-19) | the reporter cannot be someone else | ESLENDI | matrix-B: [L1480] the reporter cannot be someone else |
| 1486 | Exercise reports (PER-19) | reason must be one of the known kinds, and the note is bounded | ESLENDI | matrix-B: [L1486] reason must be a known kind; note is bounded (side finding: exerciseId <=64 not enforced, it.todo) |
| 1493 | Exercise reports (PER-19) | reports are write-only from a client — there is no in-app inbox | NA | no GET/PUT/PATCH/DELETE route for exercise-reports; verified 404 in matrix-B: [L1493] |
| 1506 | Push tokens | nobody can read push tokens from the client | NA | no read route for push tokens; verified 404 in matrix-B: [L1506] |
| 1514 | Push tokens | a user can register and remove their own token but not somebody else\ | ESLENDI | matrix-B: [L1514] register/remove own token only (also api.test F2 writes: push token) |
| 1534 | Programs | only tenant staff can author a program; a member cannot | ESLENDI | matrix-B: [L1534] only staff author a program; a member cannot |
| 1549 | Programs | a member can read their own program but not another member\ | ESLENDI | matrix-B: [L1549] a member reads their own program, not another member's |
| 1565 | Program templates (PER-18) | a member can read templates — the goal picker shows them | ESLENDI | api.test F1 reads (catalog...): program templates: global + own gyms only (and matrix-B: [L1565]) |
| 1575 | Program templates (PER-18) | nobody can write a global template from a client | ESLENDI | matrix-B: [L1575] nobody can write a global template from a client |
| 1589 | Program templates (PER-18) | gym staff own their gym\ | ESLENDI | matrix-B: [L1589] gym staff own their gym's templates, a member does not |
| 1601 | Program templates (PER-18) | a template cannot be moved to another gym | ESLENDI | matrix-B: [L1601] a template cannot be moved to another gym (column pinned; see cosmetic DTO note in report) |
| 1624 | Gym packages (PKG-1) | any active member of the tenant can read the catalog | ESLENDI | matrix-B: [L1624] any active member reads the catalog (also api.test: packages: members; promotions: staff only) |
| 1634 | Gym packages (PKG-1) | a member from another gym cannot read the catalog | ESLENDI | matrix-B: [L1634] a member of another gym cannot read the catalog |
| 1646 | Gym packages (PKG-1) | only a tenant admin may create a package | ESLENDI | packages.test.ts: katalog yalnız yönetici |
| 1657 | Gym packages (PKG-1) | a package cannot be created with a non-zero assignment count | ESLENDI | packages.test.ts [L1657] |
| 1663 | Gym packages (PKG-1) | an unlocked package (no assignments) can be freely edited by the admin | ESLENDI | packages.test.ts: kullanılmayan paket serbestçe düzenlenir |
| 1675 | Gym packages (PKG-1) | a locked package (has assignments) rejects a content edit | ESLENDI | packages.test.ts: kullanılan paket içerik düzenlemesini reddeder (409) |
| 1689 | Gym packages (PKG-1) | the client can never move activeAssignmentCount, locked or not | ESLENDI | packages.test.ts [L1689] |
| 1701 | Gym packages (PKG-1) | packages are never deleted, even by an admin | NA | no delete route for packages; verified 404 in matrix-B: [L1701] |
| 1728 | Package change requests (PKG-6) | only a tenant admin may create a request, and only as themselves | ESLENDI | F3 dilimi: packageLifecycle.test.ts `[L1728]` |
| 1740 | Package change requests (PKG-6) | the member has no direct write path to status — approve/reject only goes through approvePackageChange (Faz 1.6) | NA | no client write route on package-change-requests; approve/reject (approvePackageChange) is F3; verified 404 in matrix-B: [L1740] |
| 1754 | Package change requests (PKG-6) | another member cannot respond to someone else\ | NA | same: no respond route, verified 404 in matrix-B: [L1754]; approval itself is F3 |
| 1767 | Package change requests (PKG-6) | the admin can cancel a still-pending offer; not once it has been answered | ESLENDI | F3 dilimi: packageLifecycle.test.ts `[L1767]` |
| 1785 | Package change requests (PKG-6) | a member reads their own request; a colleague of theirs does not | ESLENDI | matrix-B: [L1785] a member reads their own request; a colleague does not (also api.test: change requests) |
| 1813 | Promotions (PKG-5) | staff can read; only a tenant admin may create | ESLENDI | packages.test.ts + matrix-B [L1813]: personel okur, yalnız yönetici yazar |
| 1831 | Promotions (PKG-5) | a promotion cannot be created already redeemed | ESLENDI | packages.test.ts [L1831] |
| 1837 | Promotions (PKG-5) | an admin can edit any field except redeemed directly | ESLENDI | packages.test.ts [L1837] (redeemed yazılamaz, 400) |
| 1849 | Promotions (PKG-5) | redemption may only move redeemed by exactly +1, and only under the cap | ESLENDI | packages.test.ts: ödeme/atama içinde +1, sınırda tükenir, hiçbir şey yazılmaz |
| 1862 | Promotions (PKG-5) | a tenant admin can delete a promotion | ESLENDI | packages.test.ts [L1862] |
| 1908 | Member packages and credits (PKG-2) | only a tenant admin may assign a package, and only as themselves | ESLENDI | packages.test.ts: atama yalnız yönetici, aktif üyeye |
| 1928 | Member packages and credits (PKG-2) | a retired (inactive) package cannot be assigned | ESLENDI | packages.test.ts: pasif paket atanamaz |
| 1939 | Member packages and credits (PKG-2) | a member reads their own assignment; another member cannot | ESLENDI | matrix-B: [L1939] a member reads their own assignment; another member cannot |
| 1956 | Member packages and credits (PKG-2) | an assignment can never be updated or deleted by a client, even an admin | NA | no update/delete route on member_packages; verified 404 in matrix-B: [L1956] |
| 1983 | Member packages and credits (PKG-2) | only a tenant admin may create a credit, and never pre-used | NA | kredi yalnız atama içinde oluşur; doğrudan uç yok (packages.test.ts [L1983], 404) |
| 1995 | Member packages and credits (PKG-2) | a credit can never be updated by a client — consumption is server-only | NA | no client write route on member_credits; consumption is server-side; verified 404 in matrix-B: [L1995] |
| 2007 | Member packages and credits (PKG-2) | a member reads their own credit; staff reads it too; another member cannot | ESLENDI | matrix-B: [L2007] a member reads own credits; staff too; another member cannot |
| 2048 | Role model — multiple roles and delegated permissions | an owner who also coaches holds both roles and gets both surfaces | ESLENDI | matrix-C [L2048] (admin+trainer roles, check-in, own pt-sessions read); note: PT booking half (pt_sessions create) is F3 bookPtSessions |
| 2067 | Role model — multiple roles and delegated permissions | a plain trainer cannot check members in | ESLENDI | matrix-C [L2067] |
| 2075 | Role model — multiple roles and delegated permissions | a trainer granted the checkin permission can — without becoming an admin | ESLENDI | matrix-C [L2075] |
| 2095 | Role model — multiple roles and delegated permissions | a trainer cannot grant themselves the checkin permission | ESLENDI | matrix-C [L2095] |
| 2103 | Role model — multiple roles and delegated permissions | an admin can assign roles and permissions to someone else | ESLENDI | matrix-C [L2103] |
| 2116 | Role model — multiple roles and delegated permissions | an admin cannot strip their own admin role and strand the gym | ESLENDI | matrix-C [L2116] |
| 2127 | Role model — multiple roles and delegated permissions | permissions do not leak across gyms | ESLENDI | matrix-C [L2127] |
| 2135 | Role model — multiple roles and delegated permissions | a suspended membership grants nothing, whatever its roles say | ESLENDI | matrix-C [L2135] |
| 2157 | Leaving a gym | a member can end their own membership | ESLENDI | matrix-C [L2157] |
| 2165 | Leaving a gym | a trainer can too | ESLENDI | matrix-C [L2165] |
| 2173 | Leaving a gym | an admin cannot use this path — they might be the gym\ | ESLENDI | matrix-C [L2173] last admin cannot leave (409). Note: rules denied ALL admins; API lets a non-last admin leave (mirrors deleteMyAccount last-admin guard) - deliberate widening |
| 2181 | Leaving a gym | leaving cannot be abused to grant yourself anything | ESLENDI | matrix-C [L2181] |
| 2193 | Leaving a gym | you cannot make somebody else leave | ESLENDI | matrix-C [L2193] |
| 2202 | Leaving a gym | a left membership grants no access | ESLENDI | matrix-C [L2202] |
| 2219 | Tenant private data and push tokens | gym contact details live in a private subdoc, not on the public tenant doc | ESLENDI | F3 dilimi: tenants.test.ts `[L2219]` |
| 2249 | Tenant private data and push tokens | a push token must be well-formed, self-owned and inside a gym you belong to | ESLENDI | matrix-C [L2249]; "someone else uid" is NA by design: userId is never taken from the body |
| 2269 | Tenant private data and push tokens | push tokens are never readable from the client, not even your own | ESLENDI | matrix-C [L2269] (no GET route; own DELETE works) |
| 2306 | No platform super-user over tenant data (P1-6) | the global admin claim cannot read another gym\ | ESLENDI | matrix-C [L2306] (API has no claim path; non-member gets 403/404 everywhere; token claims are never read) |
| 2315 | No platform super-user over tenant data (P1-6) | the global admin claim cannot write tenant data or admit members | ESLENDI | matrix-C [L2315] (no tenant-write route; roles/status/checkin/managed all 403) |
| 2361 | Approving a request that still carries the legacy `role` field | an admin can approve it | NA | legacy `role` field does not exist in D1 (migrated to roles); admin approval path tested in matrix-C [L2361] |
| 2399 | Admin edits a member's basic details | an admin can correct name, phone, e-mail and birth date of a member they created | ESLENDI | matrix-C [L2399] |
| 2408 | Admin edits a member's basic details | an admin cannot rewrite the details of a member who signed up themself | ESLENDI | matrix-C [L2408] |
| 2415 | Admin edits a member's basic details | nor a still-pending request of someone with their own account | ESLENDI | matrix-C [L2415] |
| 2422 | Admin edits a member's basic details | an admin of ANOTHER gym cannot edit a managed member | ESLENDI | matrix-C [L2422] |
| 2428 | Admin edits a member's basic details | a trainer cannot edit a managed member | ESLENDI | matrix-C [L2428] |
| 2434 | Admin edits a member's basic details | the edit path cannot smuggle a role change | ESLENDI | matrix-C [L2434] |
| 2441 | Admin edits a member's basic details | the edit path cannot clear or flip `managed`, nor change who created the row | ESLENDI | matrix-C [L2441] |
| 2448 | Admin edits a member's basic details | the edit path cannot activate someone | ESLENDI | matrix-C [L2448] |
| 2455 | Admin edits a member's basic details | an admin cannot edit a managed member into a minor — that would skip the parent\ | ESLENDI | matrix-C [L2455] |
| 2461 | Admin edits a member's basic details | the edit path cannot rewrite the check-in shortCode | ESLENDI | matrix-C [L2461] |
| 2468 | Admin edits a member's basic details | an empty name or an oversized e-mail is rejected | ESLENDI | matrix-C [L2468] |
| 2476 | Admin edits a member's basic details | a plain member cannot edit someone else | ESLENDI | matrix-C [L2476] |
| 2484 | Admin edits a member's basic details | a member cannot stamp `managed` or `createdBy` on their own new row | ESLENDI | matrix-C [L2484] |
| 2492 | Admin edits a member's basic details | deleting a membership stays closed to clients — removal goes through the callable | ESLENDI | memberRemoval.test.ts: yönetici bir salondan çıkarır (DELETE /tenants/:t/members/:id), üye/antrenör 403, son yönetici 409 |
| 2519 | A member edits their own details | name, phone and birth date | ESLENDI | matrix-C [L2519] |
| 2530 | A member edits their own details | works while still pending approval | ESLENDI | matrix-C [L2530] |
| 2537 | A member edits their own details | cannot self-approve through the profile path | ESLENDI | matrix-C [L2537] |
| 2544 | A member edits their own details | cannot self-grant a role | ESLENDI | matrix-C [L2544] |
| 2553 | A member edits their own details | cannot rewrite their own shortCode | ESLENDI | matrix-C [L2553] |
| 2560 | A member edits their own details | an empty name is rejected | ESLENDI | matrix-C [L2560] |
| 2565 | A member edits their own details | a birth date has to be a timestamp | ESLENDI | matrix-C [L2565] |
| 2573 | A member edits their own details | a write that changes nothing is still a write, and is refused | ESLENDI | matrix-C [L2573] |
| 2578 | A member edits their own details | someone who left cannot reactivate themselves through this path | ESLENDI | matrix-C [L2578] |
| 2618 | The join payload the client actually sends | a first-time applicant can create their request | ESLENDI | matrix-C [L2618] |
| 2628 | The join payload the client actually sends | the read that precedes the write works when there is no membership yet | ESLENDI | matrix-C [L2628] (GET /v1/me with no membership -> [], then join 201) |
| 2634 | The join payload the client actually sends | that allowance does not let anyone probe someone else\ | ESLENDI | matrix-C [L2634] |
| 2639 | The join payload the client actually sends | an already-ACTIVE member re-applying is rejected — the rejoin path is only for left/rejected | ESLENDI | matrix-C [L2639] |
| 2671 | Free-tier member limit (P0-1) | an admin can approve a member while under the free limit | ESLENDI | matrix-C [L2671] |
| 2677 | Free-tier member limit (P0-1) | approval is blocked at the limit — the client check is not the only gate | ESLENDI | matrix-C [L2677] |
| 2683 | Free-tier member limit (P0-1) | an active subscription lifts the limit | ESLENDI | matrix-C [L2683] |
| 2689 | Free-tier member limit (P0-1) | an expired subscription does not | ESLENDI | matrix-C [L2689] |
| 2695 | Free-tier member limit (P0-1) | rejecting and suspending stay free at the limit | ESLENDI | matrix-C [L2695] |
| 2701 | Free-tier member limit (P0-1) | hiring staff is never paywalled | ESLENDI | matrix-fixes: [L2701] işe alım paywall değil, koltuk saymaz (API düzeltildi) |
| 2712 | Free-tier member limit (P0-1) | an admin cannot grant themselves a subscription or edit the seat tally | ESLENDI | F3 dilimi: tenants.test.ts `[L2712]` |
| 2746 | Guardian link (MEMBER-5b) | a parent can read their child\ | ESLENDI | api/test/matrix-D.test.ts [L2746] |
| 2754 | Guardian link (MEMBER-5b) | that read works while the request is still pending | ESLENDI | api/test/matrix-D.test.ts [L2754] |
| 2760 | Guardian link (MEMBER-5b) | an unrelated member cannot read that row | ESLENDI | api/test/matrix-D.test.ts [L2760] |
| 2766 | Guardian link (MEMBER-5b) | the child cannot approve their own guardian | ESLENDI | api/test/matrix-D.test.ts [L2766] |
| 2774 | Guardian link (MEMBER-5b) | the child cannot attach themselves to a guardian | ESLENDI | api/test/matrix-D.test.ts [L2774] |
| 2780 | Guardian link (MEMBER-5b) | even the parent cannot write the approval directly — it goes through the callable | ESLENDI | api/test/matrix-D.test.ts [L2780] |
| 2788 | Guardian link (MEMBER-5b) | an admin cannot activate a minor whose guardian has not approved | ESLENDI | api/test/matrix-D.test.ts [L2788] |
| 2796 | Guardian link (MEMBER-5b) | an admin cannot activate a minor with no guardian at all | ESLENDI | api/test/matrix-D.test.ts [L2796] |
| 2804 | Guardian link (MEMBER-5b) | once the guardian has approved, the admin can activate them | ESLENDI | api/test/matrix-D.test.ts [L2804] |
| 2812 | Guardian link (MEMBER-5b) | an adult needs no guardian | ESLENDI | api/test/matrix-D.test.ts [L2812] |
| 2822 | Guardian link (MEMBER-5b) | a member with no birth date is not blocked | ESLENDI | api/test/matrix-D.test.ts [L2822] |
| 2841 | Guardian link (MEMBER-5b) | a minor without approval can still be rejected | ESLENDI | api/test/matrix-D.test.ts [L2841] |
| 2901 | Guardian authority (MEMBER-5c) | an approved parent reads the child\ | ESLENDI | matrix-fixes: [L2901] onaylı veli kredi + check-in okur (API düzeltildi, check-in okuma ucu eklendi) |
| 2912 | Guardian authority (MEMBER-5c) | a PENDING link grants none of that | ESLENDI | api/test/matrix-D.test.ts [L2912] |
| 2920 | Guardian authority (MEMBER-5c) | an unrelated member gets nothing | ESLENDI | api/test/matrix-D.test.ts [L2920] |
| 2927 | Guardian authority (MEMBER-5c) | an approved parent books the child into a class | ESLENDI | api/test/matrix-D.test.ts [L2927] |
| 2935 | Guardian authority (MEMBER-5c) | the parent needs no entitlement of their own | ESLENDI | api/test/matrix-D.test.ts [L2935] |
| 2944 | Guardian authority (MEMBER-5c) | but the CHILD still needs one | ESLENDI | api/test/matrix-D.test.ts [L2944] |
| 2953 | Guardian authority (MEMBER-5c) | a parent cannot book somebody else\ | ESLENDI | api/test/matrix-D.test.ts [L2953] |
| 2959 | Guardian authority (MEMBER-5c) | a pending link cannot book | ESLENDI | api/test/matrix-D.test.ts [L2959] |
| 2965 | Guardian authority (MEMBER-5c) | an approved parent cancels the child\ | ESLENDI | api/test/matrix-D.test.ts [L2965] |
| 2975 | Guardian authority (MEMBER-5c) | an approved parent files a payment notice in the child\ | ESLENDI | api/test/matrix-D.test.ts [L2975] |
| 2986 | Guardian authority (MEMBER-5c) | a parent cannot file one without naming themselves as the payer | NA | submittedBy is derived from token server-side; test [L2986] shows client value ignored |
| 2996 | Guardian authority (MEMBER-5c) | a parent cannot confirm their own notice | ESLENDI | api/test/matrix-D.test.ts [L2996] |
| 3024 | Guardian check-in reason (MEMBER-5d) | staff may record a guardian entry | ESLENDI | api/test/matrix-D.test.ts [L3024] |
| 3034 | Guardian check-in reason (MEMBER-5d) | an unknown reason is still refused | ESLENDI | api/test/matrix-D.test.ts [L3034] |
| 3044 | Guardian check-in reason (MEMBER-5d) | a member still cannot check themselves in as a guardian | ESLENDI | api/test/matrix-D.test.ts [L3044] |
| 3088 | Guardian bulk payment (MEMBER-5e) | a parent writes one entry per child in a single batch | ESLENDI | F3 dilimi: guardians.test.ts `[L3088]` |
| 3098 | Guardian bulk payment (MEMBER-5e) | one disallowed entry fails the whole batch | ESLENDI | F3 dilimi: guardians.test.ts `[L3098]` |
| 3106 | Guardian bulk payment (MEMBER-5e) | the entries stay pending — a parent cannot confirm their own | ESLENDI | api/test/matrix-D.test.ts [L3106] |
| 3113 | Guardian bulk payment (MEMBER-5e) | a parent can read back what they filed for each child | ESLENDI | api/test/matrix-D.test.ts [L3113] |
| 3151 | Payment reversal (ADMIN-4) | an admin writes a reversal and flags the original | ESLENDI | api/test/matrix-D.test.ts [L3151] |
| 3165 | Payment reversal (ADMIN-4) | a reversal must name what it cancels | ESLENDI | api/test/matrix-D.test.ts [L3165] |
| 3176 | Payment reversal (ADMIN-4) | a member cannot write a reversal | ESLENDI | api/test/matrix-D.test.ts [L3176] |
| 3186 | Payment reversal (ADMIN-4) | a member cannot flag a payment as reversed | NA | no route to flag a payment directly; [L3186] asserts 404/405 and unchanged row |
| 3194 | Payment reversal (ADMIN-4) | a row cannot be reversed a second time | ESLENDI | api/test/matrix-D.test.ts [L3194] |
| 3202 | Payment reversal (ADMIN-4) | the flag cannot be used to edit the amount | NA | no flag/edit route; [L3202] asserts amount unchanged |
| 3209 | Payment reversal (ADMIN-4) | deleting a payment stays impossible for everyone | NA | no DELETE payment route; [L3209] asserts 404/405 |
| 3244 | Package assignment stays closed to clients (ADMIN-4) | not even an admin can cancel an assignment directly | NA | no client route to mutate member_packages; package assignment itself is F3 |
| 3249 | Package assignment stays closed to clients (ADMIN-4) | nor delete it | NA | no client route to delete member_packages |
| 3254 | Package assignment stays closed to clients (ADMIN-4) | a member cannot revoke their own credits, nor grant themselves more | NA | no client route to mutate member_credits |
| 3261 | Package assignment stays closed to clients (ADMIN-4) | an admin cannot hand-edit a credit balance either | NA | no client route to mutate member_credits |
| 3283 | Admin seat cap (3 per gym) | promoting a member to admin succeeds under the cap | ESLENDI | api/test/matrix-D.test.ts [L3283] |
| 3289 | Admin seat cap (3 per gym) | a fourth admin is refused — the client check is not the only gate | ESLENDI | api/test/matrix-D.test.ts [L3289] |
| 3295 | Admin seat cap (3 per gym) | a missing counter reads as under the limit — a pre-existing gym is not locked out | NA | active_admin_count is NOT NULL DEFAULT 0; migration must backfill real counts (see report) |
| 3310 | Admin seat cap (3 per gym) | editing an existing admin (e.g. demoting them) is not blocked by the cap they already occupy | ESLENDI | api/test/matrix-D.test.ts [L3310] |
| 3318 | Admin seat cap (3 per gym) | demoting an admin out of the role is allowed at the cap — it only frees a seat | ESLENDI | api/test/matrix-D.test.ts [L3318] |
| 3340 | Owner-only member note (member_admin_notes) | an admin writes, reads and deletes the note | ESLENDI | api/test/matrix-D.test.ts [L3340] |
| 3348 | Owner-only member note (member_admin_notes) | reading a note nobody has written yet works for an admin | ESLENDI | api/test/matrix-D.test.ts [L3348] |
| 3353 | Owner-only member note (member_admin_notes) | a trainer reads and writes the shared note, but not this one | ESLENDI | api/test/matrix-D.test.ts [L3353] |
| 3367 | Owner-only member note (member_admin_notes) | the member the note is about cannot read it, even their own | ESLENDI | api/test/matrix-D.test.ts [L3367] |
| 3376 | Owner-only member note (member_admin_notes) | an admin of another gym sees nothing | ESLENDI | api/test/matrix-D.test.ts [L3376] |
| 3383 | Owner-only member note (member_admin_notes) | the id pins the note to its member and gym; text and author are checked | ESLENDI | api/test/matrix-D.test.ts [L3383] (empty text = delete is deliberate, see api.test admin note) |
| 3406 | Member address (member_addresses) | a member writes, reads and deletes their own address | ESLENDI | api/test/matrix-D.test.ts [L3406] |
| 3414 | Member address (member_addresses) | a member with no row in the gym cannot attach an address to it | ESLENDI | api/test/matrix-D.test.ts [L3414] |
| 3419 | Member address (member_addresses) | a member cannot write or read someone else\ | ESLENDI | api/test/matrix-D.test.ts [L3419] |
| 3429 | Member address (member_addresses) | the gym\ | ESLENDI | api/test/matrix-D.test.ts [L3429] |
| 3440 | Member address (member_addresses) | reading an address nobody has written yet works for the person and the admin | ESLENDI | api/test/matrix-D.test.ts [L3440] |
| 3447 | Member address (member_addresses) | an admin writes the address of a member they created, and no one else\ | ESLENDI | api/test/matrix-D.test.ts [L3447] |
| 3459 | Member address (member_addresses) | an admin cannot delete the address of a member who signed up themself | ESLENDI | api/test/matrix-D.test.ts [L3459] |
| 3466 | Member address (member_addresses) | empty, oversized or mis-attributed addresses are rejected | ESLENDI | api/test/matrix-D.test.ts [L3466] |
