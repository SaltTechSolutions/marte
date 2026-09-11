'use strict';

/**
 * Program şablonlarının BİLİMSEL DÜRÜSTLÜK denetimi.
 *
 * Biçim denetimi değil bu — şablonun biçimi zaten `SCHEMA.md`'de ve
 * `firestore.rules`'ta. Buradaki dört kural, dosyanın kullanıcıya NE SÖYLEDİĞİNE
 * bakıyor:
 *
 *   1. `limits` boş olamaz. Bir şablon ne YAPMADIĞINI yazmadan yayına giremez;
 *      yazılmayan sınırı üye kendi hayal gücüyle dolduruyor.
 *   2. Yanlış yönlendiren ifade yasak — ama yalnızca İDDİA edilirken. Aynı
 *      ifadeyi İNKÂR eden cümle serbest, çünkü ürünün dürüstlüğü tam olarak o
 *      cümlelerde yaşıyor ("bölgesel yağ kaybı yoktur").
 *   3. Her şablon kaynak göstermek zorunda ve gösterdiği anahtar kök
 *      kaynakçada gerçekten bulunmak zorunda.
 *   4. Hipertrofi şablonu, hedef aldığı her kasa haftada en az
 *      `MIN_WEEKLY_SETS` birincil set vermek zorunda. "Kol kalınlaştırma" adlı
 *      ama haftada dört set kol çalıştıran bir şablon adının vaat ettiğini
 *      yapmıyor demektir — ve bunu gözle fark etmek zor, çünkü liste dolu
 *      görünüyor.
 *
 * ## Nereden geldi
 *
 * Bu kurallar `uzak-diz-ters-bukulme` dalındaki hazır paket programlarda
 * (`validateProgrammes`) yazılmıştı ve orada gerçek bir hata yakalamıştı:
 * yazarının kendi kalça-bacak paketinde arka bacak haftada 7 sette kalmış.
 * 11 Eylül 2026'da iki program modelinden `program_templates`'in kalmasına
 * karar verildi; kurallar o modelin sözlüğüne çevrilerek buraya taşındı.
 *
 * ## Ne aynı DEĞİL
 *
 * - Öbür modelin `evidence: [{claim, basis}]` alanı taşınmadı. Burada aynı işi
 *   `sources` + kök kaynakça yapıyor ve daha iyi yapıyor: serbest metin değil,
 *   18 künyelik ortak listeye çözülen anahtarlar. Kural künyenin VARLIĞINI
 *   denetliyor (madde 3).
 * - Yasak ifade kuralı orada yalnızca `name`/`promise` alanlarına bakıyordu,
 *   çünkü o modelde inkâr metni ayrı bir alanda (`limits`) duruyordu. Burada
 *   `summary` hem vaadi hem inkârı taşıyor (ölçüldü: 19 şablonun metninde
 *   yasaklı kalıp 10 kez geçiyor ve ONUNU DA inkâr cümlesi). Alan muaf tutmak
 *   yerine cümle inkâr ediyor mu diye bakılıyor — koruma daha geniş, çünkü
 *   üyenin gerçekten okuduğu alan `summary`.
 */

const fs = require('fs');
const path = require('path');

const MUSCLES_PATH = path.resolve(__dirname, 'exercise_muscles.json');

/**
 * Kullanıcıyı yanlış yönlendiren ifadeler.
 *
 * Üslup tercihi değil: her biri fizyolojide karşılığı olmayan ya da kanıtın
 * söylediğinden fazlasını söyleyen bir iddia. En önemlisi BÖLGESEL YAĞ KAYBI —
 * bir bölgeyi çalıştırmak o bölgenin yağını azaltmıyor (Vispute 2011, Kostek
 * 2007), ama "karın eritme programı" satmanın en kolay yolu tam olarak bunu
 * ima etmek. Yasağı koda bağlamak iyi niyete bağlamaktan güvenli: metni yazan
 * kişi altı ay sonra başkası olacak.
 *
 * Türkçe ek alıyor, o yüzden düz alt dizge yetmiyor: "yağ yak" araması "karın
 * yağını yakar" cümlesini kaçırıyor. `\w` de yetmiyor — JavaScript'te ASCII
 * demek, yani "yağı"nın "ı"sını görmüyor. Harf sınıfı `\p{L}` ve `u` bayrağı
 * şart.
 */
