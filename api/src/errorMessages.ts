import { createMiddleware } from 'hono/factory';

/**
 * The app shows the server's `message` to people (see mobile `data/errors.ts`: trusted 4xx messages are
 * displayed verbatim), so it must be Turkish and free of jargon. Routes keep returning short machine
 * codes in `error`; this middleware adds `message`. A code without an entry gets the status fallback —
 * an English code can never reach a screen.
 */
export const STATUS_FALLBACK: Record<number, string> = {
  400: 'Girdiğin bilgiler geçersiz görünüyor. Kontrol edip tekrar dene.',
  401: 'Oturumun sona ermiş. Lütfen tekrar giriş yap.',
  403: 'Bu işlem için yetkin yok.',
  404: 'Aradığın kayıt bulunamadı.',
  409: 'Bu işlem şu an yapılamıyor.',
  412: 'Bu işlem şu an yapılamıyor.',
  429: 'Bir sınıra ulaşıldı.',
};

export const MESSAGES: Record<string, string> = {
  'member limit': 'Ücretsiz planda en fazla 10 aktif üye olabilir. Üye eklemek için aboneliği yükselt.',
  'admin limit': 'Bir salonda en fazla 3 yönetici olabilir.',
  'owner limit': 'Bir kişi en fazla 5 salon açabilir.',
  'already a member': 'Bu salona zaten başvurdun ya da üyesin.',
  'cannot activate (limit or guardian approval)': 'Üye etkinleştirilemedi: üye sınırı dolu ya da reşit olmayan üyenin veli onayı eksik.',
  'minor': '18 yaşından küçük üyeler elle eklenemez: veli onayı için uygulamadan katılmaları gerekiyor.',
  'cannot demote yourself': 'Kendi yönetici yetkini kaldıramazsın.',
  'last admin cannot leave': 'Salonun son yöneticisisin. Ayrılmadan önce başka bir yönetici ata.',
  'sole admin of a gym; appoint another admin first': 'Bir salonun tek yöneticisisin. Hesabını silmeden önce başka bir yönetici ata.',
  'class full': 'Ders dolu.',
  'class already started': 'Ders başladı, artık değişiklik yapılamıyor.',
  'already booked': 'Bu derse zaten kayıtlısın.',
  'already on the waitlist': 'Zaten bekleme listesindesin.',
  'not eligible': 'Bu derse katılma hakkın yok. Paketini kontrol et.',
  'not eligible or class full': 'Bu derse katılamıyorsun: ders dolu ya da paketinde ders hakkı yok.',
  'class has free places; book instead': 'Derste boş yer var, doğrudan kayıt olabilirsin.',
  'class has free places or not eligible': 'Derste boş yer var ya da bekleme listesine katılma hakkın yok.',
  'member is not booked into this class': 'Bu üye derse kayıtlı değil.',
  'package inactive': 'Bu paket artık satışta değil.',
  'package in use: only isActive/sortOrder can change': 'Bu paket kullanımda: yalnızca aktiflik ve sıra değiştirilebilir. İçeriği değiştirmek için yeni paket oluştur.',
  'promotion exhausted': 'Bu kampanyanın kullanım hakkı doldu.',
  'promotion not applicable': 'Bu kampanya bu pakete uygulanamıyor.',
  'payment is not a confirmed charge of this member': 'Seçilen ödeme bu üyeye ait onaylı bir ödeme değil.',
  'assignment conflict: member, package or payment changed; retry': 'Bilgiler az önce değişti. Lütfen tekrar dene.',
  'member not active': 'Üyenin üyeliği aktif değil.',
  'already pending': 'Zaten bekleyen bir talebin var.',
  'already answered': 'Bu teklif zaten yanıtlandı.',
  'not pending': 'Bu kayıt artık beklemede değil.',
  'code taken': 'Bu salon kodu kullanımda. Başka bir kod dene.',
  'code 2-32 of A-Z 0-9 -': 'Salon kodu 2–32 karakter olmalı; yalnızca harf, rakam ve tire içerebilir.',
  'owner must be you': 'Salonu yalnızca kendi adına açabilirsin.',
  'forbidden': 'Bu işlem için yetkin yok.',
  'unauthenticated': 'Oturumun sona ermiş. Lütfen tekrar giriş yap.',
  'bootstrap required': 'Hesabın hazırlanıyor. Lütfen birkaç saniye sonra tekrar dene.',
  'you cannot be your own guardian': 'Kendi velin olamazsın.',
  'that member is linked to a guardian themselves; pick an adult': 'Seçilen kişinin kendisi bir veliye bağlı. Yetişkin bir üye seç.',
  'no active member with that e-mail; the parent must join the gym first': 'Bu e-postayla aktif bir üye bulunamadı. Velinin önce salona katılması gerekiyor.',
  'the nominated member is no longer available': 'Seçilen veli artık uygun değil.',
  'amounts do not add up to totalAmount': 'Tutarların toplamı genel tutarla uyuşmuyor.',
  'amounts must be positive integer kuruş': 'Tutarlar sıfırdan büyük olmalı.',
  'send {"confirm": true}': 'Hesabı silmek için onay vermen gerekiyor.',
  'class has started': 'Ders başladı.',
  'text too long': 'Metin çok uzun.',
  'text required': 'Metin boş olamaz.',
  'name 1-100': 'Ad 1–100 karakter olmalı.',
  'name required': 'Ad gerekli.',
  'bad email': 'E-posta adresi geçersiz görünüyor.',
  'bad birthDate': 'Doğum tarihi geçerli değil.',
  // ---- members and gym access ----
  'no active membership': 'Bu işlem için salonda aktif bir üyeliğin olması gerekiyor.',
  'no membership in this gym': 'Bu salonda bir üyeliğin yok.',
  'no such request': 'Böyle bir onay isteği bulunamadı.',
  'cannot remove yourself': 'Kendini salondan çıkaramazsın. Ayrılmak için "Salondan ayrıl" seçeneğini kullan.',
  'last admin cannot be removed': 'Bu kişi salonun son yöneticisi. Çıkarmadan önce başka bir yönetici ata.',
  'read-only field': 'Bu bilgi buradan değiştirilemez.',
  // ---- packages, promotions, assignments ----
  'package not found': 'Paket bulunamadı.',
  'promotion not found': 'Kampanya bulunamadı.',
  'package changed; retry': 'Paket az önce değişti. Lütfen sayfayı yenileyip tekrar dene.',
  'cannot reverse': 'Bu ödeme düzeltilemedi: ya bu üyeye ait onaylı bir ödeme değil ya da zaten düzeltilmiş.',
  // ---- package change offers ----
  'current assignment is not an active package of this member': 'Değiştirilmek istenen paket artık üyenin aktif paketi değil.',
  'member, package, current assignment or promotion changed; retry': 'Üyenin, paketin ya da kampanyanın bilgisi az önce değişti. Lütfen tekrar dene.',
  'request is no longer pending': 'Bu teklif artık beklemede değil: yanıtlanmış ya da geri çekilmiş.',
  'offer expired': 'Bu teklifin süresi doldu. Yöneticiden yeni bir teklif isteyebilirsin.',
  'proposed package no longer exists': 'Teklif edilen paket artık mevcut değil.',
  'the package to replace is no longer active': 'Değiştirilecek paket artık aktif değil. Yöneticiden yeni bir teklif iste.',
  'promotion changed; retry': 'Kampanya bilgisi az önce değişti. Lütfen tekrar dene.',
  'package, promotion or current assignment changed; retry': 'Paket, kampanya ya da mevcut paketin az önce değişti. Lütfen tekrar dene.',
  // ---- cancelling an assignment ----
  'assignment already cancelled': 'Bu paket zaten geri alınmış.',
  'assignment already ended or already marked to end': 'Bu paket zaten bitmiş ya da bitişi için işaretlenmiş.',
  'an appointment was booked on this package meanwhile; cancel it first': 'Bu pakete az önce bir randevu alındı. Önce randevuyu iptal et.',
  'assignment changed; retry': 'Paket bilgisi az önce değişti. Lütfen tekrar dene.',
  // ---- freezing ----
  'only a membership package can be frozen': 'Yalnızca üyelik paketleri dondurulabilir.',
  'package is already frozen': 'Bu paket zaten dondurulmuş.',
  'only an active package can be frozen': 'Yalnızca aktif bir paket dondurulabilir.',
  'an ended package cannot be frozen': 'Bitmiş ya da bitişi için işaretlenmiş bir paket dondurulamaz.',
  'this package has no freeze right': 'Bu paketin dondurma hakkı yok.',
  'an expired package cannot be frozen': 'Süresi dolmuş bir paket dondurulamaz.',
  'days (max 365)': 'En fazla 365 gün dondurulabilir.',
  // ---- personal training ----
  'slot_taken': 'Bu saat dolu. Başka bir saat seç.',
  'slot_overlap': 'Bu saat, antrenörün başka bir randevusuyla çakışıyor.',
  'no_credit': 'Bu randevu için kullanılabilir ders hakkın yok.',
  'no_availability': 'Antrenör henüz çalışma saatlerini belirlemedi.',
  'outside_availability': 'Seçtiğin saat antrenörün çalışma saatleri dışında.',
  'trainer_unavailable': 'Seçilen antrenör şu an randevu veremiyor.',
  'member_not_active': 'Üyenin üyeliği aktif değil.',
  'conflict': 'İşlem sırasında kayıt değişti. Lütfen tekrar dene.',
  'already_cancelled': 'Bu randevu zaten iptal edilmiş.',
  'already_completed': 'Bu randevu zaten tamamlanmış.',
  'already_no-show': 'Bu randevu zaten "gelmedi" olarak işaretlenmiş.',
  'already_assigned': 'Randevu zaten bu antrenörde.',
  'session_not_started': 'Henüz başlamamış bir randevu "gelmedi" olarak işaretlenemez.',
  // ---- input a screen can plausibly send wrong ----
  'days': 'Gün sayısı 1 ile 365 arasında olmalı.',
  'reason': 'Gerekçe boş olamaz ve 500 karakteri geçemez.',
  'slot in the past': 'Geçmiş bir saate randevu alınamaz.',
  'duplicate slot': 'Aynı saat birden fazla kez seçilmiş.',
  'a trainer cannot book themselves': 'Antrenör kendine randevu veremez.',
  'viewer must be a trainer': 'Takvim yalnızca başka bir antrenörle paylaşılabilir.',
  'percent > 100': 'Yüzde indirimi 100\'ü geçemez.',
  'bad promotion': 'Kampanya bilgileri geçersiz. Ad, tür, değer, geçerli paketler ve etkin durumunu kontrol et.',
  'value (whole number)': 'Bu kampanya türünde değer tam sayı olmalı.',
  'maxRedemptions': 'Kullanım sınırı sıfırdan büyük bir tam sayı olmalı.',
  'unreadable slot': 'Seçilen saat okunamadı. Lütfen tekrar seç.',
  'at most 20 slots per request': 'Tek seferde en fazla 20 randevu alınabilir.',
  'trainerId and slots required': 'Antrenör ve en az bir saat seçmelisin.',
  'trainerId and memberId required': 'Antrenör ve üye seçmelisin.',
  'durationMinutes': 'Süre geçersiz.',
  'startsAt': 'Başlangıç zamanı geçersiz.',
  'bad class': 'Ders bilgileri eksik ya da geçersiz (ad, kapasite ve zaman gerekli).',
  'bad repeat': 'Tekrar ayarı geçersiz (en fazla 52 hafta).',
  'bad roles': 'Seçilen roller geçersiz.',
  'slotMinutes': 'Randevu süresi 30, 45, 60 ya da 90 dakika olmalı.',
  'weekly': 'Haftalık çalışma saatleri geçersiz.',
  'exceptions': 'İstisna günleri geçersiz.',
  'title 1-80, body <= 600': 'Başlık 1–80, metin en fazla 600 karakter olmalı.',
  'bad image': 'Görsel okunamadı ya da çok büyük. Başka bir görsel dene.',
  'invalid transition': 'Üyenin mevcut durumu bu değişikliğe izin vermiyor.',
};

