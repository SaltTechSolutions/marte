import { B, RigExercise, RigPose } from './rig';
import { MUSCLES } from './muscles';

/**
 * Kare verisinin biçim denetimi.
 *
 * `rigAudit.ts` hareketin MEKANİĞİNİ denetler; burası verinin ŞEKLİNİ. İkisi
 * ayrı sorular: mekanik denetim, elinde düzgün biçimli bir hareket olduğunu
 * varsayar — `mode: "supin"` yazan bir JSON ona hiç ulaşamaz, `CONTACTS[mode]`
 * `undefined` gelir ve motor `undefined.length` ile patlar.
 *
 * Kurallar tek yerde çünkü iki yerden okunuyorlar: yüklerken (`archetypes.ts`,
 * yani testler) ve kaydederken (editör sunucusu). Ayrı yazılsalardı editör
 * testlerin reddettiği veriyi diske yazabilirdi — nitekim yazabiliyordu.
 */

const MODES = ['stand', 'quad', 'bench', 'supine', 'hang'];
const ARMS = ['angles', 'ik', 'floor'];
const BARS = ['back', 'hands', 'hips'];
const PROPS = ['bench', 'box', 'bar', 'hipbench'];
const LOADS = ['barbell', 'dumbbell', 'band'];
const VIEWS = ['side', 'front'];

/** `fillPose` bu alanları tanıyor; gerisi sessizce yok sayılırdı. */
const POSE_KEYS: (keyof RigPose)[] = [
  'shinA', 'thighA', 'torso', 'thoraxA', 'neckA', 'upperA', 'foreA',
  'hx', 'hy', 'thighF', 'shinF', 'upperF', 'foreF', 'armAz', 'armAzF', 'foreAz', 'foreAzF', 'shLift', 'toe', 'toeF', 'ankleLift',
  // Ayak bileği eklem açısı, taraf başına. Bkz. `RigPose.ankle`.
  'ankle', 'ankleF',
];

const EXERCISE_KEYS = ['mode', 'arm', 'bar', 'bend', 'dur', 'load', 'hideFarLeg', 'hideFarArm', 'view', 'prop', 'note', 'kf'];

/**
 * Bir tekrarın en kısa süresi (ms). Testler de bunu okuyor: editörün daha
 * gevşek davranması, orada kaydedilip burada düşen veri demekti.
 */
export const MIN_DUR = 2000;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Bulunan her kusuru döndürür — ilkinde durmaz. Elle düzenlenmiş bir dosyada
 * hataları teker teker keşfetmek, hepsini bir kerede görmekten yavaş.
 */