const BANNED = [
  { re: /bölgesel\s*(yağ|incel|zayıfla)/u, label: 'bölgesel yağ kaybı iması' },
  { re: /yağ\p{L}*\s*(yak|erit|söktür)/u, label: 'yağ yakma vaadi' },
  { re: /(göbek|karın|basen|bel)\p{L}*\s*(erit|incelt)/u, label: 'bölgesel inceltme vaadi' },
  { re: /incelt\p{L}*/u, label: 'inceltme vaadi' },
  { re: /selülit/u, label: 'selülit vaadi' },
  { re: /detoks|toksin/u, label: 'detoks iddiası' },
  { re: /metabolizma\p{L}*\s*hızlandır/u, label: 'metabolizma hızlandırma iddiası' },
  { re: /garanti|kesinlikle|mucize|anında\s*sonuç/u, label: 'aşırı kesinlik' },
];

/**
 * İnkâr işaretleri — yasaklı kalıbı taşıyan cümleyi serbest bırakan şey.
 *
 * `-mez/-maz` eki kasten geniş: "yakmaz", "eritilemez", "seçmez". Geniş olması
 * kuralı GEVŞETİR (yanlışlıkla serbest bırakır), sıkılaştırmaz — yani hata
 * yönü güvenli tarafta. Karşılığında testte gerçek bir vaadin hâlâ
 * ateşlediğini kanıtlayan bir prob var; olmasaydı bu liste kuralı sessizce
 * öldürebilirdi.
 */
const DENIAL = /\bdeğil|\byok|aksine|sanılanın|\p{L}+m[ae]z\b/u;

/**
 * Hipertrofi hedefi için haftalık en az birincil set.
 *
 * Doz-yanıt meta-analizleri haftada 10+ setin daha azından daha çok büyüme
 * verdiğini gösteriyor (Schoenfeld 2016). Kuralın yakaladığı şey bu eşiğin
 * altında kalan bir vaat: adı "kol kalınlaştırma" olup kola haftada dört set
 * ayıran şablon.
 *
 * ## ÜST SINIR KASTEN YOK
 *
 * Geldiği yerde (paket programların `validateProgrammes`'i) bir de 40 setlik
 * tavan vardı. Buraya taşınmadı, çünkü bu veride ÖLÇÜLDÜ ve yanlış ateşledi:
 * `abs-beginner` 20 dakikalık tek bir blok, altı hareket, günde 17 set — ve
 * altı hareketin neredeyse hepsi kas haritasında "Karın (orta)"yı birincil
 * sayıyor, o yüzden sayım haftada 51 set çıkarıyor. Bu sayı antrenman hacmini
 * değil haritanın örtüşmesini ölçüyor.
 *
 * Sayım zaten YUKARI YANLI: bileşik bir hareket setinin tamamı, birincil
 * saydığı HER kasa yazılıyor. Alt sınırda bu yanlılık güvenli tarafta —
 * eşiğin altında kalan gerçekten az çalışıyordur. Üst sınırda değil: orada
 * yanlılık doğrudan yanlış suçlamaya dönüyor. İlk gerçek veride yanlış
 * ateşleyen bir kuralı taşımak, taşımamaktan kötü; tavanın arkasındaki kanıt
 * da alt sınırınkinden çok daha zayıf.
 *
 * Toparlanma korkuluğu bugün başka yerde: şablonun `durationMinutes`'ı ve
 * antrenörün atama öncesi gözden geçirmesi.
 */
const MIN_WEEKLY_SETS = 10;

/** Cümleye böl: yasaklı kalıbın inkâr edilip edilmediği cümle düzeyinde bakılıyor. */
const sentences = (s) => s.split(/(?<=[.!?;])\s+|\s+—\s+|\n+/u).filter((x) => x.trim() !== '');

/**
 * Şablonları denetler; sorun listesi döndürür (boş dizi = temiz).
 *
 * @param seed  `program_templates.seed.json`'ın çözülmüş hâli
 * @param mus   `exercise_muscles.json`; verilmezse diskten okunur
 */
