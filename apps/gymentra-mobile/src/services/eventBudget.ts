/**
 * plan.md D-4 — GlitchTip'in ücretsiz katmanı **bütün organizasyon için**
 * ayda 1.000 olay veriyor. Her render'da atan tek bir ekran bunu dakikalar
 * içinde bitirir ve asıl zarar o değil: kota bittikten sonra **hiçbir şey**
 * görünmez, yani gürültülü hata bir sonraki sessiz hatayı da saklar. Kotanın
 * dolduğunu da ancak kimse bir şey bildirmediğinde fark ederiz.
 *
 * Bu yüzden her ayrı arıza birkaç kez raporlanır, sonra susturulur. Sınır
 * **imza başına**, çünkü küresel tek bir sayaç gürültülü bir hatanın sessiz
 * olanı susturmasına izin verirdi — tam kaçınmak istediğimiz şey. Üstündeki
 * oturum tavanı ise patolojik durumu sınırlıyor: her tekrarında *yeni* imza
 * üreten bir döngü (mesajında zaman damgası taşıyan bir hata gibi) imza
 * sınırını hiç görmez.
 *
 * Bu bir **azaltma**, kota garantisi değil: sayaç bellekte durduğu için her
 * yeniden başlatma sıfırdan sayar. Açılışta çöküp çöküp yeniden açılan bir
 * uygulama hâlâ olay harcar; onu ancak GlitchTip tarafındaki kısıtlama ve
 * kota uyarısı yakalar (panelden açılmalı, DSN o ayarı yönetemiyor).
 */

/** Sentry olayının yalnızca imza için gereken kadarı — SDK tipine bağlanmadan test edilebilsin diye. */
export interface BudgetedEvent {
  exception?: { values?: { type?: string; value?: string }[] };
  message?: string;
}

export interface EventBudgetLimits {
  /** Aynı imzadan en çok kaç olay gönderilir. */
  perSignature: number;
  /** Oturum boyunca toplam tavan; yeni imza üreten döngülere karşı. */
  perSession: number;
}

/**
 * Üçü de gerekli: `type` "TypeError" ile "RangeError"ı ayırır, `value` aynı
 * türün farklı sebeplerini, `message` ise istisna taşımayan
 * `captureMessage` olaylarını. Hiçbiri yoksa tek bir kovaya düşerler —
 * ayırt edilemeyen olayları ayrı saymak, sınırı hiç uygulamamak olurdu.
 */
export function signatureOf(event: BudgetedEvent): string {
  const first = event.exception?.values?.[0];
  if (first) return `${first.type ?? '?'}|${first.value ?? '?'}`;
  return `msg|${event.message ?? '?'}`;
}

export const DEFAULT_LIMITS: EventBudgetLimits = { perSignature: 3, perSession: 25 };

/**
 * Gönderilmeli mi diye sorulan bir kapı döndürür. Sayaçlar kapanışta
 * yaşıyor, yani her `Sentry.init` kendi bütçesini alıyor ve testler
 * birbirine sızmıyor.
 */
export function createEventBudget(limits: EventBudgetLimits = DEFAULT_LIMITS): (event: BudgetedEvent) => boolean {
  const seen = new Map<string, number>();
  let sent = 0;

  return function allow(event: BudgetedEvent): boolean {
    if (sent >= limits.perSession) return false;

    const signature = signatureOf(event);
    // Sayaç reddedilen olaylar için de artıyor: susturduktan sonra saymayı
    // bırakırsak sayı sınırın altına düşmez ama niyet de belirsizleşir —
    // "bu imzadan kaç kez geldi" sorusunun cevabı burada duruyor.
    const count = (seen.get(signature) ?? 0) + 1;
    seen.set(signature, count);
    if (count > limits.perSignature) return false;

    sent += 1;
    return true;
  };
}