export function validateArchetypes(data: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(data)) return ['kök nesne bekleniyor'];
  const keys = Object.keys(data);
  if (keys.length === 0) return ['boş veri — en az bir arketip olmalı'];

  keys.forEach((key) => {
    const e = data[key];
    const bad = (msg: string) => errs.push(`${key}: ${msg}`);
    if (!isObj(e)) return bad('nesne değil');

    Object.keys(e).forEach((k) => {
      if (!EXERCISE_KEYS.includes(k)) bad(`bilinmeyen alan "${k}"`);
    });

    if (!MODES.includes(e.mode as string)) bad(`mode "${String(e.mode)}" geçersiz (${MODES.join(', ')})`);
    if (!ARMS.includes(e.arm as string)) bad(`arm "${String(e.arm)}" geçersiz (${ARMS.join(', ')})`);
    if (e.bar !== null && !BARS.includes(e.bar as string)) bad(`bar "${String(e.bar)}" geçersiz (null, ${BARS.join(', ')})`);
    if (e.bend !== 1 && e.bend !== -1) bad(`bend ${String(e.bend)} geçersiz (+1 ya da -1)`);
    if (!num(e.dur) || e.dur <= MIN_DUR) bad(`dur ${String(e.dur)} geçersiz (${MIN_DUR}ms üstü olmalı)`);
    if (e.load !== undefined && !LOADS.includes(e.load as string)) bad(`load "${String(e.load)}" geçersiz`);
    if (e.prop !== undefined && e.prop !== null && !PROPS.includes(e.prop as string)) bad(`prop "${String(e.prop)}" geçersiz`);
    if (e.view !== undefined && !VIEWS.includes(e.view as string)) bad(`view "${String(e.view)}" geçersiz`);
    if (e.note !== undefined && typeof e.note !== 'string') bad('note metin olmalı');
    (['hideFarLeg', 'hideFarArm'] as const).forEach((k) => {
      if (e[k] !== undefined && typeof e[k] !== 'boolean') bad(`${k} doğru/yanlış olmalı`);
    });

    if (!Array.isArray(e.kf)) return bad('kf dizisi yok');
    if (e.kf.length < 2) bad('en az iki kare olmalı');

    e.kf.forEach((k: unknown, i: number) => {
      if (!isObj(k)) return bad(`kf[${i}] nesne değil`);
      if (!num(k.t) || k.t < 0 || k.t > 1) bad(`kf[${i}].t ${String(k.t)} geçersiz (0..1)`);
      if (typeof k.tr !== 'string') bad(`kf[${i}].tr metin olmalı`);
      if ('plantF' in k && typeof k.plantF !== 'boolean') bad(`kf[${i}].plantF doğru/yanlış olmalı`);
      if (!isObj(k.p)) return bad(`kf[${i}].p nesne değil`);
      Object.entries(k.p).forEach(([f, v]) => {
        if (!POSE_KEYS.includes(f as keyof RigPose)) bad(`kf[${i}].p bilinmeyen alan "${f}"`);
        else if (!num(v)) bad(`kf[${i}].p.${f} sayı olmalı`);
      });
    });

    // Uçlar döngünün tanımı: hareket sonsuz dönüyor, t=1 ile t=0 aynı ana
    // denk gelmezse her tekrarın başında figür zıplıyor.
    const first = e.kf[0] as { t?: unknown };
    const last = e.kf[e.kf.length - 1] as { t?: unknown };
    if (first && first.t !== 0) bad(`ilk kare t=${String(first.t)}, 0 olmalı`);
    if (last && last.t !== 1) bad(`son kare t=${String(last.t)}, 1 olmalı`);
    for (let i = 1; i < e.kf.length; i++) {
      const a = (e.kf[i - 1] as { t: number }).t;
      const b = (e.kf[i] as { t: number }).t;
      if (num(a) && num(b) && b < a) bad(`kf[${i}] zamanı geriye gidiyor (${a} → ${b})`);
    }

    // Topuk kalkışı ayağın boyuyla sınırlı; basamakta yükselten şey ayak değil.
    if (e.mode === 'stand' && e.prop !== 'box') {
      e.kf.forEach((k: unknown, i: number) => {
        const lift = isObj(k) && isObj(k.p) ? k.p.ankleLift : undefined;
        if (num(lift) && (lift < 0 || lift > B.foot)) bad(`kf[${i}].p.ankleLift ${lift} sınır dışı (0..${B.foot})`);
      });
    }
  });

  return errs;
}

/** Geçersiz veriyle devam etmek anlamsız: motor birkaç satır sonra patlıyor. */
export function assertArchetypes(data: unknown): Record<string, RigExercise> {
  const errs = validateArchetypes(data);
  if (errs.length) throw new Error(`rigArchetypes.json geçersiz:\n  ${errs.join('\n  ')}`);
  return data as Record<string, RigExercise>;
}

/* ------------------------------------------------------------------------ *
 * Hareket kataloğu ve kas verisi
 * ------------------------------------------------------------------------ */

/** Kimlikler ASCII slug: URL'de, dosya adında ve anahtar olarak sorun çıkarmaz. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const CATALOG_KEYS = ['name', 'archetype'];
const MUSCLE_KEYS = ['status', 'primary', 'secondary', 'source', 'reviewed'];
const STATUSES = ['pending', 'authored'];

const strList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Hareket kataloğu: kimlik → görünen ad + hangi arketiple çizildiği.
 *
 * Kimlikleri bu depo sahipleniyor. `data/exerciseNames.json` yalnızca
 * `{arketip: [ad]}` tutuyordu ve 34 hareketin stabil bir anahtarı yoktu; kas
 * verisini görünen ada bağlamak, adı düzelten ilk kişide veriyi sahipsiz
 * bırakırdı.
 */