/** Refusals whose English sentence carries a number: the Turkish one carries it too. */
const DYNAMIC: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\d+) upcoming appointment\(s\) are booked on this package; cancel them first$/, (m) => `Bu pakete bağlı ${m[1]} ileri tarihli randevu var. Önce onları iptal et.`],
  [/^freeze quota used up \((\d+) times\)$/, (m) => `Dondurma hakkın doldu (en fazla ${m[1]} kez dondurulabilir).`],
  [/^a freeze must be at least (\d+) days$/, (m) => `Bir dondurma en az ${m[1]} gün olmalı.`],
];

/** The Turkish sentence for an error code: exact entry, then the numbered ones, then nothing (the caller falls back by status). */
export function messageFor(error: string | undefined): string | undefined {
  if (!error) return undefined;
  if (MESSAGES[error]) return MESSAGES[error];
  for (const [re, f] of DYNAMIC) { const m = error.match(re); if (m) return f(m); }
  return undefined;
}

export const errorMessages = createMiddleware(async (c, next) => {
  await next();
  const res = c.res;
  if (res.status < 400 || !(res.headers.get('content-type') ?? '').includes('application/json')) return;
  const body = (await res.clone().json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!body || typeof body !== 'object' || body.message) return;
  const message = messageFor(body.error) || STATUS_FALLBACK[res.status];
  if (!message) return;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify({ ...body, message }), { status: res.status, headers });
});