function auditTemplates(seed, mus) {
  const errs = [];
  if (!seed || typeof seed !== 'object') return ['kök nesne bekleniyor'];
  if (!Array.isArray(seed.templates) || seed.templates.length === 0) return ['templates boş'];
  if (!seed.sources || typeof seed.sources !== 'object') return ['kök sources (kaynakça) yok'];

  const M = mus ?? JSON.parse(fs.readFileSync(MUSCLES_PATH, 'utf8'));
  const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

  seed.templates.forEach((t) => {
    const id = (t && t.id) || '(kimliksiz)';
    const bad = (msg) => errs.push(`şablon "${id}": ${msg}`);
    if (!t || typeof t !== 'object') return bad('nesne değil');

    // 1 — sınırlar boş bırakılamaz.
    if (!Array.isArray(t.limits) || t.limits.length === 0) {
      bad('limits boş olamaz — şablon ne YAPMADIĞINI da yazmak zorunda');
    } else if (!t.limits.every(nonEmpty)) {
      bad('limits boş olmayan metinlerden oluşmalı');
    }

    // 2 — yanlış yönlendiren ifade; inkâr eden cümle serbest.
    //
    // `goal.wants` KASTEN muaf: orası üyenin kendi dili ("Karnım incelsin").
    // Ürünün tasarımı bu — üye popüler talebiyle seçer, uygulama onu dürüst
    // adlı şablona götürür ve nedenini `goal.because`'ta söyler. Talebi
    // yasaklamak ürünü sessizleştirirdi, vaadi yasaklamak dürüst tutuyor.
    const görünür = [
      ['title', t.title],
      ['summary', t.summary],
      ['progression', t.progression],
      ['goal.because', t.goal && t.goal.because],
      ...(Array.isArray(t.notes) ? t.notes.map((n, i) => [`notes[${i}]`, n]) : [['notes', t.notes]]),
      ...(Array.isArray(t.limits) ? t.limits.map((n, i) => [`limits[${i}]`, n]) : []),
    ];
    görünür.forEach(([alan, metin]) => {
      if (typeof metin !== 'string') return;
      sentences(metin).forEach((c) => {
        const low = c.toLocaleLowerCase('tr');
        if (DENIAL.test(low)) return;
        BANNED.forEach(({ re, label }) => {
          const hit = low.match(re);
          if (hit) bad(`${alan} yanlış yönlendiren ifade içeriyor (${label}): "${hit[0]}" — cümle: "${c.trim()}"`);
        });
      });
    });

    // 3 — kaynak göstermek zorunlu ve künye gerçekten var olmalı.
    if (!Array.isArray(t.sources) || t.sources.length === 0) bad('sources boş olamaz');
    else t.sources.forEach((k) => {
      if (!nonEmpty(k)) bad('sources boş olmayan anahtarlardan oluşmalı');
      else if (!(k in seed.sources)) bad(`sources "${k}" kök kaynakçada yok`);
    });

    // 4 — hipertrofi hacmi.
    const günler = Array.isArray(t.days) ? t.days : [];
    if (t.category !== 'hypertrophy') return;

    if (!Number.isFinite(t.sessionsPerWeek) || t.sessionsPerWeek < 1 || t.sessionsPerWeek > 14) {
      return bad('hipertrofi şablonu sayısal sessionsPerWeek yazmak zorunda (1..14) — hacim başka türlü hesaplanamaz');
    }
    const tur = günler.length > 0 ? t.sessionsPerWeek / günler.length : NaN;
    if (!Number.isInteger(tur) || tur < 1) {
      return bad(`sessionsPerWeek (${t.sessionsPerWeek}) gün sayısının (${günler.length}) tam katı olmalı — yoksa haftanın nasıl geçeceği belirsiz`);
    }
    if (!Array.isArray(t.targets) || t.targets.length === 0) {
      return bad('hipertrofi şablonu targets yazmak zorunda — hacim başka türlü denetlenemez');
    }

    const haftalık = {};
    günler.forEach((d, di) => {
      (Array.isArray(d.exercises) ? d.exercises : []).forEach((x, xi) => {
        if (!(x.name in M.alias)) return bad(`days[${di}].exercises[${xi}] "${x.name}" kas eşleme tablosunda yok — hacim sayılamıyor`);
        const hid = M.alias[x.name];
        if (hid === null) return; // Kasten karşılıksız satır (germe, mobilite).
        (M.primary[hid] ?? []).forEach((mu) => {
          haftalık[mu] = (haftalık[mu] ?? 0) + x.sets * tur;
        });
      });
    });

    t.targets.forEach((mu) => {
      if (!(mu in M.labels)) return bad(`targets "${mu}" kas sözlüğünde yok`);
      const n = haftalık[mu] ?? 0;
      const ad = M.labels[mu];
      if (n < MIN_WEEKLY_SETS) bad(`"${ad}" haftada ${n} birincil set alıyor, en az ${MIN_WEEKLY_SETS} gerekiyor — şablon adının vaat ettiğini yapmıyor`);
    });
  });

  return errs;
}

module.exports = { auditTemplates, BANNED, DENIAL, MIN_WEEKLY_SETS, MUSCLES_PATH };