export function validateExercises(data: unknown, archetypeKeys: string[]): string[] {
  const errs: string[] = [];
  if (!isObj(data)) return ['hareket kataloğu: kök nesne bekleniyor'];
  const keys = Object.keys(data);
  if (keys.length === 0) return ['hareket kataloğu boş'];

  keys.forEach((id) => {
    const bad = (msg: string) => errs.push(`hareket "${id}": ${msg}`);
    if (!SLUG.test(id)) bad('kimlik küçük harf ASCII slug olmalı (a-z, 0-9, tire)');
    const e = data[id];
    if (!isObj(e)) return bad('nesne değil');
    Object.keys(e).forEach((k) => {
      if (!CATALOG_KEYS.includes(k)) bad(`bilinmeyen alan "${k}"`);
    });
    if (typeof e.name !== 'string' || e.name.trim() === '') bad('name boş olmayan metin olmalı');
    if (typeof e.archetype !== 'string') bad('archetype metin olmalı');
    else if (!archetypeKeys.includes(e.archetype)) bad(`archetype "${e.archetype}" rigArchetypes.json'da yok`);
  });

  // Aynı adın iki kimliğe düşmesi, katalogda bir kopyanın kaçtığını gösterir.
  const names = keys.map((k) => (isObj(data[k]) ? data[k].name : undefined)).filter((n) => typeof n === 'string');
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  [...new Set(dupes)].forEach((n) => errs.push(`hareket adı "${String(n)}" birden fazla kimlikte`));

  return errs;
}

/**
 * Kas verisi.
 *
 * AYRI DOSYA olduğu için anahtar sürüklenmesine açık: `walking-lunge` yerine
 * `walking-lunges` yazmak iki dosyayı da tek başına geçerli bırakır ve
 * kullanıcı boş kas şeması görür. Bu yüzden anahtar kümesi katalogla BİREBİR
 * eşit olmak zorunda — kararın (`d7ad5288`) zorunlu kıldığı azaltma bu.
 *
 * Yazılmamış hareketler dosyada `status: "pending"` olarak DURUYOR, yok
 * sayılmıyor: bir kaydın sessizce düşmesi ile hiç yazılmamış olması aynı
 * görünmemeli.
 */
export function validateMuscles(data: unknown, exerciseKeys: string[]): string[] {
  const errs: string[] = [];
  if (!isObj(data)) return ['kas verisi: kök nesne bekleniyor'];

  const keys = Object.keys(data);
  const eksik = exerciseKeys.filter((k) => !keys.includes(k));
  const fazla = keys.filter((k) => !exerciseKeys.includes(k));
  if (eksik.length) errs.push(`kas verisi eksik hareket: ${eksik.join(', ')}`);
  if (fazla.length) errs.push(`kas verisinde katalogda olmayan hareket: ${fazla.join(', ')}`);

  keys.forEach((id) => {
    const bad = (msg: string) => errs.push(`kas verisi "${id}": ${msg}`);
    const m = data[id];
    if (!isObj(m)) return bad('nesne değil');
    Object.keys(m).forEach((k) => {
      if (!MUSCLE_KEYS.includes(k)) bad(`bilinmeyen alan "${k}"`);
    });
    if (typeof m.status !== 'string' || !STATUSES.includes(m.status)) {
      bad(`status "${String(m.status)}" geçersiz (${STATUSES.join(', ')})`);
    }
    // Yerel değişkene bağlanıyor: tip daraltması özellik erişiminde değil
    // yerelde çalışıyor.
    const primary = m.primary;
    const secondary = m.secondary;
    if (!strList(primary)) return bad('primary metin dizisi olmalı');
    if (!strList(secondary)) return bad('secondary metin dizisi olmalı');

    ([['primary', primary], ['secondary', secondary]] as [string, string[]][]).forEach(([which, list]) => {
      list.forEach((id2) => {
        if (!MUSCLES[id2]) bad(`${which}: bilinmeyen kas "${id2}"`);
      });
      const dup = list.filter((x, i) => list.indexOf(x) !== i);
      [...new Set(dup)].forEach((x) => bad(`${which}: "${x}" iki kez yazılmış`));
    });
    primary.filter((x) => secondary.includes(x)).forEach((x) => bad(`"${x}" hem birincil hem ikincil`));

    if (m.status === 'authored') {
      if (primary.length === 0) bad('authored ama birincil kas yazılmamış');
      if (typeof m.source !== 'string' || m.source.trim() === '') bad('authored ama source (kaynak notu) yok');
      // `reviewed` bilerek zorunlu: verinin nereden geldiği kadar KİM
      // DOĞRULADIĞI da kayıtta dursun. Uygulama aynı disiplini pozlar için
      // `poseReviewed` ile uyguluyor; kas verisi de aynı soruyu hak ediyor.
      if (typeof m.reviewed !== 'boolean') bad('authored ama reviewed (uzman doğruladı mı) yazılmamış');
    } else {
      if (primary.length || secondary.length) bad('pending ama kas yazılmış — status authored olmalı');
      if (m.source !== undefined) bad('pending ama source yazılmış');
      if (m.reviewed !== undefined) bad('pending ama reviewed yazılmış');
    }
  });

  return errs;
}

