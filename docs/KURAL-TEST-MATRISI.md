# Kural testi → API testi eşleme matrisi (F2)

Kaynak: `backend/tests/firestore.rules.test.ts` (45 describe, 250 test bloğu; kayıtlı sayı 251; bir testin farkı henüz açıklanmadı — F2 sonunda vitest raporuyla doğrulanacak).
**Kural:** her satır API testine eşlenmeden F2 kapanmaz. "Bekliyor" = henüz eşlenmedi; sessiz atlama yok.

| describe | test | API durumu |
|---|---|---|
| Firestore rules | 1 | F2/F3: yazma yolu, bekliyor |
| Tenants and tenant memberships | 9 | okuma kısmı kapalı (by-code, members); yazma F2 |
| Classes | 9 | F2/F3: yazma yolu, bekliyor |
| Check-ins | 3 | F2/F3: yazma yolu, bekliyor |
| Rejoining a gym after leaving or being rejected (P0-6) | 9 | KISMEN: join/rejoin testi var (`F2 membership lifecycle`); rejected→join eşlemesi sürüyor |
| Trainer list visibility to members (PKG-8) | 4 | F1: `/members/:id` trainer satırı (test var) |
| Tenant isolation — classes | 4 | F2/F3: yazma yolu, bekliyor |
| Cross-tenant injection — workout_logs, measurements, payments | 9 | F2/F3: yazma yolu, bekliyor |
| PT sessions | 6 | okuma F1; yazma F3 (bookPtSessions) |
| Trainer availability and busy slots (PKG-7, PKG-8) | 2 | okuma F1; yazma F2 |
| Calendar shares | 2 | okuma F1 (PT takvimi); yazma F2 |
| Trainer owns their own classes (PER-8) | 9 | F2/F3: yazma yolu, bekliyor |
| Pending applicant can reach the gym (PER-1) | 5 | F2/F3: yazma yolu, bekliyor |
| Password reset throttling (PER-2) | 1 | Firebase Auth/callable — taşınmayacak, F3 `sendReset` uç noktası |
| Member profile: height and photo (PER-20) | 3 | KISMEN: boy aralığı testli; fotoğraf yükleme F3 (medya) |
| Announcements (PER-16) | 3 | EŞLENDİ: oluştur/sil + tenant kapsamı testli (`F2 writes`) |
| Deterministik kimlikli boş dokümanlar okunabilmeli | 4 | F2/F3: yazma yolu, bekliyor |
| Renewal requests (PER-15) | 7 | EŞLENDİ: tek bekleyen, geri çekme, yeniden gönderme, yönetici işleme |
| Member notes (PER-14c) | 5 | EŞLENDİ: personel yaz/sil, üye reddedilir, boş reddedilir |
| Exercise reports (PER-19) | 7 | F2/F3: yazma yolu, bekliyor |
| Push tokens | 2 | EŞLENDİ: biçim, platform, salon üyeliği; cihaz token'ı son girişe taşınır (rules'tan bilinçli fark) |
| Programs | 2 | okuma F1; yazma F2 |
| Program templates (PER-18) | 4 | okuma F1 (sızıntı kapatıldı); yazma F2 |
| Gym packages (PKG-1) | 8 | okuma F1; yazma F3 |
| Package change requests (PKG-6) | 5 | okuma F1; yazma F3 |
| Promotions (PKG-5) | 5 | okuma F1; yazma F3 |
| Member packages and credits (PKG-2) | 7 | F2/F3: yazma yolu, bekliyor |
| Role model — multiple roles and delegated permissions | 8 | KISMEN: rol/izin atama, yönetici sınırı, kendini düşürme testli; `checkin` yetkisinin kullanımı check-in ucuyla |
| Leaving a gym | 6 | KISMEN: leave + son yönetici + koltuk serbest testli; veri temizliği (hesap silme) F3 |
| Tenant private data and push tokens | 3 | F2/F3: yazma yolu, bekliyor |
| No platform super-user over tenant data (P1-6) | 2 | API'de platform admin yolu hiç yok; tek negatif test F2 |
| Approving a request that still carries the legacy `role` field | 1 | legacy alan; veri aktarımında dönüşür, test gerekmez |
| Admin edits a member's basic details | 14 | EŞLENDİ: managed-only, reşit olmayan reddi (`details`) |
| A member edits their own details | 9 | EŞLENDİ: izinli alanlar, e-posta reddi, boy aralığı |
| The join payload the client actually sends | 4 | KISMEN: join gövdesi artık sunucu tarafında; istemci geçişinde (F4) yeniden doğrulanacak |
| Free-tier member limit (P0-1) | 7 | KISMEN: onay sınırı + abonelik testi var; elle üye sınırı F0'da; rules'taki ek yollar eşlenecek |
| Guardian link (MEMBER-5b) | 12 | KISMEN: reşit olmayan aktivasyon kapısı testli; requestGuardian/respondToGuardian F3 |
| Guardian authority (MEMBER-5c) | 12 | F2/F3: yazma yolu, bekliyor |
| Guardian check-in reason (MEMBER-5d) | 3 | F2/F3: yazma yolu, bekliyor |
| Guardian bulk payment (MEMBER-5e) | 4 | F2/F3: yazma yolu, bekliyor |
| Payment reversal (ADMIN-4) | 7 | F2/F3: yazma yolu, bekliyor |
| Package assignment stays closed to clients (ADMIN-4) | 4 | F2/F3: yazma yolu, bekliyor |
| Admin seat cap (3 per gym) | 5 | KISMEN: onayda 3 yönetici sınırı testli; rol atama yolu (F2) bekliyor |
| Owner-only member note (member_admin_notes) | 6 | F0/F1 kapalı (not + okuma, test var) |
| Member address (member_addresses) | 8 | EŞLENDİ: kendisi / yalnız managed için yönetici |
