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
  'invalid transition': 'Üyenin mevcut durumu bu değişikliğe izin vermiyor.',
};

export const errorMessages = createMiddleware(async (c, next) => {
  await next();
  const res = c.res;
  if (res.status < 400 || !(res.headers.get('content-type') ?? '').includes('application/json')) return;
  const body = (await res.clone().json().catch(() => null)) as { error?: string; message?: string } | null;
  if (!body || typeof body !== 'object' || body.message) return;
  const message = (body.error && MESSAGES[body.error]) || STATUS_FALLBACK[res.status];
  if (!message) return;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  c.res = new Response(JSON.stringify({ ...body, message }), { status: res.status, headers });
});