/**
 * Devir paketinin tamamı. `export` ve editör kaydetmesi bunu çağırıyor:
 * doğrulama ÜRETİM ZAMANINDA yapılıyor, uygulama runtime'da hiçbir şey
 * kontrol etmiyor ve kas verisini kinematik olmadan yükleyebiliyor.
 */
export function validateBundle(b: {
  archetypes: unknown;
  exercises: unknown;
  muscles: unknown;
  anatomy?: unknown;
  bodyParts?: unknown;
  programmes?: unknown;
}): string[] {
  const errs = validateArchetypes(b.archetypes);
  const archetypeKeys = isObj(b.archetypes) ? Object.keys(b.archetypes) : [];
  errs.push(...validateExercises(b.exercises, archetypeKeys));
  const exerciseKeys = isObj(b.exercises) ? Object.keys(b.exercises) : [];
  errs.push(...validateMuscles(b.muscles, exerciseKeys));
  if (b.anatomy !== undefined) errs.push(...validateAnatomy(b.anatomy));
  if (b.bodyParts !== undefined) errs.push(...validateBodyParts(b.bodyParts, B));
  if (b.programmes !== undefined) errs.push(...validateProgrammes(b.programmes, exerciseKeys, b.muscles));
  return errs;
}

/**
 * Kas haritasının anatomi yolları.
 *
 * Yollar gövdenin YARISINI çiziyor; diğer yarı aynı yolların ayna dönüşümüyle
 * çiziliyor. Bu bir boyut hilesi değil: sol ve sağ tarafın garanti simetrik
 * kalmasını sağlıyor, yani bir gölgelendirme düzeltmesi asla tek tarafa inemez.
 *
 * Denetlenen şey çizimin güzelliği değil BÜTÜNLÜĞÜ: her yolun bir `d`'si var
 * mı, kasa bağlı yolların kimliği sözlükte var mı, ve her kasın en az bir yolu
 * var mı. Sonuncusu önemli: sözlükte olup yolu olmayan bir kas, veride
 * yazılabilir ama ekranda hiç boyanmaz — sessiz bir kayıp.
 */
export function validateAnatomy(data: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(data)) return ['anatomi: kök nesne bekleniyor'];
  if (typeof data.viewBox !== 'string' || !data.viewBox.trim()) errs.push('anatomi: viewBox yok');
  if (typeof data.mirror !== 'string' || !data.mirror.trim()) errs.push('anatomi: mirror dönüşümü yok');

  const seen = new Set<string>();
  (['front', 'back'] as const).forEach((view) => {
    const list = data[view];
    if (!Array.isArray(list) || list.length === 0) return errs.push(`anatomi: ${view} yol dizisi yok`);
    list.forEach((p: unknown, i: number) => {
      const at = `anatomi ${view}[${i}]`;
      if (!isObj(p)) return errs.push(`${at}: nesne değil`);
      Object.keys(p).forEach((k) => {
        if (k !== 'd' && k !== 'muscle') errs.push(`${at}: bilinmeyen alan "${k}"`);
      });
      if (typeof p.d !== 'string' || p.d.trim() === '') errs.push(`${at}: d boş`);
      if (p.muscle === null || p.muscle === undefined) return;
      if (typeof p.muscle !== 'string') return errs.push(`${at}: muscle metin ya da null olmalı`);
      if (!MUSCLES[p.muscle]) errs.push(`${at}: bilinmeyen kas "${p.muscle}"`);
      else seen.add(p.muscle);
    });
  });

  Object.keys(MUSCLES)
    .filter((id) => !seen.has(id))
    .forEach((id) => errs.push(`anatomi: "${id}" sözlükte var ama hiçbir yolu yok — veride yazılabilir, ekranda boyanmaz`));

  return errs;
}

/**
 * Uzuv siluet parçaları.
 *
 * Parçalar YEREL uzayda: kemik (0,0)'dan (0,len)'e uzanır. Denetlenen şey
 * çizimin güzelliği değil SÖZLEŞMEye uyması: parça adı gerçek bir kemik mi ve
 * `len` o kemiğin boyuyla aynı mı. Boy uyuşmazsa parça kemiğinden kısa ya da
 * uzun çizilir ve eklemde boşluk açılır — sessiz bir kusur, çünkü figür yine
 * de çizilir.
 *
 * Parçalar MakeHuman CC0 mesh'inden üretiliyor (`npm run parts:mesh`); yan
 * (`parts`) ve ön (`front`) set aynı kurala tabi.
 */
export function validateBodyParts(data: unknown, bones: Record<string, number>): string[] {
  const errs: string[] = [];
  if (!isObj(data)) return ['uzuv parçaları: kök nesne bekleniyor'];
  const parts = data.parts;
  if (!isObj(parts)) return ['uzuv parçaları: parts nesnesi yok'];
  if (Object.keys(parts).length === 0) errs.push('uzuv parçaları: parts boş');

  Object.keys(parts).forEach((name) => {
    const bad = (msg: string) => errs.push(`uzuv parçası "${name}": ${msg}`);
    const q = parts[name];
    if (!isObj(q)) return bad('nesne değil');
    Object.keys(q).forEach((k) => {
      if (k !== 'len' && k !== 'd') bad(`bilinmeyen alan "${k}"`);
    });
    if (typeof q.d !== 'string' || q.d.trim() === '') bad('d boş');
    if (!num(q.len)) return bad('len sayı olmalı');
    if (!(name in bones)) bad(`"${name}" bir kemik adı değil (${Object.keys(bones).join(', ')})`);
    else if (q.len !== bones[name]) bad(`len ${q.len}, kemik boyu ${bones[name]} — eklemde boşluk açılır`);
  });

  // Önden set: `scripts/mesh-silhouette.mjs --az 90` üretiyor. İsteğe bağlı —
  // yoksa önden görünüm kapsülle çizilir. Varsa YAN SETLE AYNI parçaları
  // taşımak zorunda: eksik bir parça figürü çizilmez yapmıyor, o uzvu kapsülle
  // bırakıp ötekileri siluetle çiziyor — yani sessizce karışık bir figür.
  const fr = data.front;
  if (fr !== undefined) {
    if (!isObj(fr)) errs.push('uzuv parçaları: front nesne değil');
    else {
      const fp = fr.parts;
      if (!isObj(fp)) errs.push('front: parts nesnesi yok');
      else {
        const yan = Object.keys(parts).sort().join(',');
        const on = Object.keys(fp).sort().join(',');
        if (yan !== on) errs.push(`front: parça kümesi yan setle aynı olmalı (yan: ${yan} · ön: ${on})`);
        Object.keys(fp).forEach((name) => {
          const bad = (msg: string) => errs.push(`ön parça "${name}": ${msg}`);
          const q = fp[name];
          if (!isObj(q)) return bad('nesne değil');
          Object.keys(q).forEach((k) => { if (k !== 'len' && k !== 'd') bad(`bilinmeyen alan "${k}"`); });
          if (typeof q.d !== 'string' || q.d.trim() === '') bad('d boş');
          if (!num(q.len)) return bad('len sayı olmalı');
          if (name in bones && q.len !== bones[name]) bad(`len ${q.len}, kemik boyu ${bones[name]}`);
        });
      }
    }
  }
  return errs;
}

/* --- hazır paket programlar ---------------------------------------------- */

const GOALS = ['guc', 'hipertrofi', 'dayaniklilik', 'hareketlilik'];
const LEVELS = ['baslangic', 'orta', 'ileri'];
const PROGRAMME_KEYS = [
  'name', 'goal', 'level', 'weeks', 'sessionsPerWeek', 'minutes', 'equipment',
  'targets', 'promise', 'limits', 'progression', 'evidence', 'days', 'reviewed',
];
const DAY_KEYS = ['id', 'name', 'warmup', 'exercises'];
const SET_KEYS = ['id', 'sets', 'reps', 'restSec', 'note'];

/** "8", "6-10", "30 sn", "40 m" — sayı, aralık, süre ya da mesafe. */
const REPS = /^(\d{1,3}(-\d{1,3})?|\d{1,3} (sn|dk|m))$/;

/**
 * Kullanıcıyı yanlış yönlendiren ifadeler — vaatlerde ve sınırlarda YASAK.
 *
 * Bunlar üslup tercihi değil: her biri fizyolojide karşılığı olmayan ya da
 * kanıtın söylediğinden fazlasını söyleyen bir iddia. En önemlisi BÖLGESEL
 * YAĞ KAYBI: bir bölgeyi çalıştırmak o bölgenin yağını azaltmıyor, ama
 * "karın eritme programı" satmanın en kolay yolu tam olarak bunu ima etmek.
 * Yasağı koda bağlamak, iyi niyete bağlamaktan güvenli — metni yazan kişi
 * altı ay sonra başkası olacak.
 *
 * Sınır metinlerinde bu ifadeler İNKÂR EDİLİRKEN geçebilir ("bölgesel yağ
 * kaybı diye bir şey yok"), o yüzden kural yalnızca `promise` ve `name`
 * alanlarına bakıyor; `limits` zaten sınırı anlatmak için var.
 */
const BANNED: { re: RegExp; label: string }[] = [
  // Düz alt dizge YETMİYOR: Türkçe ek alıyor. "yağ yak" araması "karın yağını
  // yakar" cümlesini kaçırıyordu. `\w` de yetmiyor — JavaScript'te ASCII
  // demek, yani "yağı"nın "ı"sını görmüyor. Harf sınıfı `\p{L}` ve `u` bayrağı
  // şart; ikisi de ölçülerek bulundu (testte).
  { re: /bölgesel\s*(yağ|incel|zayıfla)/u, label: 'bölgesel yağ kaybı iması' },
  { re: /yağ\p{L}*\s*(yak|erit|söktür)/u, label: 'yağ yakma vaadi' },
  { re: /(göbek|karın|basen|bel)\p{L}*\s*(erit|incelt)/u, label: 'bölgesel inceltme vaadi' },
  { re: /incelt\p{L}*/u, label: 'inceltme vaadi' },
  { re: /selülit/u, label: 'selülit vaadi' },
  { re: /detoks|toksin/u, label: 'detoks iddiası' },
  { re: /metabolizma\p{L}*\s*hızlandır/u, label: 'metabolizma hızlandırma iddiası' },
  { re: /garanti|kesinlikle|mucize|anında\s*sonuç/u, label: 'aşırı kesinlik' },
];/**
 * Hipertrofi hedefi için haftalık birincil set sınırları.
 *
 * ALT SINIR anlamlı olan: doz-yanıt meta-analizleri haftada 10+ setin daha
 * azından daha çok büyüme verdiğini gösteriyor. Bu sınır "kol kalınlaştırma"
 * adlı ama haftada dört set kol çalıştıran paketi yakalıyor.
 *
 * ÜST SINIR kaba bir toparlanma korkuluğu, en iyi hacmin ölçüsü değil — o
 * konuda kanıt çok daha zayıf. Ayrıca sayım YUKARI YANLI: bileşik bir hareket
 * setinin tamamı BİRİNCİL saydığı her kasa yazılıyor, yani çömelme de menteşe
 * de hamle de kalçaya tam set yazıyor. Kalça gibi her alt vücut hareketinden
 * pay alan bir kasta gerçek yük, sayının gösterdiğinden az. Sınır bu yüzden
 * 30 değil 40: 30'da makul bir bacak programı yanlışlıkla düşüyordu (ölçüldü,
 * `kalca-bacak` 31 set).
 */
const MIN_WEEKLY_SETS = 10;
const MAX_WEEKLY_SETS = 40;

/**
 * Hazır paket programlar.
 *
 * Denetlenen şey biçimden ibaret değil: bu dosya kullanıcıya ne yapacağını
 * SÖYLÜYOR, o yüzden şema iki şeyi ayrıca zorluyor.
 *
 * 1. `limits` boş olamaz. Bir paket ne yapmadığını yazmadan yayına giremez;
 *    yazılmayan sınırı kullanıcı kendi hayal gücüyle dolduruyor.
 * 2. Hipertrofi hedefli bir paket, hedef aldığı her kasa haftada en az
 *    `MIN_WEEKLY_SETS` birincil set vermek zorunda. "Kol kalınlaştırma" adlı
 *    ama haftada dört set kol çalıştıran bir paket, adının vaat ettiği şeyi
 *    yapmıyor demektir — ve bunu gözle fark etmek zor, çünkü liste dolu
 *    görünüyor. Sayı veriden hesaplanıyor: setler × haftalık tekrar sayısı,
 *    kasın BİRİNCİL olduğu hareketlerde.
 */
export function validateProgrammes(data: unknown, exerciseKeys: string[], musclesRaw: unknown): string[] {
  const errs: string[] = [];
  if (!isObj(data)) return ['paket programlar: kök nesne bekleniyor'];
  const progs = data.programmes;
  if (!isObj(progs)) return ['paket programlar: programmes nesnesi yok'];
  if (Object.keys(progs).length === 0) errs.push('paket programlar: programmes boş');

  const muscles = isObj(musclesRaw) ? musclesRaw : {};
  /** Hareketin BİRİNCİL kasları — hacim sayımının tabanı. */
  const primaryOf = (id: string): string[] => {
    const m = muscles[id];
    return isObj(m) && Array.isArray(m.primary) ? (m.primary as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  };

  Object.keys(progs).forEach((id) => {
    const bad = (msg: string) => errs.push(`paket "${id}": ${msg}`);
    if (!SLUG.test(id)) bad('kimlik küçük harf ASCII slug olmalı (a-z, 0-9, tire)');
    const p = progs[id];
    if (!isObj(p)) return bad('nesne değil');
    Object.keys(p).forEach((k) => {
      if (!PROGRAMME_KEYS.includes(k)) bad(`bilinmeyen alan "${k}"`);
    });

    const text = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : '');
    if (text('name').trim() === '') bad('name boş olmayan metin olmalı');
    if (text('promise').trim() === '') bad('promise boş olmayan metin olmalı');
    if (text('progression').trim() === '') bad('progression boş olmayan metin olmalı');
    if (typeof p.goal !== 'string' || !GOALS.includes(p.goal)) bad(`goal geçersiz (${GOALS.join(', ')})`);
    if (typeof p.level !== 'string' || !LEVELS.includes(p.level)) bad(`level geçersiz (${LEVELS.join(', ')})`);
    if (typeof p.reviewed !== 'boolean') bad('reviewed doğru/yanlış olmalı');
    if (!num(p.weeks) || p.weeks < 1 || p.weeks > 52) bad('weeks 1..52 olmalı');
    if (!num(p.minutes) || p.minutes < 5 || p.minutes > 180) bad('minutes 5..180 olmalı');
    if (!Array.isArray(p.equipment) || p.equipment.some((q) => typeof q !== 'string' || q.trim() === '')) {
      bad('equipment boş olmayan metin dizisi olmalı');
    }

    // Yasaklı ifade: vaatte ve adda.
    ['name', 'promise'].forEach((k) => {
      const low = text(k).toLocaleLowerCase('tr');
      BANNED.forEach(({ re, label }) => {
        const hit = low.match(re);
        if (hit) bad(`${k} yanlış yönlendiren ifade içeriyor (${label}): "${hit[0]}"`);
      });
    });

    // Sınırlar: boş bırakılamaz.
    if (!Array.isArray(p.limits) || p.limits.length === 0) {
      bad('limits boş olamaz — paket ne YAPMADIĞINI da yazmak zorunda');
    } else if (p.limits.some((q) => typeof q !== 'string' || q.trim() === '')) {
      bad('limits boş olmayan metinlerden oluşmalı');
    }

    if (!Array.isArray(p.evidence) || p.evidence.length === 0) bad('evidence boş olamaz');
    else {
      p.evidence.forEach((e, i) => {
        if (!isObj(e)) return bad(`evidence[${i}] nesne değil`);
        if (typeof e.claim !== 'string' || e.claim.trim() === '') bad(`evidence[${i}].claim boş`);
        if (typeof e.basis !== 'string' || e.basis.trim() === '') bad(`evidence[${i}].basis boş`);
      });
    }

    const targets = Array.isArray(p.targets) ? p.targets.filter((t): t is string => typeof t === 'string') : [];
    targets.forEach((t) => {
      if (!(t in MUSCLES)) bad(`targets "${t}" kas sözlüğünde yok`);
    });

    if (!Array.isArray(p.days) || p.days.length === 0) return bad('days boş olamaz');
    const dayIds: string[] = [];
    // Kasa haftada düşen birincil set — hipertrofi kontrolünün girdisi.
    const weekly: Record<string, number> = {};
    const cycles = num(p.sessionsPerWeek) && p.days.length > 0 ? p.sessionsPerWeek / p.days.length : NaN;
    if (!num(p.sessionsPerWeek) || p.sessionsPerWeek < 1 || p.sessionsPerWeek > 14) bad('sessionsPerWeek 1..14 olmalı');
    else if (!Number.isInteger(cycles) || cycles < 1) {
      bad(`sessionsPerWeek (${p.sessionsPerWeek}) gün sayısının (${p.days.length}) tam katı olmalı — yoksa haftanın nasıl geçeceği belirsiz`);
    }

    p.days.forEach((d, di) => {
      const dbad = (msg: string) => bad(`days[${di}] ${msg}`);
      if (!isObj(d)) return dbad('nesne değil');
      Object.keys(d).forEach((k) => {
        if (!DAY_KEYS.includes(k)) dbad(`bilinmeyen alan "${k}"`);
      });
      if (typeof d.id !== 'string' || !SLUG.test(d.id)) dbad('id slug olmalı');
      else if (dayIds.includes(d.id)) dbad(`id "${d.id}" birden fazla günde`);
      else dayIds.push(d.id);
      if (typeof d.name !== 'string' || d.name.trim() === '') dbad('name boş');

      if (d.warmup !== undefined) {
        if (!Array.isArray(d.warmup)) dbad('warmup dizi olmalı');
        else {
          d.warmup.forEach((w, wi) => {
            if (typeof w !== 'string') dbad(`warmup[${wi}] metin olmalı`);
            else if (!exerciseKeys.includes(w)) dbad(`warmup[${wi}] "${w}" hareket kataloğunda yok`);
          });
        }
      }

      if (!Array.isArray(d.exercises) || d.exercises.length === 0) return dbad('exercises boş olamaz');
      d.exercises.forEach((x, xi) => {
        const xbad = (msg: string) => dbad(`exercises[${xi}] ${msg}`);
        if (!isObj(x)) return xbad('nesne değil');
        Object.keys(x).forEach((k) => {
          if (!SET_KEYS.includes(k)) xbad(`bilinmeyen alan "${k}"`);
        });
        if (typeof x.id !== 'string') return xbad('id metin olmalı');
        if (!exerciseKeys.includes(x.id)) xbad(`"${x.id}" hareket kataloğunda yok`);
        if (!num(x.sets) || !Number.isInteger(x.sets) || x.sets < 1 || x.sets > 10) xbad('sets 1..10 tam sayı olmalı');
        if (typeof x.reps !== 'string' || !REPS.test(x.reps)) xbad('reps "8", "6-10", "30 sn" ya da "40 m" biçiminde olmalı');
        if (!num(x.restSec) || x.restSec < 0 || x.restSec > 600) xbad('restSec 0..600 olmalı');
        if (x.note !== undefined && (typeof x.note !== 'string' || x.note.trim() === '')) xbad('note boş metin olamaz');

        const sets = x.sets;
        if (num(sets) && Number.isFinite(cycles)) {
          primaryOf(x.id).forEach((mu) => {
            weekly[mu] = (weekly[mu] ?? 0) + sets * cycles;
          });
        }
      });
    });

    if (p.goal === 'hipertrofi') {
      if (targets.length === 0) bad('hipertrofi hedefli paket targets yazmak zorunda — hacim başka türlü denetlenemez');
      targets.forEach((t) => {
        const n = weekly[t] ?? 0;
        const label = (MUSCLES[t]?.label ?? t);
        if (n < MIN_WEEKLY_SETS) {
          bad(`"${label}" haftada ${n} birincil set alıyor, en az ${MIN_WEEKLY_SETS} gerekiyor — paket adının vaat ettiği büyümeyi vermez`);
        } else if (n > MAX_WEEKLY_SETS) {
          bad(`"${label}" haftada ${n} birincil set alıyor, üst sınır ${MAX_WEEKLY_SETS} — toparlanmayı aşıyor`);
        }
      });
    }
  });

  return errs;
}
